'use strict';
/* Small supervised groove model. Activates ONLY when a validated CC BY 4.0
 * model trained on actual GMD performances is available. No demo/fake training.
 */
(()=>{
 const LANES=['kick','snare','hat','openhat'];
 const MODEL_PATH='./groove-model.json';
 const KEY='beatforge.groove.settings.v1';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const pitch={kick:36,snare:38,hat:42,openhat:46};
 let model=null, mode='blend', isReady=false, pending=false, error='';
 try{let settings=JSON.parse(localStorage.getItem(KEY)||'null');if(['off','blend','strong'].includes(settings?.mode))mode=settings.mode}catch(e){}
 const $=id=>document.getElementById(id);
 const valid=(m)=>{
  if(!m || m.schema!=='beatforge.gmd.rhythm-model.v1'||m.trained!==true||!m.data?.all||!Number.isInteger(m.meta?.samples_used)||m.meta.samples_used<20)return false;
  if(m.meta.license!=='CC BY 4.0'||m.meta.archive_sha256!=='651cbc524ffb891be1a3e46d89dc82a1cecb09a57c748c7b45b844c4841dcc1e')return false;
  for(const group of Object.values(m.data)){
   if(!group||!Number.isFinite(group.samples)||group.samples<1)return false;
   for(const lane of LANES){
    if(!Array.isArray(group.p?.[lane])||group.p[lane].length!==16)return false;
    if(!Array.isArray(group.prev?.[lane])||group.prev[lane].length!==16)return false;
    for(let i=0;i<16;i++){
     if(!(group.p[lane][i]>=0&&group.p[lane][i]<=1))return false;
     if(!Array.isArray(group.prev[lane][i])||group.prev[lane][i].length!==2||group.prev[lane][i].some(p=>!Number.isFinite(p)||p<0||p>1))return false;
    }
   }
  }
  return true;
 };
 const allowedGenres=new Set(['trap','drill','rage','pluggnb']);
 function bucket(bpm){return bpm<135?'slow':bpm<160?'medium':'fast'}
 function apply(s,r,bar){
  if(!model||mode==='off'||!allowedGenres.has(s.genre)||!(s.influence>0))return false;
  const g=model.data.hiphop||model.data[bucket(s.bpm)]||model.data.all;
  // GMD hiphop rhythms are not Trap-specific. Melody/bass/chords
  // remain newly composed by the existing independent engine.
  const mix=clamp((mode==='strong'?.83:.55)*s.influence,0,.9);
  const barStart=bar*16;
  let total=0;
  for(const lane of LANES){
   let prev=0, hits=0;
   const baseline={kick:[0,6,10,14],snare:[8],hat:[0,2,4,6,8,10,12,14],openhat:[7,15]}[lane];
   for(let st=0;st<16;st++){
    const globalProbability=g.p[lane][st];
    const contextual=g.prev[lane][st][prev];
    // Step-dependent Bernoulli sampling + one-step Markov memory.
    const learned=clamp(.7*globalProbability+.3*contextual,0,.94);
    const traditional=baseline.includes(st)?(lane==='openhat'?.30:lane==='hat'?.78:.76):(lane==='openhat'?.006:lane==='hat'?.028:.04);
    const jitter=1+((r()-.5)*.20)*((s.complexity||50)/100);
    const chance=clamp((traditional*(1-mix)+learned*mix)*jitter,0,.96);
    const active=r()<chance;
    prev=active?1:0;
    if(active){hits++;total++;
     const energy=clamp((s.energy||65)/100,0,1);
     const v=clamp((lane==='hat'?.30:lane==='openhat'?.31:.62)+r()*.16+energy*.15,.1,1);
     s.events.push({lane,start:barStart+st,dur:lane==='hat'?.25:lane==='openhat'?.7:.75,pitch:pitch[lane],vel:v});
    }
   }
   // All-empty bars are unintended artifacts of independent sampling.
   if(!hits&&(lane==='kick'||lane==='snare')){
    const st=lane==='kick'?0:8;
    s.events.push({lane,start:barStart+st,dur:.70,pitch:pitch[lane],vel:.7});total++;
   }
  }
  s.datasetModel='Google-Magenta-GMD';
  s.datasetModelSourceCount=model.meta.samples_used;
  s.datasetModelMix=mix;
  return total>0;
 }
 function render(){
  const status=$('gmStatus'),count=$('gmCount'),select=$('gmMode');
  if(count)count.textContent=model?`${model.meta.samples_used.toLocaleString('de-DE')} echte Drum-Takte`:'Kein Modell geladen';
  if(select)select.value=mode;
  if(status){
   status.textContent=model?`Trainiertes CC-BY-Modell aktiv · ${model.meta.performances_train} Trainingsperformances · ${model.meta.performances_holdout} getrennte Prüfperformances · Quelle Google Magenta GMD (echte Drummer). Rhythmische Grundlage für Trap/Drill/Rage/PluggnB, nicht speziell darauf trainiert.`:
     pending?'Trainiertes Groove-Modell wird geprüft …':error||'Es liegt noch kein geprüftes Magenta-GMD-Modell auf diesem Server. Der reguläre Generator bleibt aktiv.';
   status.dataset.ready=String(!!model);
  }
 }
 function setMode(v){if(!['off','blend','strong'].includes(v))return;mode=v;try{localStorage.setItem(KEY,JSON.stringify({mode}))}catch(e){}render()}
 async function load(force=false){
  if(pending)return false;
  pending=true;error='';render();
  try{
   const res=await fetch(MODEL_PATH,{cache:force?'reload':'default'});
   if(!res.ok){error='Das WaivOps-Trainingsmodell ist noch nicht verfügbar (HTTP '+res.status+').';model=null;return false;}
   const size=Number(res.headers.get('content-length')||'0');
   if(size>2*1024*1024)throw Error('Modell zu groß');
   const txt=await res.text();if(txt.length>2*1024*1024)throw Error('Modell zu groß');
   const m=JSON.parse(txt);if(!valid(m))throw Error('Modell ist unvollständig oder nicht anhand des Originaldatensatzes verifiziert');
   model=m;isReady=true;return true;
  }catch(e){model=null;error='Modell nicht geladen: '+e.message;return false}
  finally{pending=false;render()}
 }
 function init(){
  const parent=$('learnTab')||$('audioRefList')?.closest('.panel');
  if(!parent)return;
  const panel=document.createElement('section');panel.className='panel gm-panel';
  panel.innerHTML=`<div class="gm-kicker">HUMAN MIDI TRAINING / CC BY 4.0</div><h2>Human Groove AI</h2><p class="gm-copy">Ein kleines statistisch trainiertes Modell erlernt die Trefferwahrscheinlichkeiten für Kick, Snare, Hi-Hat und Open-Hat aus zeitgenauen MIDI-Aufnahmen echter Schlagzeuger. Neue Drum-Folgen werden daraus probabilistisch erzeugt, nicht aus fremden Audios kopiert.</p>
   <div class="gm-statushead"><span id="gmCount">Kein Modell geladen</span><a href="https://magenta.tensorflow.org/datasets/groove" target="_blank" rel="noopener noreferrer">Quelle / Lizenz ↗</a></div>
   <p class="gm-state" id="gmStatus" aria-live="polite">Prüfe Trainingsmodell …</p>
   <label class="gm-field">Lernintensität<select id="gmMode"><option value="off">Aus – normaler Generator</option><option value="blend">Hybrid – 55 % x Lern-Einfluss</option><option value="strong">Dataset – 83 % x Lern-Einfluss</option></select></label>
   <button class="btn btn-outline gm-check" type="button" id="gmRetry">Modell erneut prüfen</button>
   <p class="gm-licence">Trainingsmaterial: Google Magenta Groove MIDI Dataset v1.0.0 · © Google LLC · Gillick et al., ICML 2019 · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Das Modell ist kein Audio-Fundamentmodell und erkennt keine Melodien. Ohne gültige Trainingsdaten erfolgt kein angebliches Training.</p>`;
  parent.insertBefore(panel,parent.firstChild);
  $('gmMode').value=mode;$('gmMode').addEventListener('change',e=>setMode(e.target.value));
  $('gmRetry').addEventListener('click',()=>load(true));
  render();load();
 }
 window.BeatforgeGrooveModel={apply,load,getStatus:()=>({ready:!!model,mode,samples:model?.meta.samples_used||0,error,pending}),setMode,getModel:()=>model};
 init();
})();
