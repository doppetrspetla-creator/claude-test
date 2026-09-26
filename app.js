/* LightLab – UI, půdorys, interakce */
(function(){
'use strict';
var S = window.LightSim, $ = function(id){ return document.getElementById(id); };
var cv = $('stage'), ctx = cv.getContext('2d'), wrap = $('planWrap'), center = $('center');
var scene, sel = null, uid = 1, res = null, meas = null, scale = 80, ox = 40, oy = 40, fineTimer = null, view3dReady = false, hover = null;
var off = document.createElement('canvas'), offx = off.getContext('2d');
var KIND = { light:'💡', person:'🧑', camera:'🎥', flag:'🏴', bounce:'⬜', box:'📦', furniture:'🪑', wall:'🧱' };
var KINDNAME = { light:'Světlo', person:'Postava', camera:'Kamera', flag:'Vlajka', bounce:'Odrazka', box:'Nábytek', furniture:'Nábytek', wall:'Zeď' };

function blank(){ return { room:{w:7,h:5,z:2.7}, walls:'normal', floor:'wood', sky:'overcast', windows:[{id:uid++,wall:'left',from:1.6,to:3.4}], doors:[], sun:{on:false,az:Math.PI*1.25,elev:35}, items:[] }; }
function win(wall, from, to){ return {id:uid++,wall:wall,from:from,to:to}; }
function wallItem(x1,y1,x2,y2){ var o={kind:'wall',id:uid++,x1:x1,y1:y1,x2:x2,y2:y2}; wallSyncXY(o); return o; }
function wallSyncXY(w){ w.x=(w.x1+w.x2)/2; w.y=(w.y1+w.y2)/2; w.rot=Math.atan2(w.y2-w.y1,w.x2-w.x1); }
function door(wall, at, extra){ var d={id:uid++,wall:wall,at:at,w:0.9,open:true,light:'dim'}; for(var k in extra) d[k]=extra[k]; return d; }
function furn(type, x, y, rot, extra){ var f=S.FURNITURE[type]||S.FURNITURE.block; var o={kind:'furniture',id:uid++,type:type,x:x,y:y,rot:rot||0,w:f.w,d:f.d}; for(var k in extra) o[k]=extra[k]; return o; }
function light(fix, x, y, rot, extra){ var f=S.FIXTURES[fix]; var L={kind:'light',id:uid++,fixture:fix,mod:f.defMod,x:x,y:y,h:1.7,rot:rot,power:70,cct:f.cct,zoom:30,grid:false,diff:false,barn:false,gel:'none',on:true,label:''}; for(var k in extra) L[k]=extra[k]; if(fix==='lamp') L.h=extra&&extra.h!=null?extra.h:1.0; if(fix==='tube') L.h=extra&&extra.h!=null?extra.h:1.5; return L; }
function item(kind, x, y, rot, extra){ var o={kind:kind,id:uid++,x:x,y:y,rot:rot||0}; if(kind==='flag') o.len=0.9; if(kind==='bounce'){o.len=1.0;o.flip=false;o.silver=false;o.black=false;} if(kind==='box'){o.w=1.2;o.d=0.6;o.tall=false;} if(kind==='camera'){o.focal=35;o.h=1.5;o.aim=true;} if(kind==='person') o.pose='stand'; for(var k in extra) o[k]=extra[k]; return o; }

var TEMPL = {
  window: function(){ var s=blank(); s.items=[item('person',2.6,2.5,1.6), item('camera',4.4,3.5,Math.PI+0.5,{focal:50}), item('flag',3.4,1.6,-0.9,{len:0.9}), light('lamp',5.9,0.8,0), furn('table',6.0,1.3,0,{w:0.8,d:0.5})]; s.items[0].pose='sit'; s.windows=[win('left',1.4,3.2)]; return s; },
  three: function(){ var s=blank(); s.windows=[]; s.items=[item('person',3.5,2.2,Math.PI/2-0.35), item('camera',3.5,4.3,-Math.PI/2,{focal:50}), light('cob300',2.2,3.4,-0.75,{mod:'softbox90',power:80,label:'KEY',h:1.9}), light('cob100',4.8,3.6,-2.2,{mod:'softbox60',power:25,label:'FILL',h:1.6}), light('cob100',4.6,0.9,2.25,{mod:'fresnel',zoom:20,power:10,cct:4300,label:'BACK',h:2.2})]; return s; },
  night: function(){ var s=blank(); s.walls='dark'; s.floor='dark'; s.windows=[]; s.sky='dusk'; s.items=[item('person',3.2,2.6,0.95), item('camera',5.2,3.9,Math.PI+0.58,{focal:35}), light('lamp',2.5,1.9,0,{h:0.95}), light('tube',6.6,2.2,Math.PI,{power:20,cct:3200,label:'tuba'}), furn('coffee',2.5,1.9,0,{w:0.6,d:0.6}), furn('bed',5.5,1.3,Math.PI/2)]; s.doors=[door('bottom',1.2,{light:'dim'})]; return s; },
  rembrandt: function(){ var s=blank(); s.walls='dark'; s.windows=[]; s.items=[item('person',3.5,2.5,Math.PI/2), item('camera',3.5,4.4,-Math.PI/2,{focal:85}), light('cob300',2.0,3.6,-0.6,{mod:'octa120',power:60,label:'KEY',h:2.1}), item('bounce',5.0,3.3,2.06,{len:1.0,flip:false}), item('flag',2.9,1.3,0,{len:1.2})]; return s; },
  living: function(){ var s=blank(); s.room={w:6,h:5,z:2.7}; s.windows=[win('top',1.2,3.0)]; s.doors=[door('right',3.6,{light:'dim'})];
    s.items=[furn('sofa',2.4,3.6,-Math.PI/2), furn('coffee',2.4,2.4,0), item('person',2.4,3.7,-Math.PI/2+0.5,{pose:'sit'}), item('camera',3.9,1.4,Math.PI-1.05,{focal:35}), light('lamp',4.6,3.9,0,{h:1.4}), furn('shelf',5.6,1.0,Math.PI,{}), light('cob300',1.0,1.6,0.75,{mod:'softbox90',power:35,cct:4500,label:'KEY',h:1.9})]; return s; },
  sun: function(){ var s=blank(); s.room={w:8,h:5,z:2.7}; s.sky='sunny'; s.sun={on:true,az:Math.PI*1.2,elev:30}; s.windows=[win('left',1.5,3.5), win('bottom',5.5,7.0)];
    var wl=wallItem(4.5,0,4.5,3.4); s.items=[wl, item('person',2.4,2.4,0.9,{pose:'stand'}), item('camera',4.0,4.2,Math.PI+0.85,{focal:35}), furn('table',2.0,4.2,0), item('bounce',3.6,1.2,-0.4,{len:1.2}), furn('sofa',6.5,1.0,Math.PI/2), light('lamp',7.4,4.4,0,{h:1.4})]; s.windows.push(win(wl.id,1.6,2.8)); return s; },
  empty: function(){ var s=blank(); s.windows=[]; return s; }
};

// ---------- undo/redo + autosave ----------
var hist=[], hpos=-1, histTimer=null;
function snapshot(){ var j=JSON.stringify(scene); try{ localStorage.setItem('lightlab-scene',j);}catch(e){} if(hist[hpos]===j) return; hist=hist.slice(0,hpos+1); hist.push(j); if(hist.length>80) hist.shift(); hpos=hist.length-1; try{ localStorage.setItem('lightlab-scene',j);}catch(e){} updUndo(); }
function snapshotSoon(){ clearTimeout(histTimer); histTimer=setTimeout(snapshot,400); }
function restore(j){ scene=JSON.parse(j); sel=null; fixIds(); syncRoom(); props(); fit(); schedule(); updUndo(); }
function flushSnap(){ clearTimeout(histTimer); snapshot(); }
function undo(){ flushSnap(); if(hpos>0){ hpos--; restore(hist[hpos]); } }
function redo(){ flushSnap(); if(hpos<hist.length-1){ hpos++; restore(hist[hpos]); } }
function updUndo(){ $('bUndo').disabled=hpos<=0; $('bRedo').disabled=hpos>=hist.length-1; }
function fixIds(){ uid=1+Math.max.apply(null,scene.items.map(function(i){return i.id||0;}).concat((scene.doors||[]).map(function(d){return d.id||0;})).concat((scene.windows||[]).map(function(w){return w.id||0;})).concat([0])); scene.items.forEach(function(i){ if(i.id==null) i.id=uid++; }); if(!scene.room.z) scene.room.z=2.7; if(!scene.floor) scene.floor='wood'; if(!scene.doors) scene.doors=[]; scene.doors.forEach(function(d){ if(d.id==null) d.id=uid++; }); if(!scene.windows){ scene.windows=[]; if(scene.window){ if(scene.window.on) scene.windows.push({id:uid++,wall:scene.window.wall,from:scene.window.from,to:scene.window.to}); scene.sky=scene.window.sky||'overcast'; delete scene.window; } } scene.windows.forEach(function(w){ if(w.id==null) w.id=uid++; }); if(!scene.sky) scene.sky='overcast'; if(!scene.sun) scene.sun={on:false,az:Math.PI*1.25,elev:35}; scene.items.forEach(function(i){ if(i.kind==='wall') wallSyncXY(i); }); scene.items.forEach(function(i){ if(i.kind==='box'){ i.kind='furniture'; i.type=i.tall?'wardrobe':'block'; if(i.tall) delete i.tall; } if(i.kind==='person'&&!i.pose) i.pose='stand'; }); scene.items.forEach(function(i){ if(i.kind==='light'&&i.h==null) i.h=1.7; if(i.kind==='camera'){ if(i.h==null) i.h=1.5; if(i.aim==null) i.aim=true; } }); }

// ---------- mapování ----------
function fit(){ var r=wrap.getBoundingClientRect(); if(r.width<2) return; cv.width=r.width*devicePixelRatio; cv.height=r.height*devicePixelRatio; cv.style.width=r.width+'px'; cv.style.height=r.height+'px';
  var W=scene.room.w, H=scene.room.h, pad=44, ex=S.sunOn(scene)?2.0:0; scale=Math.min((r.width-2*pad)/(W+ex),(r.height-2*pad)/(H+ex)); ox=(r.width-W*scale)/2; oy=(r.height-H*scale)/2+8; draw(); }
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
  (scene.windows||[]).forEach(function(w){ var a,b; if(typeof w.wall==='string'){ var fr=wallPt(w.wall); a=fr(w.from); b=fr(w.to); } else { var wi=byId(w.wall); if(!wi) return; a=toPx.apply(null,S.wallPoint(wi,w.from)); b=toPx.apply(null,S.wallPoint(wi,w.to)); }
    ctx.strokeStyle='#0a0a0a'; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); ctx.strokeStyle='#8fc0e8'; ctx.lineWidth=3; ctx.stroke(); });
  (scene.doors||[]).forEach(function(d){ var fr=wallPt(d.wall), a=fr(d.at-d.w/2), b=fr(d.at+d.w/2), open=d.open!==false, L=S.DOORLIGHT[d.light]||S.DOORLIGHT.none;
    ctx.strokeStyle= open ? (L.E>0 ? '#e0b86a' : '#0a0a0a') : '#5a5148'; ctx.lineWidth= open?7:5; ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
    if(open){ var inw={left:[1,0],right:[-1,0],top:[0,1],bottom:[0,-1]}[d.wall], hx=a[0], hy=a[1], ang0=Math.atan2(inw[1],inw[0]), r=d.w*scale;
      var ang1=Math.atan2(b[1]-a[1],b[0]-a[0]), dd=ang0-ang1; while(dd>Math.PI) dd-=2*Math.PI; while(dd<-Math.PI) dd+=2*Math.PI; ctx.strokeStyle='rgba(236,232,224,.55)'; ctx.lineWidth=1.5; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.arc(hx,hy,r,ang1,ang0,dd<0); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle='#d8cfbf'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(hx+inw[0]*r*0.96+(b[0]-a[0])*0.08,hy+inw[1]*r*0.96+(b[1]-a[1])*0.08); ctx.stroke(); } });
  ctx.fillStyle='#8f8a80'; ctx.font='11px Inter,Lato,sans-serif'; var sb=toPx(0,H); ctx.fillRect(sb[0],sb[1]+14,scale,2); ctx.fillText('1 m',sb[0],sb[1]+30);
  ctx.fillText(W.toString().replace('.',',')+' × '+H.toString().replace('.',',')+' m', sb[0]+scale+14, sb[1]+30);
  scene.items.forEach(function(it){ if(it.kind!=='light') drawItem(it); }); scene.items.forEach(function(it){ if(it.kind==='light') drawItem(it); });
  drawSun(); drawTool();
  if(meas){ meas.sides.forEach(function(s){ var q=toPx(s.x,s.y); ctx.fillStyle= s.E===meas.lux ? '#d4b071':'#6c93c9'; ctx.beginPath(); ctx.arc(q[0],q[1],3.2,0,7); ctx.fill(); }); }
}
function wallPt(wall){ var W=scene.room.w, H=scene.room.h; return wall==='left'?function(t){return toPx(0,t);}: wall==='right'?function(t){return toPx(W,t);}: wall==='top'?function(t){return toPx(t,0);}: function(t){return toPx(t,H);}; }
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
  } else if(it.kind==='person'){ if(it.pose==='sit'){ ctx.fillStyle='rgba(120,90,60,.55)'; ctx.strokeStyle='#8a6a48'; ctx.lineWidth=1; ctx.fillRect(-0.225*s,-0.225*s,0.45*s,0.45*s); ctx.strokeRect(-0.225*s,-0.225*s,0.45*s,0.45*s); ctx.fillStyle='#8a6a48'; ctx.fillRect(-0.225*s,-0.225*s,0.05*s,0.45*s); } ctx.fillStyle='#55504a'; ctx.beginPath(); ctx.ellipse(-2,0,0.1*s,0.24*s,0,0,7); ctx.fill(); ctx.fillStyle='#d9b597'; ctx.beginPath(); ctx.moveTo(0.1*s,-0.035*s); ctx.lineTo(0.15*s,0); ctx.lineTo(0.1*s,0.035*s); ctx.fill(); ctx.beginPath(); ctx.arc(0,0,0.11*s,0,7); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.stroke(); }
  else if(it.kind==='camera'){ if($('beams').checked){ var fov=2*Math.atan(36/2/(it.focal||35)), R2=3.5*s; ctx.fillStyle='rgba(140,180,230,.06)'; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R2,-fov/2,fov/2); ctx.closePath(); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.setLineDash([3,4]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(fov/2)*R2,Math.sin(fov/2)*R2); ctx.moveTo(0,0); ctx.lineTo(Math.cos(-fov/2)*R2,Math.sin(-fov/2)*R2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle='#111'; ctx.strokeStyle='#d4b071'; ctx.lineWidth=1; ctx.fillRect(-16,-9,22,18); ctx.strokeRect(-16,-9,22,18); ctx.fillRect(6,-5,10,10); ctx.strokeRect(6,-5,10,10); }
  else if(it.kind==='flag'){ var L=it.len*s; ctx.fillStyle='#111'; ctx.strokeStyle='#555'; ctx.fillRect(-L/2,-3,L,6); ctx.strokeRect(-L/2,-3,L,6); }
  else if(it.kind==='bounce'){ var L2=it.len*s; ctx.fillStyle= it.black?'#111': (it.silver?'#c9ccd1':'#f4f1e8'); ctx.strokeStyle='#666'; ctx.fillRect(-L2/2,-3,L2,6); ctx.strokeRect(-L2/2,-3,L2,6); ctx.fillStyle='#d4b071'; var sg=it.flip?-1:1; ctx.beginPath(); ctx.moveTo(-4,sg*6); ctx.lineTo(4,sg*6); ctx.lineTo(0,sg*11); ctx.fill(); }
  else if(it.kind==='wall'){ ctx.restore(); ctx.save(); var a=toPx(it.x1,it.y1), b=toPx(it.x2,it.y2); ctx.strokeStyle='#8a8277'; ctx.lineWidth=Math.max(4,0.12*s); ctx.lineCap='butt'; ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
    if(isSel||isHov){ ctx.fillStyle='#ece8e0'; ctx.font='11px Inter,Lato,sans-serif'; ctx.fillText(fmt(S.wallLen(it),2)+' m',(a[0]+b[0])/2+8,(a[1]+b[1])/2-8); }
    if(isSel){ [a,b].forEach(function(q){ ctx.fillStyle='#d4b071'; ctx.beginPath(); ctx.arc(q[0],q[1],6,0,7); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.stroke(); }); }
    ctx.restore(); return; }
  else if(it.kind==='furniture'||it.kind==='box'){ if(it.kind==='box') ctx.rotate(-it.rot); var tall=S.isTall(it), w=it.w*s, d=it.d*s, t=it.type;
    ctx.fillStyle= tall?'rgba(40,34,30,.95)': (t==='sofa'||t==='armchair')?'rgba(75,85,104,.75)': t==='bed'?'rgba(217,212,199,.6)':'rgba(90,70,50,.6)'; ctx.strokeStyle= tall?'#3a3028':'#8a7560'; ctx.lineWidth=1;
    ctx.fillRect(-w/2,-d/2,w,d); ctx.strokeRect(-w/2,-d/2,w,d);
    if(t==='sofa'||t==='armchair'){ ctx.fillStyle='rgba(50,58,75,.9)'; ctx.fillRect(-w/2,-d/2,0.22*s,d); ctx.fillRect(-w/2,-d/2,w,0.18*s); ctx.fillRect(-w/2,d/2-0.18*s,w,0.18*s); }
    else if(t==='chair'){ ctx.fillStyle='#8a6a48'; ctx.fillRect(-w/2,-d/2,0.05*s,d); }
    else if(t==='bed'){ ctx.fillStyle='rgba(255,255,255,.5)'; ctx.fillRect(-w/2+0.12*s,-d*0.2,0.45*s,d*0.4); ctx.fillStyle='#6b4a2f'; ctx.fillRect(-w/2,-d/2,0.05*s,d); }
    else if(t==='shelf'){ ctx.strokeStyle='#6b5a4a'; for(var q=-w/2+0.3*s;q<w/2;q+=0.3*s){ ctx.beginPath(); ctx.moveTo(q,-d/2); ctx.lineTo(q,d/2); ctx.stroke(); } }
    else if(t==='wardrobe'){ ctx.strokeStyle='#6b5a4a'; ctx.beginPath(); ctx.moveTo(0,-d/2); ctx.lineTo(0,d/2); ctx.stroke(); } }
  ctx.restore();
  if(isSel||isHov){ ctx.strokeStyle= isSel?'#d4b071':'rgba(212,176,113,.4)'; ctx.setLineDash([3,3]); ctx.lineWidth=1; ctx.beginPath(); ctx.arc(p[0],p[1],22,0,7); ctx.stroke(); ctx.setLineDash([]); }
  if(isSel && it.kind!=='box' && it.kind!=='wall'){ var h=toPx.apply(null,rotHandle(it)); ctx.strokeStyle='rgba(212,176,113,.6)'; ctx.beginPath(); ctx.moveTo(p[0],p[1]); ctx.lineTo(h[0],h[1]); ctx.stroke(); ctx.fillStyle='#d4b071'; ctx.beginPath(); ctx.arc(h[0],h[1],6,0,7); ctx.fill(); }
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
  if((scene.windows||[]).some(function(w){return typeof w.wall==='string';})) rows.push(['Okna (obloha)', meas.per.win||0, meas.perDark.win||0]);
  if(S.sunOn(scene)) rows.push(['Slunce', meas.per.sun||0, meas.perDark.sun||0]);
  if((scene.doors||[]).some(function(d){return d.open!==false && (S.DOORLIGHT[d.light]||{E:0}).E>0;})) rows.push(['Otevřené dveře', meas.per.doors||0, meas.perDark.doors||0]);
  rows.push(['Rozptyl od stěn', (res.amb||0)*0.5, (res.amb||0)*0.5]);
  var mx=Math.max.apply(null,rows.map(function(r){return Math.max(r[1],r[2]);}).concat([1]));
  html+='<div class="c mut"><span></span><span class="bar" style="background:none"></span><b style="font-weight:500">světlá / stinná</b></div>';
  rows.forEach(function(r){ html+='<div class="c"><span>'+r[0]+'</span><span class="bar"><i style="width:'+(r[1]/mx*100)+'%"></i><i class="lo" style="width:'+(r[2]/mx*100)+'%"></i></span><b>'+Math.round(r[1])+' / '+Math.round(r[2])+' lx</b></div>'; });
  $('contrib').innerHTML=html||'<span class="mut">Žádná světla.</span>';
}

