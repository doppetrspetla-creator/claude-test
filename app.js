/* Viewfinder Light – UI, půdorys, interakce */
(function(){
'use strict';
var S = window.LightSim, $ = function(id){ return document.getElementById(id); };
var cv = $('stage'), ctx = cv.getContext('2d'), wrap = $('planWrap'), center = $('center');
var scene, sel = null, uid = 1, res = null, meas = null, scale = 80, ox = 40, oy = 40, fineTimer = null, view3dReady = false, hover = null;
var off = document.createElement('canvas'), offx = off.getContext('2d');
var KIND = { light:'💡', person:'🧑', camera:'🎥', flag:'🏴', bounce:'⬜', diffuser:'◻️', box:'📦', furniture:'🪑', wall:'🧱', road:'🛣️' };
var KINDNAME = { light:'Světlo', person:'Postava', camera:'Kamera', flag:'Vlajka', bounce:'Odrazka', diffuser:'Difuzní rám', box:'Nábytek', furniture:'Nábytek', wall:'Zeď', road:'Cesta' };

function blank(){ return { room:{w:7,h:5,z:2.7}, walls:'normal', floor:'wood', sky:'overcast', windows:[{id:uid++,wall:'left',from:1.6,to:3.4}], doors:[], sun:{on:false,az:Math.PI*1.25,elev:35}, exterior:{on:false,trees:6}, format:'free', items:[] }; }
function win(wall, from, to){ return {id:uid++,wall:wall,from:from,to:to}; }
function wallItem(x1,y1,x2,y2){ var o={kind:'wall',id:uid++,x1:x1,y1:y1,x2:x2,y2:y2}; wallSyncXY(o); return o; }
// cesta (asfalt) – úsečka se šířkou jako zeď, jen v exteriéru (režim Jen exteriér nebo zahrada kolem domu)
function roadItem(x1,y1,x2,y2){ var o={kind:'road',id:uid++,x1:x1,y1:y1,x2:x2,y2:y2,wd:3.5,line:true}; wallSyncXY(o); return o; }
function isSeg(it){ return !!it&&(it.kind==='wall'||it.kind==='road'); }
function extOn(){ return !!(scene.outdoor||(scene.exterior&&scene.exterior.on)); }
function roadBox(){ var W=scene.room.w, H=scene.room.h, m=scene.outdoor?0:7; return [-m,-m,W+m,H+m]; } // u domu se zahradou až k plotu
function clampSeg(it){ if(it.kind!=='road'){ clampWall(it); return; } var b=roadBox(); it.x1=Math.max(b[0],Math.min(b[2],it.x1)); it.x2=Math.max(b[0],Math.min(b[2],it.x2)); it.y1=Math.max(b[1],Math.min(b[3],it.y1)); it.y2=Math.max(b[1],Math.min(b[3],it.y2)); wallSyncXY(it); }
function roadPt(x,y,skip){ x=Math.round(x*10)/10; y=Math.round(y*10)/10; var best=null; scene.items.forEach(function(it){ if(it.kind!=='road'||it===skip) return; [[it.x1,it.y1],[it.x2,it.y2]].forEach(function(q){ var d=Math.hypot(q[0]-x,q[1]-y); if(d<0.5&&(!best||d<best.d)) best={d:d,p:q}; }); }); if(best) return [best.p[0],best.p[1]]; var b=roadBox(); return [Math.max(b[0],Math.min(b[2],x)),Math.max(b[1],Math.min(b[3],y))]; }
function drawRoads(){ var rs=scene.items.filter(function(i){return i.kind==='road';}); if(!rs.length||!extOn()) return; ctx.save();
  if(!scene.outdoor){ var p0=toPx(0,0), r=wrap.getBoundingClientRect(); ctx.beginPath(); ctx.rect(0,0,r.width,r.height); ctx.rect(p0[0],p0[1]+scene.room.h*scale,scene.room.w*scale,-scene.room.h*scale); ctx.clip('evenodd'); } // do domu cesta nevede
  rs.forEach(function(it){ var a=toPx(it.x1,it.y1), b=toPx(it.x2,it.y2), isSel=sel===it, isHov=hover===it; ctx.lineCap='butt';
    ctx.strokeStyle='rgba(38,38,40,.78)'; ctx.lineWidth=Math.max(6,(it.wd||3.5)*scale); ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
    if(it.line!==false){ ctx.strokeStyle='rgba(235,235,230,.8)'; ctx.lineWidth=Math.max(1,0.12*scale); ctx.setLineDash([3*scale,3*scale]); ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); ctx.setLineDash([]); }
    if(isSel||isHov){ ctx.strokeStyle=isSel?'#d4b071':'rgba(212,176,113,.5)'; ctx.lineWidth=1.5; ctx.setLineDash([4,3]); var L=Math.hypot(b[0]-a[0],b[1]-a[1])||1, nx=-(b[1]-a[1])/L*(it.wd||3.5)*scale/2, ny=(b[0]-a[0])/L*(it.wd||3.5)*scale/2; ctx.beginPath(); ctx.moveTo(a[0]+nx,a[1]+ny); ctx.lineTo(b[0]+nx,b[1]+ny); ctx.lineTo(b[0]-nx,b[1]-ny); ctx.lineTo(a[0]-nx,a[1]-ny); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#ece8e0'; ctx.font='11px Inter,Lato,sans-serif'; ctx.fillText('Cesta '+fmt(S.wallLen(it),1)+' m',(a[0]+b[0])/2+10,(a[1]+b[1])/2-10); }
    if(isSel) [a,b].forEach(function(q){ ctx.fillStyle='#d4b071'; ctx.beginPath(); ctx.arc(q[0],q[1],6,0,7); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.stroke(); }); });
  ctx.restore(); }
function wallSyncXY(w){ w.x=(w.x1+w.x2)/2; w.y=(w.y1+w.y2)/2; w.rot=Math.atan2(w.y2-w.y1,w.x2-w.x1); }
function door(wall, at, extra){ var d={id:uid++,wall:wall,at:at,w:0.9,open:true,light:'dim'}; for(var k in extra) d[k]=extra[k]; return d; }
function furn(type, x, y, rot, extra){ var f=S.FURNITURE[type]||S.FURNITURE.block; var o={kind:'furniture',id:uid++,type:type,x:x,y:y,rot:rot||0,w:f.w,d:f.d}; if(type==='block'){ o.h=f.h; o.mat='wood'; o.label=''; } if(['bed','ldesk','pcdesk','pc','kitchen','tree','sofa'].indexOf(type)>=0){ o.h=f.h; } if(f.elev!=null) o.elev=f.elev; if(type==='tree') o.variant=0; for(var k in extra) o[k]=extra[k]; return o; }
function light(fix, x, y, rot, extra){ var f=S.FIXTURES[fix]; var L={kind:'light',id:uid++,fixture:fix,mod:f.defMod,x:x,y:y,h:1.7,rot:rot,power:70,cct:f.cct,zoom:30,grid:false,diff:false,barn:false,gel:'none',on:true,label:''}; for(var k in extra) L[k]=extra[k]; if(fix==='lamp') L.h=extra&&extra.h!=null?extra.h:1.0; if(fix==='tube') L.h=extra&&extra.h!=null?extra.h:1.5; return L; }
function item(kind, x, y, rot, extra){ var o={kind:kind,id:uid++,x:x,y:y,rot:rot||0}; if(kind==='flag') o.len=0.9; if(kind==='bounce'){o.len=1.0;o.flip=false;o.silver=false;o.black=false;} if(kind==='diffuser'){o.len=1.2;o.h=1.6;o.grid='half';o.flip=false;} if(kind==='box'){o.w=1.2;o.d=0.6;o.tall=false;} if(kind==='camera'){o.focal=35;o.h=1.5;} if(kind==='person'){ o.pose='stand'; o.t=0.3; o.model='zena1'; o.outfit='dark'; o.hair='short'; o.hairColor='dark'; o.skin='light'; } for(var k in extra) o[k]=extra[k]; return o; }

var TEMPL = {
  window: function(){ var s=blank(); s.items=[item('person',2.6,2.5,1.6,{model:'zena1'}), item('camera',4.4,3.5,Math.PI+0.5,{focal:50}), item('flag',3.4,1.6,-0.9,{len:0.9}), light('lamp',5.9,0.8,0), furn('table',6.0,1.3,0,{w:0.8,d:0.5})]; s.items[0].pose='sit'; s.windows=[win('left',1.4,3.2)]; return s; },
  three: function(){ var s=blank(); s.windows=[]; s.items=[item('person',3.5,2.2,Math.PI/2-0.35,{model:'zena1'}), item('camera',3.5,4.3,-Math.PI/2,{focal:50}), light('cob300',2.2,3.4,-0.75,{mod:'softbox90',power:80,label:'KEY',h:1.9}), light('cob100',4.8,3.6,-2.2,{mod:'softbox60',power:25,label:'FILL',h:1.6}), light('cob100',4.6,0.9,2.25,{mod:'fresnel',zoom:20,power:10,cct:4300,label:'BACK',h:2.2})]; return s; },
  night: function(){ var s=blank(); s.walls='normal'; s.floor='wood'; s.windows=[win('right',1.2,2.6)]; s.sky='dusk'; s.format='169';
    s.windows[0].blind='half';
    var desk=furn('ldesk',1.075,0.795,0,{}), ds=S.deskSpots(desk);
    s.items=[desk, furn('pc',ds.pc.x,ds.pc.y,ds.pc.rot,{elev:ds.pc.elev}), item('person',ds.person.x,ds.person.y,ds.person.rot,{pose:'type',model:'zena1',t:0.35}),
      light('cob100',ds.pc.x+0.28,ds.pc.y+0.28,Math.PI/4,{mod:'softbox60',power:4,cct:6500,h:1.05,label:'MONITOR',hide:true}),
      light('lamp',0.35,1.95,0,{h:1.15}), light('tube',6.6,4.4,Math.PI+0.6,{power:18,cct:3200,label:'tuba'}),
      furn('bed',5.6,3.6,0,{}), furn('block',4.3,4.55,0,{w:0.45,d:0.45,h:0.55,mat:'wood',label:'Noční stolek'}),
      item('camera',2.65,0.7,Math.PI-0.3,{focal:35,h:1.25})];
    s.doors=[door('bottom',2.4,{light:'dim'})]; return s; },
  rembrandt: function(){ var s=blank(); s.walls='dark'; s.windows=[]; s.items=[item('person',3.5,2.5,Math.PI/2,{model:'zena1'}), item('camera',3.5,4.4,-Math.PI/2,{focal:85}), light('cob300',2.0,3.6,-0.6,{mod:'octa120',power:60,label:'KEY',h:2.1}), item('bounce',5.0,3.3,2.06,{len:1.0,flip:false}), item('flag',2.9,1.3,0,{len:1.2})]; return s; },
  living: function(){ var s=blank(); s.room={w:6,h:5,z:2.7}; s.windows=[win('top',1.2,3.0)]; s.doors=[door('right',3.6,{light:'dim'})];
    var sofa=furn('sofa',2.6,3.95,-Math.PI/2), st=S.sofaSeats(sofa)[0];
    s.items=[sofa, furn('coffee',2.6,2.75,0,{w:1.1,d:0.55}), item('person',st.x,st.y,st.rot,{pose:'sit',model:'zena1',t:0.8}), item('camera',3.9,1.4,Math.PI-1.05,{focal:35}), light('lamp',4.6,3.9,0,{h:1.4}), furn('shelf',5.6,1.0,Math.PI,{}), light('cob300',1.0,1.6,0.75,{mod:'softbox90',power:35,cct:4500,label:'KEY',h:1.9})]; return s; },
  sun: function(){ var s=blank(); s.room={w:8,h:5,z:2.7}; s.sky='sunny'; s.sun={on:true,az:Math.PI*1.2,elev:30}; s.windows=[win('left',1.5,3.5), win('bottom',5.5,7.0)];
    var wl=wallItem(4.5,0,4.5,3.4); s.items=[wl, item('person',2.4,2.4,0.9,{pose:'stand',model:'zena1'}), item('camera',4.0,4.2,Math.PI+0.85,{focal:35}), furn('table',2.0,4.2,0), item('bounce',3.6,1.2,-0.4,{len:1.2}), furn('sofa',6.5,1.0,Math.PI/2), light('lamp',7.4,4.4,0,{h:1.4})]; s.windows.push(win(wl.id,1.6,2.8)); return s; },
  house: function(){ var s=blank(); s.room={w:12,h:9,z:2.7}; s.walls='white'; s.floor='wood'; s.sky='sunny'; s.sun={on:true,az:3.9,elev:38}; s.exterior={on:true,trees:9}; s.format='169';
    s.windows=[win('left',1.0,2.5), win('left',6.0,8.0), win('top',5.0,6.3), win('bottom',2.0,4.5), win('right',1.5,2.5)];
    s.doors=[door('bottom',6.5,{w:1.0,light:'day'}), door('bottom',10.0,{w:2.6,light:'day'})];
    var desk=furn('ldesk',7.2,1.08,Math.PI/2,{}), ds=S.deskSpots(desk);
    var wG=wallItem(8,0,8,9), wH=wallItem(0,4.5,8,4.5);
    s.doors.push(door(wG.id,6.0,{light:'none'}), door(wH.id,3.0,{light:'none'}), door(wH.id,4.6,{light:'none'}));
    s.items=[wG, wH, wallItem(4,0,4,4.5),
      // kuchyně: linka pod horní stěnou (2 díly), linka u okna, lednice, jídelní stůl
      furn('kitchen',1.55,0.28,Math.PI/2,{d:2.98}), furn('block',3.4,0.36,0,{w:0.6,d:0.68,h:1.85,mat:'metal',label:'Lednice'}), furn('kitchen',0.28,2.2,0,{d:1.49}),
      furn('table',2.2,2.6,0,{w:1.2,d:0.8}), furn('chair',2.2,1.95,Math.PI/2), furn('chair',2.2,3.25,-Math.PI/2),
      // obývák
      furn('sofa',0.6,7.0,0), furn('coffee',1.75,7.0,0,{w:0.55,d:1.1}), furn('armchair',3.6,8.3,-Math.PI/2+0.4), furn('shelf',6.5,8.75,-Math.PI/2),
      // ložnice s pracovním koutem
      furn('bed',5.16,1.9,0,{}), furn('block',4.3,0.72,0,{w:0.45,d:0.45,h:0.55,mat:'wood',label:'Noční stolek'}), furn('block',4.3,3.08,0,{w:0.45,d:0.45,h:0.55,mat:'wood',label:'Noční stolek'}),
      furn('wardrobe',6.9,4.14,-Math.PI/2,{w:0.6,d:1.2}), desk, furn('pc',ds.pc.x,ds.pc.y,ds.pc.rot,{elev:ds.pc.elev}), furn('chair',ds.person.x,ds.person.y,ds.person.rot),
      // garáž
      furn('car',10.0,5.0,Math.PI/2,{color:'#2f4f6f'}), furn('block',11.6,1.2,0,{w:0.6,d:2.0,h:0.9,mat:'wood',label:'Ponk'}), furn('block',9.0,0.4,0,{w:1.8,d:0.6,h:2.0,mat:'dark',label:'Regál v garáži'}),
      item('person',5.0,6.8,Math.PI/2+0.3,{pose:'stand',model:'zena1'}), item('camera',6.4,8.2,Math.PI-0.9,{focal:35}),
      light('cob300',3.0,6.0,-0.3,{mod:'softbox90',power:40,cct:5600,label:'KEY',h:2.0}), light('lamp',0.5,8.6,0,{h:1.4}), light('lamp',4.3,0.72,0,{h:0.9})];
    return s; },
  yard: function(){ var s=blank(); s.room={w:14,h:10,z:2.7}; s.outdoor=true; s.floor='grey'; s.sky='sunny'; s.sun={on:true,az:3.6,elev:35}; s.exterior={on:true,trees:8}; s.windows=[]; s.format='169';
    s.items=[furn('car',6.5,3.5,0.35,{}), item('person',5.2,6.2,-0.6,{pose:'phone',model:'zena1',t:0.4}), item('person',8.6,6.0,-2.5,{pose:'talk',model:'muz1',t:0.5}), item('camera',7.0,9.0,-Math.PI/2-0.15,{focal:35}), item('bounce',4.0,7.6,0.9,{len:1.2}), furn('block',11.0,2.0,0,{w:1.2,d:0.8,h:1.1,mat:'dark',label:'Popelnice'}), furn('tree',12.2,7.8,0,{h:6.5,w:3.6,d:3.6,variant:1})]; return s; },
  office: function(){ var s=blank(); s.room={w:5,h:4.5,z:2.7}; s.walls='white'; s.floor='wood'; s.sky='overcast'; s.format='169';
    s.windows=[win('left',0.8,2.6)]; s.windows[0].blind='half';
    var desk=furn('ldesk',3.9,1.08,Math.PI/2,{}), ds=S.deskSpots(desk);
    s.items=[desk, furn('pc',ds.pc.x,ds.pc.y,ds.pc.rot,{elev:ds.pc.elev}), item('person',ds.person.x,ds.person.y,ds.person.rot,{pose:'type',model:'zena2',t:0.4}),
      light('cob100',ds.pc.x-0.28,ds.pc.y+0.28,Math.PI*3/4,{mod:'softbox60',power:3,cct:6500,h:1.05,label:'MONITOR',hide:true}),
      light('cob300',1.7,3.2,-0.55,{mod:'softbox90',power:35,cct:5000,h:1.9,label:'KEY'}), furn('shelf',0.2,3.7,0,{w:0.35,d:0.9}), furn('armchair',1.4,3.8,-Math.PI/2+0.3),
      light('lamp',0.35,4.2,0,{h:1.4}), item('camera',2.5,0.5,0.22,{focal:35,h:1.2,aim:false,tilt:-0.1})];
    return s; },
  kitchen: function(){ var s=blank(); s.room={w:5,h:4,z:2.7}; s.walls='normal'; s.floor='grey'; s.sky='sunny'; s.sun={on:true,az:-1.9,elev:18}; s.format='169';
    s.windows=[win('top',1.4,3.0)];
    s.items=[furn('kitchen',2.2,0.28,Math.PI/2,{d:2.98}), furn('block',4.1,0.36,0,{w:0.6,d:0.68,h:1.85,mat:'metal',label:'Lednice'}),
      furn('table',2.3,2.7,0,{w:1.2,d:0.8}), furn('chair',1.6,2.7,0), furn('chair',3.0,2.7,Math.PI),
      item('person',3.25,0.95,Math.PI/2+0.25,{pose:'phone',model:'zena1',t:0.45}), item('person',3.0,2.7,Math.PI,{pose:'sit',model:'muz1',t:0.8}),
      light('cob300',0.6,2.3,-0.47,{mod:'softbox90',power:22,cct:5200,h:1.8,label:'FILL'}), item('camera',1.2,3.6,-1.1,{focal:30,h:1.45})];
    return s; },
  stream: function(){ var s=blank(); s.room={w:4.5,h:4,z:2.6}; s.walls='dark'; s.floor='dark'; s.sky='dusk'; s.windows=[]; s.format='169';
    var desk=furn('pcdesk',2.25,0.4,Math.PI/2,{}), ds=S.deskSpots(desk);
    s.items=[desk, item('person',ds.person.x,ds.person.y,ds.person.rot,{pose:'type',model:'zena2',t:0.4}),
      light('panel2',3.75,1.5,Math.atan2(1.035-1.5,2.25-3.75),{power:60,cct:4800,h:1.6,label:'KEY'}),
      light('cob100',2.25,0.62,Math.PI/2,{mod:'softbox60',power:3,cct:6500,h:1.05,label:'MONITOR',hide:true}),
      light('tube',0.3,2.2,Math.PI,{power:100,h:1.8,rgb:true,color:'#9a3aff',label:'RGB'}),
      light('tube',1.9,3.75,Math.PI/2,{power:100,h:0.3,rgb:true,color:'#00c8ff',label:'RGB 2'}),
      furn('armchair',0.7,3.3,-0.6,{}), item('camera',3.9,0.75,2.88,{focal:35,h:1.25})];
    return s; },
  photostudio: function(){ var s=blank(), E=S.ENVS.photostudio; s.env='photostudio'; s.room={w:E.room.w,h:E.room.h,z:E.room.z}; s.walls=E.walls; s.floor=E.floor; s.windows=[]; s.format='43';
    s.items=[item('person',2.3,4.45,0,{model:'zena1',pose:'stand',t:0.3}), item('camera',6.6,4.45,Math.PI,{focal:70,h:1.5}),
      light('skypanel',3.9,3.3,2.52,{power:30,h:1.9,label:'KEY'}), light('kinoflo',4.1,5.9,-2.46,{power:14,h:1.6,label:'FILL'}),
      light('arri650',0.9,2.3,0.99,{zoom:24,power:30,h:2.5,label:'VLASY'}), light('arri650',1.9,6.1,-2.35,{zoom:40,power:30,h:1.0,label:'POZADÍ'})];
    return s; },
  cyclo: function(){ var s=blank(), E=S.ENVS.cyclorama; s.env='cyclorama'; s.room={w:E.room.w,h:E.room.h,z:E.room.z}; s.walls=E.walls; s.floor=E.floor; s.windows=[]; s.format='169';
    s.items=[item('person',16.4,4.2,2.74,{model:'zena1',pose:'stand',t:0.3}), item('camera',11.0,6.5,-0.4,{focal:50,h:1.5}), light('skypanel',13.5,2.5,0.53,{power:90,h:2.0,label:'KEY'}), light('kinoflo',13.0,7.4,-0.755,{power:60,h:1.7,label:'FILL'}), light('arri650',20.0,6.8,-2.51,{zoom:25,power:55,h:2.8,label:'KONTRA'}), light('cob600',15.0,0.8,0.3,{mod:'frame',power:70,h:3.2,label:'HORIZONT'})];
    return s; },
  empty: function(){ var s=blank(); s.windows=[]; return s; }
};

// ---------- undo/redo + autosave ----------
var hist=[], hpos=-1, histTimer=null;
function snapshot(){ var j=JSON.stringify(scene); try{ localStorage.setItem('viewfinder-scene',j); localStorage.setItem('viewfinder-ts',String(Date.now())); }catch(e){} cloudSave(j); if(hist[hpos]===j) return; hist=hist.slice(0,hpos+1); hist.push(j); if(hist.length>80) hist.shift(); hpos=hist.length-1; updUndo(); }
function snapshotSoon(){ clearTimeout(histTimer); histTimer=setTimeout(snapshot,400); }
function restore(j){ scene=JSON.parse(j); sel=null; fixIds(); syncRoom(); props(); fit(); schedule(); updUndo(); }
function flushSnap(){ clearTimeout(histTimer); snapshot(); }
function undo(){ flushSnap(); if(hpos>0){ hpos--; restore(hist[hpos]); } }
function redo(){ flushSnap(); if(hpos<hist.length-1){ hpos++; restore(hist[hpos]); } }
function updUndo(){ $('bUndo').disabled=hpos<=0; $('bRedo').disabled=hpos>=hist.length-1; }
// kamera už postavu automaticky nesleduje: jednorázově ji namíří na obličej první postavy (rot + náklon) a nechá stát
function aimOnce(sc, cam){ var p=sc.items.find(function(i){return i.kind==='person';}); if(p){ var dx=p.x-cam.x, dy=p.y-cam.y, d=Math.hypot(dx,dy); if(d>0.05){ cam.rot=Math.atan2(dy,dx); cam.tilt=Math.max(-0.6,Math.min(0.6,Math.atan2(S.faceZ(p)-(cam.h==null?1.5:cam.h),d))); } } cam.aim=false; }
function freezeAim(sc){ sc.items.forEach(function(i){ if(i.kind==='camera' && i.aim!==false) aimOnce(sc,i); }); sc.aimV=2; }
function fixIds(){ uid=1+Math.max.apply(null,scene.items.map(function(i){return i.id||0;}).concat((scene.doors||[]).map(function(d){return d.id||0;})).concat((scene.windows||[]).map(function(w){return w.id||0;})).concat([0])); scene.items.forEach(function(i){ if(i.id==null) i.id=uid++; }); if(!scene.room.z) scene.room.z=2.7; if(!scene.floor) scene.floor='wood'; if(!scene.doors) scene.doors=[]; scene.doors.forEach(function(d){ if(d.id==null) d.id=uid++; }); if(!scene.windows){ scene.windows=[]; if(scene.window){ if(scene.window.on) scene.windows.push({id:uid++,wall:scene.window.wall,from:scene.window.from,to:scene.window.to}); scene.sky=scene.window.sky||'overcast'; delete scene.window; } } scene.windows.forEach(function(w){ if(w.id==null) w.id=uid++; }); if(!scene.sky) scene.sky='overcast'; if(!scene.sun) scene.sun={on:false,az:Math.PI*1.25,elev:35}; if(!scene.exterior) scene.exterior={on:false,trees:6}; if(!scene.format) scene.format='free'; if(!scene.variants) scene.variants=[]; if(scene.outdoor==null) scene.outdoor=false; scene.items.forEach(function(i){ if(i.kind==='wall') wallSyncXY(i); }); scene.items.forEach(function(i){ if(i.kind==='box'){ i.kind='furniture'; i.type=i.tall?'wardrobe':'block'; if(i.tall) delete i.tall; } if(i.kind==='person'){ if(!i.pose) i.pose='stand'; if(!i.model) i.model='proc'; } if(i.kind==='furniture'&&i.type==='sofa'&&i.w>i.d){ var tw=i.w; i.w=i.d; i.d=tw; } }); if(!scene.aimV) freezeAim(scene); scene.items.forEach(function(i){ if(i.kind==='light'&&i.h==null) i.h=1.7; if(i.kind==='camera'){ if(i.h==null) i.h=1.5; if(i.aim==null) i.aim=false;  } }); }

// ---------- mapování ----------
function fit(){ var r=wrap.getBoundingClientRect(); if(r.width<2) return; cv.width=r.width*devicePixelRatio; cv.height=r.height*devicePixelRatio; cv.style.width=r.width+'px'; cv.style.height=r.height+'px';
  var W=scene.room.w, H=scene.room.h, pad=44, ex=((scene.exterior&&scene.exterior.on)||scene.outdoor)?5.0:(S.sunOn(scene)?2.0:0); scale=Math.min((r.width-2*pad)/(W+ex),(r.height-2*pad)/(H+ex)); ox=(r.width-W*scale)/2; oy=(r.height-H*scale)/2+8; draw(); }
function toPx(x,y){ return [ox+x*scale, oy+y*scale]; }
function toM(px,py){ return [(px-ox)/scale, (py-oy)/scale]; }

// ---------- výpočet ----------
function recompute(cell){ res=S.compute(scene,cell); meas=S.measure(scene,res); renderMap(); updateMeter(); draw(); sync3d(); }
function fineCell(){ var q=$('quality').value, base=q==='low'?0.06:q==='high'?0.025:0.035; return Math.max(base, Math.sqrt(scene.room.w*scene.room.h/40000)); }
function schedule(){ recompute(0.12); clearTimeout(fineTimer); fineTimer=setTimeout(function(){ recompute(fineCell()); },180); objList(); snapshotSoon(); }
function baseRef(){ if($('autoEv').checked && meas && meas.lux>0.5) return meas.lux; if(scene.outdoor){ var sk=(S.SKY[scene.sky]||S.SKY.overcast).E; return S.sunOn(scene)? (S.isNight(scene)? S.sunE(scene)*0.9 : Math.max(8000, sk*2.2)) : sk*2.2*0.9; } return 300; }
function exposureRef(){ var ev=parseFloat($('ev').value); return baseRef()*Math.pow(2,-ev); }
function sync3d(){ if(!view3dReady) return; var cam=scene.items.some(function(i){return i.kind==='camera';}); $('camHint').classList.toggle('hide',cam); if(cam){ var c=scene.items.find(function(i){return i.kind==='camera';}); $('camInfo').textContent=c.focal+' mm · výška '+c.h.toFixed(2).replace('.',',')+' m'; }
  window.View3D.sync(scene,res,meas,{ref:baseRef(), ev:parseFloat($('ev').value), shadows:$('shadows').checked, haze:parseFloat($('haze').value)/100, grain:parseFloat($('grain').value)/100, quality:$('quality').value}); window.View3D.setSel(sel?sel.id:null); camUI(); }

function renderMap(){
  var nx=res.nx, ny=res.ny; off.width=nx; off.height=ny; var img=offx.createImageData(nx,ny), d=img.data, ref=exposureRef(), zeb=$('zebra').checked;
  function tm(v){ return Math.pow(1-Math.exp(-v*1.25),1/1.5); }
  for(var j=0;j<ny;j++) for(var i=0;i<nx;i++){ var k=j*nx+i, p=k*4, r=res.R[k]/ref, g=res.G[k]/ref, b=res.B[k]/ref, R=tm(r),G=tm(g),B=tm(b);
    if(zeb && (r>2.6||g>2.6||b>2.6)){ var zs=((i+j)%6===0)?0.45:0.18; R=R*(1-zs)+zs; G=G*(1-zs)+0.25*zs; B=B*(1-zs)+0.25*zs; } // přepal: jemný červený nádech s řídkými proužky
    d[p]=Math.min(255,12+R*243); d[p+1]=Math.min(255,11+G*244); d[p+2]=Math.min(255,10+B*245); d[p+3]=255; }
  offx.putImageData(img,0,0);
}

// ---------- kreslení půdorysu ----------
function draw(){
  var dpr=devicePixelRatio; ctx.setTransform(dpr,0,0,dpr,0,0); var r=wrap.getBoundingClientRect(); ctx.clearRect(0,0,r.width,r.height);
  var W=scene.room.w, H=scene.room.h, p0=toPx(0,0);
  var rbt=document.querySelector('#tools [data-tool="road"]'); if(rbt) rbt.classList.toggle('dis',!extOn());
  if((scene.exterior&&scene.exterior.on)||scene.outdoor){ var gp=toPx(-4,-4); ctx.fillStyle='#1d2a17'; ctx.fillRect(gp[0],gp[1],(W+8)*scale,(H+8)*scale); S.exteriorTrees(scene).forEach(function(t){ var q=toPx(t.x,t.y); ctx.fillStyle= t.kind==='conifer'?'rgba(50,95,45,.85)':'rgba(70,125,55,.8)'; ctx.beginPath(); ctx.arc(q[0],q[1],t.r*scale,0,7); ctx.fill(); ctx.fillStyle='#3a2a1a'; ctx.beginPath(); ctx.arc(q[0],q[1],0.12*scale,0,7); ctx.fill(); }); }
  if(res){ ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'; ctx.drawImage(off,p0[0],p0[1],res.nx*res.cell*scale,res.ny*res.cell*scale); }
  if($('gridOn').checked){ ctx.strokeStyle='rgba(255,255,255,.07)'; ctx.lineWidth=1; for(var x=1;x<W;x++){ var a=toPx(x,0),b=toPx(x,H); ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); } for(var y=1;y<H;y++){ var a2=toPx(0,y),b2=toPx(W,y); ctx.beginPath(); ctx.moveTo(a2[0],a2[1]); ctx.lineTo(b2[0],b2[1]); ctx.stroke(); } }
  drawRoads();
  if(((scene.exterior&&scene.exterior.on)||scene.outdoor) && scene.fence!==false){ var fm=scene.outdoor?0:7.5, fp=toPx(-fm,-fm); ctx.strokeStyle='rgba(170,125,80,.9)'; ctx.lineWidth=2.5; ctx.setLineDash([2,5]); ctx.strokeRect(fp[0],fp[1],(W+2*fm)*scale,(H+2*fm)*scale); ctx.setLineDash([]); }
  if(scene.outdoor){ ctx.strokeStyle='rgba(255,255,255,.25)'; ctx.setLineDash([6,6]); ctx.lineWidth=1.5; ctx.strokeRect(p0[0],p0[1],W*scale,H*scale); ctx.setLineDash([]); } else { ctx.strokeStyle='#8a8277'; ctx.lineWidth=5; ctx.strokeRect(p0[0],p0[1],W*scale,H*scale); }
  var envD=scene.env&&S.ENVS[scene.env]; if(envD) envD.parts.forEach(function(q){ var a=toPx(q.x0,q.y0); ctx.fillStyle=q.col||'rgba(120,110,95,.45)'; ctx.fillRect(a[0],a[1],(q.x1-q.x0)*scale,(q.y1-q.y0)*scale); ctx.strokeStyle='rgba(236,232,224,.35)'; ctx.lineWidth=1; ctx.setLineDash([4,3]); ctx.strokeRect(a[0],a[1],(q.x1-q.x0)*scale,(q.y1-q.y0)*scale); ctx.setLineDash([]); ctx.fillStyle='rgba(236,232,224,.6)'; ctx.font='11px Inter,Lato,sans-serif'; ctx.fillText(q.label,a[0]+6,a[1]+14); });
  (scene.outdoor?[]:(scene.windows||[])).forEach(function(w){ var a,b; if(typeof w.wall==='string'){ var fr=wallPt(w.wall); a=fr(w.from); b=fr(w.to); } else { var wi=byId(w.wall); if(!wi) return; a=toPx.apply(null,S.wallPoint(wi,w.from)); b=toPx.apply(null,S.wallPoint(wi,w.to)); }
    var bl=S.blindOf(w); ctx.strokeStyle='#0a0a0a'; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); ctx.strokeStyle= bl>=1?'#55595e': bl>0?'#5f86a6':'#8fc0e8'; ctx.lineWidth=3; if(bl>0) ctx.setLineDash([4,3]); ctx.stroke(); ctx.setLineDash([]); });
  (scene.outdoor?[]:(scene.doors||[])).forEach(function(d){ var de=doorEnds(d); if(!de) return; var a=de.a, b=de.b, open=d.open!==false, L=S.DOORLIGHT[d.light]||S.DOORLIGHT.none;
    ctx.strokeStyle= open ? (L.E>0 ? '#e0b86a' : '#0a0a0a') : '#5a5148'; ctx.lineWidth= open?7:5; ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
    if(open){ var inw=de.inw, hx=a[0], hy=a[1], ang0=Math.atan2(inw[1],inw[0]), r=d.w*scale;
      var ang1=Math.atan2(b[1]-a[1],b[0]-a[0]), dd=ang0-ang1; while(dd>Math.PI) dd-=2*Math.PI; while(dd<-Math.PI) dd+=2*Math.PI; ctx.strokeStyle='rgba(236,232,224,.55)'; ctx.lineWidth=1.5; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.arc(hx,hy,r,ang1,ang0,dd<0); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle='#d8cfbf'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(hx+inw[0]*r*0.96+(b[0]-a[0])*0.08,hy+inw[1]*r*0.96+(b[1]-a[1])*0.08); ctx.stroke(); } });
  ctx.fillStyle='#8f8a80'; ctx.font='11px Inter,Lato,sans-serif'; var sb=toPx(0,H); ctx.fillRect(sb[0],sb[1]+14,scale,2); ctx.fillText('1 m',sb[0],sb[1]+30);
  ctx.fillText(W.toString().replace('.',',')+' × '+H.toString().replace('.',',')+' m', sb[0]+scale+14, sb[1]+30);
  scene.items.forEach(function(it){ if(it.kind!=='light'&&it.kind!=='road') drawItem(it); }); scene.items.forEach(function(it){ if(it.kind==='light') drawItem(it); });
  drawSun(); drawTool();
  if(meas){ meas.sides.forEach(function(s){ var q=toPx(s.x,s.y); ctx.fillStyle= s.E===meas.lux ? '#d4b071':'#6c93c9'; ctx.beginPath(); ctx.arc(q[0],q[1],3.2,0,7); ctx.fill(); }); }
}
function wallPt(wall){ var W=scene.room.w, H=scene.room.h; return wall==='left'?function(t){return toPx(0,t);}: wall==='right'?function(t){return toPx(W,t);}: wall==='top'?function(t){return toPx(t,0);}: function(t){return toPx(t,H);}; }
function rotHandle(it){ var L = it.kind==='camera'?0.55:(it.kind==='light'?0.6:0.5); return [it.x+Math.cos(it.rot)*L, it.y+Math.sin(it.rot)*L]; }
function drawItem(it){
  var p=toPx(it.x,it.y), s=scale, isSel=(sel===it), isHov=(hover===it);
  ctx.save(); ctx.translate(p[0],p[1]); ctx.rotate(it.rot);
  if(it.kind==='light'){ var m=S.MODS[it.mod], P=S.lightParams(it), wpx=Math.max(10,P.size*s), c=P.rgb?[parseInt(it.color.slice(1,3),16)/255,parseInt(it.color.slice(3,5),16)/255,parseInt(it.color.slice(5,7),16)/255]:S.kelvinRGB(P.cct), colS='rgb('+Math.round(c[0]*255)+','+Math.round(c[1]*255)+','+Math.round(c[2]*255)+')';
    if(P.fx.ceil){ var cz=it.fixture; ctx.fillStyle=it.on===false?'#3a3a3a':colS; ctx.strokeStyle='#111'; ctx.lineWidth=1;
      if(cz==='batten'||cz==='hangfluo'){ var tl=P.size*s, tw=Math.max(6,(cz==='hangfluo'?0.22:0.1)*s); ctx.fillRect(-tl/2,-tw/2,tl,tw); ctx.strokeRect(-tl/2,-tw/2,tl,tw); ctx.setLineDash([3,3]); ctx.strokeStyle='rgba(236,232,224,.5)'; ctx.strokeRect(-tl/2-3,-tw/2-3,tl+6,tw+6); ctx.setLineDash([]); }
      else { var rr=Math.max(cz==='bulb'?5:8,(cz==='bulb'?0.06:0.18)*s); ctx.beginPath(); ctx.arc(0,0,rr,0,7); ctx.fill(); ctx.stroke(); ctx.strokeStyle='#111'; ctx.beginPath(); ctx.moveTo(-rr*0.7,-rr*0.7); ctx.lineTo(rr*0.7,rr*0.7); ctx.moveTo(rr*0.7,-rr*0.7); ctx.lineTo(-rr*0.7,rr*0.7); ctx.stroke(); }
      if(it.on===false){ ctx.strokeStyle='#d0534a'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-10,-10); ctx.lineTo(10,10); ctx.moveTo(10,-10); ctx.lineTo(-10,10); ctx.stroke(); }
      ctx.restore(); if(isSel||isHov){ ctx.strokeStyle= isSel?'#d4b071':'rgba(212,176,113,.4)'; ctx.setLineDash([3,3]); ctx.lineWidth=1; ctx.beginPath(); ctx.arc(p[0],p[1],22,0,7); ctx.stroke(); ctx.setLineDash([]); }
      if(isSel){ var hh=toPx.apply(null,rotHandle(it)); ctx.strokeStyle='rgba(212,176,113,.6)'; ctx.beginPath(); ctx.moveTo(p[0],p[1]); ctx.lineTo(hh[0],hh[1]); ctx.stroke(); ctx.fillStyle='#d4b071'; ctx.beginPath(); ctx.arc(hh[0],hh[1],6,0,7); ctx.fill(); }
      var nm2=it.label||P.fx.name.split(' (')[0]; ctx.fillStyle= it.label?'#ece8e0':'rgba(236,232,224,.55)'; ctx.font=(it.label?'bold ':'')+'11px Inter,Lato,sans-serif'; ctx.fillText(nm2,p[0]+14,p[1]-14); return; }
    if($('beams').checked && !P.omni && it.on!==false){ var half=P.beam/2*Math.PI/180, R=3.2*s; ctx.fillStyle='rgba(212,176,113,.08)'; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R,-half,half); ctx.closePath(); ctx.fill(); ctx.strokeStyle='rgba(212,176,113,.45)'; ctx.setLineDash([4,4]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(half)*R,Math.sin(half)*R); ctx.moveTo(0,0); ctx.lineTo(Math.cos(-half)*R,Math.sin(-half)*R); ctx.stroke(); ctx.setLineDash([]); }
    if(P.omni){ ctx.fillStyle=colS; ctx.beginPath(); if(it.mod==='tube'){ ctx.roundRect(-4,-wpx/2,8,wpx,3); } else ctx.arc(0,0,Math.max(6,P.size*s/2),0,7); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.stroke(); }
    else if(m.soft){ ctx.fillStyle='#3a3a3a'; ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(4,-wpx/2); ctx.lineTo(4,wpx/2); ctx.lineTo(-12,wpx*0.22); ctx.lineTo(-12,-wpx*0.22); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.strokeStyle=colS; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(4,-wpx/2); ctx.lineTo(4,wpx/2); ctx.stroke(); if(it.grid){ ctx.strokeStyle='#111'; ctx.lineWidth=1; for(var g=-wpx/2+3; g<wpx/2; g+=4){ ctx.beginPath(); ctx.moveTo(4,g); ctx.lineTo(8,g); ctx.stroke(); } } }
    else { ctx.fillStyle='#3a3a3a'; ctx.beginPath(); ctx.arc(-4,0,9,0,7); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.stroke(); ctx.fillStyle=colS; ctx.fillRect(4,-6,5,12); if(it.barn){ ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(9,-6); ctx.lineTo(16,-11); ctx.moveTo(9,6); ctx.lineTo(16,11); ctx.stroke(); } }
    if(it.gel!=='none'){ ctx.fillStyle= it.gel==='cto' ? '#e69a3c':'#4f86d6'; ctx.fillRect(6,-4,3,8); }
    if(it.on===false){ ctx.strokeStyle='#d0534a'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-10,-10); ctx.lineTo(10,10); ctx.moveTo(10,-10); ctx.lineTo(-10,10); ctx.stroke(); }
  } else if(it.kind==='person'){ if((S.POSES[it.pose]||S.POSES.stand).sit && !S.seatUnder(scene,it)){ ctx.fillStyle='rgba(120,90,60,.55)'; ctx.strokeStyle='#8a6a48'; ctx.lineWidth=1; ctx.fillRect(-0.225*s,-0.225*s,0.45*s,0.45*s); ctx.strokeRect(-0.225*s,-0.225*s,0.45*s,0.45*s); ctx.fillStyle='#8a6a48'; ctx.fillRect(-0.225*s,-0.225*s,0.05*s,0.45*s); } ctx.fillStyle='#55504a'; ctx.beginPath(); ctx.ellipse(-2,0,0.1*s,0.24*s,0,0,7); ctx.fill(); ctx.fillStyle='#d9b597'; ctx.beginPath(); ctx.moveTo(0.1*s,-0.035*s); ctx.lineTo(0.15*s,0); ctx.lineTo(0.1*s,0.035*s); ctx.fill(); ctx.beginPath(); ctx.arc(0,0,0.11*s,0,7); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.stroke(); }
  else if(it.kind==='camera'){ if($('beams').checked){ var fov=S.fovs(it.focal||35, (S.FORMATS[scene.format]||{a:0}).a || 1.5).h, R2=3.5*s; ctx.fillStyle='rgba(140,180,230,.06)'; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R2,-fov/2,fov/2); ctx.closePath(); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.setLineDash([3,4]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(fov/2)*R2,Math.sin(fov/2)*R2); ctx.moveTo(0,0); ctx.lineTo(Math.cos(-fov/2)*R2,Math.sin(-fov/2)*R2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle='#111'; ctx.strokeStyle='#d4b071'; ctx.lineWidth=1; ctx.fillRect(-16,-9,22,18); ctx.strokeRect(-16,-9,22,18); ctx.fillRect(6,-5,10,10); ctx.strokeRect(6,-5,10,10); }
  else if(it.kind==='flag'){ var L=it.len*s; ctx.fillStyle='#111'; ctx.strokeStyle='#555'; ctx.fillRect(-L/2,-3,L,6); ctx.strokeRect(-L/2,-3,L,6); }
  else if(it.kind==='diffuser'){ var L3=it.len*s; ctx.fillStyle='rgba(240,240,236,.35)'; ctx.strokeStyle='#bbb'; ctx.setLineDash([3,2]); ctx.fillRect(-L3/2,-3,L3,6); ctx.strokeRect(-L3/2,-3,L3,6); ctx.setLineDash([]); ctx.fillStyle='#d4b071'; var sg3=it.flip?-1:1; ctx.beginPath(); ctx.moveTo(-4,sg3*6); ctx.lineTo(4,sg3*6); ctx.lineTo(0,sg3*11); ctx.closePath(); ctx.fill(); }
  else if(it.kind==='bounce'){ var L2=it.len*s; ctx.fillStyle= it.black?'#111': (it.silver?'#c9ccd1':'#f4f1e8'); ctx.strokeStyle='#666'; ctx.fillRect(-L2/2,-3,L2,6); ctx.strokeRect(-L2/2,-3,L2,6); ctx.fillStyle='#d4b071'; var sg=it.flip?-1:1; ctx.beginPath(); ctx.moveTo(-4,sg*6); ctx.lineTo(4,sg*6); ctx.lineTo(0,sg*11); ctx.fill(); }
  else if(it.kind==='wall'){ ctx.restore(); ctx.save(); var a=toPx(it.x1,it.y1), b=toPx(it.x2,it.y2); ctx.strokeStyle='#8a8277'; ctx.lineWidth=Math.max(4,0.12*s); ctx.lineCap='butt'; ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
    if(isSel||isHov){ ctx.fillStyle='#ece8e0'; ctx.font='11px Inter,Lato,sans-serif'; ctx.fillText(fmt(S.wallLen(it),2)+' m',(a[0]+b[0])/2+8,(a[1]+b[1])/2-8); }
    if(isSel){ [a,b].forEach(function(q){ ctx.fillStyle='#d4b071'; ctx.beginPath(); ctx.arc(q[0],q[1],6,0,7); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.stroke(); }); }
    ctx.restore(); return; }
  else if(it.kind==='furniture'||it.kind==='box'){ if(it.kind==='box') ctx.rotate(-it.rot); var tall=S.isTall(it), w=it.w*s, d=it.d*s, t=it.type;
    ctx.fillStyle= tall?'rgba(40,34,30,.95)': (t==='sofa'||t==='armchair')?'rgba(75,85,104,.75)': t==='bed'?'rgba(217,212,199,.6)': t==='tree'?'rgba(70,125,55,.8)':'rgba(90,70,50,.6)'; ctx.strokeStyle= tall?'#3a3028':'#8a7560'; ctx.lineWidth=1;
    if(t==='ldesk'){ var aw=0.6*it.w/2.11*s, ad=0.6*it.d/1.55*s; ctx.fillStyle='rgba(215,190,150,.75)'; ctx.beginPath(); ctx.moveTo(-w/2,-d/2); ctx.lineTo(w/2,-d/2); ctx.lineTo(w/2,-d/2+ad); ctx.lineTo(-w/2+aw,-d/2+ad); ctx.lineTo(-w/2+aw,d/2); ctx.lineTo(-w/2,d/2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.strokeRect(-w/2+1,-d/2+1,w-2,ad*0.35); ctx.strokeRect(-w/2+1,-d/2+1,aw*0.35,d-2); }
    else if(t==='tree'){ ctx.fillStyle='rgba(70,125,55,.8)'; ctx.beginPath(); ctx.arc(0,0,w/2,0,7); ctx.fill(); ctx.fillStyle='#3a2a1a'; ctx.beginPath(); ctx.arc(0,0,0.12*s,0,7); ctx.fill(); }
    else { ctx.fillRect(-w/2,-d/2,w,d); ctx.strokeRect(-w/2,-d/2,w,d); }
    if(t==='kitchen'){ ctx.fillStyle='rgba(120,90,60,.9)'; ctx.fillRect(-w/2,-d/2,w,d); ctx.fillStyle='rgba(150,150,150,.9)'; ctx.fillRect(-w/2,-d/2,w,d); ctx.fillStyle='#6b4a2f'; ctx.fillRect(w/2-0.06*s,-d/2,0.06*s,d); var nk=Math.max(1,Math.round(it.d/1.49)); for(var ki=0;ki<nk;ki++){ var cz=-d/2+d/nk*(ki+0.3); ctx.fillStyle='#ddd'; ctx.fillRect(-w*0.25,cz-0.2*s,w*0.5,0.4*s); ctx.strokeStyle='#666'; ctx.strokeRect(-w*0.25,cz-0.2*s,w*0.5,0.4*s); } }
    else if(t==='pcdesk'){ ctx.fillStyle='rgba(235,232,225,.85)'; ctx.fillRect(-w/2,-d/2,w,d); ctx.strokeRect(-w/2,-d/2,w,d); ctx.fillStyle='#222'; ctx.fillRect(-w/2+0.06*s,-0.33*s,0.06*s,0.66*s); ctx.fillStyle='#6fa8dc'; ctx.fillRect(-w/2+0.11*s,-0.3*s,0.02*s,0.6*s); ctx.fillStyle='#777'; ctx.fillRect(w/2-0.28*s,-0.17*s,0.1*s,0.25*s); }
    else if(t==='pc'){ ctx.fillStyle='#222'; ctx.fillRect(-w/2,-d/2,w,d); ctx.fillStyle='#6fa8dc'; ctx.fillRect(-w/2,-d*0.4,0.05*s,d*0.8); ctx.fillStyle='#555'; ctx.fillRect(w*0.1,-d*0.35,w*0.3,d*0.55); }
    if(t==='sofa'||t==='armchair'){ ctx.fillStyle='rgba(50,58,75,.9)'; ctx.fillRect(-w/2,-d/2,0.22*s,d); ctx.fillRect(-w/2,-d/2,w,0.18*s); ctx.fillRect(-w/2,d/2-0.18*s,w,0.18*s); }
    else if(t==='chair'){ ctx.fillStyle='#8a6a48'; ctx.fillRect(-w/2,-d/2,0.05*s,d); }
    else if(t==='bed'){ ctx.fillStyle='rgba(255,255,255,.5)'; ctx.fillRect(-w/2+0.12*s,-d*0.2,0.45*s,d*0.4); ctx.fillStyle='#6b4a2f'; ctx.fillRect(-w/2,-d/2,0.05*s,d); }
    else if(t==='shelf'){ ctx.strokeStyle='#6b5a4a'; for(var q=-w/2+0.3*s;q<w/2;q+=0.3*s){ ctx.beginPath(); ctx.moveTo(q,-d/2); ctx.lineTo(q,d/2); ctx.stroke(); } }
    else if(t==='wardrobe'){ ctx.strokeStyle='#6b5a4a'; ctx.beginPath(); ctx.moveTo(0,-d/2); ctx.lineTo(0,d/2); ctx.stroke(); }
    else if(t==='car'){ ctx.fillStyle=it.color||'#e77f00'; ctx.fillRect(-w/2,-d/2,w,d); ctx.fillStyle='rgba(30,40,60,.8)'; ctx.fillRect(-w*0.32,-d*0.42,w*0.5,d*0.84); ctx.fillStyle='#111'; [[-0.32,-0.5],[-0.32,0.42],[0.32,-0.5],[0.32,0.42]].forEach(function(o){ ctx.fillRect(o[0]*w-0.1*s,o[1]*d,0.2*s,0.08*d); }); }
    else if(t==='block'){ ctx.fillStyle='rgba(236,232,224,.7)'; ctx.font='10px Inter,Lato,sans-serif'; ctx.textAlign='center'; ctx.fillText((it.label||'Box')+' '+fmt(it.h==null?0.9:it.h,1)+' m', 0, 3); ctx.textAlign='start'; } }
  ctx.restore();
  if(isSel||isHov){ ctx.strokeStyle= isSel?'#d4b071':'rgba(212,176,113,.4)'; ctx.setLineDash([3,3]); ctx.lineWidth=1; ctx.beginPath(); ctx.arc(p[0],p[1],22,0,7); ctx.stroke(); ctx.setLineDash([]); }
  if(isSel && it.kind!=='box' && !isSeg(it)){ var h=toPx.apply(null,rotHandle(it)); ctx.strokeStyle='rgba(212,176,113,.6)'; ctx.beginPath(); ctx.moveTo(p[0],p[1]); ctx.lineTo(h[0],h[1]); ctx.stroke(); ctx.fillStyle='#d4b071'; ctx.beginPath(); ctx.arc(h[0],h[1],6,0,7); ctx.fill(); }
  if(it.kind==='light'){ var nm=it.label||S.FIXTURES[it.fixture].name; ctx.fillStyle= it.label?'#ece8e0':'rgba(236,232,224,.55)'; ctx.font=(it.label?'bold ':'')+'11px Inter,Lato,sans-serif'; ctx.fillText(nm,p[0]+14,p[1]-14); }
  if(it.kind==='camera'){ ctx.fillStyle='rgba(236,232,224,.6)'; ctx.font='11px Inter,Lato,sans-serif'; ctx.fillText((it.focal||35)+' mm',p[0]+14,p[1]-14); }
}

// ---------- měřák ----------
function fmt(n,d){ return n.toFixed(d).replace('.',','); }
function updateMeter(){
  if(!meas){ $('mLux').textContent='–'; $('mStop').textContent=''; $('mRatio').textContent='přidej postavu'; $('contrib').innerHTML=''; $('mSide').textContent=''; return; }
  $('mLux').textContent=Math.round(meas.lux)+' lx';
  var ev100 = Math.log(meas.lux/2.5)/Math.LN2; // EV při ISO 100 (K≈2,5 pro lux)
  var cN=(sceneCam()||{}).fstop||2.8; $('mStop').textContent='≈ EV '+fmt(ev100,1)+' (ISO 100) · f/'+String(cN).replace('.',',')+' · 1/50 s → ISO '+Math.max(100,Math.round(100*Math.pow(2, 9.3-ev100+2*Math.log(cN/2.8)/Math.LN2)/100)*100);
  $('mRatio').textContent= meas.stops>6 ? 'víc než 64 : 1' : fmt(meas.ratio,1)+' : 1  ('+fmt(meas.stops,1)+' EV)';
  var pos=Math.min(1,meas.stops/3.2); $('mBar').style.left='calc('+(pos*100)+'% - 1px)';
  $('mSide').textContent = meas.stops<0.5?'Plochý obličej – přidej směr nebo odeber doplňkové světlo.': meas.stops<1.6?'Měkké, přívětivé (rozhovor, korporát).': meas.stops<2.6?'Modelované, filmové.':'Dramatické, low-key.';
  var html='', rows=[];
  scene.items.forEach(function(it){ if(it.kind==='light'||it.kind==='bounce'||it.kind==='diffuser'){ rows.push([it.label||(it.kind==='bounce'?(it.black?'Černá deska':it.silver?'Odrazka stříbrná':'Odrazka'):it.kind==='diffuser'?'Difuzní rám':S.FIXTURES[it.fixture].name)+(it.on===false?' (vyp.)':''), meas.per[it.id]||0, meas.perDark[it.id]||0]); } });
  if((scene.windows||[]).some(function(w){return typeof w.wall==='string';})) rows.push(['Okna (obloha)', meas.per.win||0, meas.perDark.win||0]);
  if(S.sunOn(scene)) rows.push([S.isNight(scene)?'Měsíc':'Slunce', meas.per.sun||0, meas.perDark.sun||0]);
  if(scene.outdoor) rows.push(['Obloha', meas.per.sky||0, meas.perDark.sky||0]);
  if((scene.doors||[]).some(function(d){return d.open!==false && (S.DOORLIGHT[d.light]||{E:0}).E>0;})) rows.push(['Otevřené dveře', meas.per.doors||0, meas.perDark.doors||0]);
  rows.push(['Rozptyl od stěn', (res.amb||0)*0.5, (res.amb||0)*0.5]);
  var mx=Math.max.apply(null,rows.map(function(r){return Math.max(r[1],r[2]);}).concat([1]));
  html+='<div class="c mut"><span></span><span class="bar" style="background:none"></span><b style="font-weight:500">světlá / stinná</b></div>';
  rows.forEach(function(r){ html+='<div class="c"><span>'+r[0]+'</span><span class="bar"><i style="width:'+(r[1]/mx*100)+'%"></i><i class="lo" style="width:'+(r[2]/mx*100)+'%"></i></span><b>'+Math.round(r[1])+' / '+Math.round(r[2])+' lx</b></div>'; });
  $('contrib').innerHTML=html||'<span class="mut">Žádná světla.</span>';
}

// ---------- seznam objektů ----------
function itemName(it){ if(it.kind==='road') return 'Cesta · asfalt '+fmt(S.wallLen(it),1)+' m'; if(it.kind==='light') return (it.label?it.label+' · ':'')+S.FIXTURES[it.fixture].name+' · '+S.MODS[it.mod].name.split(' ')[0]; if(it.kind==='camera') return 'Kamera '+(it.focal||35)+' mm'; if(it.kind==='box') return it.tall?'Skříň / stěna':'Stůl'; if(it.kind==='furniture') return (it.type==='block'&&it.label) ? it.label : (S.FURNITURE[it.type]||S.FURNITURE.block).name; if(it.kind==='person') return (S.MODELS[it.model]?S.MODELS[it.model].name.split(' – ')[0]:'Postava')+(it.pose&&it.pose!=='stand'?' ('+((S.POSES[it.pose]||{}).name||'').split(' ')[0].toLowerCase()+')':''); if(it.kind==='wall') return 'Zeď '+fmt(S.wallLen(it),2)+' m'; return KINDNAME[it.kind]; }
function objList(){
  var el=$('objList'), h='';
  scene.items.forEach(function(it){ h+='<div class="item'+(sel===it?' sel':'')+'" data-id="'+it.id+'"><span class="ic">'+KIND[it.kind]+'</span><span class="nm'+(it.on===false?' off':'')+'">'+itemName(it)+'</span>'+(it.kind==='light'?'<button data-tog="'+it.id+'" title="Zapnout / vypnout (H)">'+(it.on===false?'○':'●')+'</button>':'')+'<button data-del="'+it.id+'" title="Smazat">✕</button></div>'; });
  el.innerHTML=h||'<p class="mut" style="margin:4px 6px">Scéna je prázdná.</p>';
  el.querySelectorAll('.item').forEach(function(d){ d.onclick=function(e){ var t=e.target; if(t.dataset.tog){ var L=byId(t.dataset.tog); L.on=L.on===false; props(); schedule(); return; } if(t.dataset.del){ del(byId(t.dataset.del)); return; } select(byId(d.dataset.id)); }; });
}
function byId(id){ id=+id; return scene.items.find(function(i){return i.id===id;}); }
function select(it){ sel=it; props(); objList(); draw(); if(view3dReady) window.View3D.setSel(sel?sel.id:null); poseButtons(); $('mSelDot').classList.toggle('on',!!sel); $('bRTog').classList.toggle('sel',!!sel); }
var poseOn=false;
function poseButtons(){ var ok=!!(sel&&sel.kind==='person'&&(sel.model||'proc')!=='proc'); $('bPose').classList.toggle('hide',!ok); $('bPoseReset').classList.toggle('hide',!(ok&&sel.bones&&Object.keys(sel.bones).length)); if(!ok&&poseOn){ poseOn=false; $('bPose').classList.remove('on'); } if(view3dReady) window.View3D.setPose(ok&&poseOn, ok?sel.id:null); }
$('bPose').onclick=function(){ poseOn=!poseOn; this.classList.toggle('on',poseOn); poseButtons(); };
$('bPoseReset').onclick=function(){ if(!sel||sel.kind!=='person') return; delete sel.bones; poseButtons(); sync3d(); snapshot(); };
function dup(it){ if(!it) return; var c=JSON.parse(JSON.stringify(it)); c.id=uid++; if(isSeg(c)){ var off=c.kind==='road'?(c.wd||3.5)+0.5:0.4; c.x1+=off; c.x2+=off; c.y1+=c.kind==='road'?0:off; c.y2+=c.kind==='road'?0:off; clampSeg(c); } else { c.x=Math.min(scene.room.w-0.1,c.x+0.4); c.y=Math.min(scene.room.h-0.1,c.y+0.4); } scene.items.push(c); select(c); schedule(); }
function clampWall(w){ var W=scene.room.w, H=scene.room.h; w.x1=Math.max(0,Math.min(W,w.x1)); w.x2=Math.max(0,Math.min(W,w.x2)); w.y1=Math.max(0,Math.min(H,w.y1)); w.y2=Math.max(0,Math.min(H,w.y2)); wallSyncXY(w); }
function moveWall(w,dx,dy){ w.x1+=dx; w.x2+=dx; w.y1+=dy; w.y2+=dy; clampSeg(w); }
function del(it){ if(!it) return; scene.items=scene.items.filter(function(o){return o!==it;}); if(it.kind==='wall'){ scene.windows=scene.windows.filter(function(w){return w.wall!==it.id;}); scene.doors=(scene.doors||[]).filter(function(d){return d.wall!==it.id;}); renderDoors(); } if(sel===it) sel=null; props(); renderWindows(); schedule(); }

// ---------- vlastnosti ----------
function props(){
  var el=$('props'); $('selKind').textContent= sel?KINDNAME[sel.kind]:''; if(!sel){ el.innerHTML='<p class="mut">Klikni na objekt ve scéně nebo v seznamu.</p>'; return; }
  var it=sel, h='';
  function rng(k,lab,min,max,step,unit){ h+='<label>'+lab+' <span class="pill" id="v_'+k+'">'+fmtv(k,it[k])+'</span></label><input type="range" data-k="'+k+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+it[k]+'">'; }
  function chk(k,lab){ h+='<label class="chk"><input type="checkbox" data-k="'+k+'"'+(it[k]?' checked':'')+'> '+lab+'</label>'; }
  function selc(k,lab,opts){ h+='<label>'+lab+'</label><select data-k="'+k+'">'+Object.keys(opts).map(function(o){return '<option value="'+o+'"'+(o===it[k]?' selected':'')+'>'+opts[o]+'</option>';}).join('')+'</select>'; }
  if(it.kind==='road'){ h+='<div class="row"><div><label>X1</label><input type="number" data-k="x1" step="0.1" value="'+it.x1.toFixed(2)+'"></div><div><label>Y1</label><input type="number" data-k="y1" step="0.1" value="'+it.y1.toFixed(2)+'"></div></div><div class="row"><div><label>X2</label><input type="number" data-k="x2" step="0.1" value="'+it.x2.toFixed(2)+'"></div><div><label>Y2</label><input type="number" data-k="y2" step="0.1" value="'+it.y2.toFixed(2)+'"></div></div>';
    rng('wd','Šířka cesty',1.5,12,0.5,'m'); chk('line','Přerušovaná středová čára'); chk('edge','Bílé krajní čáry'); h+='<p class="mut">Asfaltová cesta, délka '+fmt(S.wallLen(it),1)+' m. Táhni zlaté konce pro úpravu; konec se přichytí ke konci jiné cesty (křižovatka, zatáčka).</p>'; }
  else if(it.kind==='wall'){ h+='<div class="row"><div><label>X1</label><input type="number" data-k="x1" step="0.05" value="'+it.x1.toFixed(2)+'"></div><div><label>Y1</label><input type="number" data-k="y1" step="0.05" value="'+it.y1.toFixed(2)+'"></div></div><div class="row"><div><label>X2</label><input type="number" data-k="x2" step="0.05" value="'+it.x2.toFixed(2)+'"></div><div><label>Y2</label><input type="number" data-k="y2" step="0.05" value="'+it.y2.toFixed(2)+'"></div></div><p class="mut">Délka '+fmt(S.wallLen(it),2)+' m, tloušťka 12 cm, plná výška. Táhni zlaté konce pro úpravu, mezera mezi zdmi = průchod. Okno na zdi označ nástrojem Okno.</p>'; }
  else h+='<div class="row"><div><label>X (m)</label><input type="number" data-k="x" step="0.05" value="'+it.x.toFixed(2)+'"></div><div><label>Y (m)</label><input type="number" data-k="y" step="0.05" value="'+it.y.toFixed(2)+'"></div><div><label>Otočení (°)</label><input type="number" data-k="rotDeg" step="5" value="'+Math.round(it.rot*180/Math.PI)+'"></div></div>';
  if(it.kind==='light'){
    h+='<label>Popisek</label><input type="text" data-k="label" value="'+(it.label||'')+'" placeholder="např. KEY, FILL, BACK">';
    var isC=!!S.FIXTURES[it.fixture].ceil; // stropní / závěsná svítidla: jen typ, výkon, barva a výška (svítí dolů)
    var fx={}; Object.keys(S.FIXTURES).forEach(function(k){ if(!!S.FIXTURES[k].ceil===isC) fx[k]=S.FIXTURES[k].name;}); selc('fixture',isC?'Stropní svítidlo':'Světlo',fx);
    if(!isC){ var md={}; Object.keys(S.MODS).forEach(function(k){ if(!S.MODS[k].ceil) md[k]=S.MODS[k].name;}); selc('mod','Modifikátor',md); }
    rng('power','Výkon',1,100,1,'%'); chk('rgb','Barevné světlo (RGB)');
    if(it.rgb){ h+='<label>Barva</label><div class="row" style="align-items:center"><input type="color" data-k="color" value="'+(it.color||'#3a6bff')+'" style="flex:0 0 52px"><div class="swatches">'+['#ff2a2a','#ff8a00','#ffd400','#2adf4a','#00d4ff','#2a5bff','#8a2aff','#ff2ad4'].map(function(c){return '<button type="button" class="sw" data-sw="'+c+'" style="background:'+c+'" title="'+c+'"></button>';}).join('')+'</div></div><p class="mut">Saturované barvy mají menší jas (lux) – jako RGB světla v HSI režimu.</p>'; }
    else rng('cct','Teplota chromatičnosti',2700,6500,100,'K'); if(isC){ rng('h','Výška svítidla (strop '+fmt(scene.room.z||2.7,2)+' m)',1.2,Math.max(1.3,(scene.room.z||2.7)-0.03),0.05,'m'); h+='<p class="mut">'+(S.FIXTURES[it.fixture].ceil==='hang'?'Závěsné svítidlo – kabel vede ke stropu, výškou měníte délku závěsu.':'Přisazené ke stropu.')+(S.MODS[it.mod].beam>=300?' Svítí do všech stran.':' Svítí dolů.')+' U trubic určuje otočení směr tělesa.</p>'; }
    else { rng('h','Výška zdroje',0.3,Math.max(0.5,(scene.room.z||2.7)-0.1),0.05,'m'); it.tiltAuto=it.tiltDeg==null; chk('tiltAuto','Náklon automaticky na výšku obličeje'); if(!it.tiltAuto) rng('tiltDeg','Náklon nahoru / dolů',-90,60,1,'°'); }
    if(!isC && S.MODS[it.mod].zoom) rng('zoom','Fresnel – spot ↔ flood (posun čočky)',12,60,1,'°');
    if(!isC){ h+='<div class="row">'; chk('grid','Voština'); chk('diff','Difuze'); chk('barn','Klapky'); h+='</div>'; }
    if(!it.rgb) selc('gel','Gel',{none:'bez gelu',cto:'CTO (oteplit)',ctb:'CTB (ochladit)'});
    if(!isC && !S.MODS[it.mod].soft){ var gb={}; Object.keys(S.GOBOS).forEach(function(k){gb[k]=S.GOBOS[k].name;}); selc('gobo','Gobo (promítaný tvar)',gb); }
    chk('on','Zapnuto'); chk('hide','Skrýt těleso v 3D (svítí, ale není vidět – např. světlo monitoru)');
    var P=S.lightParams(it); h+='<p class="mut">V ose: ≈ '+Math.round(P.E1)+' lx @ 1 m, '+Math.round(P.E1/4)+' lx @ 2 m · úhel '+P.beam+'°</p>';
  } else if(it.kind==='camera'){ rng('focal','Ohnisko (full frame)',14,135,1,'mm'); rng('h','Výška kamery',0.3,2.4,0.05,'m'); chk('aim','Automaticky sledovat obličej postavy'); if(!it.aim) rng('tilt','Náklon nahoru/dolů',-0.6,0.6,0.02,''); }
  else if(it.kind==='person'){ var md={}; Object.keys(S.MODELS).forEach(function(k){md[k]=S.MODELS[k].name;}); selc('model','Postava (3D model)',md); if(S.MODELS[it.model]&&S.MODELS[it.model].credit){ var mm=S.MODELS[it.model]; h+='<p class="mut" style="margin:2px 0 6px">Model: '+mm.credit+' · '+mm.license+' · '+mm.source+'</p>'; } var pz={}; Object.keys(S.POSES).forEach(function(k){pz[k]=S.POSES[k].name;}); if((it.model||'proc')==='proc'){ selc('pose','Póza',{stand:'Stojí',sit:'Sedí (na židli)'}); } else { selc('pose','Póza',pz); if(it.t==null) it.t=0.3; rng('t','Fáze pohybu',0,1,0.01,''); chk('mirror','Zrcadlově (prohodit levou a pravou)'); } if((it.model||'proc')!=='proc'){ h+='<p class="mut" style="margin:2px 0 6px">Tlačítko 🦴 Kostra nad pohledem kamery (klávesa K): chyť kloub a posuň ho. '+(it.bones&&Object.keys(it.bones).length?'Póza je ručně upravená.':'')+'</p>'; } if((it.model||'proc')==='proc'){ selc('outfit','Oblečení',{dark:'tmavé',light:'světlé',blue:'modré',red:'červené',green:'zelené'}); h+='<div class="row">'; selc('hair','Účes',{short:'krátké',long:'dlouhé',bun:'drdol',bald:'bez vlasů'}); selc('hairColor','Barva vlasů',{dark:'tmavé',black:'černé',brown:'hnědé',blond:'blond',red:'zrzavé',grey:'šedé'}); h+='</div>'; selc('skin','Pleť',{light:'světlá',medium:'střední',tan:'snědá',dark:'tmavá'}); } h+='<p class="mut">Otočení určuje, kam se postava dívá. Měří se obě tváře (zlatá = světlejší) ve výšce '+fmt(S.faceZ(it),1)+' m. Sedící postavu posaď na gauč či křeslo přesunutím na ně.</p>'; }
  else if(it.kind==='furniture'){ var grp=(S.FURNITURE[it.type]||{}).grp, ft={}; Object.keys(S.FURNITURE).forEach(function(k){ if(S.FURNITURE[k].grp===grp) ft[k]=S.FURNITURE[k].name;}); if(Object.keys(ft).length>1) selc('type',(S.FURN_GROUPS[grp]||'Nábytek')+' – model',ft); if(it.type==='block'){ h+='<label>Popisek</label><input type="text" data-k="label" value="'+(it.label||'')+'" placeholder="např. Kuchyňská linka">'; } rng('w','Šířka',0.2,6,0.05,'m'); rng('d','Hloubka',0.2,6,0.05,'m'); if(['bed','ldesk','pcdesk','pc','kitchen','tree','sofa'].indexOf(it.type)>=0){ var fm=S.FURNITURE[it.type]; if(it.h==null) it.h=fm.h; rng('h','Výška',0.2,it.type==='tree'?12:2.6,0.01,'m'); if(fm.elev!=null){ if(it.elev==null) it.elev=fm.elev; rng('elev','Výška nad podlahou (deska stolu)',0,1.5,0.01,'m'); }
    if(it.type==='tree') selc('variant','Varianta stromu',{0:'strom 1',1:'strom 2'});
    if(it.type==='sofa') h+='<div class="row" style="margin-top:8px"><button class="btn sm" id="bSofaPerson" type="button">+ Postava na gauč</button></div>';
    if(it.type==='pcdesk') h+='<div class="row" style="margin-top:8px"><button class="btn sm" id="bDeskPerson" type="button">+ Postava u stolu</button></div><p class="mut">Stůl už má monitor, klávesnici, reproduktory a drobnosti. Sedí se na straně u šipky otočení.</p>';
    if(it.type==='ldesk') h+='<div class="row" style="margin-top:8px"><button class="btn sm" id="bDeskPerson" type="button">+ Postava u stolu</button><button class="btn sm" id="bDeskPc" type="button">+ Počítač na stůl</button></div><p class="mut">Sedí se do vnitřního rohu „L“ (u šipky otočení). Počítač se postaví do rohu desky, čelem k postavě.</p>';
    if(it.type==='kitchen') h+='<p class="mut">Délka linky se skládá z dílů po 1,5 m (dřez v každém dílu). Přední strana s dvířky je u šipky otočení.</p>';
    if(it.type==='pc') h+='<p class="mut">Obrazovka míří ve směru šipky otočení. Výška nad podlahou = výška desky stolu.</p>';
    h+='<p class="mut">Model: '+fm.credit+' · CC BY 4.0 · sketchfab.com</p>'; }
if(it.type==='car'){ h+='<label>Barva laku</label><input type="color" data-k="color" value="'+(it.color||'#e77f00')+'"><div class="row" style="margin-top:8px"><button class="btn sm" id="bDriver" type="button">+ Řidič</button><button class="btn sm" id="bPassenger" type="button">+ Spolujezdec</button></div><div class="row" style="margin-top:6px"><button class="btn sm" id="bEnterDrv" type="button">+ Nastupuje řidič</button><button class="btn sm" id="bEnterCar" type="button">+ Nastupuje spolujezdec</button></div><p class="mut">Nastupování: posuvník Fáze pohybu vede od příchodu ke dveřím (0 %) po usednutí (100 %).</p><p class="mut">Model: Lexyc16 · CC BY 4.0 · sketchfab.com</p>'; } if(it.type==='block'){ rng('h','Výška',0.1,2.6,0.05,'m'); selc('mat','Materiál',{wood:'dřevo',white:'bílá',dark:'tmavá',metal:'kov',concrete:'beton',fabric:'látka'}); h+='<p class="mut">Box vyšší než 1,3 m stíní ve výšce obličeje.</p>'; } h+='<p class="mut">Opěradlo / čelo je na straně proti směru otočení.</p>'; }
  else if(it.kind==='flag'){ rng('len','Délka',0.3,2.4,0.1,'m'); }
  else if(it.kind==='bounce'){ rng('len','Šířka',0.3,2.4,0.1,'m'); rng('tiltDeg','Náklon desky (nahoru / dolů)',-60,60,1,'°'); chk('silver','Stříbrná (silnější, užší odraz)'); chk('black','Černá (negativní fill – ubírá rozptýlené světlo)'); chk('flip','Otočit lícovou stranu'); var eb=res&&res.ems.find(function(e){return e.bounce&&e.id===it.id&&!e.neg;}); h+='<p class="mut">'+(it.black?'Černá deska stíní okolí – nejvíc působí v bílé místnosti, blízko stinné strany obličeje.':(eb?'Na desku dopadá ≈ '+Math.round(eb.Ein)+' lx.':'Na lícovou stranu (šipka) nedopadá žádné světlo – natoč ji ke světlu.'))+'</p>'; }
  else if(it.kind==='diffuser'){ var gr={}; Object.keys(S.GRIDS).forEach(function(k){gr[k]=S.GRIDS[k].name;}); selc('grid','Difuzní látka',gr); rng('len','Velikost rámu',0.6,2.4,0.1,'m'); rng('h','Výška středu',0.8,2.4,0.05,'m'); rng('tiltDeg','Náklon rámu (nahoru / dolů)',-60,60,1,'°'); chk('flip','Otočit (šipka = strana k postavě)'); var ed=res&&res.ems.find(function(e){return e.bounce&&e.id===it.id;}); h+='<p class="mut">Postav rám mezi světlo a postavu, šipkou k postavě. Světlo mířící do rámu pak svítí jen přes rám – velký měkký zdroj. '+(ed?'Na rám dopadá ≈ '+Math.round(ed.Ein)+' lx.':'Zatím na něj zezadu nesvítí žádné světlo.')+'</p>'; }
  else if(it.kind==='box'){ rng('w','Šířka',0.3,3,0.1,'m'); rng('d','Hloubka',0.3,3,0.1,'m'); chk('tall','Vysoký – vrhá stín (skříň, stěna)'); }
  if(it.kind==='wall'){ } h+='<div class="row" style="margin-top:12px"><button class="btn" id="bDup">Duplikovat <span class="kbd">D</span></button><button class="btn danger" id="bDel">Smazat <span class="kbd">Del</span></button></div>';
  el.innerHTML=h;
  el.querySelectorAll('[data-k]').forEach(function(inp){ inp.addEventListener('input',function(){ var k=inp.dataset.k, v;
    if(inp.type==='checkbox') v=inp.checked; else if(inp.type==='range'||inp.type==='number') v=parseFloat(inp.value); else v=inp.value;
    if(k==='rotDeg'){ if(isNaN(v)) return; it.rot=v*Math.PI/180; schedule(); return; }
    if((k==='x'||k==='y'||k==='x1'||k==='y1'||k==='x2'||k==='y2') && isNaN(v)) return;
    it[k]=v; if(isSeg(it)){ clampSeg(it); } if(k==='fixture'){ var f=S.FIXTURES[v]; it.mod=f.defMod; it.cct=f.cct; if(f.ceil) ceilSetup(it); props(); }
    if(k==='tiltAuto'){ if(v) delete it.tiltDeg; else it.tiltDeg=Math.round(S.autoTilt(it)); delete it.tiltAuto; props(); }
    if(k==='rgb'){ if(v&&!it.color) it.color='#3a6bff'; props(); }
    if(k==='aim'&&!v) aimOnce(scene,it);
    if(k==='mod'||k==='aim'||k==='model') props();
    if(k==='type'){ var ff=S.FURNITURE[v]; it.w=ff.w; it.d=ff.d; delete it.tall; if(v==='block'){ it.h=ff.h; it.mat=it.mat||'wood'; } else if(['bed','ldesk','pcdesk','pc','kitchen','tree','sofa'].indexOf(v)>=0){ it.h=ff.h; } if(ff.elev!=null) it.elev=ff.elev; else delete it.elev; props(); }
    if(k==='variant'){ it.variant=parseInt(v,10)||0; }
    var pv=$('v_'+k); if(pv) pv.textContent=fmtv(k,v);
    schedule(); }); });
  el.querySelectorAll('[data-sw]').forEach(function(b){ b.onclick=function(){ it.color=b.dataset.sw; props(); schedule(); }; });
  if($('bEnterCar')){ var car2=it; [['bEnterCar','enter',false],['bEnterDrv','enterDriver',true]].forEach(function(q){ $(q[0]).onclick=function(){ var st=S.carSeat(car2,q[1]); var o=item('person',st.x,st.y,st.rot,{pose:'carin',model:'zena1',t:0.35,mirror:q[2]}); scene.items.push(o); select(o); schedule(); }; }); }
  if($('bDriver')){ var car=it; ['bDriver','bPassenger'].forEach(function(bid){ $(bid).onclick=function(){ var st=S.carSeat(car, bid==='bDriver'?'driver':'passenger'); var o=item('person',st.x,st.y,st.rot,{pose:'sit',model:'zena1',t:0.8}); scene.items.push(o); select(o); schedule(); }; }); }
  if($('bSofaPerson')){ var sf=it; $('bSofaPerson').onclick=function(){ var seats=S.sofaSeats(sf), taken=scene.items.filter(function(i){return i.kind==='person';}), sp=seats.find(function(q){ return !taken.some(function(pp){ return Math.hypot(pp.x-q.x,pp.y-q.y)<0.35; }); })||seats[0]; var o=item('person',sp.x,sp.y,sp.rot,{pose:'sit',model:'zena1',t:0.8}); scene.items.push(o); select(o); schedule(); }; }
  if($('bDeskPerson')){ var dk=it; $('bDeskPerson').onclick=function(){ var sp=S.deskSpots(dk).person; var o=item('person',sp.x,sp.y,sp.rot,{pose:'type',model:'zena1',t:0.3}); scene.items.push(o); select(o); schedule(); };
    if($('bDeskPc')) $('bDeskPc').onclick=function(){ var sp=S.deskSpots(dk).pc; var o=furn('pc',sp.x,sp.y,sp.rot,{elev:sp.elev}); scene.items.push(o); select(o); schedule(); }; }
  $('bDel').onclick=function(){ del(sel); };
  $('bDup').onclick=function(){ dup(sel); };
}
function fmtv(k,v){ if(k==='t') return Math.round(v*100)+' %'; var u={power:' %',cct:' K',zoom:'°',focal:' mm',len:' m',tiltDeg:'°',w:' m',d:' m',h:' m',elev:' m',tilt:''}[k]||''; return (typeof v==='number'? (k==='h'||k==='elev'||k==='len'||k==='w'||k==='d'?fmt(v,2):k==='tilt'?fmt(v,2):v):v)+u; }

// ---------- interakce ----------
var drag=null;
function mpos(e){ var r=cv.getBoundingClientRect(); return [e.clientX-r.left, e.clientY-r.top]; }
function distSeg(px,py,ax,ay,bx,by){ var dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy, t=L2?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/L2)):0; return {d:Math.hypot(px-(ax+dx*t),py-(ay+dy*t)),t:t}; }
function sunPos(){ var W=scene.room.w, H=scene.room.h, d=S.sunDir(scene), t=Math.min((W/2+0.7)/Math.max(1e-6,Math.abs(d[0])),(H/2+0.7)/Math.max(1e-6,Math.abs(d[1]))); return [W/2+d[0]*t, H/2+d[1]*t]; }
function pick(mx,my){
  if(S.sunOn(scene)){ var sp=toPx.apply(null,sunPos()); if(Math.hypot(mx-sp[0],my-sp[1])<16) return {sun:true}; }
  if(isSeg(sel)){ var e1=toPx(sel.x1,sel.y1), e2=toPx(sel.x2,sel.y2); if(Math.hypot(mx-e1[0],my-e1[1])<10) return {it:sel,end:1}; if(Math.hypot(mx-e2[0],my-e2[1])<10) return {it:sel,end:2}; }
  if(sel && sel.kind!=='box' && !isSeg(sel)){ var h=toPx.apply(null,rotHandle(sel)); if(Math.hypot(mx-h[0],my-h[1])<10) return {it:sel,rot:true}; }
  for(var i=scene.items.length-1;i>=0;i--){ var it=scene.items[i]; if(isSeg(it)) continue; var p=toPx(it.x,it.y), rr=18;
    if(it.kind==='box') rr=Math.max(it.w,it.d)*scale/2; if(it.kind==='flag'||it.kind==='bounce'||it.kind==='diffuser') rr=Math.max(14,it.len*scale/2);
    if(it.kind==='furniture'){ var cf=Math.cos(it.rot||0), sf=Math.sin(it.rot||0), fx=mx-p[0], fy=my-p[1], fu=fx*cf+fy*sf, fv=-fx*sf+fy*cf; if(Math.abs(fu)<=it.w*scale/2+4 && Math.abs(fv)<=it.d*scale/2+4) return {it:it}; continue; }
    if(it.kind==='flag'||it.kind==='bounce'||it.kind==='diffuser'){ var c=Math.cos(it.rot), s=Math.sin(it.rot), dx=mx-p[0], dy=my-p[1], u=dx*c+dy*s, v=-dx*s+dy*c; if(Math.abs(u)<=rr && Math.abs(v)<=9) return {it:it}; continue; }
    if(Math.hypot(mx-p[0],my-p[1])<=rr) return {it:it}; }
  for(var j=scene.items.length-1;j>=0;j--){ var wl=scene.items[j]; if(wl.kind!=='wall') continue; var a=toPx(wl.x1,wl.y1), b=toPx(wl.x2,wl.y2); if(distSeg(mx,my,a[0],a[1],b[0],b[1]).d<=Math.max(6,0.06*scale)+3) return {it:wl}; }
  for(var k=scene.items.length-1;k>=0;k--){ var rd=scene.items[k]; if(rd.kind!=='road') continue; var ra=toPx(rd.x1,rd.y1), rb=toPx(rd.x2,rd.y2); if(distSeg(mx,my,ra[0],ra[1],rb[0],rb[1]).d<=Math.max(6,(rd.wd||3.5)/2*scale)) return {it:rd}; }
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
function setTool(t){ tool=t; draft=null; document.querySelectorAll('#tools .btn').forEach(function(b){ b.classList.toggle('gold',b.dataset.tool===t); }); cv.classList.toggle('tool',t!=='select'); $('toolHint').textContent= t==='wall'?'táhni: nová zeď (Shift = šikmo po 15°)': t==='window'?'táhni podél zdi: nové okno':t==='door'?'klikni na zeď: nové dveře (i do nakreslené příčky)':t==='road'?'táhni: nová cesta (Shift = šikmo po 15°), konce se chytají k jiné cestě':''; draw(); }
document.querySelectorAll('#tools .btn').forEach(function(b){ b.onclick=function(){ if(b.dataset.tool==='road'&&!extOn()){ setTool('select'); $('toolHint').textContent='Cesta jde jen v exteriéru – zapněte „Jen exteriér“ nebo „Zahrada kolem domu“'; return; } setTool(b.dataset.tool); }; });
function drawSun(){ if(!S.sunOn(scene)) return; var sp=toPx.apply(null,sunPos()), c=toPx(scene.room.w/2,scene.room.h/2);
  ctx.strokeStyle='rgba(255,210,90,.35)'; ctx.lineWidth=1.5; ctx.setLineDash([4,5]); ctx.beginPath(); ctx.moveTo(sp[0],sp[1]); ctx.lineTo(c[0],c[1]); ctx.stroke(); ctx.setLineDash([]);
  if(S.isNight(scene)){ ctx.fillStyle='#dfe6f5'; ctx.beginPath(); ctx.arc(sp[0],sp[1],10,0,7); ctx.fill(); ctx.fillStyle='#1b2233'; ctx.beginPath(); ctx.arc(sp[0]+5,sp[1]-3,9,0,7); ctx.fill(); ctx.fillStyle='#ece8e0'; ctx.font='11px Inter,Lato,sans-serif'; ctx.fillText('měsíc '+scene.sun.elev+'°',sp[0]+18,sp[1]+4); return; }
  ctx.fillStyle='#ffd25a'; ctx.beginPath(); ctx.arc(sp[0],sp[1],11,0,7); ctx.fill(); ctx.strokeStyle='#8a6a10'; ctx.lineWidth=1; ctx.stroke();
  for(var k=0;k<8;k++){ var a=k*Math.PI/4; ctx.beginPath(); ctx.moveTo(sp[0]+Math.cos(a)*14,sp[1]+Math.sin(a)*14); ctx.lineTo(sp[0]+Math.cos(a)*19,sp[1]+Math.sin(a)*19); ctx.strokeStyle='#ffd25a'; ctx.lineWidth=2; ctx.stroke(); }
  ctx.fillStyle='#ece8e0'; ctx.font='11px Inter,Lato,sans-serif'; ctx.fillText('slunce '+scene.sun.elev+'°',sp[0]+22,sp[1]+4); }
function drawTool(){ if(!draft) return; ctx.save();
  if(draft.kind==='road'){ var ra=toPx(draft.x1,draft.y1), rb=toPx(draft.x2,draft.y2); ctx.strokeStyle='rgba(60,60,64,.8)'; ctx.lineWidth=Math.max(6,draft.wd*scale); ctx.beginPath(); ctx.moveTo(ra[0],ra[1]); ctx.lineTo(rb[0],rb[1]); ctx.stroke(); ctx.strokeStyle='rgba(212,176,113,.9)'; ctx.lineWidth=2; ctx.stroke();
    var rt=fmt(Math.hypot(draft.x2-draft.x1,draft.y2-draft.y1),1)+' m'; ctx.font='bold 12px Inter,Lato,sans-serif'; var rtw=ctx.measureText(rt).width; ctx.fillStyle='rgba(212,176,113,.95)'; ctx.fillRect((ra[0]+rb[0])/2-rtw/2-6,(ra[1]+rb[1])/2-24,rtw+12,18); ctx.fillStyle='#111'; ctx.fillText(rt,(ra[0]+rb[0])/2-rtw/2,(ra[1]+rb[1])/2-11); }
  if(draft.kind==='wall'){ var a=toPx(draft.x1,draft.y1), b=toPx(draft.x2,draft.y2); ctx.strokeStyle='rgba(212,176,113,.9)'; ctx.lineWidth=Math.max(4,0.12*scale); ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
    var L=Math.hypot(draft.x2-draft.x1,draft.y2-draft.y1); ctx.fillStyle='#111'; ctx.font='bold 12px Inter,Lato,sans-serif'; var txt=fmt(L,2)+' m', tw=ctx.measureText(txt).width; ctx.fillStyle='rgba(212,176,113,.95)'; ctx.fillRect((a[0]+b[0])/2-tw/2-6,(a[1]+b[1])/2-24,tw+12,18); ctx.fillStyle='#111'; ctx.fillText(txt,(a[0]+b[0])/2-tw/2,(a[1]+b[1])/2-11); }
  if(draft.kind==='window'){ var p1=wallPointAny(draft.wall,draft.t1), p2=wallPointAny(draft.wall,draft.t2); if(p1&&p2){ var q1=toPx(p1[0],p1[1]), q2=toPx(p2[0],p2[1]); ctx.strokeStyle='#8fc0e8'; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(q1[0],q1[1]); ctx.lineTo(q2[0],q2[1]); ctx.stroke();
    var txt2=fmt(Math.abs(draft.t2-draft.t1),2)+' m', tw2=ctx.measureText(txt2).width; ctx.fillStyle='rgba(143,192,232,.95)'; ctx.fillRect((q1[0]+q2[0])/2-tw2/2-6,(q1[1]+q2[1])/2-24,tw2+12,18); ctx.fillStyle='#111'; ctx.font='bold 12px Inter,Lato,sans-serif'; ctx.fillText(txt2,(q1[0]+q2[0])/2-tw2/2,(q1[1]+q2[1])/2-11); } }
  ctx.restore(); }
// konce dveří v px a směr otevírání (dovnitř místnosti / u příčky na „levou“ stranu zdi)
function doorEnds(d){ if(typeof d.wall==='string'){ var fr=wallPt(d.wall); return {a:fr(d.at-d.w/2), b:fr(d.at+d.w/2), inw:{left:[1,0],right:[-1,0],top:[0,1],bottom:[0,-1]}[d.wall]}; }
  var it=byId(d.wall); if(!it) return null; var L=S.wallLen(it)||1; return {a:toPx.apply(null,S.wallPoint(it,d.at-d.w/2)), b:toPx.apply(null,S.wallPoint(it,d.at+d.w/2)), inw:[-(it.y2-it.y1)/L,(it.x2-it.x1)/L]}; }
function wallLenAny(wall){ if(typeof wall==='string') return (wall==='left'||wall==='right')?scene.room.h:scene.room.w; var it=byId(wall); return it?S.wallLen(it):0; }
function wallPointAny(wall,t){ if(typeof wall==='string'){ var W=scene.room.w, H=scene.room.h; return wall==='left'?[0,t]:wall==='right'?[W,t]:wall==='top'?[t,0]:[t,H]; } var it=byId(wall); return it?S.wallPoint(it,t):null; }
cv.addEventListener('pointerdown',function(e){ var m=mpos(e), w=toM(m[0],m[1]); cv.setPointerCapture(e.pointerId);
  if(tool==='wall'){ var p=snapPt(w[0],w[1]); draft={kind:'wall',x1:p[0],y1:p[1],x2:p[0],y2:p[1]}; draw(); return; }
  if(tool==='road'){ var pr0=roadPt(w[0],w[1]); draft={kind:'road',x1:pr0[0],y1:pr0[1],x2:pr0[0],y2:pr0[1],wd:3.5}; draw(); return; }
  if(tool==='door'){ var nd=nearestWall(w[0],w[1]); if(!nd) return; var dw=0.9, at=Math.round(Math.max(dw/2+0.05,Math.min(nd.len-dw/2-0.05,nd.t))*10)/10; if(!scene.doors) scene.doors=[]; scene.doors.push(door(nd.wall,at,{light:typeof nd.wall==='string'?'dim':'none'})); setTool('select'); renderDoors(); schedule(); return; }
  if(tool==='window'){ var nw=nearestWall(w[0],w[1]); if(!nw){ return; } draft={kind:'window',wall:nw.wall,t1:Math.round(nw.t*10)/10,t2:Math.round(nw.t*10)/10,len:nw.len}; draw(); return; }
  var hit=pick(m[0],m[1]);
  if(hit&&hit.sun){ drag={sun:true,moved:false}; return; }
  if(hit){ drag={it:hit.it,rot:!!hit.rot,end:hit.end||0,dx:hit.it.x-w[0],dy:hit.it.y-w[1],moved:false}; if(sel!==hit.it) select(hit.it); } else select(null); });
cv.addEventListener('pointermove',function(e){ var m=mpos(e), w=toM(m[0],m[1]);
  if(draft){ if(draft.kind==='road'){ var rp=roadPt(w[0],w[1]); var rq=e.shiftKey?axisSnap(draft.x1,draft.y1,rp[0],rp[1],true):(Math.hypot(rp[0]-w[0],rp[1]-w[1])<0.06?axisSnap(draft.x1,draft.y1,rp[0],rp[1],false):rp); var bx=roadBox(); draft.x2=Math.max(bx[0],Math.min(bx[2],Math.round(rq[0]*10)/10)); draft.y2=Math.max(bx[1],Math.min(bx[3],Math.round(rq[1]*10)/10)); }
    else if(draft.kind==='wall'){ var p=snapPt(w[0],w[1]); var q=axisSnap(draft.x1,draft.y1,p[0],p[1],e.shiftKey); draft.x2=Math.max(0,Math.min(scene.room.w,Math.round(q[0]*10)/10)); draft.y2=Math.max(0,Math.min(scene.room.h,Math.round(q[1]*10)/10)); }
    else { var pr=projectOnWall(draft.wall,w[0],w[1]); draft.t2=Math.max(0,Math.min(draft.len,Math.round(pr*10)/10)); } draw(); return; }
  if(!drag){ if(tool!=='select') return; var h=pick(m[0],m[1]); var nh=h?(h.it||null):null; if(nh!==hover){ hover=nh; draw(); } cv.style.cursor= h ? ((h.rot||h.end||h.sun)?'grab':'move') : 'default'; return; }
  drag.moved=true;
  if(drag.sun){ scene.sun.az=Math.atan2(w[1]-scene.room.h/2,w[0]-scene.room.w/2); if(e.shiftKey) scene.sun.az=Math.round(scene.sun.az/(Math.PI/12))*(Math.PI/12); $('sunAz').value=Math.round(((scene.sun.az*180/Math.PI)%360+360)%360); $('sunAzV').textContent=$('sunAz').value+'°'; skyUI(); }
  else { var it=drag.it;
    if(drag.end){ var o= drag.end===1?[it.x2,it.y2]:[it.x1,it.y1]; var p2=it.kind==='road'?roadPt(w[0],w[1],it):snapPt(w[0],w[1]); var q2=(e.altKey||it.kind==='road'&&!e.shiftKey)?p2:axisSnap(o[0],o[1],p2[0],p2[1],e.shiftKey); if(drag.end===1){ it.x1=q2[0]; it.y1=q2[1]; } else { it.x2=q2[0]; it.y2=q2[1]; } clampSeg(it); }
    else if(isSeg(it)){ var nx=snapv(w[0]+drag.dx), ny=snapv(w[1]+drag.dy); moveWall(it,nx-it.x,ny-it.y); }
    else if(drag.rot){ it.rot=Math.atan2(w[1]-it.y,w[0]-it.x); if(e.shiftKey) it.rot=Math.round(it.rot/(Math.PI/12))*(Math.PI/12); }
    else { var mg=it.kind==='camera'?15:-0.05; it.x=Math.max(-mg,Math.min(scene.room.w+mg,snapv(w[0]+drag.dx))); it.y=Math.max(-mg,Math.min(scene.room.h+mg,snapv(w[1]+drag.dy))); } }
  recompute(0.12); clearTimeout(fineTimer); fineTimer=setTimeout(function(){ recompute(fineCell()); },180); });
function projectOnWall(wall,x,y){ if(typeof wall==='string') return (wall==='left'||wall==='right')?y:x; var it=byId(wall); if(!it) return 0; var r=distSeg(x,y,it.x1,it.y1,it.x2,it.y2); return r.t*S.wallLen(it); }
cv.addEventListener('pointerup',function(){
  if(draft){ var d=draft; draft=null;
    if(d.kind==='road'){ if(Math.hypot(d.x2-d.x1,d.y2-d.y1)>=0.5){ var rd=roadItem(d.x1,d.y1,d.x2,d.y2); scene.items.push(rd); select(rd); schedule(); } else draw(); return; }
    if(d.kind==='wall'){ if(Math.hypot(d.x2-d.x1,d.y2-d.y1)>=0.2){ var wl=wallItem(d.x1,d.y1,d.x2,d.y2); scene.items.push(wl); select(wl); schedule(); } else draw(); }
    else { var a=Math.min(d.t1,d.t2), b=Math.max(d.t1,d.t2); if(b-a>=0.3){ scene.windows.push(win(d.wall,a,b)); renderWindows(); schedule(); } else draw(); }
    return; }
  if(drag&&drag.moved){ props(); objList(); snapshotSoon(); } drag=null; });
cv.addEventListener('wheel',function(e){ if(!sel||isSeg(sel)) return; e.preventDefault(); sel.rot+=(e.deltaY>0?1:-1)*Math.PI/36; props(); schedule(); },{passive:false});
// levá lišta: sekce (nadpis + obsah až k dalšímu nadpisu) zabalit do rámečků
(function(){ var L=document.querySelector('aside.l'); if(!L) return; var box=null; Array.prototype.slice.call(L.childNodes).forEach(function(n){ if(n.nodeType===1&&n.tagName==='H3'){ box=document.createElement('section'); box.className='box'; L.insertBefore(box,n); } if(box) box.appendChild(n); }); })();
// ---------- nastavení kamery (pravá lišta): vyvážení bílé + simulace hloubky ostrosti ----------
var FSTOPS=[1.2,1.4,2,2.8,4,5.6,8,11,16,22];
function sceneCam(){ return scene.items.find(function(i){return i.kind==='camera';}); }
function focusU(d){ return d>=999?1:1-Math.sqrt(0.3/Math.max(0.3,d)); } // stupnice jako na objektivu: blízko roztažené, nekonečno na konci
function focusD(u){ return u>=0.999?1e6:0.3/Math.pow(1-u,2); }
function fmtDist(d){ return !isFinite(d)||d>=999?'∞':(d<10?fmt(d,d<1?2:1):String(Math.round(d)))+' m'; }
// hloubka ostrosti (kruh neostrosti 0,03 mm – full frame): blízká a vzdálená mez
function dofRange(f,N,s){ f/=1000; var H=f*f/(N*0.00003)+f; if(!isFinite(s)) return [H,Infinity]; var n=s*(H-f)/(H+s-2*f), fr=s>=H?Infinity:s*(H-f)/(H-s); return [n,fr]; }
function camUI(){ var c=sceneCam(); $('csNone').classList.toggle('hide',!!c); $('csBody').classList.toggle('hide',!c); if(!c) return;
  var wb=c.wb||5600; $('wb').value=wb; $('wbVal').textContent=wb+' K'; Array.prototype.forEach.call(document.querySelectorAll('.wbPre button'),function(b){ b.classList.toggle('on',+b.getAttribute('data-wb')===wb); });
  $('dofOn').checked=!!c.dof; $('dofBox').classList.toggle('hide',!c.dof);
  var N=c.fstop||2.8, fi=FSTOPS.indexOf(N); $('fstop').value=fi<0?3:fi; $('fsVal').textContent='f/'+String(N).replace('.',',');
  var ps=scene.items.filter(function(i){return i.kind==='person';}); if(c.af!=null&&!ps.some(function(p){return p.id===c.af;})) delete c.af;
  var o='<option value="">Vypnuto – ruční zaostření</option>'; ps.forEach(function(p,k){ o+='<option value="'+p.id+'"'+(c.af===p.id?' selected':'')+'>'+(p.label||('Postava '+(k+1)))+' – '+((S.MODELS[p.model||'proc']||{}).name||'postava')+'</option>'; }); $('afSel').innerHTML=o;
  var fi3=view3dReady&&window.View3D.focusInfo(), d=c.af!=null&&fi3?fi3.s:(c.focus==null?3:(c.focus>=999?Infinity:c.focus));
  $('focus').value=Math.round(focusU(isFinite(d)?d:1e6)*1000); $('focus').disabled=c.af!=null; $('fcVal').textContent=(c.af!=null?'AF · ':'')+fmtDist(d);
  var r=dofRange(c.focal||35,N,d); $('dofInfo').innerHTML='Ohnisko <b>'+(c.focal||35)+' mm</b> (mění se kolečkem v pohledu kamery). Ostré od <b>'+fmtDist(r[0])+'</b> do <b>'+fmtDist(r[1])+'</b>. Delší ohnisko, nižší clonové číslo a bližší zaostření = menší hloubka ostrosti.'; }
function camSet(fn,final){ var c=sceneCam(); if(!c) return; fn(c); camUI(); if(view3dReady) window.View3D.refresh(); if(sel&&sel.kind==='camera'&&final) props(); if(final) snapshotSoon(); updateMeter(); }
$('wb').addEventListener('input',function(){ var v=+this.value; camSet(function(c){ c.wb=v; }); }); $('wb').addEventListener('change',function(){ camSet(function(){},true); });
Array.prototype.forEach.call(document.querySelectorAll('.wbPre button'),function(b){ b.onclick=function(){ var v=+b.getAttribute('data-wb'); camSet(function(c){ c.wb=v; },true); }; });
$('dofOn').addEventListener('change',function(){ var on=this.checked; camSet(function(c){ c.dof=on; },true); });
$('fstop').addEventListener('input',function(){ var v=FSTOPS[+this.value]; camSet(function(c){ c.fstop=v; }); }); $('fstop').addEventListener('change',function(){ camSet(function(){},true); });
$('focus').addEventListener('input',function(){ var v=focusD(+this.value/1000); camSet(function(c){ c.focus=v>=999?1e6:Math.round(v*100)/100; }); }); $('focus').addEventListener('change',function(){ camSet(function(){},true); });
$('afSel').addEventListener('change',function(){ var v=this.value; camSet(function(c){ if(v==='') { if(c.af!=null&&view3dReady){ var fi=window.View3D.focusInfo(); if(fi&&isFinite(fi.s)) c.focus=Math.round(fi.s*100)/100; } delete c.af; } else c.af=+v; },true); });
// režim ovládání pohledu kamery: OVLÁDÁNÍ KAMERY / OVLÁDÁNÍ OBJEKTU (půdorys se nemění)
function ctrlModeUI(m){ var kl=$('keyLegend'); if(kl) kl.classList.toggle('m-object',m==='object'); Array.prototype.forEach.call(document.querySelectorAll('#ctrlModes button'),function(b){ b.classList.toggle('on',b.getAttribute('data-mode')===m); }); }
function setCtrlMode(m){ if(view3dReady) m=window.View3D.setCtrlMode(m); ctrlModeUI(m); }
Array.prototype.forEach.call(document.querySelectorAll('#ctrlModes button'),function(b){ b.onclick=function(){ setCtrlMode(b.getAttribute('data-mode')); }; });
(function(){ var m='camera'; try{ if(localStorage.getItem('viewfinder-ctrlmode')==='object') m='object'; }catch(e){} ctrlModeUI(m); })();
(function(){ var kl=$('keyLegend'); if(!kl) return; try{ if(localStorage.getItem('viewfinder-legend')==='0') kl.classList.add('collapsed'); }catch(e){} $('klToggle').onclick=function(){ var c=kl.classList.toggle('collapsed'); try{ localStorage.setItem('viewfinder-legend',c?'0':'1'); }catch(e){} }; })();
window.addEventListener('keydown',function(e){ var tag=document.activeElement.tagName; if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return;
  if(view3dReady && window.View3D.wantsKeys() && !(e.ctrlKey||e.metaKey) && (/^[wasdqe]$/i.test(e.key)||e.key.startsWith('Arrow'))) return;
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); if(e.shiftKey) redo(); else undo(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); return; }
  if(e.key==='1'||e.key==='2'||e.key==='3'){ setView(['split','plan','cam'][+e.key-1]); return; }
  if(e.key.toLowerCase()==='m' && !(e.ctrlKey||e.metaKey||e.altKey) && view3dReady){ setCtrlMode(window.View3D.ctrlMode()==='object'?'camera':'object'); e.preventDefault(); return; }
  if(e.key==='Escape'){ if(!$('shotModal').classList.contains('hide')){ closeShot(); return; } setTool('select'); return; } if(e.key.toLowerCase()==='k' && sel&&sel.kind==='person'&&(sel.model||'proc')!=='proc' && !(e.ctrlKey||e.metaKey)){ $('bPose').click(); return; } if(e.key.toLowerCase()==='c' && !(e.ctrlKey||e.metaKey)){ takeShot(); return; } if(e.key.toLowerCase()==='w'){ setTool('wall'); return; } if(e.key.toLowerCase()==='o'){ setTool('window'); return; }
  if(!sel) return;
  if(e.key==='Delete'||e.key==='Backspace'){ del(sel); }
  else if(e.key.toLowerCase()==='d'){ dup(sel); }
  else if(e.key.toLowerCase()==='h' && sel.kind==='light'){ sel.on=sel.on===false; props(); schedule(); }
  else if(e.key.startsWith('Arrow')){ e.preventDefault(); var st=e.shiftKey?0.25:0.05; var mx=(e.key==='ArrowLeft'?-st:e.key==='ArrowRight'?st:0), my=(e.key==='ArrowUp'?-st:e.key==='ArrowDown'?st:0); if(isSeg(sel)) moveWall(sel,mx,my); else { sel.x=Math.max(0.05,Math.min(scene.room.w-0.05,sel.x+mx)); sel.y=Math.max(0.05,Math.min(scene.room.h-0.05,sel.y+my)); } props(); schedule(); }
});

