'use strict';
/* BeatForge Producer v2.0 — deterministic, offline, zero external dependencies. */
(()=>{
 const el=id=>document.getElementById(id);
 const tracks=['melody','chords','bass','kick','snare','hat','openhat'];
 const pitched=['melody','chords','bass'];
 const mixDefaults=()=>Object.fromEntries(tracks.map(id=>[id,{volume:1,pan:0,mute:false,solo:false}]));
 const DRAFT_KEY='beatforge.pro.session.v2';
 const UNDO_LIMIT=40;
 let currentLane='melody',octave=4,noteLength=2,velocity=.8,selection=null,undo=[],redo=[],barClipboard=null,saving=false;
 const noteMax=2500;
 function ensureMix(s){if(!s)return null;if(!s.mix||typeof s.mix!=='object')s.mix={};const mx=s.mix;
  for(const name of tracks){let current=mx[name];if(!current||typeof current!=='object')current={};mx[name]={volume:clamp(Number(current.volume)||0,0,1.5),pan:clamp(Number(current.pan)||0,-1,1),mute:!!current.mute,solo:!!current.solo};if(current.volume==null)mx[name].volume=1}
  mx.master=clamp(Number(mx.master??.85),0,1.25);mx.melodyTone=['soft','pluck','bright','warm'].includes(mx.melodyTone)?mx.melodyTone:'soft';mx.bassTone=['deep','punch','dirty'].includes(mx.bassTone)?mx.bassTone:'deep';return mx;
 }
 function draftSave(){if(!song)return;try{ensureMix(song);localStorage.setItem(DRAFT_KEY,JSON.stringify({version:2,savedAt:Date.now(),song}));const t=el('proSaved');if(t)t.textContent='● Gespeichert'}catch(e){const t=el('proSaved');if(t)t.textContent=e?.name==='QuotaExceededError'?'! Speicher voll':'! Speicher blockiert';}}
 function loadDraft(){try{const raw=localStorage.getItem(DRAFT_KEY);if(!raw)return false;const parsed=JSON.parse(raw);if(parsed?.version!==2||!validateSong(parsed.song))return false;song=parsed.song;ensureMix(song);selectedBar=0;return true}catch(e){return false}}
 function validateSong(s){return s&&typeof s==='object'&&Array.isArray(s.events)&&s.events.length<=noteMax&&tracks.length>0&&GENRES[s.genre]&&SCALES[s.scale]&&Number.isInteger(s.bars)&&s.bars>=1&&s.bars<=16&&Number.isFinite(+s.bpm)&&+s.bpm>=55&&+s.bpm<=220&&Number.isInteger(+s.root)&&+s.root>=0&&+s.root<=11&&s.events.every(e=>tracks.includes(e.lane)&&Number.isFinite(e.start)&&e.start>=0&&e.start<s.bars*16&&Number.isFinite(e.dur)&&e.dur>0&&e.dur<=64&&Number.isInteger(e.pitch)&&e.pitch>=0&&e.pitch<=127&&Number.isFinite(e.vel)&&e.vel>=0&&e.vel<=1.5)}
 function snapshot(){if(!song)return;undo.push(deepClone(song));if(undo.length>UNDO_LIMIT)undo.shift();redo.length=0;buttons();}
 function buttons(){el('proUndo')&&(el('proUndo').disabled=undo.length===0);el('proRedo')&&(el('proRedo').disabled=redo.length===0)}
 function revert(forward=false){const from=forward?redo:undo,to=forward?undo:redo;if(!from.length||!song)return;stopPlayback();to.push(deepClone(song));song=from.pop();ensureMix(song);selection=null;renderAll();notify(forward?'Wiederhergestellt.':'Rückgängig gemacht.');buttons()}
 function edited(){if(!song)return;stopPlayback();song.rated=0;state.ratings=state.ratings.filter(v=>v.id!==song.id);song.events.sort((a,b)=>a.start-b.start||a.pitch-b.pitch);renderAll()}
 function pitchLabel(p){return noteName(p)}
 function shouldHighlight(p){return SCALES[song.scale]?.some(d=>(song.root+d)%12===p%12)}
 function renderPiano(){if(!song||!el('proPiano'))return;ensureMix(song);
  el('proBarLabel').textContent='Takt '+(selectedBar+1)+' / '+song.bars;
  el('proLane').value=currentLane;el('proOctave').value=String(octave);el('proLen').value=String(noteLength);
  const root=el('proPiano'), viewKey=currentLane+'-'+octave, previousScroll=root.scrollTop;let html='<div class="piano-head"><div class="piano-head-key">NOTE</div>';
  for(let st=0;st<16;st++)html+='<span class="piano-head-step '+(st%4===0?'beat-start':'')+'">'+(st%4===0?1+st/4:'·')+'</span>';
  html+='</div>';
  const base=(octave+1)*12;const events=song.events.filter(e=>e.lane===currentLane&&e.start<selectedBar*16+16&&e.start+e.dur>selectedBar*16);
  const beginning=selectedBar*16;
  for(let p=base+35;p>=base;p--){const sharp=[1,3,6,8,10].includes(p%12);const inside=shouldHighlight(p);html+='<div class="piano-row"><div class="piano-key '+(sharp?'blackkey ':'')+'" data-pitch="'+p+'">'+pitchLabel(p)+'</div>';
   for(let st=0;st<16;st++){const abs=beginning+st;
    let note=events.find(e=>e.pitch===p&&e.start<=abs+.0001&&e.start+e.dur>abs+.0001);
    const onset=note&&Math.abs(note.start-abs)<.001,selected=selection&&selection.lane===currentLane&&selection.start===note?.start&&selection.pitch===note?.pitch;
    html+='<button type="button" class="piano-cell '+(inside?'in-scale ':'out-scale ')+(st%4===0?'measure ':'')+(note?'has-note ':'')+(onset?'note-start ':'')+(selected?'selected-note ':'')+'" data-p="'+p+'" data-step="'+st+'" aria-label="'+pitchLabel(p)+', Schritt '+(st+1)+(note?', Note vorhanden':'')+'" title="'+pitchLabel(p)+' · Step '+(st+1)+'"></button>';
   }html+='</div>';
  }
  root.innerHTML=html;if(root.dataset.viewKey===viewKey)root.scrollTop=previousScroll;else {root.dataset.viewKey=viewKey;root.scrollTop=460}el('proEventCount').textContent=song.events.filter(e=>e.lane===currentLane).length+' Noten';renderSelection();buttons();
 }
 function selectEvent(n){if(!n){selection=null;renderSelection();return}selection={lane:n.lane,start:n.start,pitch:n.pitch};renderSelection()}
 function chosen(){if(!selection||!song)return null;return song.events.find(e=>e.lane===selection.lane&&e.start===selection.start&&e.pitch===selection.pitch)||null}
 function renderSelection(){const n=chosen(),label=el('proSelected');if(!label)return;label.textContent=n?noteName(n.pitch)+' · Step '+(1+(Math.floor(n.start)%16))+' · '+n.dur+' Steps':'Note antippen oder Raster berühren';el('proDelete').disabled=!n;el('proDown').disabled=!n;el('proUp').disabled=!n;el('proShorter').disabled=!n;el('proLonger').disabled=!n;}
 function cellClick(p,st){if(!song)return;const at=selectedBar*16+st;
  const existing=song.events.find(e=>e.lane===currentLane&&e.pitch===p&&e.start<=at+.0001&&e.start+e.dur>at+.0001);
  if(existing){selectEvent(existing);renderPiano();return}
  if(song.events.length>=noteMax){notify('Notenlimit erreicht.');return}
  snapshot();const n=event(currentLane,at,Math.min(noteLength,song.bars*16-at),p,velocity);song.events.push(n);selection={lane:currentLane,start:n.start,pitch:n.pitch};edited();
 }
 function mutateNote(kind){const n=chosen();if(!n)return;snapshot();if(kind==='delete'){song.events=song.events.filter(e=>e!==n);selection=null}
  if(kind==='up')n.pitch=clamp(n.pitch+1,0,127);
  if(kind==='down')n.pitch=clamp(n.pitch-1,0,127);
  if(kind==='longer')n.dur=Math.min(16,song.bars*16-n.start,n.dur+1);
  if(kind==='shorter')n.dur=Math.max(1,n.dur-1);
  if(kind==='up'||kind==='down')selection.pitch=n.pitch;
  edited();
 }
 function barEdit(kind){if(!song)return;const base=selectedBar*16;
  if(kind==='copy'){barClipboard=song.events.filter(e=>e.start>=base&&e.start<base+16).map(e=>({...e,start:e.start-base}));notify(barClipboard.length+' Noten aus Takt '+(selectedBar+1)+' kopiert.');return}
  if(kind==='paste'&&!barClipboard){notify('Zuerst einen Takt kopieren.');return}
  snapshot();song.events=song.events.filter(e=>e.start<base||e.start>=base+16);
  if(kind==='paste')for(const e of barClipboard){if(song.events.length>=noteMax)break;song.events.push({...e,start:base+e.start,dur:Math.min(e.dur,song.bars*16-base-e.start)})}
  selection=null;edited();notify(kind==='paste'?'Takt eingefügt.':'Takt geleert.');
 }
 function previewTone(pitch){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;let ctx=null;try{ctx=new C();const t=ctx.currentTime,osc=ctx.createOscillator(),g=ctx.createGain();osc.type='sine';osc.frequency.value=440*Math.pow(2,(pitch-69)/12);osc.connect(g);g.connect(ctx.destination);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.14,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.2);osc.start(t);osc.stop(t+.22);ctx.resume().catch(()=>{});osc.onended=()=>ctx.close().catch(()=>{})}catch(e){ctx?.close().catch(()=>{})}}
 function renderMixer(){if(!song||!el('proMixer'))return;const mix=ensureMix(song);
  el('proMixer').innerHTML=tracks.map(lane=>{const m=mix[lane],name=LANES.find(x=>x.id===lane),n=song.events.filter(e=>e.lane===lane).length;
   return `<div class="pro-channel" data-lane="${lane}"><div class="pro-channel-name"><span class="mix-dot" style="background:${name.color}"></span><div><strong>${name.name}</strong><small>${n} Events</small></div></div><div class="pro-level"><label class="sr-only" for="fader-${lane}">Lautstärke ${name.name}</label><input id="fader-${lane}" data-mix="volume" type="range" min="0" max="150" value="${Math.round(m.volume*100)}" aria-label="${name.name} Lautstärke"><output>${Math.round(m.volume*100)}%</output></div><button class="mix-btn ${m.mute?'is-muted':''}" data-mix="mute" aria-pressed="${m.mute}">M</button><button class="mix-btn ${m.solo?'is-solo':''}" data-mix="solo" aria-pressed="${m.solo}">S</button></div>`
  }).join('');
  el('proMaster').value=Math.round(mix.master*100);el('proMasterOut').textContent=Math.round(mix.master*100)+'%';el('proMelTone').value=mix.melodyTone;el('proBassTone').value=mix.bassTone;
 }
 function renderArrangement(){if(!song||!el('proArrange'))return;const tags=['INTRO','VERSE','HOOK','VERSE','HOOK','BRIDGE','HOOK','OUTRO'];const parts=[];
  for(let bar=0;bar<song.bars;bar++){const count=song.events.filter(e=>e.start>=bar*16&&e.start<(bar+1)*16).length;
   parts.push(`<button class="pro-arrange-bar ${selectedBar===bar?'active':''}" data-bar="${bar}"><span class="arrange-num">${bar+1}</span><strong>${tags[Math.floor(bar/2)%tags.length]}</strong><span>${count} Hits</span></button>`)}
  el('proArrange').innerHTML=parts.join('');
 }
 function renderSongExtras(){if(!song)return;ensureMix(song);const bpm=el('proBpm'),title=el('proTitle');if(bpm&&document.activeElement!==bpm)bpm.value=song.bpm;if(title&&document.activeElement!==title)title.value=song.title||'';el('proSaved')&&(el('proSaved').textContent='● Lokal');}
 function refresh(){if(!song)return;renderSongExtras();renderArrangement();renderPiano();renderMixer();draftSave()}
 async function exportStem(){if(!song)return;const which=el('proStemTrack').value;if(!tracks.includes(which))return;const btn=el('proExportStem');btn.disabled=true;btn.textContent='Stem wird gerendert …';try{
  const trimmed=deepClone(song);ensureMix(trimmed);trimmed.mix.master=1;
  for(const lane of tracks){trimmed.mix[lane].mute=lane!==which;trimmed.mix[lane].solo=false;trimmed.mix[lane].volume=1;trimmed.mix[lane].pan=0}
  const length=Math.min(180,durationSec(trimmed)+.4),sr=44100;const ctx=new OfflineAudioContext(2,Math.ceil(sr*length),sr);
  synth(ctx,trimmed,.04);const rendered=await ctx.startRendering();downloadBlob(encodeWav(rendered),'beatforge_'+which+'_'+Date.now()+'.wav','audio/wav');notify('Stem '+which+' exportiert.');
 }catch(e){notify('Stem-Export fehlgeschlagen: '+e.message)}finally{btn.disabled=false;btn.textContent='⇩ WAV Stem exportieren'}}
 async function importProject(file){if(!file)return;try{if(file.size>2*1024*1024)throw Error('Projekt ist größer als 2 MB');const loaded=JSON.parse(await file.text());if(!validateSong(loaded))throw Error('Ungültige Projektdatei');snapshot();stopPlayback();song=loaded;ensureMix(song);selectedBar=0;selection=null;renderAll();notify('Projekt geladen.')}catch(e){notify('Import fehlgeschlagen: '+e.message)}}
 function gotoBar(delta){if(!song)return;selectedBar=(selectedBar+delta+song.bars)%song.bars;renderLanes();refresh()}
 function init(){const tab=el('editorTab');if(!tab)return;
  const main=tab.querySelector('.panel');const piano=document.createElement('section');piano.className='panel pro-panel pro-piano-panel';piano.innerHTML=`
  <div class="pro-heading"><div><span class="pro-kicker">01 / COMPOSE</span><h2>Piano Roll</h2><p>Melodien, Akkorde und 808 direkt mit dem Finger komponieren.</p></div><span class="pro-pill">16 STEPS / BAR</span></div>
  <div class="pro-toolbar"><label>Spur<select id="proLane"><option value="melody">Melodie</option><option value="chords">Akkorde</option><option value="bass">808 Bass</option></select></label><label>Oktave<select id="proOctave"><option value="2">C2–B4</option><option value="3">C3–B5</option><option value="4">C4–B6</option><option value="5">C5–B7</option></select></label><label>Notenlänge<select id="proLen"><option value="1">1/16</option><option value="2">1/8</option><option value="4">1/4</option><option value="8">1/2</option></select></label></div>
  <div class="pro-nav-row"><button id="proBarPrev" class="btn btn-outline" aria-label="Takt zurück">‹</button><strong id="proBarLabel">Takt 1 / 8</strong><button id="proBarNext" class="btn btn-outline" aria-label="Takt weiter">›</button><small id="proEventCount"></small></div>
  <div id="proPiano" class="piano-grid" role="grid" aria-label="Noteneditor"></div>
  <div class="pro-selection"><div><span class="pro-kicker">AUSGEWÄHLTE NOTE</span><strong id="proSelected">Note wählen</strong></div><div class="pro-note-actions"><button id="proDown" class="btn btn-outline" aria-label="Halbton runter">− ♭</button><button id="proUp" class="btn btn-outline" aria-label="Halbton hoch">+ ♯</button><button id="proShorter" class="btn btn-outline" aria-label="Note verkürzen">− Länge</button><button id="proLonger" class="btn btn-outline" aria-label="Note verlängern">+ Länge</button><button id="proDelete" class="btn pro-danger">Löschen</button></div></div>
  <div class="pro-utility"><button id="proUndo" class="btn btn-outline">↶ Undo</button><button id="proRedo" class="btn btn-outline">↷ Redo</button><button id="proBarCopy" class="btn btn-outline">Kopieren</button><button id="proBarPaste" class="btn btn-outline">Einfügen</button><button id="proBarClear" class="btn pro-danger">Takt leeren</button></div>
  <p class="pro-footnote">Tippen: Note hinzufügen/auswählen. Notenlänge oben festlegen, Tonhöhe und Länge unten korrigieren. Hell markierte Reihen gehören zur Skala. Das Raster ist horizontal und vertikal scrollbar. Änderungen werden automatisch lokal gespeichert.</p>`;
  tab.insertBefore(piano,main);
  const arranged=document.createElement('section');arranged.className='panel pro-panel';arranged.innerHTML=`<div class="pro-heading"><div><span class="pro-kicker">02 / ARRANGE</span><h2>Track-Arrangement</h2><p>Tippe auf einen Takt, um ihn im Piano Roll und Sequencer zu öffnen.</p></div></div><div id="proArrange" class="pro-arrange"></div>`;tab.insertBefore(arranged,main);
  const session=document.createElement('section');session.className='panel pro-panel';session.innerHTML=`<div class="pro-heading"><div><span class="pro-kicker">SESSION</span><h2>Projekt</h2></div><span id="proSaved" class="pro-autosave">● Lokal</span></div><div class="pro-toolbar"><label style="flex:2 1 145px">Projektname<input id="proTitle" maxlength="60" type="text" placeholder="Mein Beat" autocomplete="off"></label><label>Tempo<input id="proBpm" type="number" min="55" max="220" value="142"></label></div>`;
  tab.insertBefore(session,piano);
  const mixer=document.createElement('section');mixer.className='panel pro-panel';mixer.innerHTML=`<div class="pro-heading"><div><span class="pro-kicker">04 / MIX</span><h2>7-Spur Mixer</h2><p>M = stumm, S = nur diese Spur. Gilt auch beim WAV-Export.</p></div></div><div id="proMixer" class="pro-mixer"></div><div class="pro-master"><label for="proMaster">MASTER</label><input id="proMaster" type="range" min="0" max="125" value="85"><output id="proMasterOut">85%</output></div><div class="pro-toolbar"><label>Melodie Sound<select id="proMelTone"><option value="soft">Soft Keys</option><option value="pluck">Pluck</option><option value="bright">Bright Lead</option><option value="warm">Warm Pad</option></select></label><label>808 Sound<select id="proBassTone"><option value="deep">Deep Sub</option><option value="punch">Punch</option><option value="dirty">Dirty</option></select></label></div>`;
  tab.append(mixer);
  const exportSection=el('exportTab')?.querySelector('.panel');if(exportSection){const stem=document.createElement('div');stem.className='pro-stem';stem.innerHTML='<div class="pro-heading"><div><span class="pro-kicker">TRACK STEMS</span><h2>Einzelspur WAV</h2><p>Eine Spur isoliert exportieren und in einer DAW weiterbearbeiten.</p></div></div><label>Spur wählen<select id="proStemTrack"></select></label><button id="proExportStem" class="btn btn-primary">⇩ WAV Stem exportieren</button><label class="pro-project-import">Projekt JSON laden<input type="file" id="proProjectFile" accept=".json,application/json" /></label>';exportSection.append(stem);const select=el('proStemTrack');tracks.forEach(id=>select.append(new Option(LANES.find(l=>l.id===id).name,id)))}
  el('proLane').onchange=e=>{currentLane=e.target.value;octave=currentLane==='bass'?2:4;selection=null;renderPiano()};
  el('proOctave').onchange=e=>{octave=+e.target.value;renderPiano()};el('proLen').onchange=e=>{noteLength=+e.target.value};
  el('proPiano').addEventListener('click',e=>{const cell=e.target.closest('.piano-cell');if(cell)cellClick(+cell.dataset.p,+cell.dataset.step)});
  el('proPiano').addEventListener('pointerdown',e=>{const key=e.target.closest('.piano-key');if(key){const p=Number(key.dataset.pitch);if(Number.isFinite(p))previewTone(p)}});
  for(const action of ['Delete','Up','Down','Longer','Shorter'])el('pro'+action).onclick=()=>mutateNote(action.toLowerCase());
  el('proUndo').onclick=()=>revert(false);el('proRedo').onclick=()=>revert(true);
  el('proBarCopy').onclick=()=>barEdit('copy');el('proBarPaste').onclick=()=>barEdit('paste');el('proBarClear').onclick=()=>barEdit('clear');
  el('proBarPrev').onclick=()=>gotoBar(-1);el('proBarNext').onclick=()=>gotoBar(1);
  el('proArrange').onclick=e=>{const btn=e.target.closest('[data-bar]');if(btn){selectedBar=+btn.dataset.bar;renderLanes();refresh()}};
  el('barSelect')?.addEventListener('click',()=>setTimeout(refresh,0));
  el('proBpm').onchange=e=>{const value=Number(e.target.value);if(!Number.isFinite(value)||value<55||value>220){e.target.value=song.bpm;notify('Tempo nur 55–220 BPM.');return}if(value!==song.bpm){snapshot();song.bpm=Math.round(value);el('bpm').value=song.bpm;edited()}};
  el('proTitle').onchange=e=>{snapshot();song.title=e.target.value.trim().slice(0,60);renderAll()};
  el('proMixer').addEventListener('input',e=>{const line=e.target.closest('[data-lane]');if(!line||e.target.dataset.mix!=='volume')return;const m=ensureMix(song)[line.dataset.lane];m.volume=+e.target.value/100;line.querySelector('output').textContent=Math.round(m.volume*100)+'%';updateLiveMix(song);draftSave()});
  el('proMixer').addEventListener('click',e=>{const btn=e.target.closest('button[data-mix]');if(!btn)return;const name=btn.closest('[data-lane]').dataset.lane,field=btn.dataset.mix,m=ensureMix(song)[name];m[field]=!m[field];updateLiveMix(song);renderMixer();draftSave()});
  el('proMaster').oninput=e=>{ensureMix(song).master=+e.target.value/100;el('proMasterOut').textContent=e.target.value+'%';updateLiveMix(song);draftSave()};
  el('proMelTone').onchange=e=>{song.mix.melodyTone=e.target.value;if(playing){stopPlayback();notify('Sound geändert. Erneut ▶ zum Anhören.')}draftSave()};
  el('proBassTone').onchange=e=>{song.mix.bassTone=e.target.value;if(playing){stopPlayback();notify('808-Sound geändert. Erneut ▶ zum Anhören.')}draftSave()};
  el('proExportStem').onclick=exportStem;el('proProjectFile').onchange=async e=>{await importProject(e.target.files?.[0]);e.target.value=''};
  window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();revert(e.shiftKey)}else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='y'){e.preventDefault();revert(true)}});
  for(const id of ['generate','regenMelody','regenDrums','regenBass','variant','surprise','batchGenerate'])el(id)?.addEventListener('click',()=>{snapshot();selection=null},true);
  if(loadDraft())renderAll();else refresh();
  const oldNav=el('editorTab');oldNav.querySelector('.tracks-head strong').textContent='Step Sequencer / Drum-Editor';
  document.querySelector('.pocket-sub')&&(document.querySelector('.pocket-sub').textContent='PRODUCER STUDIO · V2.0');
  const menu=document.querySelector('.mobile-navitem[data-tab="editor"] span:last-child');if(menu)menu.textContent='Producer';
  const footer=document.querySelector('.footer');if(footer)footer.textContent='BEATFORGE / PRODUCER 2.0 · Touch DAW · lokales Kompositions- und Demo-Studio';
  window.BeatforgePro={refresh,undo:()=>revert(),redo:()=>revert(true),getMix:()=>deepClone(ensureMix(song)),setLane:name=>{if(pitched.includes(name)){currentLane=name;renderPiano()}},loadDraft,validateSong};
  refresh();
 }
 // Lives in a second script after the core and mobile shell are initialized.
 init();
})();