// ---------- seznam objektů ----------
function itemName(it){ if(it.kind==='light') return (it.label?it.label+' · ':'')+S.FIXTURES[it.fixture].name+' · '+S.MODS[it.mod].name.split(' ')[0]; if(it.kind==='camera') return 'Kamera '+(it.focal||35)+' mm'; if(it.kind==='box') return it.tall?'Skříň / stěna':'Stůl'; if(it.kind==='furniture') return (S.FURNITURE[it.type]||S.FURNITURE.block).name; if(it.kind==='person') return it.pose==='sit'?'Postava (sedí)':'Postava'; if(it.kind==='wall') return 'Zeď '+fmt(S.wallLen(it),2)+' m'; return KINDNAME[it.kind]; }
function objList(){
  var el=$('objList'), h='';
  scene.items.forEach(function(it){ h+='<div class="item'+(sel===it?' sel':'')+'" data-id="'+it.id+'"><span class="ic">'+KIND[it.kind]+'</span><span class="nm'+(it.on===false?' off':'')+'">'+itemName(it)+'</span>'+(it.kind==='light'?'<button data-tog="'+it.id+'" title="Zapnout / vypnout (H)">'+(it.on===false?'○':'●')+'</button>':'')+'<button data-del="'+it.id+'" title="Smazat">✕</button></div>'; });
  el.innerHTML=h||'<p class="mut" style="margin:4px 6px">Scéna je prázdná.</p>';
  el.querySelectorAll('.item').forEach(function(d){ d.onclick=function(e){ var t=e.target; if(t.dataset.tog){ var L=byId(t.dataset.tog); L.on=L.on===false; props(); schedule(); return; } if(t.dataset.del){ del(byId(t.dataset.del)); return; } select(byId(d.dataset.id)); }; });
}
function byId(id){ id=+id; return scene.items.find(function(i){return i.id===id;}); }
function select(it){ sel=it; props(); objList(); draw(); if(view3dReady) window.View3D.setSel(sel?sel.id:null); }
function dup(it){ if(!it) return; var c=JSON.parse(JSON.stringify(it)); c.id=uid++; if(c.kind==='wall'){ c.x1+=0.4; c.x2+=0.4; c.y1+=0.4; c.y2+=0.4; clampWall(c); } else { c.x=Math.min(scene.room.w-0.1,c.x+0.4); c.y=Math.min(scene.room.h-0.1,c.y+0.4); } scene.items.push(c); select(c); schedule(); }
function clampWall(w){ var W=scene.room.w, H=scene.room.h; w.x1=Math.max(0,Math.min(W,w.x1)); w.x2=Math.max(0,Math.min(W,w.x2)); w.y1=Math.max(0,Math.min(H,w.y1)); w.y2=Math.max(0,Math.min(H,w.y2)); wallSyncXY(w); }
function moveWall(w,dx,dy){ w.x1+=dx; w.x2+=dx; w.y1+=dy; w.y2+=dy; clampWall(w); }
function del(it){ if(!it) return; scene.items=scene.items.filter(function(o){return o!==it;}); if(it.kind==='wall') scene.windows=scene.windows.filter(function(w){return w.wall!==it.id;}); if(sel===it) sel=null; props(); renderWindows(); schedule(); }