// stropní svítidlo: výška pod stropem, svítí dolů (náklon −90°), bez gelu a klapek
function ceilSetup(o){ var f=S.FIXTURES[o.fixture]; o.h=Math.round(S.ceilHeight(f,scene.room.z)*100)/100; o.mod=f.defMod; if(S.MODS[f.defMod].beam<300) o.tiltDeg=-90; else delete o.tiltDeg; o.grid=o.diff=o.barn=false; o.gel='none'; o.gobo='none'; }
document.querySelectorAll('[data-add]').forEach(function(b){ b.onclick=function(){ var k=b.dataset.add, cx=scene.room.w/2, cy=scene.room.h/2, o;
  if(k==='softbox') o=light('cob300',cx-1,cy-1,0.8,{mod:'softbox90'}); else if(S.FIXTURES[k]&&S.FIXTURES[k].ceil){ o=light(k,cx,cy,0); ceilSetup(o); } else if(S.FIXTURES[k]) o=light(k,cx-1,cy-1,0.8); else if(S.FURNITURE[k]) o=furn(k,cx+0.5,cy+0.5,0); else o=item(k,cx+0.5,cy+0.5,k==='camera'?Math.PI:0);
  if(k==='camera' && scene.items.some(function(i){return i.kind==='camera';})){ o.x=cx+1.2; }
  if(k==='camera') aimOnce(scene,o);
  scene.items.push(o); select(o); schedule(); }; });

