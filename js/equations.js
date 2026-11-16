"use strict";
/* Interactive equation panels. Each demo prints the formula, labels every variable and lets the player move
   one input to watch the result change. The numbers come from the live spacecraft design, so the graph and the
   review board always agree. No libraries: plain canvas, same look as the rest of the console. */
const Eq=(()=>{
  const MONO='10px "Martian Mono",monospace';
  const dpr=()=>Math.min(2,window.devicePixelRatio||1);
  function chart(host,w,h){const c=document.createElement('canvas');host.appendChild(c);const r=dpr();
    c.width=w*r;c.height=h*r;c.style.width='100%';c.style.aspectRatio=w+'/'+h;const x=c.getContext('2d');x.setTransform(r,0,0,r,0,0);
    return {c,x,w,h};}
  function axes(g,xlab,ylab){const {x,w,h}=g;x.clearRect(0,0,w,h);x.strokeStyle='#3b2e27';x.lineWidth=1;
    x.beginPath();x.moveTo(40,10);x.lineTo(40,h-26);x.lineTo(w-10,h-26);x.stroke();
    x.fillStyle='#a39686';x.font=MONO;x.fillText(xlab,w-12-x.measureText(xlab).width,h-8);x.fillText(ylab,6,18);}
  const row=(label,val)=>`<div class="eqrow"><span>${label}</span><b class="num">${val}</b></div>`;

  /* Delta-v from the rocket equation, with the current dry mass and engine. */
  function rocket(host,d){
    const dry=Math.max(1,d.dry||600),isp=d.isp||320,need=d.need||2000,pmax=Math.max(200,Math.round((d.propMax||500)/10)*10);
    let prop=Math.min(pmax,Math.max(0,d.prop||250));
    const dv=p=>isp*9.80665*Math.log((dry+p)/dry);
    host.innerHTML=`<p class="eqf"><b>Δv = Isp × g₀ × ln(m<sub>wet</sub> ÷ m<sub>dry</sub>)</b></p>
      <p class="dim" style="font-size:.8rem">Isp ${isp} s · g₀ 9.81 m/s² · dry mass ${Math.round(dry)} kg · flight plan needs ${Math.round(need)} m/s</p>
      <label class="kicker" for="eqP">Propellant <span class="num" id="eqPL"></span></label>
      <input type="range" id="eqP" min="0" max="${pmax}" step="10" value="${prop}">
      <div class="eqgrid"><div id="eqC"></div><div id="eqR"></div></div>`;
    const g=chart(host.querySelector('#eqC'),300,180),R=host.querySelector('#eqR');
    const draw=()=>{axes(g,'propellant, kg','speed change, m/s');const {x,w,h}=g;
      const top=Math.max(dv(pmax),need)*1.1,X=p=>40+p/pmax*(w-52),Y=v=>h-26-v/top*(h-38);
      x.strokeStyle='#8fc8da';x.lineWidth=1.8;x.beginPath();for(let p=0;p<=pmax;p+=pmax/60){p?x.lineTo(X(p),Y(dv(p))):x.moveTo(X(p),Y(dv(p)));}x.stroke();
      x.strokeStyle='#ef5d52';x.setLineDash([4,3]);x.beginPath();x.moveTo(40,Y(need));x.lineTo(w-10,Y(need));x.stroke();x.setLineDash([]);
      x.fillStyle='#ef5d52';x.fillText('needed',w-58,Y(need)-5);
      x.fillStyle='#f2b84f';x.beginPath();x.arc(X(prop),Y(dv(prop)),4,0,7);x.fill();
      x.fillStyle='#efe6d9';x.fillText(`${Math.round(dv(prop))} m/s`,Math.min(X(prop)+7,w-70),Y(dv(prop))-6);
      host.querySelector('#eqPL').textContent=`${prop} kg`;
      R.innerHTML=row('wet mass',`${Math.round(dry+prop)} kg`)+row('mass ratio',( (dry+prop)/dry).toFixed(2))+row('speed change',`${Math.round(dv(prop))} m/s`)+row('flight plan',`${Math.round(need)} m/s`)+
        `<p class="dim" style="font-size:.78rem;margin:4px 0 0">Each extra kilogram of hardware makes every kilogram of propellant work harder. That is why the curve flattens.</p>`;};
    host.querySelector('#eqP').oninput=e=>{prop=+e.target.value;draw();};draw();
  }

  /* Oxygen: how many weeks each system covers, against the length of the trip. */
  function oxygen(host,d){
    const weeks=Math.max(1,Math.round(d.weeks||37)),W=Math.min(60,Math.max(weeks*1.8,20));
    host.innerHTML=`<p class="eqf"><b>weeks of oxygen = 100 ÷ percent used each week</b></p>
      <p class="dim" style="font-size:.8rem">The trip takes ${weeks} weeks. Tanks are light but finite; regenerators and electrolysis trade power and water for time.</p><div id="eqC"></div><div id="eqR"></div>`;
    const g=chart(host.querySelector('#eqC'),320,200),R=host.querySelector('#eqR');axes(g,'','weeks');
    const {x,w,h}=g,O=window.__game?__game.OXY:null;if(!O){R.textContent='';return;}
    const keys=Object.keys(O),SHORT={tanks:'Tanks',regen:'Regen',elec:'Electrolysis',hybrid:'Hybrid'},bw=(w-52)/keys.length;
    x.font='9px "Martian Mono",monospace';x.textAlign='center';
    keys.forEach((k,i)=>{const wk=100/O[k].drain,hh=Math.min(h-52,wk/W*(h-52)),px=44+i*bw+bw/2;
      x.fillStyle=wk>=weeks*1.15?'#86c994':wk>=weeks?'#f2b84f':'#ef5d52';x.fillRect(px-bw*.36,h-34-hh,bw*.72,hh);
      x.fillStyle='#efe6d9';x.fillText(Math.round(wk)+'w',px,h-40-hh);x.fillStyle='#a39686';x.fillText(SHORT[k]||k,px,h-16);});
    x.textAlign='left';
    const y=h-34-weeks/W*(h-52);x.strokeStyle='#ef5d52';x.setLineDash([4,3]);x.beginPath();x.moveTo(36,y);x.lineTo(w-10,y);x.stroke();x.setLineDash([]);
    x.fillStyle='#ef5d52';x.fillText('trip '+weeks+'w',w-64,y-4);
    R.innerHTML=keys.map(k=>row(O[k].n,`${Math.round(100/O[k].drain)} weeks`)).join('')+`<p class="dim" style="font-size:.78rem;margin:4px 0 0">One emergency reserve refills the supply once, if the system has one.</p>`;
  }

  /* Solar power falls with the square of distance. */
  function power(host,d){
    const gen=Math.max(100,d.genE||1000),load=Math.round((d.bus||300)+(d.inst||60));
    host.innerHTML=`<p class="eqf"><b>P = P<sub>Earth</sub> ÷ d²</b></p>
      <p class="dim" style="font-size:.8rem">Earth gets 100% of the array's rated power. At Mars, 1.52 AU out, the same array makes 43%.</p>
      <label class="kicker" for="eqD">Distance from the Sun <span class="num" id="eqDL"></span></label><input type="range" id="eqD" min="1" max="1.8" step="0.01" value="1.52">
      <div class="eqgrid"><div id="eqC"></div><div id="eqR"></div></div>`;
    const g=chart(host.querySelector('#eqC'),300,180),R=host.querySelector('#eqR');let dist=1.52;
    const draw=()=>{axes(g,'distance, AU','power, W');const {x,w,h}=g,top=gen*1.05,X=v=>40+(v-1)/.8*(w-52),Y=p=>h-26-p/top*(h-38);
      x.strokeStyle='#8fc8da';x.lineWidth=1.8;x.beginPath();for(let v=1;v<=1.8;v+=.01){v===1?x.moveTo(X(v),Y(gen/v/v)):x.lineTo(X(v),Y(gen/v/v));}x.stroke();
      x.strokeStyle='#ef5d52';x.setLineDash([4,3]);x.beginPath();x.moveTo(40,Y(load));x.lineTo(w-10,Y(load));x.stroke();x.setLineDash([]);
      x.fillStyle='#ef5d52';x.fillText('load',w-38,Y(load)-5);
      const out=gen/(dist*dist);x.fillStyle='#f2b84f';x.beginPath();x.arc(X(dist),Y(out),4,0,7);x.fill();
      x.fillStyle='#efe6d9';x.fillText(`${Math.round(out)} W`,Math.min(X(dist)+7,w-64),Y(out)-6);
      host.querySelector('#eqDL').textContent=`${dist.toFixed(2)} AU`;
      R.innerHTML=row('array at Earth',`${Math.round(gen)} W`)+row('at this distance',`${Math.round(out)} W`)+row('spacecraft load',`${load} W`)+
        `<p class="dim" style="font-size:.78rem;margin:4px 0 0">${out>=load?'Enough power with margin.':'Short of power. Add array area or switch something off.'}</p>`;};
    host.querySelector('#eqD').oninput=e=>{dist=+e.target.value;draw();};draw();
  }

  function attach(host,d){
    if(!host)return;
    const tabs=[['rocket','Speed change'],['oxygen','Oxygen'],['power','Solar power']];
    host.innerHTML=`<div class="eqtabs">${tabs.map((t,i)=>`<button type="button" class="ghost mini" data-eq="${t[0]}" aria-pressed="${i===0}">${t[1]}</button>`).join('')}</div><div id="eqBody"></div>`;
    const body=host.querySelector('#eqBody');
    const show=k=>{const o=Object.assign({weeks:37},d||{});
      if(k==='rocket')rocket(body,o);else if(k==='oxygen')oxygen(body,o);else power(body,o);};
    host.querySelectorAll('[data-eq]').forEach(b=>b.onclick=()=>{host.querySelectorAll('[data-eq]').forEach(x=>x.setAttribute('aria-pressed',x===b));show(b.dataset.eq);});
    show('rocket');
  }
  return {attach,rocket,oxygen,power};
})();