// ---------- vlastnosti ----------
function props(){
  var el=$('props'); $('selKind').textContent= sel?KINDNAME[sel.kind]:''; if(!sel){ el.innerHTML='<p class="mut">Klikni na objekt ve scéně nebo v seznamu.</p>'; return; }
  var it=sel, h='';
  function rng(k,lab,min,max,step,unit){ h+='<label>'+lab+' <span class="pill" id="v_'+k+'">'+fmtv(k,it[k])+'</span></label><input type="range" data-k="'+k+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+it[k]+'">'; }
  function chk(k,lab){ h+='<label class="chk"><input type="checkbox" data-k="'+k+'"'+(it[k]?' checked':'')+'> '+lab+'</label>'; }
  function selc(k,lab,opts){ h+='<label>'+lab+'</label><select data-k="'+k+'">'+Object.keys(opts).map(function(o){return '<option value="'+o+'"'+(o===it[k]?' selected':'')+'>'+opts[o]+'</option>';}).join('')+'</select>'; }
  if(it.kind==='wall'){ h+='<div class="row"><div><label>X1</label><input type="number" data-k="x1" step="0.05" value="'+it.x1.toFixed(2)+'"></div><div><label>Y1</label><input type="number" data-k="y1" step="0.05" value="'+it.y1.toFixed(2)+'"></div></div><div class="row"><div><label>X2</label><input type="number" data-k="x2" step="0.05" value="'+it.x2.toFixed(2)+'"></div><div><label>Y2</label><input type="number" data-k="y2" step="0.05" value="'+it.y2.toFixed(2)+'"></div></div><p class="mut">Délka '+fmt(S.wallLen(it),2)+' m, tloušťka 12 cm, plná výška. Táhni zlaté konce pro úpravu, mezera mezi zdmi = průchod. Okno na zdi označ nástrojem Okno.</p>'; }
  else h+='<div class="row"><div><label>X (m)</label><input type="number" data-k="x" step="0.05" value="'+it.x.toFixed(2)+'"></div><div><label>Y (m)</label><input type="number" data-k="y" step="0.05" value="'+it.y.toFixed(2)+'"></div><div><label>Otočení (°)</label><input type="number" data-k="rotDeg" step="5" value="'+Math.round(it.rot*180/Math.PI)+'"></div></div>';
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
  else if(it.kind==='person'){ selc('pose','Póza',{stand:'Stojí',sit:'Sedí (na židli)'}); h+='<p class="mut">Otočení určuje, kam se postava dívá. Měří se obě tváře (zlatá = světlejší) ve výšce '+fmt(S.faceZ(it),1)+' m. Sedící postavu posaď na gauč či křeslo přesunutím na ně.</p>'; }
  else if(it.kind==='furniture'){ var ft={}; Object.keys(S.FURNITURE).forEach(function(k){ft[k]=S.FURNITURE[k].name;}); selc('type','Typ',ft); rng('w','Šířka',0.3,3,0.05,'m'); rng('d','Hloubka',0.3,3,0.05,'m'); if(it.type==='block') chk('tall','Vysoký – stíní ve výšce obličeje'); h+='<p class="mut">Opěradlo / čelo je na straně proti směru otočení.</p>'; }
  else if(it.kind==='flag'){ rng('len','Délka',0.3,2.4,0.1,'m'); }
  else if(it.kind==='bounce'){ rng('len','Šířka',0.3,2.4,0.1,'m'); chk('silver','Stříbrná'); chk('black','Černá (negativní fill)'); chk('flip','Otočit lícovou stranu'); }
  else if(it.kind==='box'){ rng('w','Šířka',0.3,3,0.1,'m'); rng('d','Hloubka',0.3,3,0.1,'m'); chk('tall','Vysoký – vrhá stín (skříň, stěna)'); }
  if(it.kind==='wall'){ } h+='<div class="row" style="margin-top:12px"><button class="btn" id="bDup">Duplikovat <span class="kbd">D</span></button><button class="btn danger" id="bDel">Smazat <span class="kbd">Del</span></button></div>';
  el.innerHTML=h;
  el.querySelectorAll('[data-k]').forEach(function(inp){ inp.addEventListener('input',function(){ var k=inp.dataset.k, v;
    if(inp.type==='checkbox') v=inp.checked; else if(inp.type==='range'||inp.type==='number') v=parseFloat(inp.value); else v=inp.value;
    if(k==='rotDeg'){ if(isNaN(v)) return; it.rot=v*Math.PI/180; schedule(); return; }
    if((k==='x'||k==='y'||k==='x1'||k==='y1'||k==='x2'||k==='y2') && isNaN(v)) return;
    it[k]=v; if(it.kind==='wall'){ clampWall(it); } if(k==='fixture'){ var f=S.FIXTURES[v]; it.mod=f.defMod; it.cct=f.cct; props(); }
    if(k==='mod'||k==='aim') props();
    if(k==='type'){ var ff=S.FURNITURE[v]; it.w=ff.w; it.d=ff.d; delete it.tall; props(); }
    var pv=$('v_'+k); if(pv) pv.textContent=fmtv(k,v);
    schedule(); }); });
  $('bDel').onclick=function(){ del(sel); };
  $('bDup').onclick=function(){ dup(sel); };
}
function fmtv(k,v){ var u={power:' %',cct:' K',zoom:'°',focal:' mm',len:' m',w:' m',d:' m',h:' m',tilt:''}[k]||''; return (typeof v==='number'? (k==='h'||k==='len'||k==='w'||k==='d'?fmt(v,2):k==='tilt'?fmt(v,2):v):v)+u; }