function wallName(w){ return {left:'vlevo',top:'nahoře',right:'vpravo',bottom:'dole'}[w]; }
function renderDoors(){ var el=$('doors'), h=''; (scene.doors||[]).forEach(function(d,i){
    h+='<div class="door" data-i="'+i+'"><div class="hd"><b>Dveře '+(i+1)+'</b><button data-x="'+i+'" title="Odebrat">✕</button></div>'
     +'<div class="row"><div><label>Stěna</label><select data-k="wall">'+['left','top','right','bottom'].concat(scene.items.filter(function(i){return i.kind==='wall';}).map(function(i){return i.id;})).map(function(w){return '<option value="'+w+'"'+(w===d.wall?' selected':'')+'>'+(typeof w==='string'?wallName(w):wallLabel(w))+'</option>';}).join('')+'</select></div>'
     +'<div><label>Poloha (m)</label><input type="number" data-k="at" step="0.1" value="'+d.at+'"></div><div><label>Šířka (m)</label><input type="number" data-k="w" step="0.1" min="0.6" max="2.4" value="'+d.w+'"></div></div>'
     +'<div class="row"><div><label>Světlo za dveřmi</label><select data-k="light"><option value="none"'+(d.light==='none'?' selected':'')+'>tma</option><option value="dim"'+(d.light==='dim'?' selected':'')+'>slabé teplé (chodba)</option><option value="bright"'+(d.light==='bright'?' selected':'')+'>silné (osvětlená místnost)</option><option value="day"'+(d.light==='day'?' selected':'')+'>denní (místnost s oknem)</option></select></div>'
     +'<div style="flex:0 0 auto"><label>&nbsp;</label><label class="chk" style="margin:0"><input type="checkbox" data-k="open"'+(d.open!==false?' checked':'')+'> otevřené</label></div></div></div>'; });
  el.innerHTML=h||'<p class="mut" style="margin:2px 0 6px">Žádné dveře. Otevřené dveře propouští světlo z vedlejší místnosti.</p>';
  el.querySelectorAll('.door').forEach(function(div){ var d=scene.doors[+div.dataset.i];
    div.querySelectorAll('[data-k]').forEach(function(inp){ inp.addEventListener('input',function(){ var k=inp.dataset.k; if(inp.type==='checkbox') d[k]=inp.checked; else if(inp.type==='number'){ var v=parseFloat(inp.value); if(isNaN(v)) return; d[k]=k==='w'?Math.max(0.6,v):v; } else d[k]=(k==='wall'&&/^\d+$/.test(inp.value))?+inp.value:inp.value; var len=wallLenAny(d.wall); d.at=Math.max(d.w/2,Math.min(len-d.w/2,d.at)); if(k==='wall'||k==='w') inp.closest('.door').querySelector('[data-k=at]').value=d.at.toFixed(1); schedule(); }); });
    div.querySelector('[data-x]').onclick=function(){ scene.doors.splice(+div.dataset.i,1); renderDoors(); schedule(); }; }); }
