(() => {
  'use strict';

  const THREE = window.THREE;
  if (!THREE) {
    document.querySelector('#startBtn').textContent = '3D ENGINE FAILED TO LOAD';
    return;
  }

  const canvas = document.querySelector('#game');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x99b8c8);
  scene.fog = new THREE.FogExp2(0x99b8c8, 0.0027);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 1400);
  const clock = new THREE.Clock();
  const keys = {};
  const destructibles = [];
  const debris = [];
  const vehicles = [];
  const npcs = [];
  let started = false;
  let damage = 0;
  let cash = 12840;
  let heat = 0;
  let activeVehicle = null;
  let nearby = null;

  const mat = (color, roughness = 0.75, metalness = 0.05) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const box = (w, h, d, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  scene.add(new THREE.HemisphereLight(0xcde9ff, 0x48533a, 2.25));
  const sun = new THREE.DirectionalLight(0xfff0d0, 4.2);
  sun.position.set(-130, 210, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -260;
  sun.shadow.camera.right = sun.shadow.camera.top = 260;
  sun.shadow.camera.far = 650;
  scene.add(sun);

  const ground = box(500, 2, 400, mat(0x35443c));
  ground.position.y = -1;
  scene.add(ground);

  // Roads, sidewalks, markings and a waterfront make the city visibly three-dimensional.
  const roadMat = mat(0x20262a, 0.96);
  const roads = [
    [0, 0, 500, 38], [0, -125, 500, 34], [0, 125, 500, 34],
    [-150, 0, 34, 400], [20, 0, 38, 400], [180, 0, 34, 400]
  ];
  roads.forEach(([x, z, w, d]) => {
    const road = box(w, 0.3, d, roadMat);
    road.position.set(x, 0.1, z);
    scene.add(road);
    const horizontal = w > d;
    const length = horizontal ? w : d;
    for (let n = -length / 2 + 8; n < length / 2; n += 15) {
      const stripe = box(horizontal ? 7 : 0.4, 0.08, horizontal ? 0.4 : 7, mat(0xd8d4a0));
      stripe.position.set(x + (horizontal ? n : 0), 0.3, z + (horizontal ? 0 : n));
      scene.add(stripe);
    }
  });

  const water = box(500, 0.6, 42, new THREE.MeshPhysicalMaterial({
    color: 0x1e8195, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.82
  }));
  water.position.set(0, 0, -183);
  scene.add(water);

  const buildingLots = [
    [-220,-145,45,42],[-92,-148,78,38],[90,-148,95,39],[222,-148,42,38],
    [-215,-65,54,58],[-86,-65,82,52],[94,-64,102,55],[220,-64,45,52],
    [-215,62,55,62],[-87,62,82,60],[96,63,100,60],[220,62,44,58],
    [-215,160,55,42],[-87,160,82,40],[96,160,100,40],[220,160,44,40]
  ];
  const buildingColors = [0x37474f, 0x55434f, 0x43535b, 0x514c3e, 0x3f4d46];
  buildingLots.forEach(([x, z, w, d], index) => {
    const height = 20 + (index * 17) % 54;
    const group = new THREE.Group();
    const body = box(w, height, d, mat(buildingColors[index % buildingColors.length], 0.8));
    body.position.y = height / 2;
    group.add(body);
    const windowMat = mat(index % 3 ? 0x9bc3b6 : 0xd6b45b, 0.4, 0.2);
    for (let floor = 5; floor < height - 3; floor += 7) {
      for (let wx = -w / 2 + 5; wx < w / 2 - 2; wx += 9) {
        const pane = box(3.8, 2.6, 0.25, windowMat);
        pane.position.set(wx, floor, d / 2 + 0.15);
        pane.castShadow = false;
        group.add(pane);
      }
    }
    const roof = box(w + 1, 1.2, d + 1, mat(0x242a2c));
    roof.position.y = height + 0.6;
    group.add(roof);
    group.position.set(x, 0, z);
    group.userData = { type: 'building', hp: 3, value: 650, width: w, depth: d, height };
    destructibles.push(group);
    scene.add(group);
  });

  // Street furniture is also destructible.
  for (let i = 0; i < 52; i++) {
    const isTree = i % 3 === 0;
    const prop = new THREE.Group();
    if (isTree) {
      const trunk = box(1.3, 7, 1.3, mat(0x65452e));
      trunk.position.y = 3.5;
      prop.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(4.2, 1), mat(0x315f3e));
      crown.position.y = 9;
      crown.castShadow = true;
      prop.add(crown);
    } else {
      const crate = box(4, 4, 4, mat(0x9e6438));
      crate.position.y = 2;
      prop.add(crate);
    }
    prop.position.set(-235 + (i * 73) % 470, 0, -165 + (i * 97) % 330);
    prop.userData = { type: isTree ? 'tree' : 'crate', hp: 1, value: 125, width: 4, depth: 4, height: isTree ? 10 : 4 };
    destructibles.push(prop);
    scene.add(prop);
  }

  function createVehicle(name, type, color, x, z, rotation = 0) {
    const group = new THREE.Group();
    const paint = mat(color, 0.32, 0.62);
    const dark = mat(0x111820, 0.3, 0.7);
    let width = 4.6, length = 9;
    if (type === 'bike') { width = 1.5; length = 5; }
    if (type === 'skateboard') { width = 1.2; length = 3.5; }
    if (type === 'plane') { width = 16; length = 13; }
    if (type === 'boat') { width = 5; length = 12; }

    if (type === 'plane') {
      const fuselage = box(2.8, 2.4, length, paint); fuselage.position.y = 2.6; group.add(fuselage);
      const wing = box(width, 0.45, 3.2, paint); wing.position.y = 2.5; group.add(wing);
      const tail = box(5.5, 0.4, 2, paint); tail.position.set(0, 3, 5); group.add(tail);
    } else if (type === 'boat') {
      const hull = box(width, 2, length, paint); hull.position.y = 1.2; group.add(hull);
      const cabin = box(width * 0.65, 2, 4, dark); cabin.position.set(0, 3, 1); group.add(cabin);
    } else {
      const body = box(width, type === 'skateboard' ? 0.35 : 1.6, length, paint);
      body.position.y = type === 'skateboard' ? 0.55 : 1.5;
      group.add(body);
      if (type === 'car') {
        const cabin = box(width * 0.78, 1.7, length * 0.45, dark); cabin.position.set(0, 2.9, 0.5); group.add(cabin);
      }
      const wheels = type === 'bike' ? [[0,0,-1.8],[0,0,1.8]] : [[-width*.45,0,-length*.32],[width*.45,0,-length*.32],[-width*.45,0,length*.32],[width*.45,0,length*.32]];
      wheels.forEach(([wx,,wz]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.5, 12), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.75, wz);
        wheel.castShadow = true;
        group.add(wheel);
      });
    }
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    group.userData = { name, type, speed: 0, maxSpeed: type === 'plane' ? 72 : type === 'skateboard' ? 34 : type === 'bike' ? 52 : 46 };
    vehicles.push(group);
    scene.add(group);
  }

  [
    ['Vortex GT','car',0xff3c7d,-125,18], ['Bulldog 4x4','car',0xd9ff43,-40,12],
    ['Metro Compact','car',0x42e8ff,70,-12], ['Nightblade','bike',0xe1e1e1,135,14],
    ['Dust Devil','bike',0xff9f32,-170,-108], ['Street Deck','skateboard',0xd9ff43,-18,92],
    ['Skyhawk','plane',0xff3c7d,205,-110], ['Seabird','plane',0xdfe6e8,218,-25],
    ['Wavecutter','boat',0x42e8ff,-62,-183], ['Marlin','boat',0xff9f32,88,-183],
    ['City Bus','car',0xb6c0c2,-205,114], ['Neon Coupe','car',0x985bff,58,127]
  ].forEach((v, i) => createVehicle(...v, (i % 4) * Math.PI / 2));

  function createNPC(name, role, line, color, x, z) {
    const group = new THREE.Group();
    const body = box(1.4, 3.2, 1, mat(color)); body.position.y = 2.5; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 10), mat(0xd39b78));
    head.position.y = 4.7; head.castShadow = true; group.add(head);
    group.position.set(x, 0, z);
    group.userData = { name, role, line, color, direction: Math.random() * Math.PI * 2, timer: 0 };
    npcs.push(group); scene.add(group);
  }
  [
    ['Rico','Street mechanic','Anything with an engine is yours if you can get to it.',0xff3c7d,-136,8],
    ['Maya','Fixer','Make enough noise and I have a real job for you.',0x42e8ff,9,92],
    ['Jax','Local legend','Boats are at the canal. Aircraft are by the east hangar.',0xd9ff43,165,-14],
    ['Nia','Skater','That deck is faster than it looks. Hit boost.',0x985bff,-12,110],
    ['Officer Vale','Off duty','Keep the heat low, unless you enjoy company.',0xff9f32,-162,42],
    ['Bo','Vendor','Come back after the job. I will have something special.',0x65db88,145,109]
  ].forEach(args => createNPC(...args));

  const player = new THREE.Group();
  const playerBody = box(1.8, 3.2, 1.4, mat(0xd9ff43)); playerBody.position.y = 2.4; player.add(playerBody);
  const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.82, 16, 10), mat(0xb6785c));
  playerHead.position.y = 4.7; playerHead.castShadow = true; player.add(playerHead);
  player.position.set(-110, 0, 4);
  scene.add(player);

  const minimap = document.querySelector('#minimap').getContext('2d');
  function horizontalDistance(a, b) { return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z); }

  function interact() {
    document.querySelector('#dialogue').classList.remove('visible');
    if (activeVehicle) {
      player.position.copy(activeVehicle.position).add(new THREE.Vector3(5, 0, 0));
      player.visible = true;
      activeVehicle = null;
      return;
    }
    if (!nearby) return;
    if (npcs.includes(nearby)) {
      const d = nearby.userData;
      document.querySelector('#portrait').textContent = d.name[0];
      document.querySelector('#portrait').style.background = `#${d.color.toString(16).padStart(6, '0')}`;
      document.querySelector('#speakerName').textContent = d.name.toUpperCase();
      document.querySelector('#speakerRole').textContent = d.role.toUpperCase();
      document.querySelector('#dialogueText').textContent = d.line;
      document.querySelector('#dialogue').classList.add('visible');
    } else {
      activeVehicle = nearby;
      player.visible = false;
    }
  }

  function destroyNearby() {
    const actor = activeVehicle || player;
    const radius = activeVehicle ? 15 : 7;
    destructibles.forEach(object => {
      if (!object.visible || horizontalDistance(actor, object) > radius) return;
      object.userData.hp--;
      if (object.userData.hp > 0) {
        object.rotation.z += 0.035;
        return;
      }
      object.visible = false;
      damage += object.userData.value;
      cash += Math.round(object.userData.value * 0.15);
      heat = Math.min(5, heat + 1);
      for (let i = 0; i < 14; i++) {
        const chunk = box(1 + Math.random() * 2.5, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5, mat(i % 3 ? 0x555a58 : 0xd9ff43));
        chunk.position.copy(object.position).add(new THREE.Vector3((Math.random() - .5) * object.userData.width, 4 + Math.random() * 8, (Math.random() - .5) * object.userData.depth));
        chunk.userData.velocity = new THREE.Vector3((Math.random() - .5) * 18, 8 + Math.random() * 15, (Math.random() - .5) * 18);
        chunk.userData.life = 4;
        debris.push(chunk); scene.add(chunk);
      }
      updateHUD();
    });
  }

  function updateHUD() {
    document.querySelector('#cash').textContent = `$${cash.toLocaleString()}`;
    document.querySelector('#damageValue').textContent = `$${damage.toLocaleString()} / $3,000`;
    document.querySelector('#missionProgress').style.width = `${Math.min(100, damage / 30)}%`;
    const pips = document.querySelector('#heatPips');
    pips.textContent = `${'◆ '.repeat(heat)}${'◇ '.repeat(5 - heat)}`;
    pips.style.color = heat ? '#ff3c7d' : '#666';
    if (damage >= 3000) {
      document.querySelector('.mission-card h1').textContent = 'JOB COMPLETE';
      document.querySelector('.mission-card p').innerHTML = 'Maya is impressed. <strong>$2,500 bonus earned.</strong>';
    }
  }

  function updateNearby() {
    const actor = activeVehicle || player;
    const entities = [...vehicles, ...npcs].filter(item => item !== activeVehicle);
    entities.sort((a, b) => horizontalDistance(actor, a) - horizontalDistance(actor, b));
    nearby = horizontalDistance(actor, entities[0]) < 11 ? entities[0] : null;
    const prompt = document.querySelector('#interaction');
    prompt.classList.toggle('visible', Boolean(nearby) || Boolean(activeVehicle));
    if (activeVehicle) {
      document.querySelector('#interactionType').textContent = 'EXIT VEHICLE';
      document.querySelector('#interactionText').textContent = `Leave ${activeVehicle.userData.name}`;
    } else if (nearby) {
      const isNPC = npcs.includes(nearby);
      document.querySelector('#interactionType').textContent = isNPC ? 'TALK' : 'ENTER VEHICLE';
      document.querySelector('#interactionText').textContent = `${isNPC ? 'Talk to' : 'Drive'} ${nearby.userData.name}`;
    }
    document.querySelector('#nearbyList').innerHTML = entities.slice(0, 3).map(item => {
      const label = npcs.includes(item) ? 'PERSON' : item.userData.type.toUpperCase();
      return `<div class="nearby-item"><i>${label[0]}</i><div><b>${item.userData.name}</b><small>${label} // ${Math.round(horizontalDistance(actor, item))}M</small></div></div>`;
    }).join('');
  }

  function updateMinimap() {
    minimap.fillStyle = '#101517'; minimap.fillRect(0, 0, 220, 220);
    minimap.fillStyle = '#3c4648';
    roads.forEach(([x,z,w,d]) => minimap.fillRect((x-w/2+250)*.44, (z-d/2+200)*.55, w*.44, d*.55));
    minimap.fillStyle = '#667071';
    destructibles.filter(x => x.visible && x.userData.type === 'building').forEach(b => minimap.fillRect((b.position.x-b.userData.width/2+250)*.44, (b.position.z-b.userData.depth/2+200)*.55, b.userData.width*.44, b.userData.depth*.55));
    vehicles.forEach(v => { minimap.fillStyle = '#42e8ff'; minimap.fillRect((v.position.x+250)*.44-2, (v.position.z+200)*.55-2, 4, 4); });
    const actor = activeVehicle || player;
    minimap.fillStyle = '#d9ff43'; minimap.beginPath(); minimap.arc((actor.position.x+250)*.44, (actor.position.z+200)*.55, 5, 0, Math.PI*2); minimap.fill();
  }

  function update(dt) {
    if (!started) return;
    const forward = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    const turn = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);
    let actor = player;
    if (activeVehicle) {
      actor = activeVehicle;
      const data = actor.userData;
      data.speed += (forward * (keys.shift ? 46 : 28) - data.speed * 1.3) * dt;
      data.speed = THREE.MathUtils.clamp(data.speed, -data.maxSpeed * .35, data.maxSpeed);
      actor.rotation.y += turn * dt * 1.65 * (data.speed >= 0 ? 1 : -1);
      actor.translateZ(-data.speed * dt);
      if (data.type === 'plane' && Math.abs(data.speed) > 38) actor.position.y = THREE.MathUtils.lerp(actor.position.y, keys.shift ? 34 : 16, dt * 1.2);
      else if (data.type !== 'plane') actor.position.y = 0;
    } else {
      const sideways = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      const move = new THREE.Vector3(sideways, 0, -forward);
      if (move.lengthSq()) {
        move.normalize();
        player.position.addScaledVector(move, dt * (keys.shift ? 28 : 17));
        player.rotation.y = Math.atan2(-move.x, -move.z);
      }
    }
    actor.position.x = THREE.MathUtils.clamp(actor.position.x, -245, 245);
    actor.position.z = THREE.MathUtils.clamp(actor.position.z, -195, 195);

    npcs.forEach(npc => {
      npc.userData.timer -= dt;
      if (npc.userData.timer < 0) { npc.userData.timer = 2 + Math.random() * 4; npc.userData.direction += (Math.random() - .5) * 2.5; }
      npc.rotation.y = npc.userData.direction;
      npc.translateZ(dt * 1.2);
    });
    for (let i = debris.length - 1; i >= 0; i--) {
      const chunk = debris[i];
      chunk.userData.velocity.y -= 24 * dt;
      chunk.position.addScaledVector(chunk.userData.velocity, dt);
      chunk.rotation.x += dt * 4; chunk.rotation.z += dt * 3;
      if (chunk.position.y < .5) { chunk.position.y = .5; chunk.userData.velocity.multiplyScalar(.4); }
      chunk.userData.life -= dt;
      if (chunk.userData.life < 0) { scene.remove(chunk); debris.splice(i, 1); }
    }

    const cameraOffset = activeVehicle && activeVehicle.userData.type === 'plane' ? new THREE.Vector3(0, 22, 37) : new THREE.Vector3(0, 15, 24);
    cameraOffset.applyQuaternion(actor.quaternion);
    camera.position.lerp(actor.position.clone().add(cameraOffset), 1 - Math.pow(0.001, dt));
    camera.lookAt(actor.position.clone().add(new THREE.Vector3(0, activeVehicle ? 3 : 2.8, 0)));
    updateNearby(); updateMinimap();
  }

  addEventListener('keydown', event => {
    keys[event.key.toLowerCase()] = true;
    if (event.key.toLowerCase() === 'e' && !event.repeat) interact();
    if (event.code === 'Space' && !event.repeat) { event.preventDefault(); destroyNearby(); }
  });
  addEventListener('keyup', event => { keys[event.key.toLowerCase()] = false; });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  });
  document.querySelector('#startBtn').onclick = () => { started = true; document.querySelector('#startScreen').classList.add('hidden'); };
  document.querySelector('#closeDialogue').onclick = () => document.querySelector('#dialogue').classList.remove('visible');
  document.querySelector('#collapseBtn').onclick = event => { const list = document.querySelector('#nearbyList'); list.hidden = !list.hidden; event.currentTarget.textContent = list.hidden ? '+' : '−'; };
  document.querySelector('#soundBtn').onclick = event => { const label = event.currentTarget.querySelector('b'); label.textContent = label.textContent === 'ON' ? 'OFF' : 'ON'; };

  camera.position.set(-110, 18, 28);
  updateHUD(); updateNearby(); updateMinimap();
  renderer.setAnimationLoop(() => { update(Math.min(clock.getDelta(), 0.04)); renderer.render(scene, camera); });
})();
