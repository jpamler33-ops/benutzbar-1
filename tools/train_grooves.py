#!/usr/bin/env python3
"""Train a tiny mobile groove prior from licensed HH-TRP JSON labels.

No original WAVs, audio samples, or song copies go into the output.
Source: WaivOps HH-TRP CC BY 4.0, https://doi.org/10.5281/zenodo.15734094
This learns smoothed 16-step hit probabilities with a one-step dependency.
"""
import argparse
import collections
import datetime
import hashlib
import io
import json
import math
import os
import random
import re
import tarfile
import urllib.request
from pathlib import Path

URL = 'https://zenodo.org/records/15734094/files/hh_trp_json.tar.gz?download=1'
EXPECTED_MD5 = 'f63594ac19d5fde3b5277de4643c5046'
LANES = ('kick', 'snare', 'hat', 'openhat')
DRUM_MAP = {
    35:'kick',36:'kick', 38:'snare',40:'snare',37:'snare',39:'snare',
    42:'hat',44:'hat', 46:'openhat',26:'openhat', 22:'hat',
}


def source(path: Path) -> bytes:
    if path.exists():
        payload = path.read_bytes()
    else:
        req = urllib.request.Request(URL, headers={'User-Agent':'BeatForge-GrooveResearch/1.0 (CC BY 4.0 training)'})
        with urllib.request.urlopen(req, timeout=65) as response:
            payload = response.read(6*1024*1024+1)
    if len(payload) > 6*1024*1024:
        raise ValueError('Label archive unexpectedly large')
    actual = hashlib.md5(payload).hexdigest()
    if actual != EXPECTED_MD5:
        raise ValueError('Downloaded dataset MD5 mismatch! got '+actual)
    return payload


def iter_json(payload: bytes):
    with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as tf:
        for item in tf:
            if not item.isfile() or not item.name.lower().endswith('.json'):
                continue
            if item.size > 8*1024*1024: continue
            f = tf.extractfile(item)
            if not f: continue
            try: obj = json.load(f)
            except (ValueError,UnicodeError):continue
            if isinstance(obj, list):
                for ix, row in enumerate(obj):
                    if isinstance(row, dict): yield item.name+'#'+str(ix),row
            elif isinstance(obj, dict):
                # Collections may be nested under "data", "tracks", "loops" etc.
                for key in ('data','loops','tracks','samples','items'):
                    if isinstance(obj.get(key), list) and obj[key] and isinstance(obj[key][0],dict):
                        for ix,row in enumerate(obj[key]):
                            yield item.name+'#'+str(ix),row
                        break
                else: yield item.name,obj


def numeric(v):
    if isinstance(v,(int,float)) and math.isfinite(v):return float(v)
    if isinstance(v,str):
        try:
            n=float(v.strip()); return n if math.isfinite(n) else None
        except ValueError:return None
    return None


def bpm_from_filename(name):
    m=re.search(r'(?<!\d)(1[1-8]\d)(?:bpm|[_-])', name.lower())
    return float(m.group(1)) if m else None


def read_bpm(row,name):
    for key in ('bpm','tempo','tempo_bpm','beats_per_minute'):
        v=numeric(row.get(key))
        if v and 40<=v<=260:return v
    return bpm_from_filename(name)


def lane_for(note):
    if note is None:return None
    if isinstance(note,dict):
        for key in ('pitch','note','midi_note','midi_pitch','midi','number','key','instrument'):
            if key in note:
                v=lane_for(note[key])
                if v: return v
        return None
    num=numeric(note)
    if num is not None: return DRUM_MAP.get(round(num))
    s=str(note).lower().replace('_',' ').replace('-',' ')
    if any(t in s for t in ('openhat','open hat','open hihat','open hi hat')):return 'openhat'
    if any(t in s for t in ('kick','bass drum','bd ', 'bd_')):return 'kick'
    if any(t in s for t in ('snare','rimshot','clap')):return 'snare'
    if any(t in s for t in ('hi hat','hihat','hat','cymbal closed')):return 'hat'
    return None


def extract_events(row):
    """Read note-on event objects; do not infer events from arbitrary numeric lists."""
    res=[]
    visited=0
    def recurse(obj,depth=0, lane_hint=None):
        nonlocal visited
        if depth>8 or visited>150000:return
        visited+=1
        if isinstance(obj,dict):
            note_id=None
            for key in ('pitch','note','midi_note','midi_pitch','key','instrument','drum','drum_note','note_number'):
                if key in obj:
                    note_id=lane_for(obj[key]);
                    if note_id:break
            if not note_id:note_id=lane_hint
            ts=None;unit=None
            for key in ('start','start_time','time','onset','position','tick','beat','step','t','offset'):
                if key in obj:
                    ts=numeric(obj[key]);unit=key;break
            if note_id and ts is not None and 0<=ts<1000000:
                vel=numeric(obj.get('velocity',obj.get('vel',100)))
                if vel is None or vel>0:res.append((note_id,ts,unit))
                return
            for key,v in obj.items():
                hint=lane_for(key) or lane_hint
                if isinstance(v,(dict,list)):recurse(v,depth+1,hint)
        elif isinstance(obj,list):
            for x in obj[:100000]:recurse(x,depth+1,lane_hint)
    recurse(row)
    return res