$('bDoor').onclick=function(){ if(!scene.doors) scene.doors=[]; var walls=['bottom','right','top','left'], w=walls[scene.doors.length%4], len=(w==='left'||w==='right')?scene.room.h:scene.room.w; scene.doors.push(door(w,Math.round(len/2*10)/10)); renderDoors(); schedule(); };
function syncRoom(){ renderDoors(); renderWindows(); renderVariants(); $('outdoor').checked=!!scene.outdoor; $('exOn').checked=!!(scene.exterior&&scene.exterior.on); $('fenceOn').checked=scene.fence!==false; $('exTrees').value=scene.exterior?scene.exterior.trees:6; $('exTreesV').textContent=$('exTrees').value; $('fmt').value=scene.format||'free'; $('walls').value=scene.walls||'normal'; $('env').value=scene.env||''; $('floor').value=scene.floor||'wood'; $('rw').value=scene.room.w; $('rh').value=scene.room.h; $('rz').value=scene.room.z||2.7; $('sky').value=scene.sky||'overcast'; $('sunOn').checked=!!scene.sun.on; $('sunElev').value=scene.sun.elev; $('sunAz').value=Math.round(((scene.sun.az*180/Math.PI)%360+360)%360); $('sunElevV').textContent=scene.sun.elev+'°'; $('sunAzV').textContent=$('sunAz').value+'°';  skyUI(); }
function wallLabel(w){ return typeof w==='string' ? 'vnější '+wallName(w) : 'zeď '+(function(){ var it=byId(w); return it?fmt(S.wallLen(it),1)+' m':'?'; })(); }
function renderWindows(){ var el=$('windows'), h=''; (scene.windows||[]).forEach(function(w,i){
    h+='<div class="win" data-i="'+i+'"><div class="hd"><b>Okno '+(i+1)+' · '+wallLabel(w.wall)+'</b><button data-x="'+i+'" title="Odebrat">✕</button></div><div class="row"><div><label>Od (m)</label><input type="number" data-k="from" step="0.1" value="'+w.from.toFixed(1)+'"></div><div><label>Do (m)</label><input type="number" data-k="to" step="0.1" value="'+w.to.toFixed(1)+'"></div><div><label>Roleta</label><select data-k="blind"><option value="none"'+(!w.blind||w.blind==='none'?' selected':'')+'>otevřená</option><option value="half"'+(w.blind==='half'?' selected':'')+'>napůl</option><option value="closed"'+(w.blind==='closed'?' selected':'')+'>zatažená</option></select></div></div></div>'; });
  el.innerHTML=h||'<p class="mut" style="margin:2px 0 6px">Žádná okna.</p>';
  el.querySelectorAll('.win').forEach(function(div){ var w=scene.windows[+div.dataset.i];
    div.querySelectorAll('[data-k]').forEach(function(inp){ inp.addEventListener('input',function(){ if(inp.tagName==='SELECT'){ w.blind=inp.value; schedule(); return; } var v=parseFloat(inp.value); if(isNaN(v)) return; w[inp.dataset.k]=v; if(w.to<w.from+0.3) w.to=w.from+0.3; schedule(); }); });
    div.querySelector('[data-x]').onclick=function(){ scene.windows.splice(+div.dataset.i,1); renderWindows(); schedule(); }; }); }
