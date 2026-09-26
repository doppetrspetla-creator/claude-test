/* LightLab – UI, půdorys, interakce */
(function(){
'use strict';
var S = window.LightSim, $ = function(id){ return document.getElementById(id); };
var cv = $('stage'), ctx = cv.getContext('2d'), wrap = $('planWrap'), center = $('center');
var scene, sel = null, uid = 1, res = null, meas = null, scale = 80, ox = 40, oy = 40, fineTimer = null, view3dReady = false, hover = null;
var off = document.createElement('canvas'), offx = off.getContext('2d');
var KIND = { light:'💡', person:'🧑', camera:'🎥', flag:'🏴', bounce:'⬜', box:'📦' };
var KINDNAME = { light:'Světlo', person:'Postava', camera:'Kamera', flag:'Vlajka', bounce:'Odrazka', box:'Nábytek' };

function blank(){ return { room:{w:7,h:5,z:2.7}, walls:'normal', floor:'wood', window:{on:true,wall:'left',from:1.6,to:3.4,sky:'overcast'}, items:[] }; }
function light(fix, x, y, rot, extra){ var f=S.FIXTURES[fix]; var L={kind:'light',id:uid++,fixture:fix,mod:f.defMod,x:x,y:y,h:1.7,rot:rot,power:70,cct:f.cct,zoom:30,grid:false,diff:false,barn:false,gel:'none',on:true,label:''}; for(var k in extra) L[k]=extra[k]; if(fix==='lamp') L.h=extra&&extra.h!=null?extra.h:1.0; if(fix==='tube') L.h=extra&&extra.h!=null?extra.h:1.5; return L; }
function item(kind, x, y, rot, extra){ var o={kind:kind,id:uid++,x:x,y:y,rot:rot||0}; if(kind==='flag') o.len=0.9; if(kind==='bounce'){o.len=1.0;o.flip=false;o.silver=false;o.black=false;} if(kind==='box'){o.w=1.2;o.d=0.6;o.tall=false;} if(kind==='camera'){o.focal=35;o.h=1.5;o.aim=true;} for(var k in extra) o[k]=extra[k]; return o; }

var TEMPL = {
  window: function(){ var s=blank(); s.items=[item('person',2.6,2.5,1.6), item('camera',4.4,3.5,Math.PI+0.5,{focal:50}), item('flag',3.15,2.05,-0.9,{len:0.9}), light('lamp',5.9,0.8,0), item('box',6.0,1.2,0,{w:0.8,d:0.5})]; s.window={on:true,wall:'left',from:1.4,to:3.2,sky:'overcast'}; return s; },
  three: function(){ var s=blank(); s.window.on=false; s.items=[item('person',3.5,2.2,Math.PI/2-0.35), item('camera',3.5,4.3,-Math.PI/2,{focal:50}), light('cob300',2.2,3.4,-0.75,{mod:'softbox90',power:80,label:'KEY',h:1.9}), light('cob100',4.8,3.6,-2.2,{mod:'softbox60',power:25,label:'FILL',h:1.6}), light('cob100',4.6,0.9,2.25,{mod:'fresnel',zoom:20,power:10,cct:4300,label:'BACK',h:2.2})]; return s; },
  night: function(){ var s=blank(); s.walls='dark'; s.floor='dark'; s.window={on:false,wall:'top',from:4.6,to:6.2,sky:'dusk'}; s.items=[item('person',3.2,2.6,0.95), item('camera',5.2,3.9,Math.PI+0.58,{focal:35}), light('lamp',2.5,1.9,0,{h:0.95}), light('tube',6.6,2.2,Math.PI,{power:20,cct:3200,label:'tuba'}), item('box',2.5,1.9,0,{w:0.6,d:0.6})]; return s; },
  rembrandt: function(){ var s=blank(); s.walls='dark'; s.window.on=false; s.items=[item('person',3.5,2.5,Math.PI/2), item('camera',3.5,4.4,-Math.PI/2,{focal:85}), light('cob300',2.0,3.6,-0.6,{mod:'octa120',power:60,label:'KEY',h:2.1}), item('bounce',5.0,3.3,2.06,{len:1.0,flip:false}), item('flag',2.9,1.3,0,{len:1.2})]; return s; },
  empty: function(){ var s=blank(); s.window.on=false; return s; }
};

// ---------- undo/redo + autosave ----------
var hist=[], hpos=-1, histTimer=null;
function snapshot(){ var j=JSON.stringify(scene); if(hist[hpos]===j) return; hist=hist.slice(0,hpos+1); hist.push(j); if(hist.length>80) hist.shift(); hpos=hist.length-1; try{ localStorage.setItem('lightlab-scene',j);}catch(e){} updUndo(); }
function snapshotSoon(){ clearTimeout(histTimer); histTimer=setTimeout(snapshot,400); }
function restore(j){ scene=JSON.parse(j); sel=null; fixIds(); syncRoom(); props(); fit(); schedule(); updUndo(); }
function undo(){ if(hpos>0){ hpos--; restore(hist[hpos]); } }
function redo(){ if(hpos<hist.length-1){ hpos++; restore(hist[hpos]); } }
function updUndo(){ $('bUndo').disabled=hpos<=0; $('bRedo').disabled=hpos>=hist.length-1; }
function fixIds(){ uid=1+Math.max.apply(null,scene.items.map(function(i){return i.id||0;}).concat([0])); scene.items.forEach(function(i){ if(i.id==null) i.id=uid++; }); if(!scene.room.z) scene.room.z=2.7; if(!scene.floor) scene.floor='wood'; scene.items.forEach(function(i){ if(i.kind==='light'&&i.h==null) i.h=1.7; if(i.kind==='camera'){ if(i.h==null) i.h=1.5; if(i.aim==null) i.aim=true; } }); }

// ---------- mapování ----------
function fit(){ var r=wrap.getBoundingClientRect(); if(r.width<2) return; cv.width=r.width*devicePixelRatio; cv.height=r.height*devicePixelRatio; cv.style.width=r.width+'px'; cv.style.height=r.height+'px';
  var W=scene.room.w, H=scene.room.h, pad=44; scale=Math.min((r.width-2*pad)/W,(r.height-2*pad)/H); ox=(r.width-W*scale)/2; oy=(r.height-H*scale)/2+8; draw(); }
function toPx(x,y){ return [ox+x*scale, oy+y*scale]; }
function toM(px,py){ return [(px-ox)/scale, (py-oy)/scale]; }

// ---------- výpočet ----------
function recompute(cell){ res=S.compute(scene,cell); meas=S.measure(scene,res); renderMap(); updateMeter(); draw(); sync3d(); }
function schedule(){ recompute(0.12); clearTimeout(fineTimer); fineTimer=setTimeout(function(){ recompute(0.035); },180); objList(); snapshotSoon(); }
function exposureRef(){ var ev=parseFloat($('ev').value); var base=($('autoEv').checked && meas && meas.lux>0.5) ? meas.lux : 300; return base*Math.pow(2,-ev); }
function sync3d(){ if(!view3dReady) return; var cam=scene.items.some(function(i){return i.kind==='camera';}); $('camHint').classList.toggle('hide',cam); if(cam){ var c=scene.items.find(function(i){return i.kind==='camera';}); $('camInfo').textContent=c.focal+' mm · výška '+c.h.toFixed(2).replace('.',',')+' m'; }
  window.View3D.sync(scene,res,meas,{ref:($('autoEv').checked&&meas&&meas.lux>0.5)?meas.lux:300, ev:parseFloat($('ev').value), shadows:$('shadows').checked}); window.View3D.setSel(sel?sel.id:null); }

function renderMap(){
  var nx=res.nx, ny=res.ny; off.width=nx; off.height=ny; var img=offx.createImageData(nx,ny), d=img.data, ref=exposureRef(), zeb=$('zebra').checked;
  function tm(v){ return Math.pow(1-Math.exp(-v*1.25),1/1.5); }
  for(var j=0;j<ny;j++) for(var i=0;i<nx;i++){ var k=j*nx+i, p=k*4, r=res.R[k]/ref, g=res.G[k]/ref, b=res.B[k]/ref, R=tm(r),G=tm(g),B=tm(b);
    if(zeb && (r>2.6||g>2.6||b>2.6) && ((i+j)%4<2)){ R=1;G=0.25;B=0.25; }
    d[p]=Math.min(255,12+R*243); d[p+1]=Math.min(255,11+G*244); d[p+2]=Math.min(255,10+B*245); d[p+3]=255; }
  offx.putImageData(img,0,0);
}

// ---------- kreslení půdorysu ----------
function draw(){
  var dpr=devicePixelRatio; ctx.setTransform(dpr,0,0,dpr,0,0); var r=wrap.getBoundingClientRect(); ctx.clearRect(0,0,r.width,r.height);
  var W=scene.room.w, H=scene.room.h, p0=toPx(0,0);
  if(res){ ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'; ctx.drawImage(off,p0[0],p0[1],res.nx*res.cell*scale,res.ny*res.cell*scale); }
  if($('gridOn').checked){ ctx.strokeStyle='rgba(255,255,255,.07)'; ctx.lineWidth=1; for(var x=1;x<W;x++){ var a=toPx(x,0),b=toPx(x,H); ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); } for(var y=1;y<H;y++){ var a2=toPx(0,y),b2=toPx(W,y); ctx.beginPath(); ctx.moveTo(a2[0],a2[1]); ctx.lineTo(b2[0],b2[1]); ctx.stroke(); } }
  ctx.strokeStyle='#8a8277'; ctx.lineWidth=5; ctx.strokeRect(p0[0],p0[1],W*scale,H*scale);
  var w=scene.window; if(w.on){ var a,b; if(w.wall==='left'){a=toPx(0,w.from);b=toPx(0,w.to);} else if(w.wall==='right'){a=toPx(W,w.from);b=toPx(W,w.to);} else if(w.wall==='top'){a=toPx(w.from,0);b=toPx(w.to,0);} else {a=toPx(w.from,H);b=toPx(w.to,H);} ctx.strokeStyle='#0a0a0a'; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); ctx.strokeStyle='#8fc0e8'; ctx.lineWidth=3; ctx.stroke(); }
  ctx.fillStyle='#8f8a80'; ctx.font='11px Inter,Lato,sans-serif'; var sb=toPx(0,H); ctx.fillRect(sb[0],sb[1]+14,scale,2); ctx.fillText('1 m',sb[0],sb[1]+30);
  ctx.fillText(W.toString().replace('.',',')+' × '+H.toString().replace('.',',')+' m', sb[0]+scale+14, sb[1]+30);
  scene.items.forEach(function(it){ if(it.kind!=='light') drawItem(it); }); scene.items.forEach(function(it){ if(it.kind==='light') drawItem(it); });
  if(meas){ meas.sides.forEach(function(s){ var q=toPx(s.x,s.y); ctx.fillStyle= s.E===meas.lux ? '#d4b071':'#6c93c9'; ctx.beginPath(); ctx.arc(q[0],q[1],3.2,0,7); ctx.fill(); }); }
}
function rotHandle(it){ var L = it.kind==='camera'?0.55:(it.kind==='light'?0.6:0.5); return [it.x+Math.cos(it.rot)*L, it.y+Math.sin(it.rot)*L]; }
function drawItem(it){
  var p=toPx(it.x,it.y), s=scale, isSel=(sel===it), isHov=(hover===it);
  ctx.save(); ctx.translate(p[0],p[1]); ctx.rotate(it.rot);
  if(it.kind==='light'){ var m=S.MODS[it.mod], P=S.lightParams(it), wpx=Math.max(10,P.size*s), c=S.kelvinRGB(P.cct), colS='rgb('+Math.round(c[0]*255)+','+Math.round(c[1]*255)+','+Math.round(c[2]*255)+')';
    if($('beams').checked && !P.omni && it.on!==false){ var half=P.beam/2*Math.PI/180, R=3.2*s; ctx.fillStyle='rgba(212,176,113,.08)'; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R,-half,half); ctx.closePath(); ctx.fill(); ctx.strokeStyle='rgba(212,176,113,.45)'; ctx.setLineDash([4,4]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(half)*R,Math.sin(half)*R); ctx.moveTo(0,0); ctx.lineTo(Math.cos(-half)*R,Math.sin(-half)*R); ctx.stroke(); ctx.setLineDash([]); }
    if(P.omni){ ctx.fillStyle=colS; ctx.beginPath(); if(it.mod==='tube'){ ctx.roundRect(-4,-wpx/2,8,wpx,3); } else ctx.arc(0,0,Math.max(6,P.size*s/2),0,7); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.stroke(); }
    else if(m.soft){ ctx.fillStyle='#3a3a3a'; ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(4,-wpx/2); ctx.lineTo(4,wpx/2); ctx.lineTo(-12,wpx*0.22); ctx.lineTo(-12,-wpx*0.22); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.strokeStyle=colS; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(4,-wpx/2); ctx.lineTo(4,wpx/2); ctx.stroke(); if(it.grid){ ctx.strokeStyle='#111'; ctx.lineWidth=1; for(var g=-wpx/2+3; g<wpx/2; g+=4){ ctx.beginPath(); ctx.moveTo(4,g); ctx.lineTo(8,g); ctx.stroke(); } } }
    else { ctx.fillStyle='#3a3a3a'; ctx.beginPath(); ctx.arc(-4,0,9,0,7); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.stroke(); ctx.fillStyle=colS; ctx.fillRect(4,-6,5,12); if(it.barn){ ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(9,-6); ctx.lineTo(16,-11); ctx.moveTo(9,6); ctx.lineTo(16,11); ctx.stroke(); } }
    if(it.gel!=='none'){ ctx.fillStyle= it.gel==='cto' ? '#e69a3c':'#4f86d6'; ctx.fillRect(6,-4,3,8); }
    if(it.on===false){ ctx.strokeStyle='#d0534a'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-10,-10); ctx.lineTo(10,10); ctx.moveTo(10,-10); ctx.lineTo(-10,10); ctx.stroke(); }
  } else if(it.kind==='person'){ ctx.fillStyle='#55504a'; ctx.beginPath(); ctx.ellipse(-2,0,0.1*s,0.24*s,0,0,7); ctx.fill(); ctx.fillStyle='#d9b597'; ctx.beginPath(); ctx.moveTo(0.1*s,-0.035*s); ctx.lineTo(0.15*s,0); ctx.lineTo(0.1*s,0.035*s); ctx.fill(); ctx.beginPath(); ctx.arc(0,0,0.11*s,0,7); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.stroke(); }
  else if(it.kind==='camera'){ if($('beams').checked){ var fov=2*Math.atan(36/2/(it.focal||35)), R2=3.5*s; ctx.fillStyle='rgba(140,180,230,.06)'; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R2,-fov/2,fov/2); ctx.closePath(); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.setLineDash([3,4]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(fov/2)*R2,Math.sin(fov/2)*R2); ctx.moveTo(0,0); ctx.lineTo(Math.cos(-fov/2)*R2,Math.sin(-fov/2)*R2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle='#111'; ctx.strokeStyle='#d4b071'; ctx.lineWidth=1; ctx.fillRect(-16,-9,22,18); ctx.strokeRect(-16,-9,22,18); ctx.fillRect(6,-5,10,10); ctx.strokeRect(6,-5,10,10); }
  else if(it.kind==='flag'){ var L=it.len*s; ctx.fillStyle='#111'; ctx.strokeStyle='#555'; ctx.fillRect(-L/2,-3,L,6); ctx.strokeRect(-L/2,-3,L,6); }
  else if(it.kind==='bounce'){ var L2=it.len*s; ctx.fillStyle= it.black?'#111': (it.silver?'#c9ccd1':'#f4f1e8'); ctx.strokeStyle='#666'; ctx.fillRect(-L2/2,-3,L2,6); ctx.strokeRect(-L2/2,-3,L2,6); ctx.fillStyle='#d4b071'; var sg=it.flip?-1:1; ctx.beginPath(); ctx.moveTo(-4,sg*6); ctx.lineTo(4,sg*6); ctx.lineTo(0,sg*11); ctx.fill(); }
  else if(it.kind==='box'){ ctx.rotate(-it.rot); ctx.fillStyle= it.tall?'rgba(40,34,30,.95)':'rgba(60,50,42,.55)'; ctx.strokeStyle='#6b5a4a'; ctx.fillRect(-it.w*s/2,-it.d*s/2,it.w*s,it.d*s); ctx.strokeRect(-it.w*s/2,-it.d*s/2,it.w*s,it.d*s); }
  ctx.restore();
  if(isSel||isHov){ ctx.strokeStyle= isSel?'#d4b071':'rgba(212,176,113,.4)'; ctx.setLineDash([3,3]); ctx.lineWidth=1; ctx.beginPath(); ctx.arc(p[0],p[1],22,0,7); ctx.stroke(); ctx.setLineDash([]); }
  if(isSel && it.kind!=='box'){ var h=toPx.apply(null,rotHandle(it)); ctx.strokeStyle='rgba(212,176,113,.6)'; ctx.beginPath(); ctx.moveTo(p[0],p[1]); ctx.lineTo(h[0],h[1]); ctx.stroke(); ctx.fillStyle='#d4b071'; ctx.beginPath(); ctx.arc(h[0],h[1],6,0,7); ctx.fill(); }
  if(it.kind==='light'){ var nm=it.label||S.FIXTURES[it.fixture].name; ctx.fillStyle= it.label?'#ece8e0':'rgba(236,232,224,.55)'; ctx.font=(it.label?'bold ':'')+'11px Inter,Lato,sans-serif'; ctx.fillText(nm,p[0]+14,p[1]-14); }
  if(it.kind==='camera'){ ctx.fillStyle='rgba(236,232,224,.6)'; ctx.font='11px Inter,Lato,sans-serif'; ctx.fillText((it.focal||35)+' mm',p[0]+14,p[1]-14); }
}