def make_grid(row,name):
    bpm=read_bpm(row,name)
    events=extract_events(row)
    if not events or not bpm:return None
    sig=row.get('time_signature',row.get('timesig','4/4'))
    if isinstance(sig,dict) and sig.get('numerator') not in (None,4):return None
    if isinstance(sig,str) and re.match(r'^\s*\d+\s*/',sig) and not sig.lstrip().startswith('4/'):return None
    sec_per_step=60/bpm/4
    # Most annotations are in seconds. Explicit beat/step fields can be normalized.
    ticks=numeric(row.get('ticks_per_beat',row.get('ppq')))
    max_time=max(t for _,t,_ in events)
    # If all time fields are unknown "position", avoid guessing unsupported units.
    offset=bpm_from_filename(name)
    grid={lane:[0]*16 for lane in LANES}
    found=0
    for lane,t,unit in events:
        if unit=='step': step=round(t)
        elif unit=='beat':step=round(t*4)
        elif unit=='tick' and ticks:step=round(t*4/ticks)
        elif unit in ('start','time','start_time','onset','t','offset'):
            # Millisecond note formats use times larger than a plausible 4-bar clip.
            time=t/1000 if max_time>180 else t
            step=round(time/sec_per_step)
        else:continue
        if step <0 or step>512:continue
        grid[lane][step%16]=1
        found+=1
    if found<2:return None
    return bpm,grid


def train(records):
    sets=[]; examples=0; usable=0; note_total=0; by_bucket=collections.Counter(); sample_keys=[]; diagnostics=[]
    for name,row in records:
        examples+=1
        if examples<=3: diagnostics.append((name,row))
        entry=make_grid(row,name)
        if not entry:continue
        bpm,grid=entry
        bucket='slow' if bpm<135 else 'medium' if bpm<160 else 'fast'
        by_bucket[bucket]+=1;usable+=1
        note_total+=sum(map(sum,grid.values()))
        sets.append((name,grid,bucket))
        if len(sample_keys)<5:sample_keys.append(name)
    if usable<20:
        for name,record in diagnostics: print("SAMPLE_RECORD",name, json.dumps(record, ensure_ascii=False)[:2500])
        raise ValueError(f'Insufficient labeled drum loops: {usable}/{examples} usable; expected >=20. Review WaivOps schema before training; no fake model emitted.')
    rng=random.Random(42); rng.shuffle(sets)
    nvalid=max(1,int(len(sets)*.15)); trainset,validset=sets[nvalid:],sets[:nvalid]
    def build(subset):
        output={}
        for bucket in ('all','slow','medium','fast'):
            target=[(name,g) for name,g,b in subset if bucket=='all' or b==bucket]
            if not target:continue
            probs={}; condition={}
            for lane in LANES:
                counts=[sum(g[lane][st] for _,g in target) for st in range(16)]
                probs[lane]=[round((n+1)/(len(target)+2),5) for n in counts]
                # 1st-order probability based on whether previous step of the same lane hit.
                conditional=[]
                for st in range(16):
                    prev0=[g[lane][st] for _,g in target if not g[lane][(st-1)%16]]
                    prev1=[g[lane][st] for _,g in target if g[lane][(st-1)%16]]
                    conditional.append([round((sum(v)+1)/(len(v)+2),5) for v in (prev0,prev1)])
                condition[lane]=conditional
            output[bucket]={'samples':len(target),'p':probs,'prev':condition}
        return output
    bins=build(trainset)
    # held out log-loss vs constant per-lane rate, and periodic-step base, for diagnosis only.
    def loss(evalset,binned):
        a=b=c=0;n=0
        for _,g,bucket in evalset:
            model=binned.get(bucket,binned['all'])
            for lane in LANES:
                general=sum(model['p'][lane])/16
                for st in range(16):
                    val=g[lane][st];p=model['p'][lane][st];p2=model['prev'][lane][st][g[lane][(st-1)%16]]
                    for q,w in ((general,'a'),(p,'b'),(.7*p+.3*p2,'c')):
                        v=-(val*math.log(max(1e-5,q))+(1-val)*math.log(max(1e-5,1-q)))
                        if w=='a':a+=v
                        elif w=='b':b+=v
                        else:c+=v
                    n+=1
        return [round(v/max(1,n),5) for v in (a,b,c)]
    scores=loss(validset,bins)
    return {'schema':'beatforge.waivops.rhythm-model.v1','trained':True,'lanes':list(LANES),
       'data':bins,'meta':{'source':'WaivOps HH-TRP','doi':'10.5281/zenodo.15734094',
       'license':'CC BY 4.0','license_url':'https://creativecommons.org/licenses/by/4.0/',
       'dataset_url':URL.split('?')[0],'samples_total':examples,'samples_used':usable,
       'training_samples':len(trainset),'holdout_samples':len(validset),'note_hits':note_total,
       'buckets':dict(by_bucket),'holdout_logloss':{'constant':scores[0],'step':scores[1],'step_plus_prev':scores[2]},
       'trained_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sample_identifiers':sample_keys}}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--input',type=Path,default=Path('/tmp/hh_trp_json.tar.gz'))
    ap.add_argument('--output',type=Path,default=Path('groove-model.json'))
    args=ap.parse_args()
    content=source(args.input)
    model=train(iter_json(content))
    args.output.write_text(json.dumps(model,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print('Trained WaivOps model:',json.dumps(model['meta'],indent=2))
    print('Wrote',args.output, args.output.stat().st_size, 'bytes')

if __name__=='__main__': main()