$('sky').addEventListener('input',function(){ scene.sky=$('sky').value; skyUI(); schedule(); });
document.querySelectorAll('#skyPick [data-sky]').forEach(function(b){ b.onclick=function(){ $('sky').value=b.dataset.sky; $('sky').dispatchEvent(new Event('input')); }; });
// vektorové ovladače slunce / měsíce: oblouk výšky nad obzorem a kompas směru (sever = nahoru v půdorysu)
function skyUI(){ document.querySelectorAll('#skyPick [data-sky]').forEach(function(b){ b.classList.toggle('on',b.dataset.sky===(scene.sky||'overcast')); });
  var night=scene.sky==='night', body=night?'#dfe6f5':'#ffd25a'; $('sunH').textContent=night?'Měsíc':'Slunce'; $('sunOnL').textContent=night?'Měsíc svítí (studené slabé světlo)':'Přímé slunce (svítí okny)';
  var el=scene.sun.elev==null?35:scene.sun.elev, er=el*Math.PI/180, cx=60, cy=62, R=52, sx=cx+Math.cos(Math.PI-er)*R*-1, sy=cy-Math.sin(er)*R; sx=cx-Math.cos(er)*R;
  $('elevDial').innerHTML='<path d="M8 62 A52 52 0 0 1 112 62" fill="none" stroke="#3a3833" stroke-width="2"/>'+[15,30,45,60,75].map(function(a){ var r=a*Math.PI/180; return '<line x1="'+(cx-Math.cos(r)*48)+'" y1="'+(cy-Math.sin(r)*48)+'" x2="'+(cx-Math.cos(r)*55)+'" y2="'+(cy-Math.sin(r)*55)+'" stroke="#55514a"/>'; }).join('')
    +'<line x1="4" y1="62" x2="116" y2="62" stroke="#6b655b" stroke-width="1.5"/><path d="M'+cx+' '+cy+' L'+(cx-R+8)+' '+cy+' A'+(R-8)+' '+(R-8)+' 0 0 1 '+(cx-Math.cos(er)*(R-8))+' '+(cy-Math.sin(er)*(R-8))+' Z" fill="rgba(212,176,113,.18)"/>'
    +'<line x1="'+cx+'" y1="'+cy+'" x2="'+sx+'" y2="'+sy+'" stroke="'+body+'" stroke-width="2" stroke-dasharray="3 3"/><circle cx="'+sx+'" cy="'+sy+'" r="7" fill="'+body+'"/>'+(night?'<circle cx="'+(sx+3.5)+'" cy="'+(sy-2)+'" r="6" fill="#141414"/>':'')
    +'<text x="'+(cx+4)+'" y="'+(cy-6)+'" fill="#ece8e0" font-size="11" font-family="Inter,Lato,sans-serif">'+el+'°</text><rect x="'+(cx-3)+'" y="'+(cy-9)+'" width="6" height="9" fill="#9a948a"/>';
  var az=scene.sun.az||0, ax=40+Math.cos(az)*30, ay=40+Math.sin(az)*30;
  $('azDial').innerHTML='<circle cx="40" cy="40" r="30" fill="#1c1b19" stroke="#3a3833" stroke-width="2"/>'+[0,1,2,3,4,5,6,7].map(function(i){ var a=i*Math.PI/4, r1=i%2?27:24; return '<line x1="'+(40+Math.cos(a)*r1)+'" y1="'+(40+Math.sin(a)*r1)+'" x2="'+(40+Math.cos(a)*30)+'" y2="'+(40+Math.sin(a)*30)+'" stroke="#55514a"/>'; }).join('')
    +'<rect x="31" y="33" width="18" height="14" fill="none" stroke="#9a948a" stroke-width="1.5"/><line x1="40" y1="40" x2="'+ax+'" y2="'+ay+'" stroke="'+body+'" stroke-width="2"/><path d="M40 40 L'+(40+Math.cos(az+0.35)*8)+' '+(40+Math.sin(az+0.35)*8)+' M40 40 L'+(40+Math.cos(az-0.35)*8)+' '+(40+Math.sin(az-0.35)*8)+'" stroke="'+body+'" stroke-width="2"/><circle cx="'+ax+'" cy="'+ay+'" r="6" fill="'+body+'"/><text x="40" y="9" text-anchor="middle" fill="#6b655b" font-size="8" font-family="Inter,sans-serif">půdorys</text>';
  document.querySelector('.sunDials').classList.toggle('off',!scene.sun.on); }
