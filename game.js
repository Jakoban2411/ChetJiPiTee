(() => {
  'use strict';

  const THREE = window.THREE;
  if (!THREE) {
    document.querySelector('#startBtn').textContent = '3D ENGINE FAILED TO LOAD';
    return;
  }

  const canvas = document.querySelector('#game');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2a07c);
  scene.fog = new THREE.FogExp2(0xd99086, 0.00225);

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
  const smokeParticles = [];
  const waterRipples = [];
  const staticColliders = [];
  const colliderHelpers = [];
  let started = false;
  let damage = 0;
  let cash = 12840;
  let heat = 0;
  let activeVehicle = null;
  let nearby = null;
  let cameraYaw = 0;
  let cameraPitch = 0.42;
  let physicsAccumulator = 0;
  const FIXED_STEP = 1 / 60;

  // Deterministic fixed-step physics. Gameplay collision never depends on frame rate.
  const physics = {
    gravity: -30,
    addBox(object, halfX, halfZ, destructible = null) {
      const collider = { object, halfX, halfZ, destructible, enabled: true };
      staticColliders.push(collider);
      const helper = new THREE.Box3Helper(new THREE.Box3(), 0x42e8ff);
      helper.visible = false; helper.material.transparent = true; helper.material.opacity = .45;
      collider.helper = helper; colliderHelpers.push(helper); scene.add(helper);
      return collider;
    },
    sync(collider) {
      const p = collider.object.position;
      collider.minX = p.x - collider.halfX; collider.maxX = p.x + collider.halfX;
      collider.minZ = p.z - collider.halfZ; collider.maxZ = p.z + collider.halfZ;
      collider.helper.box.min.set(collider.minX, 0, collider.minZ);
      collider.helper.box.max.set(collider.maxX, collider.destructible?.userData.height || 5, collider.maxZ);
    },
    resolveCircle(body, radius) {
      let hit = null;
      for (const collider of staticColliders) {
        if (!collider.enabled || collider.destructible?.visible === false) continue;
        const closestX = THREE.MathUtils.clamp(body.position.x, collider.minX, collider.maxX);
        const closestZ = THREE.MathUtils.clamp(body.position.z, collider.minZ, collider.maxZ);
        let dx = body.position.x - closestX, dz = body.position.z - closestZ;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= radius * radius) continue;
        let distance = Math.sqrt(distanceSq);
        if (distance < .0001) {
          const left = Math.abs(body.position.x - collider.minX), right = Math.abs(collider.maxX - body.position.x);
          const top = Math.abs(body.position.z - collider.minZ), bottom = Math.abs(collider.maxZ - body.position.z);
          const edge = Math.min(left, right, top, bottom);
          if (edge === left) { dx = -1; dz = 0; distance = 1; }
          else if (edge === right) { dx = 1; dz = 0; distance = 1; }
          else if (edge === top) { dx = 0; dz = -1; distance = 1; }
          else { dx = 0; dz = 1; distance = 1; }
        }
        const penetration = radius - distance;
        body.position.x += dx / distance * penetration;
        body.position.z += dz / distance * penetration;
        hit = collider;
      }
      body.position.x = THREE.MathUtils.clamp(body.position.x, -245 + radius, 245 - radius);
      body.position.z = THREE.MathUtils.clamp(body.position.z, -195 + radius, 195 - radius);
      return hit;
    }
  };

  const mat = (color, roughness = 0.75, metalness = 0.05) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const box = (w, h, d, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  scene.add(new THREE.HemisphereLight(0xffcdb8, 0x304968, 2.4));
  const sun = new THREE.DirectionalLight(0xffc58f, 4.8);
  sun.position.set(-170, 125, -120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -260;
  sun.shadow.camera.right = sun.shadow.camera.top = 260;
  sun.shadow.camera.far = 650;
  scene.add(sun);

  // A warm coastal sky gives the city the saturated, cinematic Florida atmosphere
  // used by the visual reference without copying any branded art or assets.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(650, 32, 18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { topColor: { value: new THREE.Color(0x557ab4) }, horizonColor: { value: new THREE.Color(0xff947d) }, bottomColor: { value: new THREE.Color(0x3d5572) } },
      vertexShader: 'varying vec3 worldPos; void main(){ worldPos=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor; varying vec3 worldPos; void main(){ float h=normalize(worldPos).y; vec3 c=mix(horizonColor,topColor,smoothstep(0.0,.58,h)); c=mix(bottomColor,c,smoothstep(-.35,.05,h)); gl_FragColor=vec4(c,1.0); }'
    })
  );
  scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(12, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffd2a1, fog: false }));
  sunDisc.position.set(-260, 90, -320);
  scene.add(sunDisc);

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

  const waterGeometry = new THREE.PlaneGeometry(500, 42, 80, 10);
  waterGeometry.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeometry, new THREE.MeshPhysicalMaterial({
    color: 0x168aa5, roughness: 0.12, metalness: 0.18, transparent: true,
    opacity: 0.82, transmission: 0.08, clearcoat: 0.7
  }));
  water.position.set(0, 0.35, -183);
  water.receiveShadow = true;
  scene.add(water);
  const baseWaterPositions = Float32Array.from(waterGeometry.attributes.position.array);

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
    physics.sync(physics.addBox(group, w / 2, d / 2, group));
  });

  // Street furniture is also destructible.
  for (let i = 0; i < 52; i++) {
    const isTree = i % 3 === 0;
    const prop = new THREE.Group();
    if (isTree) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.55, .9, 11, 8), mat(0x70452d));
      trunk.position.y = 5.5; trunk.rotation.z = (i % 2 ? 1 : -1) * .055; trunk.castShadow = true;
      prop.add(trunk);
      for (let leaf = 0; leaf < 8; leaf++) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(1.05, 8.5, 5), mat(leaf % 2 ? 0x287345 : 0x36965c));
        frond.position.y = 11; frond.rotation.z = Math.PI / 2.7; frond.rotation.y = leaf * Math.PI / 4; frond.translateY(2.7); frond.castShadow = true; prop.add(frond);
      }
    } else {
      const crate = box(4, 4, 4, mat(0x9e6438));
      crate.position.y = 2;
      prop.add(crate);
    }
    prop.position.set(-235 + (i * 73) % 470, 0, -165 + (i * 97) % 330);
    prop.userData = { type: isTree ? 'tree' : 'crate', hp: 1, value: 125, width: 4, depth: 4, height: isTree ? 10 : 4 };
    destructibles.push(prop);
    scene.add(prop);
    physics.sync(physics.addBox(prop, isTree ? 1.2 : 2, isTree ? 1.2 : 2, prop));
  }

  // Neon storefronts and streetlights add readable nightlife landmarks.
  const neonColors = [0xff4f9a, 0x4de9ff, 0xffb347, 0xbaff56];
  buildingLots.forEach(([x, z, w, d], index) => {
    if (index % 2) return;
    const signMaterial = new THREE.MeshStandardMaterial({ color: neonColors[index % neonColors.length], emissive: neonColors[index % neonColors.length], emissiveIntensity: 3 });
    const sign = box(Math.min(w * .58, 25), 3.2, .35, signMaterial);
    sign.position.set(x, 6 + index % 4, z + d / 2 + .5);
    scene.add(sign);
  });
  for (let z = -150; z <= 150; z += 50) {
    [-166, 36, 164].forEach(x => {
      const lamp = new THREE.Group();
      const pole = box(.35, 9, .35, mat(0x222a32, .4, .75)); pole.position.y = 4.5; lamp.add(pole);
      if (x === 36) { const bulb = new THREE.PointLight(0xffb6d7, 10, 22, 2); bulb.position.y = 9; lamp.add(bulb); }
      const globe = new THREE.Mesh(new THREE.SphereGeometry(.6, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffd1e4 })); globe.position.y = 9; lamp.add(globe);
      lamp.position.set(x, 0, z); scene.add(lamp);
    });
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

    const wheels = [];
    if (type === 'plane') {
      const fuselage = box(2.8, 2.4, length, paint); fuselage.position.y = 2.6; group.add(fuselage);
      const wing = box(width, 0.45, 3.2, paint); wing.position.y = 2.5; group.add(wing);
      const tail = box(5.5, 0.4, 2, paint); tail.position.set(0, 3, 5); group.add(tail);
      const propeller = box(5, 0.25, 0.3, dark); propeller.position.set(0, 2.6, -length / 2 - .4); propeller.name = 'propeller'; group.add(propeller);
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
      const wheelPoints = type === 'bike' ? [[0,0,-1.8],[0,0,1.8]] : [[-width*.45,0,-length*.32],[width*.45,0,-length*.32],[-width*.45,0,length*.32],[width*.45,0,length*.32]];
      wheelPoints.forEach(([wx,,wz]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.5, 12), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.75, wz);
        wheel.castShadow = true;
        group.add(wheel);
        wheels.push(wheel);
      });
      if (type === 'car') {
        const glass = new THREE.MeshPhysicalMaterial({ color: 0x82aaba, roughness: .12, metalness: .25, transparent: true, opacity: .72 });
        const windshield = box(width * .7, 1.2, .18, glass); windshield.position.set(0, 3, -length * .23); windshield.rotation.x = -.25; group.add(windshield);
        [-1, 1].forEach(side => { const lamp = box(.75, .45, .15, mat(0xfff4bd, .2)); lamp.position.set(side * width * .3, 1.65, -length / 2 - .08); group.add(lamp); });
      }
    }
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    group.userData = { name, type, speed: 0, wheels, smokeTimer: 0, collisionRadius: Math.max(width, length) * .38, maxSpeed: type === 'plane' ? 72 : type === 'skateboard' ? 34 : type === 'bike' ? 52 : 46 };
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

  function createFaceTexture(skin, hair, eye) {
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = faceCanvas.height = 128;
    const face = faceCanvas.getContext('2d');
    const texture = new THREE.CanvasTexture(faceCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { faceCanvas, face, texture, skin, hair, eye, blink: 0, mouth: 0, lastPaint: -1 };
  }

  function paintFace(state) {
    const { face, skin, hair, eye } = state;
    face.fillStyle = skin; face.fillRect(0, 0, 128, 128);
    face.fillStyle = hair; face.fillRect(0, 0, 128, 28);
    face.beginPath(); face.arc(20, 25, 24, 0, Math.PI * 2); face.arc(108, 25, 24, 0, Math.PI * 2); face.fill();
    face.fillStyle = '#3d241c'; face.fillRect(28, 50, 25, 4); face.fillRect(75, 50, 25, 4);
    const eyeHeight = state.blink > .72 ? 2 : 12;
    face.fillStyle = '#fff'; face.fillRect(31, 56, 20, eyeHeight); face.fillRect(77, 56, 20, eyeHeight);
    face.fillStyle = eye; face.fillRect(39, 57, 7, eyeHeight); face.fillRect(82, 57, 7, eyeHeight);
    face.fillStyle = '#8b4b45';
    face.beginPath(); face.ellipse(64, 94, 15, 3 + state.mouth * 7, 0, 0, Math.PI * 2); face.fill();
    state.texture.needsUpdate = true;
  }

  function createCharacter(name, color, skin = '#c98967', hair = '#241713', eye = '#293b38') {
    const group = new THREE.Group();
    const body = box(1.55, 2.5, .8, mat(color)); body.position.y = 3.25; group.add(body);
    const faceState = createFaceTexture(skin, hair, eye); paintFace(faceState);
    const headMaterials = [mat(skin), mat(skin), mat(hair), mat(skin), new THREE.MeshStandardMaterial({ map: faceState.texture }), mat(skin)];
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.5, 1.15), headMaterials);
    head.position.set(0, 5.25, -.05); head.castShadow = true; group.add(head);
    const limbMat = mat(color, .85);
    const leftArm = box(.42, 2.4, .45, limbMat); leftArm.position.set(-1, 3.25, 0); group.add(leftArm);
    const rightArm = box(.42, 2.4, .45, limbMat); rightArm.position.set(1, 3.25, 0); group.add(rightArm);
    const leftLeg = box(.55, 2.6, .62, mat(0x202934)); leftLeg.position.set(-.43, 1.35, 0); group.add(leftLeg);
    const rightLeg = box(.55, 2.6, .62, mat(0x202934)); rightLeg.position.set(.43, 1.35, 0); group.add(rightLeg);
    group.userData.rig = { head, leftArm, rightArm, leftLeg, rightLeg, faceState, phase: Math.random() * 10, name };
    return group;
  }

  function animateCharacter(character, time, movement, talking = false) {
    const rig = character.userData.rig;
    if (!rig) return;
    const stride = Math.sin(time * 8 + rig.phase) * Math.min(1, movement) * .65;
    rig.leftArm.rotation.x = stride; rig.rightArm.rotation.x = -stride;
    rig.leftLeg.rotation.x = -stride; rig.rightLeg.rotation.x = stride;
    rig.head.rotation.y = Math.sin(time * .8 + rig.phase) * .12;
    rig.faceState.blink = (time * .55 + rig.phase) % 3;
    rig.faceState.mouth = talking ? Math.abs(Math.sin(time * 9)) : .12 + Math.abs(Math.sin(time * 1.4)) * .08;
    if (time - rig.faceState.lastPaint > .08) {
      paintFace(rig.faceState);
      rig.faceState.lastPaint = time;
    }
  }

  function createNPC(name, role, line, color, x, z, skin, hair, eye) {
    const group = createCharacter(name, color, skin, hair, eye);
    group.position.set(x, 0, z);
    Object.assign(group.userData, { name, role, line, color, direction: Math.random() * Math.PI * 2, timer: 0 });
    npcs.push(group); scene.add(group);
  }
  [
    ['Rico','Street mechanic','Anything with an engine is yours if you can get to it.',0xff3c7d,-136,8,'#a96645','#171313','#473421'],
    ['Maya','Fixer','Make enough noise and I have a real job for you.',0x42e8ff,9,92,'#6f412f','#16100e','#241d19'],
    ['Jax','Local legend','Boats are at the canal. Aircraft are by the east hangar.',0xd9ff43,165,-14,'#d79b72','#5e311a','#315851'],
    ['Nia','Skater','That deck is faster than it looks. Hit boost.',0x985bff,-12,110,'#b87356','#29182b','#322c55'],
    ['Officer Vale','Off duty','Keep the heat low, unless you enjoy company.',0xff9f32,-162,42,'#e1aa82','#c49b70','#365967'],
    ['Bo','Vendor','Come back after the job. I will have something special.',0x65db88,145,109,'#8c583e','#0f1711','#302418']
  ].forEach(args => createNPC(...args));

  const player = createCharacter('Player', 0xd9ff43, '#ad6d50', '#15100e', '#334f43');
  player.position.set(-110, 0, 4);
  player.userData.velocityY = 0;
  player.userData.grounded = true;
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
      damageObject(object);
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

  function emitSmoke(vehicle, dt) {
    const data = vehicle.userData;
    data.smokeTimer -= dt;
    if (data.smokeTimer > 0 || Math.abs(data.speed) < 3 || data.type === 'skateboard') return;
    data.smokeTimer = data.type === 'boat' ? .08 : .16;
    const isBoat = data.type === 'boat';
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(isBoat ? .5 : .35, 7, 5),
      new THREE.MeshBasicMaterial({ color: isBoat ? 0xc5f4ff : 0x687277, transparent: true, opacity: isBoat ? .65 : .5, depthWrite: false })
    );
    puff.position.set(0, isBoat ? .5 : 1.2, isBoat ? 6.5 : 4.7).applyMatrix4(vehicle.matrixWorld);
    puff.userData = { life: isBoat ? 1.4 : 2, velocity: new THREE.Vector3((Math.random()-.5)*.5, isBoat ? .2 : 1.1, (Math.random()-.5)*.5) };
    smokeParticles.push(puff); scene.add(puff);
    if (isBoat) createRipple(vehicle.position.x, vehicle.position.z + 4);
  }

  function createRipple(x, z) {
    const ripple = new THREE.Mesh(
      new THREE.RingGeometry(.6, .85, 24),
      new THREE.MeshBasicMaterial({ color: 0xcaf7ff, transparent: true, opacity: .75, side: THREE.DoubleSide, depthWrite: false })
    );
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(x, .72, z);
    ripple.userData.life = 1.5;
    waterRipples.push(ripple); scene.add(ripple);
  }

  function updateEffects(dt, time) {
    const waterPosition = waterGeometry.attributes.position;
    for (let i = 0; i < waterPosition.count; i++) {
      const offset = i * 3;
      const x = baseWaterPositions[offset];
      const z = baseWaterPositions[offset + 2];
      waterPosition.setY(i, baseWaterPositions[offset + 1] + Math.sin(x * .07 + time * 2.2) * .38 + Math.cos(z * .32 + time * 1.5) * .18);
    }
    waterPosition.needsUpdate = true;
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
      const puff = smokeParticles[i];
      puff.position.addScaledVector(puff.userData.velocity, dt);
      puff.scale.addScalar(dt * .9);
      puff.userData.life -= dt;
      puff.material.opacity = Math.max(0, puff.userData.life * .28);
      if (puff.userData.life <= 0) { scene.remove(puff); puff.geometry.dispose(); puff.material.dispose(); smokeParticles.splice(i, 1); }
    }
    for (let i = waterRipples.length - 1; i >= 0; i--) {
      const ripple = waterRipples[i];
      ripple.scale.addScalar(dt * 5);
      ripple.userData.life -= dt;
      ripple.material.opacity = Math.max(0, ripple.userData.life * .45);
      if (ripple.userData.life <= 0) { scene.remove(ripple); ripple.geometry.dispose(); ripple.material.dispose(); waterRipples.splice(i, 1); }
    }
  }

  function simulateActorPhysics(dt, time) {
    const forwardInput = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    const sideInput = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    if (activeVehicle) {
      const vehicle = activeVehicle;
      const data = vehicle.userData;
      data.speed += (forwardInput * (keys.shift ? 46 : 28) - data.speed * 1.3) * dt;
      data.speed = THREE.MathUtils.clamp(data.speed, -data.maxSpeed * .35, data.maxSpeed);
      vehicle.rotation.y += -sideInput * dt * 1.65 * (data.speed >= 0 ? 1 : -1);
      vehicle.translateZ(-data.speed * dt);
      const airborne = data.type === 'plane' && Math.abs(data.speed) > 38;
      if (airborne) vehicle.position.y = THREE.MathUtils.lerp(vehicle.position.y, keys.shift ? 34 : 16, dt * 1.2);
      else if (data.type !== 'plane') vehicle.position.y = 0;
      if (!airborne) {
        const collision = physics.resolveCircle(vehicle, data.collisionRadius);
        const vehicleHit = resolveVehicleCollisions(vehicle, data.collisionRadius);
        if (collision) {
          if (Math.abs(data.speed) > 18 && collision.destructible) damageObject(collision.destructible, Math.abs(data.speed) > 34 ? 3 : 1);
          data.speed *= -.22;
        }
        if (vehicleHit) data.speed *= -.35;
      }
      data.wheels.forEach((wheel, index) => {
        wheel.rotation.x -= data.speed * dt * 1.35;
        if (index < 2 && data.type === 'car') wheel.rotation.y = sideInput * .35;
      });
      const propeller = vehicle.getObjectByName('propeller');
      if (propeller) propeller.rotation.z += dt * (8 + Math.abs(data.speed));
      emitSmoke(vehicle, dt);
      return;
    }

    // Camera-relative movement: A/D strafe rather than rotate, so controls are not tank-style.
    const cameraForward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const cameraRight = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    const movement = cameraForward.multiplyScalar(forwardInput).add(cameraRight.multiplyScalar(sideInput));
    if (movement.lengthSq()) {
      movement.normalize();
      player.position.addScaledVector(movement, dt * (keys.shift ? 28 : 17));
      player.rotation.y = Math.atan2(-movement.x, -movement.z);
    }
    physics.resolveCircle(player, 1.05);
    resolveVehicleCollisions(player, 1.05);
    player.userData.velocityY += physics.gravity * dt;
    player.position.y += player.userData.velocityY * dt;
    if (player.position.y <= 0) { player.position.y = 0; player.userData.velocityY = 0; player.userData.grounded = true; }
    animateCharacter(player, time, movement.lengthSq() ? 1 : 0);
  }

  function resolveVehicleCollisions(actor, radius) {
    let collided = false;
    vehicles.forEach(vehicle => {
      if (vehicle === actor || vehicle.position.y > 4) return;
      const otherRadius = vehicle.userData.collisionRadius;
      let dx = actor.position.x - vehicle.position.x, dz = actor.position.z - vehicle.position.z;
      const minimum = radius + otherRadius;
      const distance = Math.hypot(dx, dz);
      if (distance >= minimum) return;
      if (distance < .001) { dx = 1; dz = 0; }
      const push = minimum - Math.max(distance, .001);
      actor.position.x += dx / Math.max(distance, .001) * push;
      actor.position.z += dz / Math.max(distance, .001) * push;
      collided = true;
    });
    return collided;
  }

  function damageObject(object, amount = 1) {
    if (!object?.visible) return;
    object.userData.hp -= amount;
    if (object.userData.hp > 0) { object.rotation.z += .035 * amount; return; }
    object.visible = false;
    const collider = staticColliders.find(item => item.destructible === object);
    if (collider) collider.enabled = false;
    damage += object.userData.value;
    cash += Math.round(object.userData.value * .15);
    heat = Math.min(5, heat + 1);
    for (let i = 0; i < 14; i++) {
      const chunk = box(1 + Math.random()*2.5, 1 + Math.random()*2.5, 1 + Math.random()*2.5, mat(i%3 ? 0x555a58 : 0xff4f9a));
      chunk.position.copy(object.position).add(new THREE.Vector3((Math.random()-.5)*object.userData.width, 4+Math.random()*8, (Math.random()-.5)*object.userData.depth));
      chunk.userData.velocity = new THREE.Vector3((Math.random()-.5)*18, 8+Math.random()*15, (Math.random()-.5)*18);
      chunk.userData.life = 4; debris.push(chunk); scene.add(chunk);
    }
    updateHUD();
  }

  function update(dt) {
    if (!started) return;
    const time = clock.elapsedTime;
    physicsAccumulator = Math.min(physicsAccumulator + dt, FIXED_STEP * 4);
    while (physicsAccumulator >= FIXED_STEP) { simulateActorPhysics(FIXED_STEP, time); physicsAccumulator -= FIXED_STEP; }
    const actor = activeVehicle || player;

    npcs.forEach(npc => {
      npc.userData.timer -= dt;
      if (npc.userData.timer < 0) { npc.userData.timer = 2 + Math.random() * 4; npc.userData.direction += (Math.random() - .5) * 2.5; }
      npc.rotation.y = npc.userData.direction;
      npc.translateZ(dt * 1.2);
      const dialogueOpen = document.querySelector('#dialogue').classList.contains('visible') && document.querySelector('#speakerName').textContent === npc.userData.name.toUpperCase();
      animateCharacter(npc, time, 0.35, dialogueOpen);
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

    const distance = activeVehicle && activeVehicle.userData.type === 'plane' ? 37 : 24;
    const cameraOffset = new THREE.Vector3(Math.sin(cameraYaw) * distance * Math.cos(cameraPitch), distance * Math.sin(cameraPitch), Math.cos(cameraYaw) * distance * Math.cos(cameraPitch));
    camera.position.lerp(actor.position.clone().add(cameraOffset), 1 - Math.pow(0.001, dt));
    camera.lookAt(actor.position.clone().add(new THREE.Vector3(0, activeVehicle ? 3 : 2.8, 0)));
    updateEffects(dt, time);
    updateNearby(); updateMinimap();
  }

  addEventListener('keydown', event => {
    keys[event.key.toLowerCase()] = true;
    if (event.key.toLowerCase() === 'e' && !event.repeat) interact();
    if (event.key.toLowerCase() === 'f' && !event.repeat) destroyNearby();
    if (event.key.toLowerCase() === 'h' && !event.repeat) colliderHelpers.forEach(helper => { helper.visible = !helper.visible; });
    if (event.code === 'Space' && !event.repeat && !activeVehicle && player.userData.grounded) {
      event.preventDefault(); player.userData.velocityY = 12; player.userData.grounded = false;
    }
  });
  addEventListener('keyup', event => { keys[event.key.toLowerCase()] = false; });
  addEventListener('mousemove', event => {
    if (document.pointerLockElement !== canvas) return;
    cameraYaw -= event.movementX * .0024;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch - event.movementY * .0018, .15, 1.05);
  });
  canvas.addEventListener('mousedown', event => {
    if (started && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    else if (started && event.button === 0) destroyNearby();
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  });
  document.querySelector('#startBtn').onclick = () => { started = true; document.querySelector('#startScreen').classList.add('hidden'); canvas.requestPointerLock?.(); };
  document.querySelector('#closeDialogue').onclick = () => document.querySelector('#dialogue').classList.remove('visible');
  document.querySelector('#collapseBtn').onclick = event => { const list = document.querySelector('#nearbyList'); list.hidden = !list.hidden; event.currentTarget.textContent = list.hidden ? '+' : '−'; };
  document.querySelector('#soundBtn').onclick = event => { const label = event.currentTarget.querySelector('b'); label.textContent = label.textContent === 'ON' ? 'OFF' : 'ON'; };

  camera.position.set(-110, 18, 28);
  updateHUD(); updateNearby(); updateMinimap();
  renderer.setAnimationLoop(() => { update(Math.min(clock.getDelta(), 0.04)); renderer.render(scene, camera); });
})();
