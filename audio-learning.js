'use strict';
/* BeatForge Audio Learn v3 - local feature extractor, not a neural audio model. */
(()=>{
 const $=id=>document.getElementById(id);
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 const bands=['kick','snare','hat'];
 const round=(n,d=2)=>+n.toFixed(d);
 const MAX_FILE=28*1024*1024,MAX_LENGTH=150;
 const splitSeconds=sec=>`${Math.floor(sec/60)}:${String(Math.round(sec%60)).padStart(2,'0')}`;
 let busy=false;
 function extract(audio, genre, tempoOverride=0){
  const sr=audio.sampleRate,n=audio.length,secs=audio.duration;
  if(!Number.isFinite(secs)||secs<3||secs>MAX_LENGTH)throw Error('Referenz muss 3 bis 150 Sekunden lang sein. Kürze längere Beats zuerst.');
  const channels=audio.numberOfChannels;
  if(!channels||!sr)throw Error('Keine gültigen Audio-Kanäle.');
  const source=Array.from({length:Math.min(channels,2)},(_,i)=>audio.getChannelData(i));
  const desiredRate=11025,step=Math.max(1,Math.floor(sr/desiredRate)),fs=sr/step;
  const hop=512,lowA=1-Math.exp(-2*Math.PI*180/fs),midA=1-Math.exp(-2*Math.PI*2300/fs);
  const stats={low:[],mid:[],high:[],mix:[]};
  let lp=0,mp=0,sum0=0,sum1=0,sum2=0,sum3=0,count=0;
  for(let j=0;j<n;j+=step){
   let x=0;for(const channel of source)x+=channel[j];x/=source.length;
   if(!Number.isFinite(x))continue;
   lp+=lowA*(x-lp);mp+=midA*(x-mp);
   const a=lp,m=mp-lp,h=x-mp;
   sum0+=a*a;sum1+=m*m;sum2+=h*h;sum3+=x*x;
   if(++count===hop){stats.low.push(Math.sqrt(sum0/hop));stats.mid.push(Math.sqrt(sum1/hop));stats.high.push(Math.sqrt(sum2/hop));stats.mix.push(Math.sqrt(sum3/hop));sum0=sum1=sum2=sum3=0;count=0;}
  }
  const N=stats.mix.length;
  if(N<45)throw Error('Zu wenig verwertbares Audio.');
  let rms=0;for(const a of stats.mix)rms+=a*a;rms=Math.sqrt(rms/N);
  if(rms<.001)throw Error('Audiodatei ist praktisch stumm.');
  const envelopes={};const means={};
  for(const k of ['low','mid','high','mix']){
   const vals=stats[k],en=new Float32Array(N);let avg=0,prev=vals[0];
   for(let i=0;i<N;i++){
    avg=avg*.986+vals[i]*.014;
    const delta=vals[i]-prev;
    en[i]=Math.max(0,delta-.09*avg);
    prev=vals[i];
   }
   // Quiet, mastered recordings need a different threshold from loud tracks.
   const ordered=Array.from(en).sort((a,b)=>a-b);
   const top=ordered[Math.floor((N-1)*.95)]||1e-8;
   envelopes[k]=Array.from(en,x=>clamp(x/(top*1.6),0,2.5));
   means[k]=vals.reduce((a,b)=>a+b*b,0)/N;
  }
  const fps=fs/hop,on=envelopes.mix;
  // Multi-scale autocorrelation at quarter- and half-note periodicities.
  // Float lags avoid the strong tempo bias caused by rounding to one 512-sample frame.
  function corr(signal,lag){
   if(lag<1||lag>=signal.length-2)return 0;
   const floor=Math.floor(lag),fraction=lag-floor;
   let prod=0,aa=0,bb=0;
   for(let i=floor+2;i<N;i++){
    const x=signal[i],y=signal[i-floor]*(1-fraction)+signal[i-floor-1]*fraction;
    prod+=x*y;aa+=x*x;bb+=y*y;
   }
   return prod/Math.sqrt(Math.max(1e-10,aa*bb));
  }
  const prior=(GENRES[genre]||GENRES.trap).bpm;
  const candidates=[];
  for(let bpm=65;bpm<=190;bpm++){
   const lag=fps*60/bpm;
   const c0=corr(on,lag),c1=corr(on,lag*.5),c2=corr(on,lag*2);
   const high=corr(envelopes.high,lag*.5),low=corr(envelopes.low,lag*2);
   const adjusted=(c0*.40+c1*.16+c2*.19+high*.11+low*.14)*(.92+.08*Math.exp(-Math.abs(Math.log(bpm/prior))*4));
   candidates.push({bpm,corr:c0,score:adjusted});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const winner=candidates[0];
  const median=[...candidates].sort((a,b)=>a.score-b.score)[Math.floor(candidates.length/2)]?.score||0;
  const confidence=clamp((winner.score-Math.max(0,median))*1.1+winner.corr*.45,0,.96);
  const computedBpm=winner.bpm;
  const bpm=tempoOverride?clamp(Math.round(tempoOverride),55,220):computedBpm;
  const stepFrames=fps*60/bpm/4;
  // Phase = first 16th note, refined against quarter-note and backbeat onsets.
  let phase=0,best=-1e99;
  for(let k=0;k<Math.max(4,Math.round(stepFrames*4));k++){
   const offset=k/4;let score=0;
   for(let i=0;i<N;i++){
    const ix=Math.round((i-offset)/stepFrames);
    if(ix<0)continue;
    const dis=Math.abs(i-offset-ix*stepFrames);
    if(dis>.30*stepFrames)continue;
    const pos=((ix%16)+16)%16;
    score+=(envelopes.low[i]+envelopes.mid[i]*.6+envelopes.high[i]*.18)*(1-dis/stepFrames)*(pos%4===0?1:.65);
   }
   if(score>best){best=score;phase=offset}
  }
  const totals={low:Array(16).fill(0),mid:Array(16).fill(0),high:Array(16).fill(0)},counts=Array(16).fill(0);
  const frameStart=Math.round(fps*Math.min(0.8,secs*.03));
  for(let i=frameStart;i<N;i++){
   const idx=Math.round((i-phase)/stepFrames);
   if(idx<0)continue;
   const distance=Math.abs(i-phase-idx*stepFrames);
   if(distance>Math.max(1,stepFrames*.35))continue;
   const st=((idx%16)+16)%16;
   // Each onset is weighted by proximity to the nearest 16th-grid point.
   const w=1-distance/(Math.max(1,stepFrames*.36));
   totals.low[st]+=envelopes.low[i]*w;totals.mid[st]+=envelopes.mid[i]*w;totals.high[st]+=envelopes.high[i]*w;
   counts[st]+=w;
  }
  const pattern={};
  for(const [lane,key] of [['kick','low'],['snare','mid'],['hat','high'],['openhat','high']]){
   const byStep=totals[key].map((v,i)=>v/Math.max(1,counts[i]));
   const max=Math.max(1e-8,...byStep),peak=Math.max(1e-8,[...byStep].sort((a,b)=>a-b)[Math.floor(byStep.length*.75)]);
   pattern[lane]=byStep.map((v,i)=>{
    const pulse=clamp(v/Math.max(peak,max*.4),0,1);
    // Preserve 16th step emphasis but avoid guaranteed hits in noisy masters.
    return round(clamp(pulse*(lane==='openhat'?.36:lane==='hat'?.90:.80),0,.96));
   });
  }
  const framesWithOnset=on.filter(v=>v>.65).length;
  const low=means.low,mid=means.mid,high=means.high,total=low+mid+high+1e-12;
  const profile={bpm,estimatedBpm:computedBpm,tempoOverride:!!tempoOverride,
   confidence:round(tempoOverride?.8:confidence),tempoConfidence:round(confidence),duration:round(secs),
   loudnessRms:round(rms,4),lowRatio:round(low/total),brightness:round(high/total),
   transientDensity:round(framesWithOnset/Math.max(1,secs),2),groove:pattern,
   algorithm:'band-onset-autocorrelation-v1',sampleRate:sr,channelCount:channels};
  return profile;
 }
 function showMessage(message,isError=false){const t=$('audioLearnStatus');if(t){t.textContent=message;t.dataset.error=String(isError)}notify(message)}
 function render(){
  const list=$('audioRefList');if(!list)return;
  const all=state.audioRefs||[];
  const selected=all.filter(x=>x.genre===$('genre').value);
  $('audioRefCount').textContent=`${all.length} gespeichert · ${selected.length} aktuelles Genre`;
  list.innerHTML='';
  if(!all.length){list.innerHTML='<p class="subtle">Noch keine Audio-Referenzen. Lade einen eigenen Beat hoch, um echte rhythmische Merkmale zu lernen.</p>';return}
  for(const ref of [...all].reverse()){
   const item=document.createElement('article');item.className='al-ref';
   const head=document.createElement('div');head.className='al-ref-heading';
   const name=document.createElement('strong');name.textContent=ref.name;
   const del=document.createElement('button');del.className='btn btn-outline';del.type='button';del.textContent='Entfernen';del.onclick=()=>{state.audioRefs=state.audioRefs.filter(x=>x.id!==ref.id);persist();renderAll()};
   head.append(name,del);item.append(head);
   const info=document.createElement('div');info.className='al-meta';
   const genre=GENRES[ref.genre]?.name||ref.genre;
   const certainty=ref.profile.tempoOverride?'BPM manuell gesetzt':`Tempo-Schätzung ${Math.round(ref.profile.tempoConfidence*100)}%`;
   info.textContent=`${genre} · ${ref.profile.bpm} BPM · ${splitSeconds(ref.profile.duration)} · ${certainty} · Low ${Math.round(ref.profile.lowRatio*100)}%`;
   item.append(info);
   const buttons=document.createElement('div');buttons.className='al-actions';
   const label=document.createElement('label');label.className='al-toggle';
   const ck=document.createElement('input');ck.type='checkbox';ck.checked=ref.enabled!==false;ck.onchange=()=>{ref.enabled=ck.checked;persist();renderAll()};
   label.append(ck,document.createTextNode(' Beim Generieren verwenden'));
   const impact=document.createElement('label');impact.className='al-toggle';impact.textContent='Gewichtung';
   const select=document.createElement('select');for(const n of [1,2,3])select.add(new Option(n===1?'Normal':n===2?'Stark':'Sehr stark',n));select.value=String(ref.weight||1);select.onchange=()=>{ref.weight=+select.value;persist();renderAll()};impact.append(select);
   buttons.append(label,impact);item.append(buttons);
   const grid=document.createElement('div');grid.className='al-groove';
   for(const lane of bands){const row=document.createElement('div');row.className='al-pattern';
    const nm=document.createElement('small');nm.textContent={kick:'Kick',snare:'Snare',hat:'Hats'}[lane];row.append(nm);
    const bar=document.createElement('div');bar.className='al-steps';
    for(const val of ref.profile.groove[lane]||[]){const cell=document.createElement('span');cell.style.opacity=String(.20+val*.8);cell.style.height=`${Math.round(8+val*21)}px`;bar.append(cell)}row.append(bar);grid.append(row)}item.append(grid);list.append(item);
  }
 }
 async function importAudio(file){
  if(!file||busy)return;
  if(file.size>MAX_FILE)throw Error('Datei zu groß: maximal 28 MB. Exportiere einen kürzeren WAV/MP3-Ausschnitt.');
  if(!(/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name)||file.type.startsWith('audio/')))throw Error('Bitte eine WAV-, MP3- oder andere unterstützte Audiodatei auswählen.');
  if(!$('audioRights').checked)throw Error('Bestätige zuerst, dass du die Datei analysieren darfst.');
  const btn=$('audioImport');busy=true;btn.disabled=true;btn.textContent='Analysiere Audio …';
  let ctx;
  try{
   showMessage('Audio wird lokal dekodiert und analysiert. Große Dateien können auf dem iPhone etwas dauern.');
   const C=window.AudioContext||window.webkitAudioContext;
   if(!C)throw Error('Dein Browser unterstützt Audio-Decoding nicht.');
   ctx=new C();
   const b=await file.arrayBuffer();
   let audio;
   try{audio=await ctx.decodeAudioData(b)}catch(_){throw Error('Format konnte nicht dekodiert werden. Versuche eine WAV- oder MP3-Datei.')}
   const override=clamp(Math.round(+$('audioManualBpm').value||0),0,220);
   const profile=extract(audio,$('genre').value,override>=55?override:0);
   if(profile.confidence<.18&&!profile.tempoOverride){
    showMessage('Tempoerkennung zu unsicher. Bitte manuelles BPM-Feld ausfüllen und erneut analysieren.',true);
    return;
   }
   const id='aud-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
   state.audioRefs=Array.isArray(state.audioRefs)?state.audioRefs:[];
   state.audioRefs.push({id,name:file.name.slice(0,100),genre:$('genre').value,enabled:true,weight:1,profile,createdAt:Date.now(),source:'audio-profile'});
   state.audioRefs=state.audioRefs.slice(-20);
   persist();renderAll();
   showMessage(`Stilprofil gelernt: ${profile.bpm} BPM${profile.tempoOverride?' (manuell gesetzt)':` (Tempo-Schätzung ${Math.round(profile.tempoConfidence*100)}%)`}. Nächster Beat verwendet das Groove-Profil.`);
  }finally{busy=false;btn.disabled=false;btn.textContent='Audio-Beat analysieren';if(ctx)ctx.close().catch(()=>{})}
 }
 function init(){
  // The mobile pocket shell moves the original reference panel into the Learning tab.
  const parent=$('learnTab')||$('referenceList')?.closest('.panel');if(!parent)return;
  const section=document.createElement('section');section.className='panel al-panel';
  section.innerHTML=`<div class="al-heading"><span class="al-kicker">REAL AUDIO / LOCAL ANALYSIS</span><h2>Aus echten Beats lernen</h2><p>Lade deine eigenen WAV-/MP3-Beats hoch. BeatForge untersucht Tempo, Transienten, Kick-, Snare- und Hi-Hat-Grooves sowie den Bass-/Hochtonanteil. Audio bleibt auf diesem Gerät.</p></div>
  <label class="al-file">Audio-Datei auswählen<input id="audioInput" type="file" accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg" /></label>
  <label class="al-bpm">BPM manuell (optional, bei unklarer Erkennung)<input id="audioManualBpm" type="number" min="55" max="220" placeholder="Automatisch erkennen" inputmode="numeric" /></label>
  <label class="al-toggle"><input type="checkbox" id="audioRights" /> Ich besitze die nötigen Rechte zur Audioanalyse.</label>
  <label class="al-toggle"><input type="checkbox" id="audioMatchTempo" /> Erkanntes Tempo bei neuen Beats übernehmen</label>
  <button class="btn btn-primary" id="audioImport" type="button">Audio-Beat analysieren</button>
  <p id="audioLearnStatus" class="al-status" role="status" aria-live="polite">Ohne Upload: keine Audiodaten. Nur die erkannten Merkmale werden im lokalen Lernspeicher gesichert.</p>
  <div class="al-summary"><strong>Gelernte Stilprofile</strong><span id="audioRefCount">0 gespeichert</span></div><div id="audioRefList"></div>
  <p class="al-notice">Technischer Hinweis: Das ist eine heuristische Audioanalyse, kein trainiertes neuronales Audiomodell. Schlagzeug-Klassifikation und BPM sind bei vollständigen Songs unsicher. Es werden keine Melodien, Samples oder fertigen Songs rekonstruiert. Nutze für bestmögliche Ergebnisse reine Instrumental-Beats.</p>`;
  parent.insertBefore(section,parent.firstChild);
  $('audioImport').onclick=async()=>{try{await importAudio($('audioInput').files[0])}catch(e){showMessage('Audio-Lernen: '+e.message,true)}};
  $('genre').addEventListener('change',()=>render());
  // A session's linked file input is not persisted; only extracted features are.
  render();
 }
 init();
 window.BeatforgeAudioLearn={refresh:render,analyze:extract,getProfiles:()=>JSON.parse(JSON.stringify(state.audioRefs||[]))};
})();