function dialDrag(svg,fn){ var on=false; function mv(e){ var r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal, x=(e.clientX-r.left)/r.width*vb.width, y=(e.clientY-r.top)/r.height*vb.height; fn(x,y); }
  svg.addEventListener('pointerdown',function(e){ on=true; svg.setPointerCapture(e.pointerId); if(!scene.sun.on){ scene.sun.on=true; $('sunOn').checked=true; } mv(e); }); svg.addEventListener('pointermove',function(e){ if(on) mv(e); }); svg.addEventListener('pointerup',function(){ on=false; snapshotSoon(); }); }
dialDrag($('elevDial'),function(x,y){ var a=Math.round(Math.atan2(62-y,60-x)*180/Math.PI); a=Math.max(2,Math.min(88,a)); scene.sun.elev=a; $('sunElev').value=a; $('sunElevV').textContent=a+'°'; skyUI(); schedule(); });
dialDrag($('azDial'),function(x,y){ var a=Math.atan2(y-40,x-40); scene.sun.az=a; $('sunAz').value=Math.round(((a*180/Math.PI)%360+360)%360); $('sunAzV').textContent=$('sunAz').value+'°'; skyUI(); schedule(); });
$('exOn').addEventListener('input',function(){ scene.exterior.on=$('exOn').checked; fit(); schedule(); });
$('fenceOn').addEventListener('input',function(){ scene.fence=$('fenceOn').checked; draw(); sync3d(); snapshotSoon(); });
$('outdoor').addEventListener('input',function(){ scene.outdoor=$('outdoor').checked; fit(); schedule(); });
$('exTrees').addEventListener('input',function(){ scene.exterior.trees=parseInt($('exTrees').value,10); $('exTreesV').textContent=$('exTrees').value; draw(); sync3d(); snapshotSoon(); });
Object.keys(S.FORMATS).forEach(function(k){ var o=document.createElement('option'); o.value=k; o.textContent=S.FORMATS[k].name; $('fmt').appendChild(o); });
$('fmt').addEventListener('input',function(){ scene.format=$('fmt').value; if(view3dReady) window.View3D.resize(); draw(); snapshotSoon(); });
$('sunOn').addEventListener('input',function(){ scene.sun.on=$('sunOn').checked; skyUI(); fit(); schedule(); });
$('sunElev').addEventListener('input',function(){ scene.sun.elev=parseFloat($('sunElev').value); $('sunElevV').textContent=scene.sun.elev+'°'; skyUI(); schedule(); });
$('sunAz').addEventListener('input',function(){ scene.sun.az=parseFloat($('sunAz').value)*Math.PI/180; $('sunAzV').textContent=$('sunAz').value+'°'; skyUI(); schedule(); });
['rw','rh','rz'].forEach(function(id){ $(id).addEventListener('change',function(){ var mx=scene.outdoor?NEW_LIM.ext.max:NEW_LIM.room.max; scene.room.w=Math.min(mx,Math.max(3,parseFloat($('rw').value)||7)); scene.room.h=Math.min(mx,Math.max(3,parseFloat($('rh').value)||5)); $('rw').value=scene.room.w; $('rh').value=scene.room.h; scene.room.z=Math.max(2.2,parseFloat($('rz').value)||2.7); scene.items.forEach(function(i){ if(i.kind==='wall'){ clampWall(i); return; } i.x=Math.min(i.x,scene.room.w-0.1); i.y=Math.min(i.y,scene.room.h-0.1); var cf=i.kind==='light'&&S.FIXTURES[i.fixture]&&S.FIXTURES[i.fixture].ceil; if(cf) i.h= cf==='flush' ? scene.room.z-0.06 : Math.min(i.h,scene.room.z-0.1); }); /* stropní svítidla s výškou stropu */ fit(); schedule(); }); });
$('walls').addEventListener('input',function(){ scene.walls=$('walls').value; schedule(); });
$('env').addEventListener('input',function(){ var v=$('env').value, E=S.ENVS[v]; if(!E){ delete scene.env; syncRoom(); fit(); schedule(); return; } scene.env=v; scene.room={w:E.room.w,h:E.room.h,z:E.room.z}; scene.walls=E.walls; scene.floor=E.floor; scene.windows=[]; scene.doors=[]; scene.outdoor=false; scene.exterior={on:false,trees:6}; scene.items.forEach(function(i){ if(i.kind==='wall') return; i.x=Math.min(i.x,scene.room.w-0.1); i.y=Math.min(i.y,scene.room.h-0.1); }); syncRoom(); fit(); schedule(); });
$('floor').addEventListener('input',function(){ scene.floor=$('floor').value; schedule(); });
$('quality').addEventListener('input',function(){ try{ localStorage.setItem('viewfinder-quality',$('quality').value);}catch(e){} schedule(); });
['ev','autoEv','zebra','shadows','haze','grain'].forEach(function(id){ $(id).addEventListener('input',function(){ if(id==='autoEv'){ try{ localStorage.setItem('viewfinder-autoev',$('autoEv').checked?'1':'0');}catch(e){} } $('evv').textContent=(parseFloat($('ev').value)>0?'+':'')+$('ev').value+' EV'; $('hazeV').textContent=$('haze').value+' %'; $('grainV').textContent=$('grain').value+' %'; if(res){ renderMap(); draw(); sync3d(); } }); });
['gridOn','beams','snap'].forEach(function(id){ $(id).addEventListener('input',draw); });
// ---------- nová místnost / nový exteriér podle zadaných rozměrů ----------
var NEW_LIM={room:{min:3,max:30,zmin:2.2,zmax:6}, ext:{min:5,max:50}}; // exteriér do 50 × 50 m – výpočet i 3D okolí (obloha, terén) zůstanou únosné
var nmKind='room';
function openNew(kind){ nmKind=kind; var ext=kind==='ext', L=ext?NEW_LIM.ext:NEW_LIM.room;
  $('nmTitle').textContent=ext?'Nový exteriér':'Nová místnost'; $('nmZBox').classList.toggle('hide',ext); $('nmExtBox').classList.toggle('hide',!ext);
  $('nmW').value=ext?20:6; $('nmH').value=ext?15:4.5; $('nmZ').value=2.7; ['nmW','nmH'].forEach(function(id){ $(id).min=L.min; $(id).max=L.max; }); $('nmZ').min=NEW_LIM.room.zmin; $('nmZ').max=NEW_LIM.room.zmax;
  $('nmHint').textContent=ext?'Délka i šířka '+L.min+'–'+L.max+' m (větší plocha by zbytečně zatěžovala výpočet). Cestu pak nakreslíte nástrojem Cesta nad půdorysem.':'Délka a šířka '+L.min+'–'+L.max+' m, výška stropu '+fmt(NEW_LIM.room.zmin,1)+'–'+NEW_LIM.room.zmax+' m. Okna a dveře pak přidáte nástroji nad půdorysem.';
  $('newModal').classList.remove('hide'); setTimeout(function(){ $('nmW').focus(); $('nmW').select(); },30); }
