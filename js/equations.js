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
