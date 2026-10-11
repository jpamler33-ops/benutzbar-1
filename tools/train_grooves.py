#!/usr/bin/env python3
"""Reproducible small human-drum-groove prior trained from Google Magenta GMD.

Dataset copyright © Google LLC, CC BY 4.0; source: https://magenta.tensorflow.org/datasets/groove
Derived probabilities and aggregate performance statistics, never raw sequences.
Drum audio is NOT included. Training requires only the ~3.11 MB MIDI archive.
"""
from __future__ import annotations
import argparse
import collections
import csv
import datetime as dt
import hashlib
import io
import json
import math
import random
import zipfile
from pathlib import Path
from urllib.request import Request, urlopen

import mido

URL='https://storage.googleapis.com/magentadata/datasets/groove/groove-v1.0.0-midionly.zip'
SHA256='651cbc524ffb891be1a3e46d89dc82a1cecb09a57c748c7b45b844c4841dcc1e'
LANES=('kick','snare','hat','openhat')
PITCH_TO_LANE={35:'kick',36:'kick',38:'snare',37:'snare',39:'snare',40:'snare',
               42:'hat',44:'hat',22:'hat',46:'openhat',26:'openhat'}


def download(archive:Path)->bytes:
    if archive.is_file():data=archive.read_bytes()
    else:
        req=Request(URL,headers={'User-Agent':'BeatForge/4.0 training CC-BY attribution'})
        with urlopen(req,timeout=90) as response:data=response.read(16*1024*1024+1)
    if len(data)>16*1024*1024:raise ValueError('Groove MIDI archive exceeds 16 MB guard')
    sha=hashlib.sha256(data).hexdigest()
    if sha!=SHA256:raise ValueError('Official Google MIDI archive hash mismatch '+sha)
    return data


def midi_bars(data:bytes)->list[dict[str,list[int]]]:
    """Parse note_on tick times (not audio estimates). Return actual 16th-grid bars."""
    mid=mido.MidiFile(file=io.BytesIO(data))
    ppq=mid.ticks_per_beat
    if ppq<1 or ppq>100000:return []
    hits=[]
    for track in mid.tracks:
        tick=0
        for msg in track:
            tick+=msg.time
            if msg.type!='note_on' or msg.velocity<=0:continue
            lane=PITCH_TO_LANE.get(msg.note)
            if not lane:continue
            pos=tick/ppq*4
            if 0<=pos<8000:
                rounded=round(pos)
                # Avoid snapping tuplets and fills far from the 16th grid.
                if abs(pos-rounded)<=.32: hits.append((rounded,lane,msg.velocity,(pos-rounded)))
    if not hits:return []
    bars=collections.defaultdict(lambda:{lane:[0]*16 for lane in LANES})
    for step,lane,vel,_ in hits:
        bar,st=divmod(step,16)
        bars[bar][lane][st]=1
    # Exclude empty intros/outros; prevent a single long file dominating training.
    return [bars[b] for b in sorted(bars)[:128] if sum(map(sum,bars[b].values()))>=2]


def read_zip(payload:bytes):
    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        info_paths=[n for n in z.namelist() if n.endswith('info.csv')]
        if not info_paths:raise ValueError('Groove MIDI metadata info.csv missing')
        info_path=info_paths[0]
        records=list(csv.DictReader(io.StringIO(z.read(info_path).decode('utf-8-sig'))))
        available=set(z.namelist())
        prefix=info_path.removesuffix('info.csv')
        for row in records:
            if row.get('time_signature','') not in ('4-4','4/4'):continue
            fname=row.get('midi_filename','')
            actual=prefix+fname
            if actual not in available:
                # Don't blindly choose another basename: duplicates exist among sessions.
                continue
            try:
                bpm=float(row.get('bpm') or 0)
                if bpm<45 or bpm>220:continue
                bars=midi_bars(z.read(actual))
            except (ValueError,EOFError,KeyError,IndexError,TypeError,ZeroDivisionError):continue
            if not bars:continue
            genre=row.get('style','').split('/')[0].lower()
            split=row.get('split','train').strip().lower()
            group='hiphop' if genre=='hiphop' else 'other'
            yield {'id':row.get('id') or fname, 'bpm':bpm,'group':group,'style':genre,'split':split,'bars':bars}