function closeNew(){ $('newModal').classList.add('hide'); }
function createNew(){ var ext=nmKind==='ext', L=ext?NEW_LIM.ext:NEW_LIM.room, cl=function(v,a,b,d){ v=parseFloat(String(v).replace(',','.')); return isFinite(v)?Math.max(a,Math.min(b,Math.round(v*10)/10)):d; };
  var W=cl($('nmW').value,L.min,L.max,ext?20:6), H=cl($('nmH').value,L.min,L.max,ext?15:4.5), Z=cl($('nmZ').value,NEW_LIM.room.zmin,NEW_LIM.room.zmax,2.7);
  var s=blank(); s.room={w:W,h:H,z:Z}; s.windows=[]; s.format='169';
  if(ext){ s.outdoor=true; s.floor=$('nmFloor').value; s.sky='sunny'; s.sun={on:true,az:3.6,elev:35}; s.exterior={on:$('nmTrees').checked,trees:8}; s.fence=$('nmFence').checked; }
  else { s.walls='normal'; s.floor='wood'; }
  s.items=[item('camera',W/2,H-Math.min(1,H*0.15),-Math.PI/2,{focal:35,h:1.5,aim:false,tilt:0})];
  scene=s; fixIds(); if(view3dReady) window.View3D.resetOrbit(); sel=null; syncRoom(); props(); fit(); schedule(); closeNew(); }
$('bNmOk').onclick=createNew; $('bNmCancel').onclick=closeNew; $('bNmClose').onclick=closeNew; $('newModal').addEventListener('click',function(e){ if(e.target===this) closeNew(); });
['nmW','nmH','nmZ'].forEach(function(id){ $(id).addEventListener('keydown',function(e){ if(e.key==='Enter') createNew(); if(e.key==='Escape') closeNew(); }); });
$('tpl').onchange=function(){ if(!this.value) return; if(this.value==='__room'||this.value==='__ext'){ var k=this.value==='__ext'?'ext':'room'; this.value=''; openNew(k); return; } scene=TEMPL[this.value](); freezeAim(scene); if(view3dReady) window.View3D.resetOrbit(); sel=null; syncRoom(); props(); fit(); schedule(); this.value=''; };
$('bSave').onclick=function(){ var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(scene,null,1)],{type:'application/json'})); a.download='viewfinder-light-scena.json'; a.click(); };
$('bLoad').onclick=function(){ $('fLoad').click(); };
$('fLoad').onchange=function(){ var f=this.files[0]; if(!f) return; f.text().then(function(t){ try{ var sc=JSON.parse(t); if(!sc.room||!sc.items) throw 0; scene=sc; fixIds(); sel=null; syncRoom(); props(); fit(); schedule(); }catch(e){ alert('Soubor nejde načíst.'); } }); $('fLoad').value=''; };
$('bPng').onclick=function(){ var a=document.createElement('a'); a.href=cv.toDataURL('image/png'); a.download='viewfinder-light-pudorys.png'; a.click(); };
$('bShot').onclick=function(){ if(!view3dReady) return; var a=document.createElement('a'); a.href=window.View3D.shot(); a.download='viewfinder-light-kamera.png'; a.click(); };
$('bUndo').onclick=undo; $('bRedo').onclick=redo;
$('bOrbit').onclick=function(){ if(!view3dReady) return; var o=window.View3D.toggleOrbit(); $('bOrbit').classList.toggle('gold',o); $('bOrbit').textContent= o?'Zpět do kamery':'Volný pohled'; };

function setView(v){ center.className=v; document.querySelectorAll('#viewTabs .tab').forEach(function(t){ t.classList.toggle('active',t.dataset.view===v); }); if(!isPhone()) try{ localStorage.setItem('viewfinder-view',v);}catch(e){} mNavSync(); requestAnimationFrame(function(){ fit(); if(view3dReady) window.View3D.resize(); }); }
document.querySelectorAll('#viewTabs .tab').forEach(function(t){ t.onclick=function(){ setView(t.dataset.view); }; });
window.addEventListener('resize',function(){ fit(); if(view3dReady) window.View3D.resize(); mNavSync(); });
// ---------- škálování: nabídka ⋯, výsuvné lišty (tablet / telefon), spodní lišta telefonu, dotykové šipky kamery ----------
var APP=$('app');
function isPhone(){ return window.matchMedia('(max-width:760px), (max-height:520px) and (max-width:1000px)').matches; }
function isDrawerR(){ return window.matchMedia('(max-width:1180px)').matches; }
function drawer(side,open){ var c=side==='left'?'lOpen':'rOpen'; if(open==null) open=!APP.classList.contains(c); APP.classList.remove('lOpen','rOpen'); if(open) APP.classList.add(c); mNavSync(); }
function mNavSync(){ var v=center.className; document.querySelectorAll('#mNav button').forEach(function(b){ var m=b.dataset.m; b.classList.toggle('on', m==='left'?APP.classList.contains('lOpen'): m==='right'?APP.classList.contains('rOpen'): m==='plan'?v==='plan': m==='cam'?(v==='cam'||v==='split'):false); }); }
$('bMore').onclick=function(e){ e.stopPropagation(); $('tbMore').classList.toggle('open'); };
document.addEventListener('pointerdown',function(e){ var m=$('tbMore'); if(m.classList.contains('open') && !m.contains(e.target) && e.target!==$('bMore')) m.classList.remove('open'); });
$('tbMore').addEventListener('click',function(e){ if(e.target.closest('button')) setTimeout(function(){ $('tbMore').classList.remove('open'); },0); });
$('bRTog').onclick=function(){ drawer('right'); };
$('drawerBg').onclick=function(){ drawer('left',false); };
document.querySelectorAll('#mNav button').forEach(function(b){ b.onclick=function(){ var m=b.dataset.m; if(m==='left'||m==='right') drawer(m); else if(m==='snap'){ drawer('left',false); $('bSnap').click(); } else { drawer('left',false); setView(m); } mNavSync(); }; });
// na telefonu po přidání objektu zavřít lištu, ať je vidět, kam se přidal
document.querySelector('aside.l').addEventListener('click',function(e){ if(isPhone() && e.target.closest('.add .btn, #objList .item')) setTimeout(function(){ drawer('left',false); },60); });
document.querySelectorAll('#touchPad button').forEach(function(b){ var k=b.dataset.k;
  var on=function(e){ e.preventDefault(); b.classList.add('on'); if(view3dReady) window.View3D.setKey(k,true); try{ b.setPointerCapture(e.pointerId); }catch(er){} };
  var off=function(){ b.classList.remove('on'); if(view3dReady) window.View3D.setKey(k,false); };
  b.addEventListener('pointerdown',on); b.addEventListener('pointerup',off); b.addEventListener('pointercancel',off); b.addEventListener('lostpointercapture',off); b.addEventListener('contextmenu',function(e){ e.preventDefault(); }); });
var camTimer=null;
window.addEventListener('view3d-model',function(){ if(res) sync3d(); });
window.addEventListener('view3d-ready',function(){ window.View3D.init($('view3d')); view3dReady=true; window.View3D.resize();
  window.View3D.setPoseCallback(function(id,bone,q,final){ var it=byId(id); if(!it) return; if(!it.bones) it.bones={}; it.bones[bone]=q; if(final){ poseButtons(); snapshotSoon(); } });
  // objekt chycený myší v 3D pohledu: výběr, průběžné překreslení půdorysu, na konci přepočet světla
  window.View3D.setMoveCallback(function(id,x,y,phase){ var it=byId(id); if(!it) return; if(phase==='start'){ if(sel!==it) select(it); return; } it.x=Math.max(0.05,Math.min(scene.room.w-0.05,it.x)); it.y=Math.max(0.05,Math.min(scene.room.h-0.05,it.y)); draw(); if(phase==='end'){ props(); schedule(); } });
  window.View3D.setCameraCallback(function(cam,final){ draw(); var c=scene.items.find(function(i){return i.kind==='camera';}); if(c) $('camInfo').textContent=c.focal+' mm · výška '+c.h.toFixed(2).replace('.',',')+' m'; camUI(); clearTimeout(camTimer); camTimer=setTimeout(function(){ if(sel&&sel.kind==='camera') props(); schedule(); }, final?50:350); });
  if(res) sync3d(); });
if(window.View3D){ window.dispatchEvent(new Event('view3d-ready')); }

// ---------- varianty nasvícení ----------
function sceneCore(){ var c=JSON.parse(JSON.stringify(scene)); delete c.variants; delete c.variantId; return c; }
function renderVariants(){ var sel=$('varSel'); sel.innerHTML='<option value="">Varianta…</option>'; (scene.variants||[]).forEach(function(v){ var o=document.createElement('option'); o.value=v.id; o.textContent=v.name; if(scene.variantId===v.id) o.selected=true; sel.appendChild(o); }); var has=!!(scene.variantId&&(scene.variants||[]).some(function(v){return v.id===scene.variantId;})); $('bVarUpd').disabled=!has; $('bVarDel').disabled=!has; }
$('bVarAdd').onclick=function(){ var n=prompt('Název varianty nasvícení:', 'Varianta '+(((scene.variants||[]).length)+1)); if(!n) return; if(!scene.variants) scene.variants=[]; var v={id:uid++,name:n.slice(0,60),data:sceneCore()}; scene.variants.push(v); scene.variantId=v.id; renderVariants(); snapshot(); };
$('bVarUpd').onclick=function(){ var v=(scene.variants||[]).find(function(x){return x.id===scene.variantId;}); if(!v) return; v.data=sceneCore(); renderVariants(); snapshot(); };
$('bVarDel').onclick=function(){ var v=(scene.variants||[]).find(function(x){return x.id===scene.variantId;}); if(!v||!confirm('Smazat variantu „'+v.name+'“?')) return; scene.variants=scene.variants.filter(function(x){return x!==v;}); scene.variantId=null; renderVariants(); snapshot(); };
$('varSel').addEventListener('change',function(){ var id=+this.value; var v=(scene.variants||[]).find(function(x){return x.id===id;}); if(!v){ scene.variantId=null; renderVariants(); return; }
  var keep={variants:scene.variants, variantId:v.id}; scene=JSON.parse(JSON.stringify(v.data)); scene.variants=keep.variants; scene.variantId=keep.variantId; fixIds(); sel=null; syncRoom(); props(); renderVariants(); fit(); schedule(); });

// ---------- cvaky (lišta) ----------
var shots=[], shotDb=null, curShot=null;
function dbOpen(cb){ if(shotDb){ cb(shotDb); return; } try{ var rq=indexedDB.open('viewfinder',1); rq.onupgradeneeded=function(){ rq.result.createObjectStore('shots',{keyPath:'id'}); }; rq.onsuccess=function(){ shotDb=rq.result; cb(shotDb); }; rq.onerror=function(){ cb(null); }; }catch(e){ cb(null); } }
function dbAll(cb){ dbOpen(function(db){ if(!db){ cb([]); return; } var tx=db.transaction('shots','readonly'), rq=tx.objectStore('shots').getAll(); rq.onsuccess=function(){ cb((rq.result||[]).sort(function(a,b){return a.order-b.order;})); }; rq.onerror=function(){ cb([]); }; }); }
function dbPut(sh){ dbOpen(function(db){ if(!db) return; db.transaction('shots','readwrite').objectStore('shots').put(sh); }); }
function dbDel(id){ dbOpen(function(db){ if(!db) return; db.transaction('shots','readwrite').objectStore('shots').delete(id); }); }
function scaleImg(dataUrl, maxW, q, cb){ var im=new Image(); im.onload=function(){ var k=Math.min(1,maxW/im.width), c=document.createElement('canvas'); c.width=Math.round(im.width*k); c.height=Math.round(im.height*k); var g=c.getContext('2d'); g.fillStyle='#000'; g.fillRect(0,0,c.width,c.height); g.drawImage(im,0,0,c.width,c.height); cb(c.toDataURL('image/jpeg',q)); }; im.src=dataUrl; }
function lightsSummary(){ return scene.items.filter(function(i){return i.kind==='light';}).map(function(L){ var P=S.lightParams(L); return (L.label?L.label+' – ':'')+S.FIXTURES[L.fixture].name+', '+S.MODS[L.mod].name+', '+L.power+' %, '+(P.rgb?'barva '+L.color:Math.round(P.cct)+' K')+', výška '+fmt(P.h,1)+' m'+(L.on===false?' (vypnuto)':''); }); }
function takeShot(suffix){ if(!view3dReady||!window.View3D.hasCamera()){ alert('Přidej do scény kameru.'); return; } suffix=typeof suffix==='string'?suffix:''; var cam=scene.items.find(function(i){return i.kind==='camera';});
  var camUrl=window.View3D.shot(); draw();
  // ořez půdorysu na místnost (+ okolí se sluncem / zahradou) – bez prázdných okrajů
  var ex=(scene.exterior&&scene.exterior.on)?4.2:(S.sunOn(scene)?1.6:0.5), a=toPx(-ex,-ex), b2=toPx(scene.room.w+ex,scene.room.h+ex+0.5), dpr=devicePixelRatio;
  var cx0=Math.max(0,a[0]*dpr), cy0=Math.max(0,a[1]*dpr), cw=Math.min(cv.width,b2[0]*dpr)-cx0, chh=Math.min(cv.height,b2[1]*dpr)-cy0;
  var pc=document.createElement('canvas'); pc.width=Math.max(2,Math.round(cw)); pc.height=Math.max(2,Math.round(chh)); pc.getContext('2d').drawImage(cv,cx0,cy0,cw,chh,0,0,pc.width,pc.height); var planUrl=pc.toDataURL('image/png');
  scaleImg(camUrl,1400,0.86,function(camJ){ scaleImg(planUrl,1000,0.85,function(planJ){
    var sh={id:Date.now(), order:shots.length?shots[shots.length-1].order+1:1, name:'Záběr '+(shots.length+1)+suffix, note:'', ts:Date.now(), cam:camJ, plan:planJ,
      meta:{lux:meas?Math.round(meas.lux):0, ratio:meas?fmt(meas.ratio,1):'-', stops:meas?fmt(meas.stops,1):'-', focal:cam.focal||35, format:(S.FORMATS[scene.format]||S.FORMATS.free).name, variant:(function(){ var v=(scene.variants||[]).find(function(x){return x.id===scene.variantId;}); return v?v.name:''; })(), lights:lightsSummary()},
      scene:JSON.stringify(sceneCore())};
    shots.push(sh); dbPut(sh); renderShots(); curShotFlash(sh.id); }); }); }