// ---------- měřák ----------
function fmt(n,d){ return n.toFixed(d).replace('.',','); }
function updateMeter(){
  if(!meas){ $('mLux').textContent='–'; $('mStop').textContent=''; $('mRatio').textContent='přidej postavu'; $('contrib').innerHTML=''; $('mSide').textContent=''; return; }
  $('mLux').textContent=Math.round(meas.lux)+' lx';
  var ev100 = Math.log(meas.lux/2.5)/Math.LN2; // EV při ISO 100 (K≈2,5 pro lux)
  $('mStop').textContent='≈ EV '+fmt(ev100,1)+' (ISO 100) · f/2,8 · 1/50 s → ISO '+Math.max(100,Math.round(100*Math.pow(2, 9.3-ev100)/100)*100);
  $('mRatio').textContent= meas.stops>6 ? 'víc než 64 : 1' : fmt(meas.ratio,1)+' : 1  ('+fmt(meas.stops,1)+' EV)';
  var pos=Math.min(1,meas.stops/3.2); $('mBar').style.left='calc('+(pos*100)+'% - 1px)';
  $('mSide').textContent = meas.stops<0.5?'Plochý obličej – přidej směr nebo odeber doplňkové světlo.': meas.stops<1.6?'Měkké, přívětivé (rozhovor, korporát).': meas.stops<2.6?'Modelované, filmové.':'Dramatické, low-key.';
  var html='', rows=[];
  scene.items.forEach(function(it){ if(it.kind==='light'||it.kind==='bounce'){ rows.push([it.label||(it.kind==='bounce'?'Odrazka':S.FIXTURES[it.fixture].name)+(it.on===false?' (vyp.)':''), meas.per[it.id]||0, meas.perDark[it.id]||0]); } });
  if(scene.window.on) rows.push(['Okno', meas.per.win||0, meas.perDark.win||0]);
  rows.push(['Rozptyl od stěn', (res.amb||0)*0.5, (res.amb||0)*0.5]);
  var mx=Math.max.apply(null,rows.map(function(r){return Math.max(r[1],r[2]);}).concat([1]));
  html+='<div class="c mut"><span></span><span class="bar" style="background:none"></span><b style="font-weight:500">světlá / stinná</b></div>';
  rows.forEach(function(r){ html+='<div class="c"><span>'+r[0]+'</span><span class="bar"><i style="width:'+(r[1]/mx*100)+'%"></i><i class="lo" style="width:'+(r[2]/mx*100)+'%"></i></span><b>'+Math.round(r[1])+' / '+Math.round(r[2])+' lx</b></div>'; });
  $('contrib').innerHTML=html||'<span class="mut">Žádná světla.</span>';
}