def quant_model(records):
    records=list(records)
    if len(records)<30:raise ValueError(f'Insufficient 4/4 drum performances ({len(records)})')
    styles=collections.Counter(r['style'] for r in records)
    train=[r for r in records if r['split']=='train']
    held=[r for r in records if r['split'] in ('validation','test')]
    # No leakage: fallback split by performance, never by 16-step bar.
    if len(train)<30 or len(held)<10:
        rng=random.Random(45);rng.shuffle(records)
        cutoff=max(10,int(len(records)*.18));train=records[cutoff:];held=records[:cutoff]
    def speed(bpm):return 'slow' if bpm<100 else 'medium' if bpm<140 else 'fast'
    def collect(perfs):
        samples=[]
        for perf in perfs:
            for g in perf['bars']:
                samples.append((g,perf['group'],speed(perf['bpm'])))
        return samples
    trainbars,holdbars=collect(train),collect(held)
    if len(trainbars)<120 or len(holdbars)<20:raise ValueError('Not enough independent drum bars')
    result={}
    for category in ('all','hiphop','other','slow','medium','fast'):
        rows=[g for g,genre,tempo in trainbars if category=='all' or genre==category or tempo==category]
        if len(rows)<20:continue
        p,prev={},{}
        for lane in LANES:
            amounts=[sum(g[lane][i] for g in rows) for i in range(16)]
            p[lane]=[round((n+1)/(len(rows)+2),6) for n in amounts]
            conditional=[]
            for i in range(16):
                counts=[[],[]]
                for g in rows:counts[g[lane][(i-1)%16]].append(g[lane][i])
                conditional.append([round((sum(group)+1)/(len(group)+2),6) for group in counts])
            prev[lane]=conditional
        result[category]={'samples':len(rows),'p':p,'prev':prev}
    def evaluate():
        sums=[0.,0.,0.];n=0
        for grid,genre,tempo in holdbars:
            # Measure against both constant-density and step-aware baselines.
            model=result.get('hiphop') if genre=='hiphop' else result['all']
            for lane in LANES:
                prior=sum(model['p'][lane])/16
                for step in range(16):
                    val=grid[lane][step];p=model['p'][lane][step]
                    p2=.7*p+.3*model['prev'][lane][step][grid[lane][(step-1)%16]]
                    for i,prob in enumerate((prior,p,p2)):
                        prob=min(.99999,max(.00001,prob))
                        sums[i]+=-(val*math.log(prob)+(1-val)*math.log(1-prob))
                    n+=1
        return [round(v/n,6) for v in sums]
    score=evaluate()
    meta={'source':'Google Magenta Groove MIDI Dataset v1.0.0','license':'CC BY 4.0',
          'dataset_url':'https://magenta.tensorflow.org/datasets/groove',
          'archive_url':URL, 'archive_sha256':SHA256,
          'performances_total':len(records),'performances_train':len(train),'performances_holdout':len(held),
          'samples_used':len(trainbars),'holdout_bars':len(holdbars),'style_counts':dict(styles),
          'holdout_logloss':{'constant':score[0],'step':score[1],'step_plus_prev':score[2]},
          'training_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
          'attribution':'Google LLC; Gillick, Roberts, Engel, Eck & Bamman, ICML 2019'}
    return {'schema':'beatforge.gmd.rhythm-model.v1','trained':True,'lanes':list(LANES),'data':result,'meta':meta}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--input',type=Path,default=Path('/tmp/groove-v1.0.0-midionly.zip'))
    ap.add_argument('--output',type=Path,default=Path('groove-model.json'))
    args=ap.parse_args()
    payload=download(args.input)
    model=quant_model(read_zip(payload))
    args.output.write_text(json.dumps(model,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print('TRAINED_GMD_MODEL',json.dumps(model['meta'],indent=2,ensure_ascii=False))
    print('Model bytes',args.output.stat().st_size)

if __name__=='__main__':main()
