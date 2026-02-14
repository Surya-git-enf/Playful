// src/main.js
// Stable 3D scene (Babylon) with landscape driving, camera switch (1st/3rd), left/right and accel/brake, hold-to-drift.
// IMPORTANT: Put this file at car-game/src/main.js and open via HTTP (GitHub Pages or local server).

console.log('main.js loaded');

(function () {
  if (!window.BABYLON) {
    document.getElementById('debug').style.display = 'block';
    document.getElementById('debug').innerText = 'Error: Babylon.js not loaded.';
    console.error('Babylon not loaded');
    return;
  }

  // DOM elements
  const canvas = document.getElementById('renderCanvas');
  const speedEl = document.getElementById('speed');
  const debugEl = document.getElementById('debug');
  const camBtn = document.getElementById('camBtn');
  const fsBtn = document.getElementById('fsBtn');

  // Input buttons
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  const accBtn = document.getElementById('accBtn');
  const brakeBtn = document.getElementById('brakeBtn');
  const driftBtn = document.getElementById('driftBtn');

  // create engine & scene
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.53, 0.78, 0.95);

  // basic lights
  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.95;
  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.45, -1, -0.25), scene);
  sun.position = new BABYLON.Vector3(40, 80, 40);
  sun.intensity = 0.9;

  // shadow generator
  const shadowGen = new BABYLON.ShadowGenerator(2048, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 8;

  // TERRAIN (grass) - large ground
  const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 3000, height: 3000 }, scene);
  const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.16, 0.5, 0.14); // grass green
  ground.material = groundMat;
  ground.receiveShadows = true;

  // ROAD (straight long road)
  const roadWidth = 12;
  const roadLength = 3000;
  const road = BABYLON.MeshBuilder.CreateGround('road', { width: roadWidth, height: roadLength }, scene);
  road.position.y = 0.02;
  road.position.z = roadLength / 2 - 20;
  const roadMat = new BABYLON.StandardMaterial('roadMat', scene);
  roadMat.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.06);
  road.material = roadMat;
  road.receiveShadows = true;

  // lane divider boxes to simulate dashed center line
  const divSpacing = 14;
  for (let i = 0; i < Math.floor(roadLength / divSpacing); i++) {
    const d = BABYLON.MeshBuilder.CreateBox('div' + i, { width: 0.18, height: 0.02, depth: 6 }, scene);
    d.position = new BABYLON.Vector3(0, 0.03, i * divSpacing + 10);
    const dm = new BABYLON.StandardMaterial('dm' + i, scene);
    dm.diffuseColor = new BABYLON.Color3(1, 1, 1);
    d.material = dm;
  }

  // Buildings + trees (simple, but varied)
  function addBuilding(x, z, w, h, d, colorScale = 0.7) {
    const b = BABYLON.MeshBuilder.CreateBox(`b_${x}_${z}`, { width: w, height: h, depth: d }, scene);
    b.position = new BABYLON.Vector3(x, h / 2, z);
    const m = new BABYLON.StandardMaterial(`bm_${x}_${z}`, scene);
    m.diffuseColor = new BABYLON.Color3(0.2 + Math.random() * colorScale, 0.2, 0.2 + Math.random() * colorScale);
    b.material = m;
    b.receiveShadows = true;
  }
  function addTree(x, z) {
    const trunk = BABYLON.MeshBuilder.CreateCylinder(`tr_${x}_${z}`, { height: 2, diameterTop: 0.4, diameterBottom: 0.4 }, scene);
    trunk.position = new BABYLON.Vector3(x, 1, z);
    const leaves = BABYLON.MeshBuilder.CreateSphere(`le_${x}_${z}`, { diameter: 2 }, scene);
    leaves.position = new BABYLON.Vector3(x, 2.6, z);
    const lm = new BABYLON.StandardMaterial(`lm_${x}_${z}`, scene); lm.diffuseColor = new BABYLON.Color3(0.12, 0.5, 0.12);
    leaves.material = lm;
    trunk.material = new BABYLON.StandardMaterial(`trm_${x}_${z}`, scene); trunk.material.diffuseColor = new BABYLON.Color3(0.36, 0.2, 0.08);
    leaves.receiveShadows = true; trunk.receiveShadows = true;
  }
  for (let i = 0; i < 40; i++) {
    const z = 40 + i * 60 + Math.random() * 20;
    addBuilding(-28 - Math.random() * 14, z, 10 + Math.random() * 16, 12 + Math.random() * 40, 8);
    addBuilding(28 + Math.random() * 14, z, 10 + Math.random() * 16, 12 + Math.random() * 40, 8);
    addTree(-44, z + (Math.random() * 30 - 15));
    addTree(44, z + (Math.random() * 30 - 15));
  }

  // CAR root + visuals (simple "simulation style" car)
  const carRoot = new BABYLON.TransformNode('carRoot', scene);
  const chassis = BABYLON.MeshBuilder.CreateBox('chassis', { width: 2.0, height: 0.55, depth: 4.0 }, scene);
  chassis.parent = carRoot;
  chassis.position.y = 1.05;
  const chMat = new BABYLON.StandardMaterial('chMat', scene);
  chMat.diffuseColor = new BABYLON.Color3(0.9, 0.16, 0.16);
  chassis.material = chMat;
  shadowGen.addShadowCaster(chassis);

  // cabin
  const cabin = BABYLON.MeshBuilder.CreateBox('cabin', { width: 1.6, height: 0.6, depth: 1.8 }, scene);
  cabin.parent = carRoot;
  cabin.position.y = 1.45;
  cabin.position.z = -0.1;
  const cabMat = new BABYLON.StandardMaterial('cabMat', scene);
  cabMat.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.12);
  cabin.material = cabMat;
  shadowGen.addShadowCaster(cabin);

  // wheels (visual only)
  function makeWheel(name, x, z) {
    const tire = BABYLON.MeshBuilder.CreateCylinder(name + '_t', { diameter: 0.68, height: 0.36, tessellation: 24 }, scene);
    tire.rotation.z = Math.PI / 2;
    tire.parent = carRoot;
    tire.position = new BABYLON.Vector3(x, 0.46, z);
    const tm = new BABYLON.StandardMaterial(name + '_m', scene); tm.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.06);
    tire.material = tm;
    shadowGen.addShadowCaster(tire);
    return tire;
  }
  const wFL = makeWheel('wFL', -0.9, 1.55);
  const wFR = makeWheel('wFR', 0.9, 1.55);
  const wBL = makeWheel('wBL', -0.9, -1.55);
  const wBR = makeWheel('wBR', 0.9, -1.55);

  // place car
  carRoot.position = new BABYLON.Vector3(0, 0, 6);

  // CAMERAS — 3rd person follow and 1st person (parented)
  const followCamera = new BABYLON.FollowCamera('followCam', new BABYLON.Vector3(0, 6, -10), scene);
  followCamera.radius = 16; followCamera.heightOffset = 4.6; followCamera.rotationOffset = 180; followCamera.cameraAcceleration = 0.04;
  followCamera.lockedTarget = carRoot;

  const firstCamera = new BABYLON.UniversalCamera('firstCam', new BABYLON.Vector3(0, 1.6, 0), scene);
  firstCamera.parent = carRoot;
  firstCamera.position = new BABYLON.Vector3(0, 1.6, 0.6);
  firstCamera.rotation = new BABYLON.Vector3(0, Math.PI, 0); // look forward

  scene.activeCamera = followCamera;
  followCamera.attachControl(canvas, true);

  let cameraMode = 0; // 0 = 3rd, 1 = 1st
  camBtn.addEventListener('click', () => {
    try {
      scene.activeCamera.detachControl(canvas);
    } catch (e) { /* ignore */ }
    cameraMode = (cameraMode + 1) % 2;
    scene.activeCamera = cameraMode === 0 ? followCamera : firstCamera;
    scene.activeCamera.attachControl(canvas, true);
  });

  // fullscreen
  fsBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) { dbg('FS error', e.message || e); }
  });

  // INPUT handling (pointer + keyboard), uses hold semantics
  const input = { left: false, right: false, accel: false, brake: false, drift: false };
  // keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
    if (e.key === 'ArrowUp' || e.key === 'w') input.accel = true;
    if (e.key === 'ArrowDown' || e.key === 's') input.brake = true;
    if (e.key === ' ') input.drift = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
    if (e.key === 'ArrowUp' || e.key === 'w') input.accel = false;
    if (e.key === 'ArrowDown' || e.key === 's') input.brake = false;
    if (e.key === ' ') input.drift = false;
  });

  // pointer/ touch wiring helper
  function wireHold(el, prop) {
    if (!el) return;
    el.addEventListener('pointerdown', (ev) => { input[prop] = true; ev.preventDefault(); }, { passive: false });
    el.addEventListener('pointerup',   (ev) => { input[prop] = false; ev.preventDefault(); }, { passive: false });
    el.addEventListener('pointerout',  (ev) => { input[prop] = false; ev.preventDefault(); }, { passive: false });
    el.addEventListener('pointercancel',(ev)=>{ input[prop] = false; ev.preventDefault(); }, { passive: false });
  }
  wireHold(leftBtn, 'left'); wireHold(rightBtn, 'right');
  wireHold(accBtn, 'accel'); wireHold(brakeBtn, 'brake'); wireHold(driftBtn, 'drift');

  // Kinematic car state and params
  let velocity = 0;
  let steer = 0;
  let wheelSpin = 0;
  let lateral = 0; // visual lateral offset

  const P = {
    maxSpeed: 36, accel: 12.0, brake: 22.0, drag: 0.985,
    steerSpeed: 4.2, maxSteer: 0.55, driftGrip: 0.62, grip: 6.0,
    tiltFactor: 0.055, pitchFactor: 0.03
  };

  // audio (engine)
  let audioCtx = null, engineOsc = null, engineGain = null;
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = audioCtx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 80;
      engineGain = audioCtx.createGain(); engineGain.gain.value = 0.0008;
      engineOsc.connect(engineGain); engineGain.connect(audioCtx.destination); engineOsc.start();
    } catch (e) { dbg('Audio init failed', e.message || e); }
  }
  ['pointerdown','keydown','touchstart'].forEach(evt => window.addEventListener(evt, () => { if (!audioCtx) initAudio(); }, { once: true, passive: true }));
  function updateEngineSound(norm) {
    if (!engineOsc || !engineGain) return;
    const freq = 80 + norm * 900;
    const g = 0.02 + norm * 0.6;
    try {
      engineOsc.frequency.linearRampToValueAtTime(freq, audioCtx.currentTime + 0.05);
      engineGain.gain.linearRampToValueAtTime(g, audioCtx.currentTime + 0.05);
    } catch (e) { /* ignore */ }
  }

  // main update
  const startTime = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;

    // forward/backward
    if (input.accel) velocity += P.accel * dt;
    else if (input.brake) velocity -= P.brake * dt;
    else velocity *= Math.pow(P.drag, dt * 60);

    velocity = Math.max(-6, Math.min(P.maxSpeed, velocity));

    // steering smoothing
    const targetSteer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const targetAngle = targetSteer * P.maxSteer;
    steer += (targetAngle - steer) * Math.min(1, P.steerSpeed * dt);

    // yaw rotation
    const turnFactor = 1.0 + Math.min(3.0, Math.abs(velocity) / 8.0);
    const yawDelta = steer * (velocity / P.maxSpeed) * dt * 2.6 * turnFactor;
    carRoot.rotation.y += yawDelta;

    // lateral offset visual for drift
    lateral += -steer * (Math.abs(velocity) / P.maxSpeed) * (input.drift ? 2.6 : 1.2) * dt * 6;
    lateral *= 0.94;

    // move forward along heading
    const fwd = new BABYLON.Vector3(Math.sin(carRoot.rotation.y), 0, Math.cos(carRoot.rotation.y));
    const moveScale = 0.13;
    const step = fwd.scale(velocity * moveScale * dt * 60);
    carRoot.position.addInPlace(step);

    // apply lateral visual offset
    const right = new BABYLON.Vector3(Math.cos(carRoot.rotation.y), 0, -Math.sin(carRoot.rotation.y));
    carRoot.position.addInPlace(right.scale(lateral * 0.02));

    // clamp to road edges
    const maxLat = (roadWidth / 2) - 1.0;
    if (carRoot.position.x > maxLat) { carRoot.position.x = maxLat; velocity *= 0.85; }
    if (carRoot.position.x < -maxLat) { carRoot.position.x = -maxLat; velocity *= 0.85; }

    // tilt/pitch
    const roll = -steer * Math.min(1, Math.abs(velocity) / (P.maxSpeed * 0.6)) * P.tiltFactor;
    const pitch = (input.accel ? -0.5 : (input.brake ? 0.6 : 0)) * Math.min(0.45, Math.abs(velocity) / P.maxSpeed) * P.pitchFactor;
    carRoot.rotation.z += (roll - carRoot.rotation.z) * Math.min(1, 6 * dt);
    carRoot.rotation.x += (pitch - carRoot.rotation.x) * Math.min(1, 6 * dt);

    // wheel visuals (spin)
    wheelSpin += velocity * 0.12 * dt * 60;
    wFL.rotation.x += wheelSpin; wFR.rotation.x += wheelSpin; wBL.rotation.x += wheelSpin; wBR.rotation.x += wheelSpin;
    wFL.rotation.y = -steer * 0.9; wFR.rotation.y = -steer * 0.9;

    // HUD
    speedEl.innerText = `${Math.round(Math.abs(velocity) * 3.6)} km/h`;
    const s = Math.floor((performance.now() - startTime) / 1000);
    // audio
    if (audioCtx && engineOsc) updateEngineSound(Math.min(1, Math.abs(velocity) / P.maxSpeed));
  });

  // render
  engine.runRenderLoop(() => {
    scene.render();
  });
  window.addEventListener('resize', () => engine.resize());

  dbg('Scene started — follow camera + first person available. Use arrow keys or on-screen buttons.');
})();
