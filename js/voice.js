"use strict";
/* Narration, kept apart from the game logic. The game only ever calls Voice.say(text, who) and Voice.stop().
   Two sources, tried in this order:
   1. Recorded lines. If assets/voice/manifest.json exists ({"<key>":"file.mp3"}, where key = Voice.key(text)),
      that file is played. This is where lines made with a voice-design service would go.
   2. The browser's own speech synthesis, set low and slow.
   Narration is off until the player turns it on. The choice and the volume are remembered.
   Subtitles are always shown, so nothing is lost when narration is off or unavailable. */
const Voice=(()=>{
  let on=false,vol=.9,voice=null,man=null,aud=null;
  try{on=localStorage.getItem('mcb-voice')==='1';const v=parseFloat(localStorage.getItem('mcb-voice-vol'));if(v>=0&&v<=1)vol=v;}catch(e){}
  const synth=window.speechSynthesis||null;
  const key=t=>{let h=2166136261;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};
  function pick(){if(!synth)return;const vs=synth.getVoices().filter(v=>/^en/i.test(v.lang));if(!vs.length)return;
    const male=/Daniel|Aaron|Alex\b|Fred|Guy|David|Mark|Ryan|Male/i,us=/en[-_]US/i;
    voice=vs.find(v=>male.test(v.name)&&us.test(v.lang))||vs.find(v=>male.test(v.name))||vs.find(v=>us.test(v.lang))||vs[0];}
  if(synth){pick();if(synth.addEventListener)synth.addEventListener('voiceschanged',pick);}
  try{fetch('assets/voice/manifest.json').then(r=>r.ok?r.json():null).then(j=>{man=j;}).catch(()=>{});}catch(e){}
  /* one narrator; character lines are the same voice pitched slightly differently */
  const PITCH={narrator:.6,reyes:.95,lind:.75,park:1.1};
  function stop(){try{if(synth)synth.cancel();}catch(e){}if(aud){try{aud.pause();}catch(e){}aud=null;}}
  function say(text,who){if(!on||!text)return false;stop();const t=String(text).replace(/<[^>]+>/g,'');
    const f=man&&man[key(t)];if(f){aud=new Audio('assets/voice/'+f);aud.volume=vol;aud.play().catch(()=>{});return true;}
    if(!synth)return false;if(!voice)pick();
    try{const u=new SpeechSynthesisUtterance(t);if(voice)u.voice=voice;u.lang='en-US';u.pitch=PITCH[who]||PITCH.narrator;u.rate=.9;u.volume=vol;synth.speak(u);}catch(e){return false;}
    return true;}
  return {say,stop,key,est:t=>1.3+t.length*.074,get on(){return on},get vol(){return vol},get available(){return !!synth||!!man},get voiceName(){return voice?voice.name:''},
    set(v){on=!!v;try{localStorage.setItem('mcb-voice',on?'1':'0');}catch(e){}if(!on)stop();},
    setVol(v){vol=Math.max(0,Math.min(1,+v||0));try{localStorage.setItem('mcb-voice-vol',String(vol));}catch(e){}}};
})();