// ---------- seznam objektů ----------
function itemName(it){ if(it.kind==='light') return (it.label?it.label+' · ':'')+S.FIXTURES[it.fixture].name+' · '+S.MODS[it.mod].name.split(' ')[0]; if(it.kind==='camera') return 'Kamera '+(it.focal||35)+' mm'; if(it.kind==='box') return it.tall?'Skříň / stěna':'Stůl'; return KINDNAME[it.kind]; }
function objList(){
  var el=$('objList'), h='';
  scene.items.forEach(function(it){ h+='<div class="item'+(sel===it?' sel':'')+'" data-id="'+it.id+'"><span class="ic">'+KIND[it.kind]+'</span><span class="nm'+(it.on===false?' off':'')+'">'+itemName(it)+'</span>'+(it.kind==='light'?'<button data-tog="'+it.id+'" title="Zapnout / vypnout (H)">'+(it.on===false?'○':'●')+'</button>':'')+'<button data-del="'+it.id+'" title="Smazat">✕</button></div>'; });
  el.innerHTML=h||'<p class="mut" style="margin:4px 6px">Scéna je prázdná.</p>';
  el.querySelectorAll('.item').forEach(function(d){ d.onclick=function(e){ var t=e.target; if(t.dataset.tog){ var L=byId(t.dataset.tog); L.on=L.on===false; props(); schedule(); return; } if(t.dataset.del){ del(byId(t.dataset.del)); return; } select(byId(d.dataset.id)); }; });
}
function byId(id){ id=+id; return scene.items.find(function(i){return i.id===id;}); }
function select(it){ sel=it; props(); objList(); draw(); if(view3dReady) window.View3D.setSel(sel?sel.id:null); }
function del(it){ if(!it) return; scene.items=scene.items.filter(function(o){return o!==it;}); if(sel===it) sel=null; props(); schedule(); }
function dup(it){ if(!it) return; var c=JSON.parse(JSON.stringify(it)); c.id=uid++; c.x=Math.min(scene.room.w-0.1,c.x+0.4); c.y=Math.min(scene.room.h-0.1,c.y+0.4); scene.items.push(c); select(c); schedule(); }