// ---------- interakce ----------
var drag=null;
function mpos(e){ var r=cv.getBoundingClientRect(); return [e.clientX-r.left, e.clientY-r.top]; }
function distSeg(px,py,ax,ay,bx,by){ var dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy, t=L2?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/L2)):0; return {d:Math.hypot(px-(ax+dx*t),py-(ay+dy*t)),t:t}; }
function sunPos(){ var W=scene.room.w, H=scene.room.h, d=S.sunDir(scene), t=Math.min((W/2+0.7)/Math.max(1e-6,Math.abs(d[0])),(H/2+0.7)/Math.max(1e-6,Math.abs(d[1]))); return [W/2+d[0]*t, H/2+d[1]*t]; }
function pick(mx,my){
  if(S.sunOn(scene)){ var sp=toPx.apply(null,sunPos()); if(Math.hypot(mx-sp[0],my-sp[1])<16) return {sun:true}; }
  if(sel && sel.kind==='wall'){ var e1=toPx(sel.x1,sel.y1), e2=toPx(sel.x2,sel.y2); if(Math.hypot(mx-e1[0],my-e1[1])<10) return {it:sel,end:1}; if(Math.hypot(mx-e2[0],my-e2[1])<10) return {it:sel,end:2}; }
  if(sel && sel.kind!=='box' && sel.kind!=='wall'){ var h=toPx.apply(null,rotHandle(sel)); if(Math.hypot(mx-h[0],my-h[1])<10) return {it:sel,rot:true}; }
  for(var i=scene.items.length-1;i>=0;i--){ var it=scene.items[i]; if(it.kind==='wall') continue; var p=toPx(it.x,it.y), rr=18;
    if(it.kind==='box') rr=Math.max(it.w,it.d)*scale/2; if(it.kind==='flag'||it.kind==='bounce') rr=Math.max(14,it.len*scale/2);
    if(it.kind==='furniture'){ var cf=Math.cos(it.rot||0), sf=Math.sin(it.rot||0), fx=mx-p[0], fy=my-p[1], fu=fx*cf+fy*sf, fv=-fx*sf+fy*cf; if(Math.abs(fu)<=it.w*scale/2+4 && Math.abs(fv)<=it.d*scale/2+4) return {it:it}; continue; }
    if(it.kind==='flag'||it.kind==='bounce'){ var c=Math.cos(it.rot), s=Math.sin(it.rot), dx=mx-p[0], dy=my-p[1], u=dx*c+dy*s, v=-dx*s+dy*c; if(Math.abs(u)<=rr && Math.abs(v)<=9) return {it:it}; continue; }
    if(Math.hypot(mx-p[0],my-p[1])<=rr) return {it:it}; }
  for(var j=scene.items.length-1;j>=0;j--){ var wl=scene.items[j]; if(wl.kind!=='wall') continue; var a=toPx(wl.x1,wl.y1), b=toPx(wl.x2,wl.y2); if(distSeg(mx,my,a[0],a[1],b[0],b[1]).d<=Math.max(6,0.06*scale)+3) return {it:wl}; }
  return null;
}
// nejbližší zeď (vnější strana nebo nakreslená) k bodu v metrech; vrací {wall, t (m podél zdi), len}
function nearestWall(x,y){
  var W=scene.room.w, H=scene.room.h, best=null, tol=0.35;
  function cand(wall,d,t,len){ if(d<tol && (!best||d<best.d)) best={wall:wall,d:d,t:t,len:len}; }
  cand('left',Math.abs(x),y,H); cand('right',Math.abs(W-x),y,H); cand('top',Math.abs(y),x,W); cand('bottom',Math.abs(H-y),x,W);
  scene.items.forEach(function(it){ if(it.kind!=='wall') return; var L=S.wallLen(it); if(L<0.2) return; var r=distSeg(x,y,it.x1,it.y1,it.x2,it.y2); cand(it.id,r.d,r.t*L,L); });
  return best;
}
function snapv(v){ return $('snap').checked ? Math.round(v/0.1)*0.1 : v; }
function snapPt(x,y){ x=Math.round(x*10)/10; y=Math.round(y*10)/10; var best=null; scene.items.forEach(function(it){ if(it.kind!=='wall') return; [[it.x1,it.y1],[it.x2,it.y2]].forEach(function(q){ var d=Math.hypot(q[0]-x,q[1]-y); if(d<0.2 && (!best||d<best.d)) best={d:d,p:q}; }); }); if(best) return [best.p[0],best.p[1]]; return [Math.max(0,Math.min(scene.room.w,x)),Math.max(0,Math.min(scene.room.h,y))]; }
function axisSnap(x1,y1,x2,y2,free){ var dx=x2-x1, dy=y2-y1; if(free){ var a=Math.atan2(dy,dx), L=Math.hypot(dx,dy), q=Math.round(a/(Math.PI/12))*(Math.PI/12); return [x1+Math.cos(q)*L, y1+Math.sin(q)*L]; } if(Math.abs(dx)>=Math.abs(dy)) return [x2,y1]; return [x1,y2]; }
var tool='select', draft=null;
function setTool(t){ tool=t; draft=null; document.querySelectorAll('#tools .btn').forEach(function(b){ b.classList.toggle('gold',b.dataset.tool===t); }); cv.classList.toggle('tool',t!=='select'); $('toolHint').textContent= t==='wall'?'táhni: nová zeď (Shift = šikmo po 15°)': t==='window'?'táhni podél zdi: nové okno':''; draw(); }
document.querySelectorAll('#tools .btn').forEach(function(b){ b.onclick=function(){ setTool(b.dataset.tool); }; });
function drawSun(){ if(!S.sunOn(scene)) return; var sp=toPx.apply(null,sunPos()), c=toPx(scene.room.w/2,scene.room.h/2);
  ctx.strokeStyle='rgba(255,210,90,.35)'; ctx.lineWidth=1.5; ctx.setLineDash([4,5]); ctx.beginPath(); ctx.moveTo(sp[0],sp[1]); ctx.lineTo(c[0],c[1]); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='#ffd25a'; ctx.beginPath(); ctx.arc(sp[0],sp[1],11,0,7); ctx.fill(); ctx.strokeStyle='#8a6a10'; ctx.lineWidth=1; ctx.stroke();
  for(var k=0;k<8;k++){ var a=k*Math.PI/4; ctx.beginPath(); ctx.moveTo(sp[0]+Math.cos(a)*14,sp[1]+Math.sin(a)*14); ctx.lineTo(sp[0]+Math.cos(a)*19,sp[1]+Math.sin(a)*19); ctx.strokeStyle='#ffd25a'; ctx.lineWidth=2; ctx.stroke(); }
  ctx.fillStyle='#ece8e0'; ctx.font='11px Inter,Lato,sans-serif'; ctx.fillText('slunce '+scene.sun.elev+'°',sp[0]+22,sp[1]+4); }
