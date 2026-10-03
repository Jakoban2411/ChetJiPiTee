(() => {
  'use strict';
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const mapCanvas = document.querySelector('#minimap');
  const mctx = mapCanvas.getContext('2d');
  const WORLD = { w: 2400, h: 1800 };
  let w, h, dpr, last = 0, started = false, damage = 0, cash = 12840, heat = 0, shake = 0;
  const keys = {}, particles = [], rubble = [];
  const camera = { x: 0, y: 0 };

  const roads = [
    {x:0,y:270,w:2400,h:180},{x:0,y:820,w:2400,h:210},{x:0,y:1420,w:2400,h:170},
    {x:380,y:0,w:190,h:1800},{x:1030,y:0,w:210,h:1800},{x:1810,y:0,w:190,h:1800}
  ];
  const buildings = [];
  const colors = ['#333a3c','#42494a','#2c3235','#4b4146','#354249'];
  [[40,35,300,190],[610,45,370,180],[1270,30,490,200],[2040,40,310,180],[35,500,300,260],[615,490,360,270],[1285,485,470,280],[2035,490,320,275],[30,1080,300,290],[620,1080,355,280],[1285,1080,465,280],[2045,1075,300,300],[40,1630,295,130],[620,1625,360,135],[1280,1625,475,135],[2040,1635,315,125]].forEach((b,i)=>buildings.push({x:b[0],y:b[1],w:b[2],h:b[3],hp:3,maxHp:3,color:colors[i%colors.length],destroyed:false}));
  const props = Array.from({length:46},(_,i)=>({x:90+(i*193)%2220,y:240+(i*317)%1300,r:10+(i%3)*4,hp:1,type:i%3?'crate':'tree',destroyed:false}));
  const vehicleDefs = [
    ['Vortex GT','car','#ff3c7d',86,42],['Bulldog 4x4','car','#d9ff43',82,44],['Metro Compact','car','#42e8ff',72,38],['Nightblade','bike','#e1e1e1',58,22],['Dust Devil','bike','#ff9f32',60,24],['Street Deck','skateboard','#d9ff43',42,13],['Skyhawk','plane','#ff3c7d',104,90],['Seabird','plane','#dfe6e8',96,82],['Wavecutter','boat','#42e8ff',94,42],['Marlin','boat','#ff9f32',86,38],['City Bus','car','#b6c0c2',120,46],['Neon Coupe','car','#985bff',78,39]
  ];
  const vehicles = vehicleDefs.map((v,i)=>({name:v[0],type:v[1],color:v[2],w:v[3],h:v[4],x:180+(i*337)%2100,y:330+(i*229)%1220,angle:(i%4)*Math.PI/2,speed:0,occupied:false}));
  const npcData = [['Rico','Street mechanic','R','Got an eye on a ride? Walk up and take it. I tune everything in this neighborhood.'],['Maya','Fixer','M','The city pays attention when things break. Make enough noise and I have a real job for you.'],['Jax','Local legend','J','Boats are down by the canal, aircraft by the east hangar. Try not to scratch the paint.'],['Nia','Skater','N','That deck is faster than it looks. Hit boost and show this block who owns the pavement.'],['Officer Vale','Off duty','V','I saw nothing. But keep the heat low, unless you enjoy company.'],['Bo','Vendor','B','Come back after the job. I will have something special waiting for you.']];
  const npcs = npcData.map((n,i)=>({name:n[0],role:n[1],letter:n[2],line:n[3],x:300+(i*383)%1900,y:360+(i*271)%1150,vx:0,vy:0,timer:0,color:['#ff3c7d','#42e8ff','#d9ff43','#985bff','#ff9f32','#65db88'][i]}));
  const player = {x:720,y:920,r:15,angle:0,speed:230,vehicle:null};

  function resize(){dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
  addEventListener('resize',resize);resize();
  addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='e'&&!e.repeat) interact();if(e.code==='Space'&&!e.repeat){e.preventDefault();action()}});
  addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  document.querySelector('#startBtn').onclick=()=>{started=true;document.querySelector('#startScreen').classList.add('hidden')};
  document.querySelector('#closeDialogue').onclick=()=>document.querySelector('#dialogue').classList.remove('visible');
  document.querySelector('#collapseBtn').onclick=()=>{const el=document.querySelector('#nearbyList');el.hidden=!el.hidden;document.querySelector('#collapseBtn').textContent=el.hidden?'+':'−'};
  document.querySelector('#soundBtn').onclick=e=>{const b=e.currentTarget.querySelector('b');b.textContent=b.textContent==='ON'?'OFF':'ON'};

  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function nearest(){const origin=player.vehicle||player;let best=null,bd=85;[...npcs,...vehicles].forEach(o=>{const d=dist(origin,o);if(d<bd&&o!==player.vehicle){best=o;bd=d}});return best}
  function interact(){
    if(player.vehicle){const v=player.vehicle;player.x=v.x+Math.cos(v.angle+Math.PI/2)*55;player.y=v.y+Math.sin(v.angle+Math.PI/2)*55;v.occupied=false;player.vehicle=null;return}
    const n=nearest();if(!n)return;
    if('line' in n){document.querySelector('#portrait').textContent=n.letter;document.querySelector('#portrait').style.background=n.color;document.querySelector('#speakerName').textContent=n.name.toUpperCase();document.querySelector('#speakerRole').textContent=n.role.toUpperCase();document.querySelector('#dialogueText').textContent=n.line;document.querySelector('#dialogue').classList.add('visible')}
    else{player.vehicle=n;n.occupied=true;document.querySelector('#dialogue').classList.remove('visible')}
  }
  function action(){
    const o=player.vehicle||player;shake=7;for(let i=0;i<18;i++)particles.push({x:o.x,y:o.y,vx:(Math.random()-.5)*280,vy:(Math.random()-.5)*280,life:.4+Math.random()*.6,color:i%3?'#d9ff43':'#ff3c7d'});
    [...buildings,...props].forEach(b=>{if(!b.destroyed&&dist(o,{x:b.x+(b.w||0)/2,y:b.y+(b.h||0)/2})<(player.vehicle?120:75)){b.hp--;if(b.hp<=0){b.destroyed=true;const value=b.w?650:125;damage+=value;cash+=Math.round(value*.15);heat=Math.min(5,heat+1);for(let i=0;i<12;i++)rubble.push({x:b.x+Math.random()*(b.w||20),y:b.y+Math.random()*(b.h||20),a:Math.random()*6,s:5+Math.random()*14})}}});updateHUD()
  }
  function updateHUD(){document.querySelector('#cash').textContent='$'+cash.toLocaleString();document.querySelector('#damageValue').textContent='$'+damage.toLocaleString()+' / $3,000';document.querySelector('#missionProgress').style.width=Math.min(100,damage/30)+'%';document.querySelector('#heatPips').textContent='◆ '.repeat(heat)+'◇ '.repeat(5-heat);document.querySelector('#heatPips').style.color=heat?'#ff3c7d':'#666';if(damage>=3000){document.querySelector('.mission-card h1').textContent='JOB COMPLETE';document.querySelector('.mission-card p').innerHTML='Maya is impressed. <strong>$2,500 bonus earned.</strong>'}}
  function update(dt){
    if(!started)return;const v=player.vehicle;
    if(v){const accel=(keys.w?1:0)-(keys.s?1:0),turn=(keys.d?1:0)-(keys.a?1:0);const max=v.type==='plane'?520:v.type==='bike'?370:v.type==='skateboard'?290:v.type==='boat'?310:350;v.speed+=(accel*280-v.speed*1.5)*dt;if(keys.shift)v.speed+=accel*190*dt;v.speed=Math.max(-max*.45,Math.min(max,v.speed));v.angle+=turn*dt*2.2*(v.speed>=0?1:-1);v.x+=Math.cos(v.angle)*v.speed*dt;v.y+=Math.sin(v.angle)*v.speed*dt;player.x=v.x;player.y=v.y
    }else{let dx=(keys.d?1:0)-(keys.a?1:0),dy=(keys.s?1:0)-(keys.w?1:0);const l=Math.hypot(dx,dy)||1;const sp=player.speed*(keys.shift?1.65:1);player.x+=dx/l*sp*dt;player.y+=dy/l*sp*dt;if(dx||dy)player.angle=Math.atan2(dy,dx)}
    player.x=Math.max(20,Math.min(WORLD.w-20,player.x));player.y=Math.max(20,Math.min(WORLD.h-20,player.y));if(v){v.x=player.x;v.y=player.y}
    npcs.forEach(n=>{n.timer-=dt;if(n.timer<=0){n.timer=2+Math.random()*4;const a=Math.random()*Math.PI*2;n.vx=Math.cos(a)*22;n.vy=Math.sin(a)*22}n.x+=n.vx*dt;n.y+=n.vy*dt});
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;p.vx*=.96;p.vy*=.96});for(let i=particles.length-1;i>=0;i--)if(particles[i].life<=0)particles.splice(i,1);
    const target=player.vehicle||player;camera.x+=(target.x-w/2-camera.x)*.09;camera.y+=(target.y-h/2-camera.y)*.09;camera.x=Math.max(0,Math.min(WORLD.w-w,camera.x));camera.y=Math.max(0,Math.min(WORLD.h-h,camera.y));shake*=.85;updateNearby()
  }
  function updateNearby(){const n=nearest(),el=document.querySelector('#interaction');if(n){el.classList.add('visible');document.querySelector('#interactionType').textContent='line' in n?'TALK':'ENTER VEHICLE';document.querySelector('#interactionText').textContent=('line' in n?'Talk to ':'Drive ')+n.name}else el.classList.remove('visible');const o=player.vehicle||player;const list=[...vehicles.map(v=>({...v,label:v.type.toUpperCase()})),...npcs.map(v=>({...v,label:'PERSON'}))].sort((a,b)=>dist(o,a)-dist(o,b)).slice(0,3);document.querySelector('#nearbyList').innerHTML=list.map(x=>`<div class="nearby-item"><i>${x.label[0]}</i><div><b>${x.name}</b><small>${x.label} // ${Math.round(dist(o,x)/3)}M</small></div></div>`).join('')}
  function rect(x,y,w,h,fill){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h)}
  function drawWorld(){
    ctx.save();ctx.translate(-camera.x+(Math.random()-.5)*shake,-camera.y+(Math.random()-.5)*shake);rect(0,0,WORLD.w,WORLD.h,'#202728');
    ctx.strokeStyle='rgba(160,180,176,.08)';ctx.lineWidth=1;for(let x=0;x<WORLD.w;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD.h);ctx.stroke()}for(let y=0;y<WORLD.h;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD.w,y);ctx.stroke()}
    roads.forEach(r=>{rect(r.x,r.y,r.w,r.h,'#151a1c');ctx.save();ctx.setLineDash([22,28]);ctx.strokeStyle='#58605f';ctx.lineWidth=2;ctx.beginPath();if(r.w>r.h){ctx.moveTo(r.x,r.y+r.h/2);ctx.lineTo(r.x+r.w,r.y+r.h/2)}else{ctx.moveTo(r.x+r.w/2,r.y);ctx.lineTo(r.x+r.w/2,r.y+r.h)}ctx.stroke();ctx.restore()});
    buildings.forEach((b,i)=>{if(b.destroyed)return;ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(b.x+12,b.y+14,b.w,b.h);rect(b.x,b.y,b.w,b.h,b.color);ctx.strokeStyle='rgba(255,255,255,.15)';ctx.strokeRect(b.x,b.y,b.w,b.h);for(let x=b.x+24;x<b.x+b.w-15;x+=42)for(let y=b.y+20;y<b.y+b.h-15;y+=38)rect(x,y,17,9,(x+y+i)%3?'#64715e':'#273033');ctx.fillStyle='rgba(0,0,0,.28)';ctx.font='900 28px Barlow Condensed';ctx.fillText(['NOIR','KARMA','VOID','HAVOC'][i%4],b.x+20,b.y+b.h-18)});
    rubble.forEach(r=>{ctx.save();ctx.translate(r.x,r.y);ctx.rotate(r.a);rect(-r.s/2,-r.s/3,r.s,r.s*.65,'#565c5b');ctx.restore()});props.forEach(p=>{if(p.destroyed)return;if(p.type==='tree'){ctx.fillStyle='#243d32';ctx.beginPath();ctx.arc(p.x,p.y,p.r*1.7,0,7);ctx.fill();rect(p.x-3,p.y,6,p.r*2,'#5b4434')}else{rect(p.x-p.r,p.y-p.r,p.r*2,p.r*2,'#9f6635');ctx.strokeStyle='#ce9764';ctx.strokeRect(p.x-p.r,p.y-p.r,p.r*2,p.r*2)}});
    vehicles.forEach(drawVehicle);npcs.forEach(drawNPC);if(!player.vehicle)drawPlayer();particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.fillRect(p.x-3,p.y-3,6,6);ctx.globalAlpha=1});ctx.restore()
  }
  function drawVehicle(v){ctx.save();ctx.translate(v.x,v.y);ctx.rotate(v.angle);ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(-v.w/2+5,-v.h/2+7,v.w,v.h);ctx.fillStyle=v.color;if(v.type==='bike'||v.type==='skateboard'){ctx.fillRect(-v.w/2,-v.h/3,v.w,v.h*.66);ctx.fillStyle='#111';ctx.beginPath();ctx.arc(-v.w*.3,-v.h/2,7,0,7);ctx.arc(v.w*.3,-v.h/2,7,0,7);ctx.fill()}else if(v.type==='plane'){ctx.beginPath();ctx.moveTo(v.w/2,0);ctx.lineTo(-v.w/2,-v.h/2);ctx.lineTo(-v.w*.2,0);ctx.lineTo(-v.w/2,v.h/2);ctx.closePath();ctx.fill()}else if(v.type==='boat'){ctx.beginPath();ctx.moveTo(v.w/2,0);ctx.lineTo(v.w*.2,-v.h/2);ctx.lineTo(-v.w/2,-v.h*.35);ctx.lineTo(-v.w/2,v.h*.35);ctx.lineTo(v.w*.2,v.h/2);ctx.closePath();ctx.fill();rect(-10,-v.h*.3,30,v.h*.6,'#162126')}else{ctx.fillRect(-v.w/2,-v.h/2,v.w,v.h);rect(-v.w*.18,-v.h*.38,v.w*.42,v.h*.76,'#142126');rect(v.w*.34,-v.h*.4,8,v.h*.8,'#f4f0be')}if(v.occupied){ctx.strokeStyle='#d9ff43';ctx.lineWidth=3;ctx.strokeRect(-v.w/2-5,-v.h/2-5,v.w+10,v.h+10)}ctx.restore()}
  function drawNPC(n){ctx.save();ctx.translate(n.x,n.y);ctx.fillStyle='rgba(0,0,0,.4)';ctx.beginPath();ctx.ellipse(3,12,12,6,0,0,7);ctx.fill();ctx.fillStyle=n.color;ctx.beginPath();ctx.arc(0,0,10,0,7);ctx.fill();rect(-7,7,14,19,n.color);ctx.fillStyle='#fff';ctx.font='700 8px Inter';ctx.textAlign='center';ctx.fillText(n.name.toUpperCase(),0,-17);ctx.restore()}
  function drawPlayer(){ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);ctx.fillStyle='#d9ff43';ctx.beginPath();ctx.arc(0,0,player.r,0,7);ctx.fill();ctx.fillStyle='#0c1010';ctx.beginPath();ctx.moveTo(17,0);ctx.lineTo(4,-6);ctx.lineTo(4,6);ctx.fill();ctx.restore()}
  function drawMap(){mctx.setTransform(1,0,0,1,0,0);mctx.fillStyle='#101517';mctx.fillRect(0,0,220,220);const sx=220/WORLD.w,sy=220/WORLD.h;mctx.fillStyle='#30393a';roads.forEach(r=>mctx.fillRect(r.x*sx,r.y*sy,r.w*sx,r.h*sy));mctx.fillStyle='#485152';buildings.filter(b=>!b.destroyed).forEach(b=>mctx.fillRect(b.x*sx,b.y*sy,b.w*sx,b.h*sy));vehicles.forEach(v=>{mctx.fillStyle=v.color;mctx.fillRect(v.x*sx-1,v.y*sy-1,3,3)});mctx.fillStyle='#d9ff43';mctx.beginPath();mctx.arc(player.x*sx,player.y*sy,4,0,7);mctx.fill();mctx.strokeStyle='rgba(217,255,67,.4)';mctx.beginPath();mctx.arc(player.x*sx,player.y*sy,14,0,7);mctx.stroke()}
  function frame(t){const dt=Math.min(.033,(t-last)/1000||0);last=t;update(dt);ctx.clearRect(0,0,w,h);drawWorld();drawMap();requestAnimationFrame(frame)}
  updateHUD();updateNearby();requestAnimationFrame(frame);
})();