// ---------- vlastnosti ----------
function props(){
  var el=$('props'); $('selKind').textContent= sel?KINDNAME[sel.kind]:''; if(!sel){ el.innerHTML='<p class="mut">Klikni na objekt ve scéně nebo v seznamu.</p>'; return; }
  var it=sel, h='';
  function rng(k,lab,min,max,step,unit){ h+='<label>'+lab+' <span class="pill" id="v_'+k+'">'+fmtv(k,it[k])+'</span></label><input type="range" data-k="'+k+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+it[k]+'">'; }
  function chk(k,lab){ h+='<label class="chk"><input type="checkbox" data-k="'+k+'"'+(it[k]?' checked':'')+'> '+lab+'</label>'; }
  function selc(k,lab,opts){ h+='<label>'+lab+'</label><select data-k="'+k+'">'+Object.keys(opts).map(function(o){return '<option value="'+o+'"'+(o===it[k]?' selected':'')+'>'+opts[o]+'</option>';}).join('')+'</select>'; }
  h+='<div class="row"><div><label>X (m)</label><input type="number" data-k="x" step="0.05" value="'+it.x.toFixed(2)+'"></div><div><label>Y (m)</label><input type="number" data-k="y" step="0.05" value="'+it.y.toFixed(2)+'"></div><div><label>Otočení (°)</label><input type="number" data-k="rotDeg" step="5" value="'+Math.round(it.rot*180/Math.PI)+'"></div></div>';
  if(it.kind==='light'){
    h+='<label>Popisek</label><input type="text" data-k="label" value="'+(it.label||'')+'" placeholder="např. KEY, FILL, BACK">';
    var fx={}; Object.keys(S.FIXTURES).forEach(function(k){fx[k]=S.FIXTURES[k].name;}); selc('fixture','Světlo',fx);
    var md={}; Object.keys(S.MODS).forEach(function(k){md[k]=S.MODS[k].name;}); selc('mod','Modifikátor',md);
    rng('power','Výkon',1,100,1,'%'); rng('cct','Teplota chromatičnosti',2700,6500,100,'K'); rng('h','Výška zdroje',0.3,Math.max(0.5,(scene.room.z||2.7)-0.1),0.05,'m');
    if(S.MODS[it.mod].zoom) rng('zoom','Fresnel – úhel',12,60,1,'°');
    h+='<div class="row">'; chk('grid','Voština'); chk('diff','Difuze'); chk('barn','Klapky'); h+='</div>';
    selc('gel','Gel',{none:'bez gelu',cto:'CTO (oteplit)',ctb:'CTB (ochladit)'});
    chk('on','Zapnuto');
    var P=S.lightParams(it); h+='<p class="mut">V ose: ≈ '+Math.round(P.E1)+' lx @ 1 m, '+Math.round(P.E1/4)+' lx @ 2 m · úhel '+P.beam+'°</p>';
  } else if(it.kind==='camera'){ rng('focal','Ohnisko (full frame)',14,135,1,'mm'); rng('h','Výška kamery',0.3,2.4,0.05,'m'); chk('aim','Mířit na obličej postavy'); if(!it.aim) rng('tilt','Náklon nahoru/dolů',-0.6,0.6,0.02,''); }
  else if(it.kind==='person'){ h+='<p class="mut">Otočení určuje, kam se postava dívá. Měří se obě tváře (zlatá = světlejší).</p>'; }
  else if(it.kind==='flag'){ rng('len','Délka',0.3,2.4,0.1,'m'); }
  else if(it.kind==='bounce'){ rng('len','Šířka',0.3,2.4,0.1,'m'); chk('silver','Stříbrná'); chk('black','Černá (negativní fill)'); chk('flip','Otočit lícovou stranu'); }
  else if(it.kind==='box'){ rng('w','Šířka',0.3,3,0.1,'m'); rng('d','Hloubka',0.3,3,0.1,'m'); chk('tall','Vysoký – vrhá stín (skříň, stěna)'); }
  h+='<div class="row" style="margin-top:12px"><button class="btn" id="bDup">Duplikovat <span class="kbd">D</span></button><button class="btn danger" id="bDel">Smazat <span class="kbd">Del</span></button></div>';
  el.innerHTML=h;
  el.querySelectorAll('[data-k]').forEach(function(inp){ inp.addEventListener('input',function(){ var k=inp.dataset.k, v;
    if(inp.type==='checkbox') v=inp.checked; else if(inp.type==='range'||inp.type==='number') v=parseFloat(inp.value); else v=inp.value;
    if(k==='rotDeg'){ if(isNaN(v)) return; it.rot=v*Math.PI/180; schedule(); return; }
    if((k==='x'||k==='y') && isNaN(v)) return;
    it[k]=v; if(k==='fixture'){ var f=S.FIXTURES[v]; it.mod=f.defMod; it.cct=f.cct; props(); }
    if(k==='mod'||k==='aim') props();
    var pv=$('v_'+k); if(pv) pv.textContent=fmtv(k,v);
    schedule(); }); });
  $('bDel').onclick=function(){ del(sel); };
  $('bDup').onclick=function(){ dup(sel); };
}
function fmtv(k,v){ var u={power:' %',cct:' K',zoom:'°',focal:' mm',len:' m',w:' m',d:' m',h:' m',tilt:''}[k]||''; return (typeof v==='number'? (k==='h'||k==='len'||k==='w'||k==='d'?fmt(v,2):k==='tilt'?fmt(v,2):v):v)+u; }