function drawTool(){ if(!draft) return; ctx.save();
  if(draft.kind==='wall'){ var a=toPx(draft.x1,draft.y1), b=toPx(draft.x2,draft.y2); ctx.strokeStyle='rgba(212,176,113,.9)'; ctx.lineWidth=Math.max(4,0.12*scale); ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
    var L=Math.hypot(draft.x2-draft.x1,draft.y2-draft.y1); ctx.fillStyle='#111'; ctx.font='bold 12px Inter,Lato,sans-serif'; var txt=fmt(L,2)+' m', tw=ctx.measureText(txt).width; ctx.fillStyle='rgba(212,176,113,.95)'; ctx.fillRect((a[0]+b[0])/2-tw/2-6,(a[1]+b[1])/2-24,tw+12,18); ctx.fillStyle='#111'; ctx.fillText(txt,(a[0]+b[0])/2-tw/2,(a[1]+b[1])/2-11); }
  if(draft.kind==='window'){ var p1=wallPointAny(draft.wall,draft.t1), p2=wallPointAny(draft.wall,draft.t2); if(p1&&p2){ var q1=toPx(p1[0],p1[1]), q2=toPx(p2[0],p2[1]); ctx.strokeStyle='#8fc0e8'; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(q1[0],q1[1]); ctx.lineTo(q2[0],q2[1]); ctx.stroke();
    var txt2=fmt(Math.abs(draft.t2-draft.t1),2)+' m', tw2=ctx.measureText(txt2).width; ctx.fillStyle='rgba(143,192,232,.95)'; ctx.fillRect((q1[0]+q2[0])/2-tw2/2-6,(q1[1]+q2[1])/2-24,tw2+12,18); ctx.fillStyle='#111'; ctx.font='bold 12px Inter,Lato,sans-serif'; ctx.fillText(txt2,(q1[0]+q2[0])/2-tw2/2,(q1[1]+q2[1])/2-11); } }
  ctx.restore(); }
