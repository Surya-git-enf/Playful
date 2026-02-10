// src/main.js
// Phase 2+ — improved kinematic car: fullscreen, repositioned controls, hold-to-drift, improved environment and car visuals.
// Requirements: index.html and style.css as provided. Babylon.js loaded from CDN.

(() => {
  // DOM
  const canvas = document.getElementById('renderCanvas');
  const speedEl = document.getElementById('speed');
  const modeEl = document.getElementById('mode');
  const timerEl = document.getElementById('timer');
  const debugEl = document.getElementById('debug');
  const fsBtn = document.getElementById('fsBtn');

  function dbg(...s){ try { debugEl.style.display='block'; debugEl.innerText += s.join(' ') + '\n'; debugEl.scrollTop = debugEl.scrollHeight; } catch(e){ console.log(...s); } }

  // Engine & Scene
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.52, 0.77, 0.95);

  // Camera
  const camera = new BABYLON.FollowCamera('cam', new BABYLON.Vector3(0,6,-14), scene);
  camera.radius = 14;
  camera.heightOffset = 5;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.06;
  camera.maxCameraSpeed = 40;
  camera.attachControl(canvas, true);

  // Lights
  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.9;
  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.45,-1,-0.25), scene);
  sun.position = new BABYLON.Vector3(30,80,30);
  sun.intensity = 0.95;

  // Shadow
  const shadowGen = new BABYLON.ShadowGenerator(2048, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 8;

  // Ground & terrain
  const bigGround = BABYLON.MeshBuilder.CreateGround('bigGround', { width: 3000, height: 3000 }, scene);
  const soilMat = new BABYLON.StandardMaterial('soil', scene);
  soilMat.diffuseColor = new BABYLON.Color3(0.11, 0.55, 0.18); // grassish
  bigGround.material = soilMat;
  bigGround.receiveShadows = true;

  // road
  const roadWidth = 12;
  const roadLength = 3000;
  const road = BABYLON.MeshBuilder.CreateGround('road', { width: roadWidth, height: roadLength }, scene);
  road.position.y = 0.02;
  road.position.z = roadLength / 2 - 40;
  const roadMat = new BABYLON.StandardMaterial('roadMat', scene);
  roadMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
  road.material = roadMat;
  road.receiveShadows = true;

  // road curb edges (slightly raised)
  function makeCurb(x,z) {
    const c = BABYLON.MeshBuilder.CreateBox('curb_'+x+'_'+z, { width:1.4, height:0.12, depth:6 }, scene);
    c.position = new BABYLON.Vector3(x, 0.06, z);
    const cm = new BABYLON.StandardMaterial('cm_'+x+'_'+z, scene);
    cm.diffuseColor = new BABYLON.Color3(0.18,0.18,0.18);
    c.material = cm;
    c.receiveShadows = true;
  }
  // lane divider dashed center
  const dividerSpacing = 14;
  for (let i=0;i<Math.floor(roadLength/dividerSpacing);i++){
    const d = BABYLON.MeshBuilder.CreateBox('div'+i, { width:0.18, height:0.02, depth:6 }, scene);
    d.position = new BABYLON.Vector3(0, 0.03, i*dividerSpacing + 10);
    const dm = new BABYLON.StandardMaterial('dm'+i, scene);
    dm.diffuseColor = new BABYLON.Color3(1,1,1);
    d.material = dm;
  }

  // roadside grass strips for visual separation
  const leftGrass = BABYLON.MeshBuilder.CreateGround('lgrass',{width:80,height:roadLength}, scene);
  leftGrass.position.x = -roadWidth/2 - 40;
  leftGrass.position.z = road.position.z/1;
  const lmat = new BABYLON.StandardMaterial('lmat', scene); lmat.diffuseColor = new BABYLON.Color3(0.12,0.52,0.12);
  leftGrass.material = lmat;
  leftGrass.receiveShadows = true;
  const rightGrass = leftGrass.clone('rgrass'); rightGrass.position.x = -leftGrass.position.x;

  // buildings & trees spread
  function addBuilding(x,z,w,h,d) {
    const b = BABYLON.MeshBuilder.CreateBox('b_'+x+'_'+z,{width:w,height:h,depth:d},scene);
    b.position = new BABYLON.Vector3(x, h/2, z);
    const bm = new BABYLON.StandardMaterial('bm_'+x+'_'+z, scene);
    bm.diffuseColor = new BABYLON.Color3(0.2 + Math.random()*0.5, 0.15 + Math.random()*0.2, 0.2 + Math.random()*0.5);
    b.material = bm;
    b.receiveShadows = true;
  }
  function addTree(x,z) {
    const trunk = BABYLON.MeshBuilder.CreateCylinder('tr_'+x+'_'+z,{height:2.6,diameterTop:0.45,diameterBottom:0.45},scene);
    trunk.position = new BABYLON.Vector3(x,1.3,z);
    const leaves = BABYLON.MeshBuilder.CreateSphere('leaf_'+x+'_'+z,{diameter:2.2},scene);
    leaves.position = new BABYLON.Vector3(x,2.9,z);
    const lm = new BABYLON.StandardMaterial('lm_'+x+'_'+z,scene); lm.diffuseColor = new BABYLON.Color3(0.05,0.45,0.07);
    leaves.material = lm;
    trunk.material = new BABYLON.StandardMaterial('trm_'+x+'_'+z,scene); trunk.material.diffuseColor = new BABYLON.Color3(0.36,0.2,0.08);
    trunk.receiveShadows = true; leaves.receiveShadows = true;
  }
  for (let i=0;i<60;i++){
    const z = 40 + i*48 + Math.random()*22;
    addBuilding(-30 - Math.random()*14, z, 10 + Math.random()*18, 12 + Math.random()*40, 8);
    addBuilding(30 + Math.random()*14, z, 10 + Math.random()*18, 12 + Math.random()*40, 8);
    addTree(-46, z + (Math.random()*30-15));
    addTree(46, z + (Math.random()*30-15));
    // add small curbs occasionally
    if (i%3===0) { makeCurb(-roadWidth/2 - 0.6, z+8); makeCurb(roadWidth/2 + 0.6, z+8); }
  }

  // --------------------
  // Car model (improved)
  // --------------------
  // parent node
  const carRoot = new BABYLON.TransformNode('carRoot', scene);

  // chassis main box (lower)
  const chassis = BABYLON.MeshBuilder.CreateBox('chassis', {width:2.0, height:0.5, depth:3.8}, scene);
  chassis.parent = carRoot;
  chassis.position.y = 1.1;
  const chMat = new BABYLON.StandardMaterial('chMat', scene);
  chMat.diffuseColor = new BABYLON.Color3(0.85,0.06,0.06); // red body
  chMat.specularPower = 64;
  chassis.material = chMat;
  chassis.receiveShadows = true; shadowGen.addShadowCaster(chassis);

  // cabin: smaller box on top
  const cabin = BABYLON.MeshBuilder.CreateBox('cabin', {width:1.6, height:0.6, depth:1.8}, scene);
  cabin.parent = carRoot;
  cabin.position.y = 1.45;
  cabin.position.z = -0.1;
  const cabMat = new BABYLON.StandardMaterial('cabMat',scene);
  cabMat.diffuseColor = new BABYLON.Color3(0.14,0.14,0.14); cabMat.alpha = 0.95;
  cabin.material = cabMat;
  shadowGen.addShadowCaster(cabin);

  // hood + bumper minor details
  const hood = BABYLON.MeshBuilder.CreateBox('hood',{width:1.9,height:0.12,depth:1.1},scene);
  hood.parent = carRoot; hood.position.y = 1.32; hood.position.z = 1.05; hood.material = chMat; shadowGen.addShadowCaster(hood);

  // wheels: make tire (cylinder) + rim (torus) and parent to carRoot so they follow transforms
  function makeWheel(name, x, z) {
    const tire = BABYLON.MeshBuilder.CreateCylinder(name + '_tire', {diameter:0.68, height:0.36, tessellation:32}, scene);
    tire.rotation.z = Math.PI/2;
    tire.parent = carRoot;
    tire.position = new BABYLON.Vector3(x, 0.46, z);
    const tMat = new BABYLON.StandardMaterial(name + '_tire_m', scene); tMat.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.06);
    tire.material = tMat;
    shadowGen.addShadowCaster(tire);

    const rim = BABYLON.MeshBuilder.CreateTorus(name + '_rim', {thickness:0.12, diameter:0.36, tessellation:24}, scene);
    rim.parent = tire;
    rim.rotation.x = Math.PI/2;
    rim.position = new BABYLON.Vector3(0,0,0);
    const rMat = new BABYLON.StandardMaterial(name + '_rim_m', scene); rMat.diffuseColor = new BABYLON.Color3(0.8,0.8,0.85);
    rim.material = rMat;
    shadowGen.addShadowCaster(rim);

    return { tire, rim };
  }
  const wFL = makeWheel('wFL', -0.9,  1.55);
  const wFR = makeWheel('wFR',  0.9,  1.55);
  const wBL = makeWheel('wBL', -0.9, -1.55);
  const wBR = makeWheel('wBR',  0.9, -1.55);

  // put carRoot initial transform
  carRoot.position = new BABYLON.Vector3(0,0,6);
  carRoot.rotationQuaternion = null;

  // camera locked
  camera.lockedTarget = carRoot;

  // --------------------
  // input (left/right steering left side; accel/brake right side)
  // --------------------
  const input = { left:false, right:false, accel:false, brake:false, drift:false };
  // keyboard
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
    if (e.key === 'ArrowUp' || e.key === 'w') input.accel = true;
    if (e.key === 'ArrowDown' || e.key === 's') input.brake = true;
    if (e.key === ' ') input.drift = true;
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
    if (e.key === 'ArrowUp' || e.key === 'w') input.accel = false;
    if (e.key === 'ArrowDown' || e.key === 's') input.brake = false;
    if (e.key === ' ') input.drift = false;
  });

  // touch/button wiring - uses hold semantics
  function wireHold(id, prop) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => { input[prop] = true; e.preventDefault(); }, { passive:false });
    el.addEventListener('touchend',   e => { input[prop] = false; e.preventDefault(); }, { passive:false });
    el.addEventListener('mousedown', e => { input[prop] = true; e.preventDefault(); });
    el.addEventListener('mouseup',   e => { input[prop] = false; e.preventDefault(); });
    el.addEventListener('mouseleave', e => { input[prop] = false; });
  }
  wireHold('leftBtn','left'); wireHold('rightBtn','right');
  wireHold('accBtn','accel'); wireHold('brakeBtn','brake'); wireHold('driftBtn','drift');

  // fullscreen button
  fsBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) { dbg('FS error', e.message || e); }
  });

  // --------------------
  // Kinematic car parameters
  // --------------------
  let velocity = 0;            // forward speed scalar
  let steer = 0;               // current wheel steer angle
  let wheelSpin = 0;          // visual spin
  let lateral = 0;            // lateral offset used for drift visuals

  const P = {
    maxSpeed: 40,         // m/s-ish
    accel: 12.0,
    brake: 22.0,
    drag: 0.985,
    steerSpeed: 4.5,
    maxSteer: 0.55,
    driftGrip: 0.55,
    grip: 6.0,
    tiltFactor: 0.055,
    pitchFactor: 0.03
  };

  // --------------------
  // Audio (engine sound)
  // --------------------
  let audioCtx = null, engineOsc = null, engineGain = null;
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = audioCtx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 90;
      engineGain = audioCtx.createGain();
      engineGain.gain.value = 0.0008;
      engineOsc.connect(engineGain);
      engineGain.connect(audioCtx.destination);
      engineOsc.start();
    } catch(e){ dbg('Audio init failed', e.message || e); }
  }
  ['touchstart','mousedown','keydown'].forEach(ev => window.addEventListener(ev, () => { if (!audioCtx) initAudio(); }, { once:true, passive:true }));
  function updateEngineSound(norm) {
    if (!engineOsc || !engineGain) return;
    const freq = 90 + norm * 1000;
    const g = 0.02 + norm * 0.6;
    try {
      engineOsc.frequency.linearRampToValueAtTime(freq, audioCtx.currentTime + 0.05);
      engineGain.gain.linearRampToValueAtTime(g, audioCtx.currentTime + 0.05);
    } catch(e){ /* ignore scheduling fail */ }
  }

  // --------------------
  // Main update loop
  // --------------------
  const startTime = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;

    // longitudinal
    if (input.accel) velocity += P.accel * dt;
    else if (input.brake) velocity -= P.brake * dt;
    else velocity *= Math.pow(P.drag, dt * 60);

    velocity = Math.max(-6, Math.min(P.maxSpeed, velocity));

    // steering target
    const targetSteer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const targetAngle = targetSteer * P.maxSteer;
    steer += (targetAngle - steer) * Math.min(1, P.steerSpeed * dt);

    // if drifting, reduce grip; if not, normal grip
    const grip = input.drift ? (P.grip * P.driftGrip) : P.grip;

    // rotation of carRoot based on steering and speed
    const turnFactor = 1.0 + Math.min(3.0, Math.abs(velocity) / 8.0);
    const yawDelta = steer * (velocity / P.maxSpeed) * dt * 2.6 * turnFactor;
    carRoot.rotation.y += yawDelta;

    // lateral offset (visual) increases during drift and high steer
    lateral += -steer * (Math.abs(velocity) / P.maxSpeed) * (input.drift ? 2.6 : 1.2) * dt * 6;
    lateral *= 0.94;

    // move forward along car heading
    const forward = new BABYLON.Vector3(Math.sin(carRoot.rotation.y), 0, Math.cos(carRoot.rotation.y));
    const moveScale = 0.13;
    const step = forward.scale(velocity * moveScale * dt * 60);
    carRoot.position.addInPlace(step);

    // apply lateral visual offset right vector
    const right = new BABYLON.Vector3(Math.cos(carRoot.rotation.y), 0, -Math.sin(carRoot.rotation.y));
    carRoot.position.addInPlace(right.scale(lateral * 0.02));

    // clamp lateral to road
    const maxLat = (roadWidth / 2) - 1.15;
    if (carRoot.position.x > maxLat) { carRoot.position.x = maxLat; velocity *= 0.9; }
    if (carRoot.position.x < -maxLat) { carRoot.position.x = -maxLat; velocity *= 0.9; }

    // body tilt & pitch to feel dynamics
    const roll = -steer * Math.min(1, Math.abs(velocity)/(P.maxSpeed*0.6)) * P.tiltFactor;
    const pitch = (input.accel ? -0.5 : (input.brake ? 0.6 : 0)) * Math.min(0.45, Math.abs(velocity)/P.maxSpeed) * P.pitchFactor;
    // smooth them
    carRoot.rotation.z += (roll - carRoot.rotation.z) * Math.min(1, 6 * dt);
    carRoot.rotation.x += (pitch - carRoot.rotation.x) * Math.min(1, 6 * dt);

    // wheel visuals: spin and steer
    wheelSpin += velocity * 0.12 * dt * 60;
    // front wheel steering rotation (local Y on tire parent)
    wFL.tire.rotation.y = -steer * 0.9;
    wFR.tire.rotation.y = -steer * 0.9;
    // wheel spin (tire rotation X)
    wFL.tire.rotation.x += wheelSpin;
    wFR.tire.rotation.x += wheelSpin;
    wBL.tire.rotation.x += wheelSpin;
    wBR.tire.rotation.x += wheelSpin;

    // HUD
    speedEl.innerText = `${Math.round(Math.abs(velocity) * 3.6)} km/h`;
    const s = Math.floor((performance.now() - startTime)/1000);
    timerEl.innerText = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

    // engine sound
    if (audioCtx && engineOsc) {
      updateEngineSound(Math.min(1, Math.abs(velocity)/P.maxSpeed));
    }
  });

  // render loop
  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  // debug toggle (Ctrl+D)
  window.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'd') debugEl.style.display = (debugEl.style.display==='none'?'block':'none'); });

  dbg('Phase2+ loaded — fullscreen, controls rearranged, hold-to-drift enabled, improved environment & car model.');

})();