/* ===== Worked formulas =====
   A card that teaches one formula tied to a decision on screen. The player reads what each variable means, types the
   numbers into the blanks of the equation, and the calculator substitutes them and shows every step, the answer with
   its unit and what it means for the mission right now. Hints are optional; the full working appears only after two
   wrong tries. Wrong numbers get an explanation, never just "wrong".
   A definition (def) has: id, title, ask, formula (HTML), vars [{k,sym,name,unit,meaning,effect,dec,choices?}],
   out {sym,name,unit,dec}, tpl (equation template: strings and variable keys), get() -> {v:{k:value},ctx},
   calc(v,ctx), steps(v,ctx) -> [html], meaning(result,v,ctx) -> html, hints [html], why(k,typed,v,ctx) -> html|null,
   tol (relative tolerance for a typed value, default 2%). A variable with choices accepts any listed value. */
const FX=(()=>{
  const ST={},DEF={};
  const num=x=>{const t=String(x==null?'':x).replace(/[,\s]/g,'').replace('−','-');return t===''?NaN:Number(t);};
  const fmt=(x,d=0)=>!isFinite(x)?'—':Math.abs(x)>=1e5?Math.round(x).toLocaleString('en-US'):x.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
  const near=(a,b,tol)=>Math.abs(a-b)<=Math.max(tol*Math.abs(b),1e-9);
  const st=id=>ST[id]||(ST[id]={in:{},tries:0,hints:0,state:'',msg:'',open:false});
  function card(def){DEF[def.id]=def;const s=st(def.id);if(def.open&&!s.seen){s.open=true;s.seen=true;}
    return `<details class="fx" data-fx="${def.id}" ${s.open?'open':''}><summary><span class="fxtag">Work it out</span><b>${def.title}</b></summary><div class="fxbody"></div></details>`;}
  const valOf=(d,k,g)=>g.v[k];
  function body(id){const d=DEF[id],s=st(id),g=d.get(),V=d.vars;
    const blank=k=>{const vr=V.find(x=>x.k===k);return `<label class="fxbl ${s.mark&&s.mark[k]||''}"><input class="fxin num" inputmode="decimal" data-k="${k}" value="${s.in[k]!=null?String(s.in[k]).replace(/"/g,''):''}" aria-label="${vr.name} (${vr.unit||'no unit'})" placeholder="${vr.symText||k}"><i>${vr.sym}</i></label>`;};
    const eq=d.tpl.map(t=>V.some(x=>x.k===t)?blank(t):`<span>${t}</span>`).join('');
    return `<p class="fxask">${d.ask}</p>
      <p class="eqf fxf"><b>${d.formula}</b></p>
      <div class="tw"><table class="fxvars"><tr><th>Symbol</th><th>What it is</th><th>Value now</th><th class="fxup">If it goes up</th></tr>
        ${V.map(x=>`<tr><td class="fxsym">${x.sym}</td><td><b>${x.name}</b>${x.unit?` <span class="dim">(${x.unit})</span>`:''}<div class="dim">${x.meaning}</div><div class="dim fxeff">If it goes up: ${x.effect}</div></td><td class="num">${x.choices?x.choices.map(c=>`${c[1]}: ${fmt(c[0],x.dec||0)}`).join('<br>'):fmt(valOf(d,x.k,g),x.dec||0)+(x.unit?' '+x.unit:'')}</td><td class="dim fxup">${x.effect}</td></tr>`).join('')}
        <tr><td class="fxsym">${d.out.sym}</td><td><b>${d.out.name}</b> <span class="dim">(${d.out.unit})</span><div class="dim">What you are working out.</div></td><td class="num">?</td><td class="fxup"></td></tr></table></div>
      <p class="kicker" style="margin-top:8px">Fill in the numbers from the table</p>
      <div class="fxeq">${eq}<span>=</span><label class="fxbl ans ${s.ansMark||''}"><input class="fxin num" inputmode="decimal" data-k="__ans" value="${s.in.__ans!=null?s.in.__ans:''}" aria-label="Your answer (optional)" placeholder="?"><i>${d.out.sym} · optional</i></label><span class="dim">${d.out.unit}</span></div>
      <div class="row fxbtns"><button type="button" class="btn sm" data-fxa="calc">Calculate</button>
        <button type="button" class="ghost sm" data-fxa="hint" ${s.hints>=d.hints.length?'disabled':''}>${s.hints>=d.hints.length?'No more hints':`Hint ${s.hints+1} of ${d.hints.length}`}</button>
        ${s.tries>=2&&s.state!=='ok'?'<button type="button" class="ghost sm" data-fxa="show">Show the working</button>':''}
        ${Object.keys(s.in).length?'<button type="button" class="ghost sm" data-fxa="clear">Clear</button>':''}</div>
      ${s.hints?`<ol class="fxhints">${d.hints.slice(0,s.hints).map(h=>`<li>${h}</li>`).join('')}</ol>`:''}
      <div class="fxout" aria-live="polite">${s.msg||''}</div>`;}
  function render(el){const id=el.dataset.fx,b=el.querySelector('.fxbody');if(!DEF[id]||!b)return;b.innerHTML=body(id);wire(el);}
  function wire(el){const id=el.dataset.fx,d=DEF[id],s=st(id);
    el.querySelectorAll('.fxin').forEach(i=>{i.oninput=()=>{s.in[i.dataset.k]=i.value;};i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();act(el,'calc');}};});
    el.querySelectorAll('[data-fxa]').forEach(b=>b.onclick=()=>act(el,b.dataset.fxa));}
  function working(d,v,g){const r=d.calc(v,g.ctx);
    return {r,html:`<p class="kicker">Working</p><ol class="fxsteps">${d.steps(v,g.ctx).map(x=>`<li>${x}</li>`).join('')}</ol>
      <p class="fxres"><b>${d.out.sym} ≈ ${fmt(r,d.out.dec||0)} ${d.out.unit}</b></p><div class="fxmean">${d.meaning(r,v,g.ctx)}</div>`};}
  function act(el,a){const id=el.dataset.fx,d=DEF[id],s=st(id),g=d.get();
    if(a==='hint'){s.hints=Math.min(d.hints.length,s.hints+1);}
    else if(a==='clear'){s.in={};s.mark=null;s.ansMark='';s.msg='';s.state='';}
    else if(a==='show'){const v=Object.assign({},g.v);d.vars.forEach(x=>{if(x.choices&&s.in[x.k]!=null&&x.choices.some(c=>near(num(s.in[x.k]),c[0],d.tol||.02)))v[x.k]=num(s.in[x.k]);s.in[x.k]=String(+(+v[x.k]).toFixed(x.dec||0));});
      s.mark=Object.fromEntries(d.vars.map(x=>[x.k,'ok']));const w=working(d,v,g);s.state='ok';s.ansMark='';s.vals=JSON.stringify(g.v);
      s.msg=`<p class="dim">Here are the right numbers and the full working.</p>${w.html}`;}
    else if(a==='calc'){const v={},bad=[];s.mark={};let empty=false;
      for(const x of d.vars){const t=num(s.in[x.k]);if(!isFinite(t)){empty=true;s.mark[x.k]='empty';continue;}
        const ok=x.choices?x.choices.some(c=>near(t,c[0],d.tol||.02)):near(t,g.v[x.k],d.tol||.02);v[x.k]=t;s.mark[x.k]=ok?'ok':'bad';if(!ok)bad.push([x,t]);}
      if(empty){s.msg='<p class="warnt">Fill every box first. Each number is in the “Value now” column.</p>';}
      else if(bad.length){s.tries++;s.state='bad';s.ansMark='';
        const r=d.calc(v,g.ctx);
        s.msg=`<p class="badt">Not yet: ${bad.length===1?'one number does':`${bad.length} numbers do`} not match the spacecraft.</p><ul class="plain fxwhy">${bad.map(([x,t])=>`<li><b>${x.sym}</b>: ${explain(d,x,t,g)}</li>`).join('')}</ul>
          ${isFinite(r)?`<p class="dim">With the numbers you typed the answer would be ${fmt(r,d.out.dec||0)} ${d.out.unit}.</p>`:''}${s.tries>=2?'<p class="dim">Stuck? Try a hint, or show the working.</p>':''}`;}
      else{const w=working(d,v,g),ua=num(s.in.__ans);let note='';
        if(isFinite(ua)){const ok=near(ua,w.r,Math.max(d.tol||.02,.03));s.ansMark=ok?'ok':'bad';
          note=ok?'<p class="okt">Your own answer matches the calculator.</p>':`<p class="badt">Your answer, ${fmt(ua,d.out.dec||0)} ${d.out.unit}, does not match. ${d.ansWhy?d.ansWhy(ua,w.r,v,g.ctx)||'':''} Compare your steps with the working below.</p>`;}
        else s.ansMark='';
        s.state='ok';s.vals=JSON.stringify(g.v);s.msg=`<p class="okt">All the numbers are right.</p>${note}${w.html}`;}}
    render(el);}
  function explain(d,x,t,g){const own=d.why&&d.why(x.k,t,g.v,g.ctx);if(own)return own;const want=g.v[x.k];
    if(x.choices)return `use one of the listed values (${x.name}).`;
    if(isFinite(want)&&want!==0){const q=t/want;
      if(near(q,1000,.03)||near(q,.001,.03))return `check the units: this box takes ${x.unit}.`;
      if(near(q,100,.03)||near(q,.01,.03))return `that looks like a percentage. Use the plain number (${x.unit||'no unit'}).`;}
    const other=d.vars.find(y=>y.k!==x.k&&!y.choices&&isFinite(g.v[y.k])&&near(t,g.v[y.k],d.tol||.02));
    if(other)return `that number is ${other.sym} (${other.name}). This box is ${x.sym}: ${x.name}.`;
    return `this box is ${x.name}, and that is not its value. ${x.meaning}`;}
  /* re-read live values (the design changed): keep what was typed, recheck on the next Calculate */
  function refresh(root){(root||document).querySelectorAll('[data-fx]').forEach(el=>{const id=el.dataset.fx,s=st(id);if(!DEF[id])return;if(s.state==='ok'&&JSON.stringify(DEF[id].get().v)!==s.vals){s.state='';s.mark=null;s.msg='<p class="dim">The numbers changed. Update the boxes and calculate again.</p>';}if(el.open)render(el);});}
  function bind(root){(root||document).querySelectorAll('[data-fx]').forEach(el=>{const id=el.dataset.fx;if(el.open)render(el);
    el.addEventListener('toggle',()=>{st(id).open=el.open;if(el.open)render(el);});});}
  return {card,bind,refresh,state:ST,_act:(id,a)=>{const el=document.querySelector(`[data-fx="${id}"]`);if(el)act(el,a);}};
})();
window.FX=FX;