// ---------- interakce ----------
var drag=null;
function mpos(e){ var r=cv.getBoundingClientRect(); return [e.clientX-r.left, e.clientY-r.top]; }
function pick(mx,my){
  if(sel && sel.kind!=='box'){ var h=toPx.apply(null,rotHandle(sel)); if(Math.hypot(mx-h[0],my-h[1])<10) return {it:sel,rot:true}; }
  for(var i=scene.items.length-1;i>=0;i--){ var it=scene.items[i], p=toPx(it.x,it.y), rr=18;
    if(it.kind==='box') rr=Math.max(it.w,it.d)*scale/2; if(it.kind==='flag'||it.kind==='bounce') rr=Math.max(14,it.len*scale/2);
    if(it.kind==='flag'||it.kind==='bounce'){ var c=Math.cos(it.rot), s=Math.sin(it.rot), dx=mx-p[0], dy=my-p[1], u=dx*c+dy*s, v=-dx*s+dy*c; if(Math.abs(u)<=rr && Math.abs(v)<=9) return {it:it}; continue; }
    if(Math.hypot(mx-p[0],my-p[1])<=rr) return {it:it}; }
  return null;
}
function snapv(v){ return $('snap').checked ? Math.round(v/0.1)*0.1 : v; }
cv.addEventListener('pointerdown',function(e){ var m=mpos(e), hit=pick(m[0],m[1]); cv.setPointerCapture(e.pointerId);
  if(hit){ var w=toM(m[0],m[1]); drag={it:hit.it,rot:!!hit.rot,dx:hit.it.x-w[0],dy:hit.it.y-w[1],moved:false}; if(sel!==hit.it) select(hit.it); } else select(null); });