function wallPointAny(wall,t){ if(typeof wall==='string'){ var W=scene.room.w, H=scene.room.h; return wall==='left'?[0,t]:wall==='right'?[W,t]:wall==='top'?[t,0]:[t,H]; } var it=byId(wall); return it?S.wallPoint(it,t):null; }
cv.addEventListener('pointerdown',function(e){ var m=mpos(e), w=toM(m[0],m[1]); cv.setPointerCapture(e.pointerId);
  if(tool==='wall'){ var p=snapPt(w[0],w[1]); draft={kind:'wall',x1:p[0],y1:p[1],x2:p[0],y2:p[1]}; draw(); return; }
  if(tool==='window'){ var nw=nearestWall(w[0],w[1]); if(!nw){ return; } draft={kind:'window',wall:nw.wall,t1:Math.round(nw.t*10)/10,t2:Math.round(nw.t*10)/10,len:nw.len}; draw(); return; }
  var hit=pick(m[0],m[1]);
  if(hit&&hit.sun){ drag={sun:true,moved:false}; return; }
  if(hit){ drag={it:hit.it,rot:!!hit.rot,end:hit.end||0,dx:hit.it.x-w[0],dy:hit.it.y-w[1],moved:false}; if(sel!==hit.it) select(hit.it); } else select(null); });