function curShotFlash(id){ var el=document.querySelector('.shot[data-id="'+id+'"]'); if(el){ el.classList.add('cur'); var sh=el.parentElement; if(sh) sh.scrollLeft=Math.max(0,el.offsetLeft+el.offsetWidth-sh.clientWidth+8); /* posunout jen lištu cvaků, ne celou stránku */ setTimeout(function(){ el.classList.remove('cur'); },1200); } }
function renderShots(){ var el=$('shots'); el.innerHTML=''; $('shotCount').textContent=shots.length; shots.forEach(function(sh,i){ var d=document.createElement('div'); d.className='shot'; d.dataset.id=sh.id;
    d.innerHTML='<img src="'+sh.cam+'" alt=""><div class="cap"></div><span class="num">'+(i+1)+'</span><div class="mv"><button data-mv="-1" title="Posunout doleva">◀</button><button data-mv="1" title="Posunout doprava">▶</button><button data-del="1" title="Smazat">✕</button></div>';
    d.querySelector('.cap').textContent=sh.name+(sh.meta&&sh.meta.variant?' · '+sh.meta.variant:'');
    d.onclick=function(e){ var t=e.target; if(t.dataset.mv){ moveShot(sh,+t.dataset.mv); return; } if(t.dataset.del){ delShot(sh); return; } openShot(sh); };
    el.appendChild(d); }); }
function moveShot(sh,dir){ var i=shots.indexOf(sh), j=i+dir; if(j<0||j>=shots.length) return; var o=shots[i].order; shots[i].order=shots[j].order; shots[j].order=o; shots.sort(function(a,b){return a.order-b.order;}); dbPut(shots[i]); dbPut(shots[j]); renderShots(); }
function delShot(sh){ if(!confirm('Smazat cvak „'+sh.name+'“?')) return; shots=shots.filter(function(x){return x!==sh;}); dbDel(sh.id); renderShots(); if(curShot===sh) closeShot(); }
function openShot(sh){ curShot=sh; $('shotName').value=sh.name; $('shotNote').value=sh.note||''; $('shotImg').src=sh.cam; $('shotPlan').src=sh.plan; var m=sh.meta||{}; $('shotMeta').innerHTML='<b>'+m.lux+' lx</b> · poměr '+m.ratio+' : 1 ('+m.stops+' EV) · '+m.focal+' mm · '+m.format+(m.variant?' · '+m.variant:'')+'<br>'+(m.lights||[]).map(function(t){return '• '+t;}).join('<br>')+'<br><span class="mut">'+new Date(sh.ts).toLocaleString('cs-CZ')+'</span>'; $('shotModal').classList.remove('hide'); }
function closeShot(){ if(curShot){ curShot.name=$('shotName').value.slice(0,80)||curShot.name; curShot.note=$('shotNote').value.slice(0,1000); dbPut(curShot); renderShots(); } curShot=null; $('shotModal').classList.add('hide'); }
// ---------- HQ render → rovnou do lišty cvaků ----------
var hqRunning=false;
function hqUI(st){ var info=$('ptInfo'), b=$('bPT');
  if(st.stopped){ info.classList.add('hide'); b.classList.remove('on'); b.textContent='🎬 Vykreslit'; hqRunning=false; return; }
  if(st.done){ info.textContent='Hotovo · uloženo do cvaků'; b.classList.remove('on'); b.textContent='🎬 Vykreslit'; hqRunning=false; takeShot(' (HQ)'); setTimeout(function(){ if(!hqRunning) info.classList.add('hide'); },4000); return; }
  info.textContent='Vykresluji '+st.pass+' / '+st.passes; info.classList.remove('hide'); }
$('bPT').onclick=function(){ if(!view3dReady) return; if(hqRunning){ window.View3D.stopHQ(); return; }
  if(!window.View3D.hasCamera()){ alert('Přidej do scény kameru.'); return; }
  var q=$('quality').value, passes= q==='low'?12: q==='high'?48:24;
  hqRunning=true; $('bPT').classList.add('on'); $('bPT').textContent='■ Zastavit'; $('ptInfo').textContent='Vykresluji…'; $('ptInfo').classList.remove('hide');
  if(!window.View3D.renderHQ({passes:passes, onProgress:hqUI})) hqUI({stopped:true}); };
$('bAbout').onclick=function(){ $('aboutModal').classList.remove('hide'); }; $('bAboutClose').onclick=function(){ $('aboutModal').classList.add('hide'); }; $('aboutModal').addEventListener('click',function(e){ if(e.target===this) this.classList.add('hide'); });
$('bSnap').onclick=takeShot; $('bShotClose').onclick=closeShot; $('shotModal').addEventListener('click',function(e){ if(e.target===this) closeShot(); });
$('bShotDel').onclick=function(){ if(curShot) delShot(curShot); };
$('bShotPng').onclick=function(){ if(!curShot) return; var a=document.createElement('a'); a.href=curShot.cam; a.download='viewfinder-'+(curShot.name||'zaber').replace(/[^\w\-]+/g,'_')+'.jpg'; a.click(); };
$('bShotRestore').onclick=function(){ if(!curShot) return; try{ var sc=JSON.parse(curShot.scene); var keep={variants:scene.variants, variantId:scene.variantId}; scene=sc; scene.variants=keep.variants; scene.variantId=keep.variantId; fixIds(); sel=null; syncRoom(); props(); renderVariants(); fit(); schedule(); closeShot(); }catch(e){ alert('Scénu se nepodařilo obnovit.'); } };
$('bShotsClear').onclick=function(){ if(!shots.length||!confirm('Smazat všechny cvaky ('+shots.length+')?')) return; shots.forEach(function(s){ dbDel(s.id); }); shots=[]; renderShots(); };
$('bStripToggle').onclick=function(){ var c=$('strip').classList.toggle('collapsed'); this.textContent=c?'▴':'▾'; try{ localStorage.setItem('viewfinder-strip',c?'0':'1');}catch(e){} requestAnimationFrame(function(){ fit(); if(view3dReady) window.View3D.resize(); }); };
dbAll(function(list){ shots=list; renderShots(); });

// ---------- PDF export (stránky jako obrázky – plná diakritika, žádná knihovna) ----------
function pdfFromJpegs(pages){ // pages: [{data:Uint8Array, w, h}] – každá stránka = jeden JPEG na A4 na šířku
  var enc=new TextEncoder(), parts=[], offsets=[], pos=0; function add(u8){ parts.push(u8); pos+=u8.length; } function addS(str){ add(enc.encode(str)); }
  var W=842, H=595, n=pages.length; addS('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  var objs=[]; function obj(i){ offsets[i]=pos; addS(i+' 0 obj\n'); }
  var kids=[]; for(var i=0;i<n;i++) kids.push((3+i*3)+' 0 R');
  obj(1); addS('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj(2); addS('<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+n+' >>\nendobj\n');
  pages.forEach(function(p,i){ var pg=3+i*3, im=pg+1, ct=pg+2;
    obj(pg); addS('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /XObject << /Im'+i+' '+im+' 0 R >> >> /Contents '+ct+' 0 R >>\nendobj\n');
    obj(im); addS('<< /Type /XObject /Subtype /Image /Width '+p.w+' /Height '+p.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+p.data.length+' >>\nstream\n'); add(p.data); addS('\nendstream\nendobj\n');
    var c='q '+W+' 0 0 '+H+' 0 0 cm /Im'+i+' Do Q'; obj(ct); addS('<< /Length '+c.length+' >>\nstream\n'+c+'\nendstream\nendobj\n'); });
  var xref=pos, total=3+n*3; addS('xref\n0 '+total+'\n0000000000 65535 f \n'); for(var k=1;k<total;k++) addS(String(offsets[k]).padStart(10,'0')+' 00000 n \n');
  addS('trailer\n<< /Size '+total+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  return new Blob(parts,{type:'application/pdf'}); }
function b64ToU8(dataUrl){ var b=atob(dataUrl.split(',')[1]), u=new Uint8Array(b.length); for(var i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; }
function loadImg(src){ return new Promise(function(res){ var im=new Image(); im.onload=function(){res(im);}; im.onerror=function(){res(null);}; im.src=src; }); }
function wrapText(g,text,x,y,maxW,lh,maxLines){ var words=(text||'').split(/\s+/), line='', lines=0; for(var i=0;i<words.length;i++){ var t=line?line+' '+words[i]:words[i]; if(g.measureText(t).width>maxW&&line){ g.fillText(line,x,y); y+=lh; line=words[i]; if(++lines>=maxLines-1){ line+=' …'; break; } } else line=t; } if(line) g.fillText(line,x,y); return y+lh; }
async function exportPdf(){ if(!shots.length){ alert('V liště nejsou žádné cvaky.'); return; } $('bPdf').disabled=true; $('bPdf').textContent='Generuji…';
  try{ var pages=[], PW=1754, PH=1240, title=prompt('Název projektu do záhlaví PDF:', 'Světelný plán')||'Světelný plán';
    for(var i=0;i<shots.length;i++){ var sh=shots[i], c=document.createElement('canvas'); c.width=PW; c.height=PH; var g=c.getContext('2d');
      g.fillStyle='#fff'; g.fillRect(0,0,PW,PH); g.fillStyle='#111'; g.font='bold 40px Inter,Lato,Arial,sans-serif'; g.fillText(title,70,90); g.font='24px Inter,Lato,Arial,sans-serif'; g.fillStyle='#666'; g.fillText('Viewfinder Light · '+(i+1)+' / '+shots.length+' · '+new Date(sh.ts).toLocaleDateString('cs-CZ'),70,128); g.textAlign='right'; g.fillText('Svět v hledáčku',PW-70,90); g.textAlign='left';
      g.fillStyle='#111'; g.font='bold 32px Inter,Lato,Arial,sans-serif'; g.fillText(sh.name||('Záběr '+(i+1)),70,190);
      var cam=await loadImg(sh.cam), pl=await loadImg(sh.plan); var bx=70, by=215, bw=1040, bh=690;
      if(cam){ var k=Math.min(bw/cam.width,bh/cam.height), w=cam.width*k, h=cam.height*k; g.fillStyle='#000'; g.fillRect(bx,by,bw,bh); g.drawImage(cam,bx+(bw-w)/2,by+(bh-h)/2,w,h); g.strokeStyle='#333'; g.lineWidth=2; g.strokeRect(bx,by,bw,bh); }
      var px=1160, py=215, pw=524, ph=380; if(pl){ var k2=Math.min(pw/pl.width,ph/pl.height), w2=pl.width*k2, h2=pl.height*k2; g.fillStyle='#0a0a0b'; g.fillRect(px,py,pw,ph); g.drawImage(pl,px+(pw-w2)/2,py+(ph-h2)/2,w2,h2); g.strokeStyle='#333'; g.strokeRect(px,py,pw,ph); }
      g.fillStyle='#666'; g.font='18px Inter,Lato,Arial,sans-serif'; g.fillText('Schéma nasvícení (půdorys)',px,py+ph+28);
      var m=sh.meta||{}; g.fillStyle='#111'; g.font='bold 22px Inter,Lato,Arial,sans-serif'; var yy=wrapText(g,'Obličej '+m.lux+' lx · poměr '+m.ratio+' : 1 ('+m.stops+' EV) · '+m.focal+' mm · '+m.format+(m.variant?' · '+m.variant:''),px,py+ph+64,pw,28,3)+6;
      g.font='18px Inter,Lato,Arial,sans-serif'; (m.lights||[]).slice(0,10).forEach(function(t){ yy=wrapText(g,'• '+t,px,yy,pw,24,2); });
      if(sh.note){ g.fillStyle='#333'; g.font='italic 22px Inter,Lato,Arial,sans-serif'; wrapText(g,sh.note,bx,by+bh+40,bw,30,6); }
      g.fillStyle='#999'; g.font='16px Inter,Lato,Arial,sans-serif'; g.fillText('Orientační simulace. Hodnoty luxů jsou přibližné.',70,PH-40); var cr=[]; try{ cr=S.credits(JSON.parse(sh.scene)); }catch(e){} if(cr.length) g.fillText(cr.join(' · '),70,PH-62);
      pages.push({data:b64ToU8(c.toDataURL('image/jpeg',0.88)), w:PW, h:PH}); }
    var blob=pdfFromJpegs(pages), a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='viewfinder-light-storyboard.pdf'; a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); },5000);
  } finally { $('bPdf').disabled=false; $('bPdf').textContent='PDF storyboard'; } }
$('bPdf').onclick=exportPdf;

// ---------- napojení na WordPress (plugin Viewfinder Light) ----------
var VF = window.SVH_VIEWFINDER || null, cloudTimer=null, cloudBusy=false;
// nový REST nonce (aplikace otevřená z cache nebo dlouho: starý nonce WordPress odmítne s 403)
function refreshNonce(){ return fetch(VF.ajax||'/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(function(r){ return r.ok?r.text():null; }).then(function(t){ if(t&&/^[a-f0-9]{6,}$/i.test(t.trim())) VF.nonce=t.trim(); }).catch(function(){}); }
function cloudPost(j){ return fetch(VF.rest,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-WP-Nonce':VF.nonce},body:JSON.stringify({scene:j,ts:Date.now()})}); }
function cloudSave(j){ if(!VF||!VF.rest) return; clearTimeout(cloudTimer); cloudTimer=setTimeout(function(){ if(cloudBusy) return; cloudBusy=true;
  cloudPost(j).then(function(r){ if(r.status===403) return refreshNonce().then(function(){ return cloudPost(j); }); }).catch(function(){}).then(function(){ cloudBusy=false; }); },1500); }
function cloudLoad(cb){ if(!VF||!VF.rest){ cb(null); return; } fetch(VF.rest,{credentials:'same-origin',headers:{'X-WP-Nonce':VF.nonce}}).then(function(r){ return r.ok?r.json():null; }).then(function(d){ cb(d&&d.scene?d:null); }).catch(function(){ cb(null); }); }
if(VF){ var bar=$('wpBar'); if(VF.back){ var a=document.createElement('a'); a.className='btn sm'; a.href=VF.back; a.textContent='← Můj účet'; bar.appendChild(a); }
  var fs=document.createElement('button'); fs.className='btn sm'; fs.textContent='Celá obrazovka'; fs.title='Přepnout celou obrazovku (F11 / Esc)'; fs.onclick=function(){ if(document.fullscreenElement){ document.exitFullscreen(); } else { document.documentElement.requestFullscreen().catch(function(){}); } }; bar.appendChild(fs);
  // instalovatelná aplikace (PWA): service worker = offline cache + pravidelné ověření nákupu v e-shopu
  if(VF.pwa && 'serviceWorker' in navigator && window.isSecureContext){ navigator.serviceWorker.register('sw.js'+(VF.version?'?v='+encodeURIComponent(VF.version):''),{scope:'./'}).catch(function(){}); }
  document.addEventListener('fullscreenchange',function(){ fs.textContent= document.fullscreenElement?'Ukončit celou obrazovku':'Celá obrazovka'; setTimeout(function(){ fit(); if(view3dReady) window.View3D.resize(); },100); }); }

// ---------- tlačítko „Nainstalovat“ (Chrome/Edge: nabídka prohlížeče; Safari/iPad: návod) ----------
(function(){ var V=window.SVH_VIEWFINDER, btn=$('bInstall'), ev=null;
  var standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  if(!V||!V.pwa||standalone||!('serviceWorker' in navigator)) return;
  var ua=navigator.userAgent, ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1), safari=/^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  window.addEventListener('beforeinstallprompt',function(e){ e.preventDefault(); ev=e; btn.classList.remove('hide'); });
  window.addEventListener('appinstalled',function(){ btn.classList.add('hide'); });
  btn.classList.remove('hide'); // Chrome/Edge: nabídka prohlížeče; jinde (Safari, iPad, Firefox) návod
  function help(){ var h;
    if(ios) h='<p>Na iPadu / iPhonu v Safari klepněte na <b>Sdílet</b> <span style="font-size:17px">⎋</span> a zvolte <b>Přidat na plochu</b>. Aplikace pak bude mít vlastní ikonu a poběží v celé obrazovce i bez internetu.</p>';
    else if(safari) h='<p>V Safari na Macu zvolte v menu <b>Soubor → Přidat do Docku</b>. Aplikace pak poběží ve vlastním okně s ikonou v Docku, i bez internetu.</p>';
    else if(/firefox|fxios/i.test(ua)) h='<p>Firefox instalaci aplikací nepodporuje. Otevřete, prosím, aplikaci v <b>Chrome</b> nebo <b>Edge</b> (Windows, Mac) či v <b>Safari</b> (Mac, iPad) a nainstalujte ji tam. V prohlížeči můžete pracovat i bez instalace.</p>';
    else h='<p>V Chrome nebo Edge klikněte na ikonu instalace vpravo v adresním řádku (monitor se šipkou), případně v menu ⋮ zvolte <b>Nainstalovat Viewfinder Light</b>. Pokud tam volba není, aplikace už je nejspíš nainstalovaná – najdete ji mezi programy.</p>';
    h+='<p class="mut">Po instalaci se aplikace jednou za čas ověří přes váš účet v e-shopu (stačí být občas online). Rozpracovaná scéna se dál ukládá do účtu.</p>';
    $('installBody').innerHTML=h; $('installModal').classList.remove('hide'); }
  btn.onclick=function(){ if(ev){ ev.prompt(); ev.userChoice.then(function(){ ev=null; }); } else help(); };
  $('bInstClose').onclick=function(){ $('installModal').classList.add('hide'); };
  $('installModal').addEventListener('click',function(e){ if(e.target===this) this.classList.add('hide'); });
})();

// start
var saved=null; try{ saved=localStorage.getItem('viewfinder-scene')||localStorage.getItem('lightlab-scene'); }catch(e){}
if(saved){ try{ scene=JSON.parse(saved); fixIds(); }catch(e){ scene=null; } }
if(!scene){ scene=TEMPL.window(); freezeAim(scene); }
var sv='split'; try{ sv=localStorage.getItem('viewfinder-view')||localStorage.getItem('lightlab-view')||'split'; var qq=localStorage.getItem('viewfinder-quality'); if(qq) $('quality').value=qq; $('autoEv').checked=localStorage.getItem('viewfinder-autoev')==='1'; }catch(e){}
try{ if(localStorage.getItem('viewfinder-strip')==='0'||isPhone()){ $('strip').classList.add('collapsed'); $('bStripToggle').textContent='▴'; } }catch(e){} // na telefonu začít se sbalenou lištou cvaků
setView(sv); syncRoom(); fit(); schedule(); snapshot();
cloudLoad(function(d){ if(!d) return; var lts=0; try{ lts=parseInt(localStorage.getItem('viewfinder-ts')||'0',10); }catch(e){} if(!(d.ts>lts+2000)) return; try{ var sc=JSON.parse(d.scene); if(!sc.room||!sc.items) return; scene=sc; fixIds(); sel=null; syncRoom(); props(); fit(); schedule(); }catch(e){} });
})();