cv.addEventListener('pointermove',function(e){ var m=mpos(e);
  if(!drag){ var h=pick(m[0],m[1]); var nh=h?h.it:null; if(nh!==hover){ hover=nh; draw(); } cv.style.cursor= h ? (h.rot?'grab':'move') : 'default'; return; }
  var w=toM(m[0],m[1]), it=drag.it; drag.moved=true;
  if(drag.rot){ it.rot=Math.atan2(w[1]-it.y,w[0]-it.x); if(e.shiftKey) it.rot=Math.round(it.rot/(Math.PI/12))*(Math.PI/12); }
  else { it.x=Math.max(0.05,Math.min(scene.room.w-0.05,snapv(w[0]+drag.dx))); it.y=Math.max(0.05,Math.min(scene.room.h-0.05,snapv(w[1]+drag.dy))); }
  recompute(0.12); clearTimeout(fineTimer); fineTimer=setTimeout(function(){ recompute(0.035); },180); });
cv.addEventListener('pointerup',function(){ if(drag&&drag.moved){ props(); snapshotSoon(); } drag=null; });
cv.addEventListener('wheel',function(e){ if(!sel) return; e.preventDefault(); sel.rot+=(e.deltaY>0?1:-1)*Math.PI/36; props(); schedule(); },{passive:false});
window.addEventListener('keydown',function(e){ var tag=document.activeElement.tagName; if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return;
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); if(e.shiftKey) redo(); else undo(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); return; }
  if(e.key==='1'||e.key==='2'||e.key==='3'){ setView(['split','plan','cam'][+e.key-1]); return; }
  if(!sel) return;
  if(e.key==='Delete'||e.key==='Backspace'){ del(sel); }
  else if(e.key.toLowerCase()==='d'){ dup(sel); }
  else if(e.key.toLowerCase()==='h' && sel.kind==='light'){ sel.on=sel.on===false; props(); schedule(); }
  else if(e.key.startsWith('Arrow')){ e.preventDefault(); var st=e.shiftKey?0.25:0.05; if(e.key==='ArrowLeft') sel.x-=st; if(e.key==='ArrowRight') sel.x+=st; if(e.key==='ArrowUp') sel.y-=st; if(e.key==='ArrowDown') sel.y+=st; sel.x=Math.max(0.05,Math.min(scene.room.w-0.05,sel.x)); sel.y=Math.max(0.05,Math.min(scene.room.h-0.05,sel.y)); props(); schedule(); }
});