cv.addEventListener('pointermove',function(e){ var m=mpos(e), w=toM(m[0],m[1]);
  if(draft){ if(draft.kind==='wall'){ var p=snapPt(w[0],w[1]); var q=axisSnap(draft.x1,draft.y1,p[0],p[1],e.shiftKey); draft.x2=Math.max(0,Math.min(scene.room.w,Math.round(q[0]*10)/10)); draft.y2=Math.max(0,Math.min(scene.room.h,Math.round(q[1]*10)/10)); }
    else { var pr=projectOnWall(draft.wall,w[0],w[1]); draft.t2=Math.max(0,Math.min(draft.len,Math.round(pr*10)/10)); } draw(); return; }
  if(!drag){ if(tool!=='select') return; var h=pick(m[0],m[1]); var nh=h?(h.it||null):null; if(nh!==hover){ hover=nh; draw(); } cv.style.cursor= h ? ((h.rot||h.end||h.sun)?'grab':'move') : 'default'; return; }
  drag.moved=true;
  if(drag.sun){ scene.sun.az=Math.atan2(w[1]-scene.room.h/2,w[0]-scene.room.w/2); if(e.shiftKey) scene.sun.az=Math.round(scene.sun.az/(Math.PI/12))*(Math.PI/12); $('sunAz').value=Math.round(((scene.sun.az*180/Math.PI)%360+360)%360); $('sunAzV').textContent=$('sunAz').value+'°'; }
  else { var it=drag.it;
    if(drag.end){ var o= drag.end===1?[it.x2,it.y2]:[it.x1,it.y1]; var p2=snapPt(w[0],w[1]); var q2=e.altKey?p2:axisSnap(o[0],o[1],p2[0],p2[1],e.shiftKey); if(drag.end===1){ it.x1=q2[0]; it.y1=q2[1]; } else { it.x2=q2[0]; it.y2=q2[1]; } clampWall(it); }
    else if(it.kind==='wall'){ var nx=snapv(w[0]+drag.dx), ny=snapv(w[1]+drag.dy); moveWall(it,nx-it.x,ny-it.y); }
    else if(drag.rot){ it.rot=Math.atan2(w[1]-it.y,w[0]-it.x); if(e.shiftKey) it.rot=Math.round(it.rot/(Math.PI/12))*(Math.PI/12); }
    else { it.x=Math.max(0.05,Math.min(scene.room.w-0.05,snapv(w[0]+drag.dx))); it.y=Math.max(0.05,Math.min(scene.room.h-0.05,snapv(w[1]+drag.dy))); } }
  recompute(0.12); clearTimeout(fineTimer); fineTimer=setTimeout(function(){ recompute(0.035); },180); });
function projectOnWall(wall,x,y){ if(typeof wall==='string') return (wall==='left'||wall==='right')?y:x; var it=byId(wall); if(!it) return 0; var r=distSeg(x,y,it.x1,it.y1,it.x2,it.y2); return r.t*S.wallLen(it); }
cv.addEventListener('pointerup',function(){
  if(draft){ var d=draft; draft=null;
    if(d.kind==='wall'){ if(Math.hypot(d.x2-d.x1,d.y2-d.y1)>=0.2){ var wl=wallItem(d.x1,d.y1,d.x2,d.y2); scene.items.push(wl); select(wl); schedule(); } else draw(); }
    else { var a=Math.min(d.t1,d.t2), b=Math.max(d.t1,d.t2); if(b-a>=0.3){ scene.windows.push(win(d.wall,a,b)); renderWindows(); schedule(); } else draw(); }
    return; }
  if(drag&&drag.moved){ props(); objList(); snapshotSoon(); } drag=null; });
cv.addEventListener('wheel',function(e){ if(!sel||sel.kind==='wall') return; e.preventDefault(); sel.rot+=(e.deltaY>0?1:-1)*Math.PI/36; props(); schedule(); },{passive:false});
window.addEventListener('keydown',function(e){ var tag=document.activeElement.tagName; if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return;
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); if(e.shiftKey) redo(); else undo(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); return; }
  if(e.key==='1'||e.key==='2'||e.key==='3'){ setView(['split','plan','cam'][+e.key-1]); return; }
  if(e.key==='Escape'){ setTool('select'); return; } if(e.key.toLowerCase()==='w'){ setTool('wall'); return; } if(e.key.toLowerCase()==='o'){ setTool('window'); return; }
  if(!sel) return;
  if(e.key==='Delete'||e.key==='Backspace'){ del(sel); }
  else if(e.key.toLowerCase()==='d'){ dup(sel); }
  else if(e.key.toLowerCase()==='h' && sel.kind==='light'){ sel.on=sel.on===false; props(); schedule(); }
  else if(e.key.startsWith('Arrow')){ e.preventDefault(); var st=e.shiftKey?0.25:0.05; var mx=(e.key==='ArrowLeft'?-st:e.key==='ArrowRight'?st:0), my=(e.key==='ArrowUp'?-st:e.key==='ArrowDown'?st:0); if(sel.kind==='wall') moveWall(sel,mx,my); else { sel.x=Math.max(0.05,Math.min(scene.room.w-0.05,sel.x+mx)); sel.y=Math.max(0.05,Math.min(scene.room.h-0.05,sel.y+my)); } props(); schedule(); }
});

document.querySelectorAll('[data-add]').forEach(function(b){ b.onclick=function(){ var k=b.dataset.add, cx=scene.room.w/2, cy=scene.room.h/2, o;
  if(S.FIXTURES[k]) o=light(k,cx-1,cy-1,0.8); else if(S.FURNITURE[k]) o=furn(k,cx+0.5,cy+0.5,0); else o=item(k,cx+0.5,cy+0.5,k==='camera'?Math.PI:0);
  if(k==='camera' && scene.items.some(function(i){return i.kind==='camera';})){ o.x=cx+1.2; }
  scene.items.push(o); select(o); schedule(); }; });

function wallName(w){ return {left:'vlevo',top:'nahoře',right:'vpravo',bottom:'dole'}[w]; }
function renderDoors(){ var el=$('doors'), h=''; (scene.doors||[]).forEach(function(d,i){
    h+='<div class="door" data-i="'+i+'"><div class="hd"><b>Dveře '+(i+1)+'</b><button data-x="'+i+'" title="Odebrat">✕</button></div>'
     +'<div class="row"><div><label>Stěna</label><select data-k="wall">'+['left','top','right','bottom'].map(function(w){return '<option value="'+w+'"'+(w===d.wall?' selected':'')+'>'+wallName(w)+'</option>';}).join('')+'</select></div>'
     +'<div><label>Poloha (m)</label><input type="number" data-k="at" step="0.1" value="'+d.at+'"></div><div><label>Šířka (m)</label><input type="number" data-k="w" step="0.1" min="0.6" max="2.4" value="'+d.w+'"></div></div>'
     +'<div class="row"><div><label>Světlo za dveřmi</label><select data-k="light"><option value="none"'+(d.light==='none'?' selected':'')+'>tma</option><option value="dim"'+(d.light==='dim'?' selected':'')+'>slabé teplé (chodba)</option><option value="bright"'+(d.light==='bright'?' selected':'')+'>silné (osvětlená místnost)</option><option value="day"'+(d.light==='day'?' selected':'')+'>denní (místnost s oknem)</option></select></div>'
     +'<div style="flex:0 0 auto"><label>&nbsp;</label><label class="chk" style="margin:0"><input type="checkbox" data-k="open"'+(d.open!==false?' checked':'')+'> otevřené</label></div></div></div>'; });
  el.innerHTML=h||'<p class="mut" style="margin:2px 0 6px">Žádné dveře. Otevřené dveře propouští světlo z vedlejší místnosti.</p>';
  el.querySelectorAll('.door').forEach(function(div){ var d=scene.doors[+div.dataset.i];
    div.querySelectorAll('[data-k]').forEach(function(inp){ inp.addEventListener('input',function(){ var k=inp.dataset.k; if(inp.type==='checkbox') d[k]=inp.checked; else if(inp.type==='number'){ var v=parseFloat(inp.value); if(isNaN(v)) return; d[k]=k==='w'?Math.max(0.6,v):v; } else d[k]=inp.value; var len=(d.wall==='left'||d.wall==='right')?scene.room.h:scene.room.w; d.at=Math.max(d.w/2,Math.min(len-d.w/2,d.at)); if(k==='wall'||k==='w') inp.closest('.door').querySelector('[data-k=at]').value=d.at.toFixed(1); schedule(); }); });
    div.querySelector('[data-x]').onclick=function(){ scene.doors.splice(+div.dataset.i,1); renderDoors(); schedule(); }; }); }
$('bDoor').onclick=function(){ if(!scene.doors) scene.doors=[]; var walls=['bottom','right','top','left'], w=walls[scene.doors.length%4], len=(w==='left'||w==='right')?scene.room.h:scene.room.w; scene.doors.push(door(w,Math.round(len/2*10)/10)); renderDoors(); schedule(); };
function syncRoom(){ renderDoors(); renderWindows(); $('walls').value=scene.walls||'normal'; $('floor').value=scene.floor||'wood'; $('rw').value=scene.room.w; $('rh').value=scene.room.h; $('rz').value=scene.room.z||2.7; $('sky').value=scene.sky||'overcast'; $('sunOn').checked=!!scene.sun.on; $('sunElev').value=scene.sun.elev; $('sunAz').value=Math.round(((scene.sun.az*180/Math.PI)%360+360)%360); $('sunElevV').textContent=scene.sun.elev+'°'; $('sunAzV').textContent=$('sunAz').value+'°'; }
function wallLabel(w){ return typeof w==='string' ? 'vnější '+wallName(w) : 'zeď '+(function(){ var it=byId(w); return it?fmt(S.wallLen(it),1)+' m':'?'; })(); }
function renderWindows(){ var el=$('windows'), h=''; (scene.windows||[]).forEach(function(w,i){
    h+='<div class="win" data-i="'+i+'"><div class="hd"><b>Okno '+(i+1)+' · '+wallLabel(w.wall)+'</b><button data-x="'+i+'" title="Odebrat">✕</button></div><div class="row"><div><label>Od (m)</label><input type="number" data-k="from" step="0.1" value="'+w.from.toFixed(1)+'"></div><div><label>Do (m)</label><input type="number" data-k="to" step="0.1" value="'+w.to.toFixed(1)+'"></div></div></div>'; });
  el.innerHTML=h||'<p class="mut" style="margin:2px 0 6px">Žádná okna.</p>';
  el.querySelectorAll('.win').forEach(function(div){ var w=scene.windows[+div.dataset.i];
    div.querySelectorAll('[data-k]').forEach(function(inp){ inp.addEventListener('input',function(){ var v=parseFloat(inp.value); if(isNaN(v)) return; w[inp.dataset.k]=v; if(w.to<w.from+0.3) w.to=w.from+0.3; schedule(); }); });
    div.querySelector('[data-x]').onclick=function(){ scene.windows.splice(+div.dataset.i,1); renderWindows(); schedule(); }; }); }
$('sky').addEventListener('input',function(){ scene.sky=$('sky').value; schedule(); });
$('sunOn').addEventListener('input',function(){ scene.sun.on=$('sunOn').checked; fit(); schedule(); });
$('sunElev').addEventListener('input',function(){ scene.sun.elev=parseFloat($('sunElev').value); $('sunElevV').textContent=scene.sun.elev+'°'; schedule(); });
$('sunAz').addEventListener('input',function(){ scene.sun.az=parseFloat($('sunAz').value)*Math.PI/180; $('sunAzV').textContent=$('sunAz').value+'°'; schedule(); });
['rw','rh','rz'].forEach(function(id){ $(id).addEventListener('change',function(){ scene.room.w=Math.max(3,parseFloat($('rw').value)||7); scene.room.h=Math.max(3,parseFloat($('rh').value)||5); scene.room.z=Math.max(2.2,parseFloat($('rz').value)||2.7); scene.items.forEach(function(i){ if(i.kind==='wall'){ clampWall(i); return; } i.x=Math.min(i.x,scene.room.w-0.1); i.y=Math.min(i.y,scene.room.h-0.1); }); fit(); schedule(); }); });
$('walls').addEventListener('input',function(){ scene.walls=$('walls').value; schedule(); });
$('floor').addEventListener('input',function(){ scene.floor=$('floor').value; schedule(); });
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