document.querySelectorAll('[data-add]').forEach(function(b){ b.onclick=function(){ var k=b.dataset.add, cx=scene.room.w/2, cy=scene.room.h/2, o;
  if(S.FIXTURES[k]) o=light(k,cx-1,cy-1,0.8); else o=item(k,cx+0.5,cy+0.5,k==='camera'?Math.PI:0);
  if(k==='camera' && scene.items.some(function(i){return i.kind==='camera';})){ o.x=cx+1.2; }
  scene.items.push(o); select(o); schedule(); }; });

function syncRoom(){ $('walls').value=scene.walls||'normal'; $('floor').value=scene.floor||'wood'; $('rw').value=scene.room.w; $('rh').value=scene.room.h; $('rz').value=scene.room.z||2.7; $('winOn').checked=scene.window.on; $('winWall').value=scene.window.wall; $('winSky').value=scene.window.sky; $('winFrom').value=scene.window.from; $('winTo').value=scene.window.to; }
['rw','rh','rz'].forEach(function(id){ $(id).addEventListener('change',function(){ scene.room.w=Math.max(3,parseFloat($('rw').value)||7); scene.room.h=Math.max(3,parseFloat($('rh').value)||5); scene.room.z=Math.max(2.2,parseFloat($('rz').value)||2.7); scene.items.forEach(function(i){ i.x=Math.min(i.x,scene.room.w-0.1); i.y=Math.min(i.y,scene.room.h-0.1); }); fit(); schedule(); }); });
$('walls').addEventListener('input',function(){ scene.walls=$('walls').value; schedule(); });
$('floor').addEventListener('input',function(){ scene.floor=$('floor').value; schedule(); });
['winOn','winWall','winSky','winFrom','winTo'].forEach(function(id){ $(id).addEventListener('input',function(){ var w=scene.window; w.on=$('winOn').checked; w.wall=$('winWall').value; w.sky=$('winSky').value; w.from=parseFloat($('winFrom').value)||0; w.to=Math.max(w.from+0.3,parseFloat($('winTo').value)||0); schedule(); }); });
['ev','autoEv','zebra','shadows'].forEach(function(id){ $(id).addEventListener('input',function(){ $('evv').textContent=(parseFloat($('ev').value)>0?'+':'')+$('ev').value+' EV'; if(res){ renderMap(); draw(); sync3d(); } }); });
['gridOn','beams','snap'].forEach(function(id){ $(id).addEventListener('input',draw); });
$('tpl').onchange=function(){ if(!this.value) return; scene=TEMPL[this.value](); sel=null; syncRoom(); props(); fit(); schedule(); this.value=''; };
$('bSave').onclick=function(){ var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(scene,null,1)],{type:'application/json'})); a.download='lightlab-scena.json'; a.click(); };
$('bLoad').onclick=function(){ $('fLoad').click(); };
$('fLoad').onchange=function(){ var f=this.files[0]; if(!f) return; f.text().then(function(t){ try{ var sc=JSON.parse(t); if(!sc.room||!sc.items) throw 0; scene=sc; fixIds(); sel=null; syncRoom(); props(); fit(); schedule(); }catch(e){ alert('Soubor nejde načíst.'); } }); $('fLoad').value=''; };
$('bPng').onclick=function(){ var a=document.createElement('a'); a.href=cv.toDataURL('image/png'); a.download='lightlab-pudorys.png'; a.click(); };
$('bShot').onclick=function(){ if(!view3dReady) return; var a=document.createElement('a'); a.href=window.View3D.shot(); a.download='lightlab-kamera.png'; a.click(); };
$('bUndo').onclick=undo; $('bRedo').onclick=redo;
$('bOrbit').onclick=function(){ if(!view3dReady) return; var o=window.View3D.toggleOrbit(); $('bOrbit').classList.toggle('gold',o); $('bOrbit').textContent= o?'Zpět do kamery':'Volný pohled'; };

function setView(v){ center.className=v; document.querySelectorAll('#viewTabs .tab').forEach(function(t){ t.classList.toggle('active',t.dataset.view===v); }); try{ localStorage.setItem('lightlab-view',v);}catch(e){} requestAnimationFrame(function(){ fit(); if(view3dReady) window.View3D.resize(); }); }
document.querySelectorAll('#viewTabs .tab').forEach(function(t){ t.onclick=function(){ setView(t.dataset.view); }; });
window.addEventListener('resize',function(){ fit(); if(view3dReady) window.View3D.resize(); });
window.addEventListener('view3d-ready',function(){ window.View3D.init($('view3d')); view3dReady=true; window.View3D.resize(); if(res) sync3d(); });
if(window.View3D){ window.dispatchEvent(new Event('view3d-ready')); }

// start
var saved=null; try{ saved=localStorage.getItem('lightlab-scene'); }catch(e){}
if(saved){ try{ scene=JSON.parse(saved); fixIds(); }catch(e){ scene=null; } }
if(!scene) scene=TEMPL.window();
var sv='split'; try{ sv=localStorage.getItem('lightlab-view')||'split'; }catch(e){}
setView(sv); syncRoom(); fit(); schedule(); snapshot();
})();
