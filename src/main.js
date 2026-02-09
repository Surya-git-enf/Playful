// main.js (Phase 2) - kinematic 3D car with wheels rotation, body tilt, environment, and engine sound
// Usage: index.html references this script from /src/main.js
(() => {
  // DOM & HUD
  const canvas = document.getElementById('renderCanvas');
  const speedEl = document.getElementById('speed');
  const modeEl = document.getElementById('mode');
  const timerEl = document.getElementById('timer');
  const debugEl = document.getElementById('debug');

  function dbg(...s){ try { debugEl.style.display='block'; debugEl.innerText += s.join(' ') + '\n'; debugEl.scrollTop = debugEl.scrollHeight; } catch(e){ console.log(...s); } }

  // Babylon engine
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.52, 0.77, 0.95);

  // Camera
  const camera = new BABYLON.FollowCamera('cam', new BABYLON.Vector3(0, 6, -14), scene);
  camera.radius = 18;
  camera.heightOffset = 4.5;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.06;
  camera.maxCameraSpeed = 30;

  // Lights
  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.9;
  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.4,-1,-0.3), scene);
  sun.position = new BABYLON.Vector3(40,80,40);
  sun.intensity = 0.9;

  // Shadow generator for nicer look
  const shadowGen = new BABYLON.ShadowGenerator(2048, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 8;

  // Ground + road
  const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 1600, height: 1600 }, scene);
  const groundMat = new BABYLON.StandardMaterial('gmat', scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.12, 0.47, 0.15);
  ground.material = groundMat;
  ground.receiveShadows = true;

  // Road plane (slightly above ground)
  const roadWidth = 12;
  const roadLen = 3000;
  const road = BABYLON.MeshBuilder.CreateGround('road', { width: roadWidth, height: roadLen }, scene);
  road.position.y = 0.02;
  road.position.z = roadLen / 2 - 120;
  const roadMat = new BABYLON.StandardMaterial('roadMat', scene);
  roadMat.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.06);
  road.material = roadMat;
  road.receiveShadows = true;

  // lane dividers - dashed look using small boxes
  const dividerSpacing = 14;
  for (let i = 0; i < Math.floor(roadLen / dividerSpacing); i++) {
    const d = BABYLON.MeshBuilder.CreateBox('div' + i, { width: 0.18, height: 0.02, depth: 6 }, scene);
    d.position = new BABYLON.Vector3(0, 0.03, i * dividerSpacing + 6);
    const dm = new BABYLON.StandardMaterial('dm' + i, scene);
    dm.diffuseColor = new BABYLON.Color3(0.96, 0.96, 0.96);
    d.material = dm;
  }

  // simple environment: buildings + trees
  function makeBuilding(x, z, w, h, d) {
    const b = BABYLON.MeshBuilder.CreateBox('b_' + x + '_' + z, { width: w, height: h, depth: d }, scene);
    b.position = new BABYLON.Vector3(x, h / 2, z);
    const m = new BABYLON.StandardMaterial('bm_' + x + '_' + z, scene);
    m.diffuseColor = new BABYLON.Color3(0.2 + Math.random() * 0.4, 0.2, 0.2 + Math.random() * 0.4);
    b.material = m;
    b.receiveShadows = true;
    return b;
  }
  function makeTree(x, z) {
    const trunk = BABYLON.MeshBuilder.CreateCylinder('t_' + x + '_' + z, { height: 2.8, diameterTop: 0.45, diameterBottom: 0.45 }, scene);
    trunk.position = new BABYLON.Vector3(x, 1.4, z);
    const leaves = BABYLON.MeshBuilder.CreateSphere('le_' + x + '_' + z, { diameter: 2.4 }, scene);
    leaves.position = new BABYLON.Vector3(x, 3.2, z);
    const tm = new BABYLON.StandardMaterial('tm_' + x + '_' + z, scene);
    tm.diffuseColor = new BABYLON.Color3(0.06, 0.5, 0.12);
    leaves.material = tm;
    trunk.material = new BABYLON.StandardMaterial('trm_' + x + '_' + z, scene);
    trunk.material.diffuseColor = new BABYLON.Color3(0.36, 0.2, 0.08);
    trunk.receiveShadows = true;
    leaves.receiveShadows = true;
  }
  // scatter along sides
  for (let i = 0; i < 40; i++) {
    const z = 40 + i * 60 + Math.random() * 30;
    makeBuilding(-18 - Math.random() * 10, z, 10 + Math.random() * 16, 12 + Math.random() * 40, 8);
    makeBuilding(18 + Math.random() * 10, z, 10 + Math.random() * 16, 12 + Math.random() * 40, 8);
    makeTree(-34, z + (Math.random() * 30 - 15));
    makeTree(34, z + (Math.random() * 30 - 15));
  }

  // -------------------------
  // CAR (chassis + wheels)
  // -------------------------
  const chassis = BABYLON.MeshBuilder.CreateBox('chassis', { width: 2.2, height: 0.6, depth: 4.4 }, scene);
  chassis.position = new BABYLON.Vector3(0, 1.4, 0);
  const chMat = new BABYLON.StandardMaterial('chMat', scene);
  chMat.diffuseColor = new BABYLON.Color3(0.9, 0.14, 0.12);
  chassis.material = chMat;
  chassis.receiveShadows = true;
  shadowGen.addShadowCaster(chassis);

  // wheels: create and parent to chassis for simple local transforms
  function makeWheelLocal(name, x, z) {
    const w = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: 0.68, height: 0.36, tessellation: 24 }, scene);
    w.rotation.z = Math.PI / 2; // cylinder axis aligned
    w.position = new BABYLON.Vector3(x, -0.52, z); // local positions (we'll parent)
    w.parent = chassis; // parent means local position is relative to chassis transform
    const wm = new BABYLON.StandardMaterial(name + '_mat', scene);
    wm.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    w.material = wm;
    shadowGen.addShadowCaster(w);
    return w;
  }
  // offsets: front/back
  const wheelFL = makeWheelLocal('wheelFL', -0.95, 1.75);
  const wheelFR = makeWheelLocal('wheelFR', 0.95, 1.75);
  const wheelBL = makeWheelLocal('wheelBL', -0.95, -1.75);
  const wheelBR = makeWheelLocal('wheelBR', 0.95, -1.75);

  // camera locked target and follow
  camera.lockedTarget = chassis;
  camera.attachControl(canvas, true);

  // -------------------------
  // Input & Controls
  // -------------------------
  const input = { left: false, right: false, accel: false, brake: false, drift: false };
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

  // Touch & buttons
  function wireBtn(id, prop) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => { input[prop] = true; e.preventDefault(); }, { passive: false });
    el.addEventListener('touchend', e => { input[prop] = false; e.preventDefault(); }, { passive: false });
    el.addEventListener('mousedown', e => { input[prop] = true; e.preventDefault(); });
    el.addEventListener('mouseup', e => { input[prop] = false; e.preventDefault(); });
    el.addEventListener('mouseleave', e => { input[prop] = false; });
  }
  wireBtn('leftBtn', 'left');
  wireBtn('rightBtn', 'right');
  wireBtn('accBtn', 'accel');
  wireBtn('brakeBtn', 'brake');
  wireBtn('driftBtn', 'drift');

  // -------------------------
  // KINEMATIC CAR MODEL (Arcade-sim)
  // -------------------------
  // state
  let velocity = 0;           // forward scalar (m/s scaled)
  let wheelSteer = 0;         // front wheel steer angle (radians)
  let wheelSpin = 0;          // wheel spinning for visuals
  let lateralOffset = 0;      // small lateral drift offset
  let lastTime = performance.now();

  // tuning params (tweak these to taste)
  const PARAM = {
    maxSpeed: 36,        // m/s (approx 130 km/h)
    accelPower: 10.5,    // m/s^2 (arbitrary scale)
    brakePower: 18.0,
    engineDrag: 0.98,
    steerSpeed: 2.6,     // how quickly wheelSteer approaches target
    maxSteer: 0.55,      // rad ~ 31 deg
    driftGrip: 0.6,      // lower = easier drift
    grip: 6.0,           // lateral grip base
    tiltFactor: 0.045,   // body roll multiplier
    pitchFactor: 0.025   // body pitch on accel/brake
  };

  // engine audio - WebAudio oscillator
  let audioCtx = null, engineOsc = null, engineGain = null;
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = audioCtx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 80;
      engineGain = audioCtx.createGain();
      engineGain.gain.value = 0.001;
      engineOsc.connect(engineGain);
      engineGain.connect(audioCtx.destination);
      engineOsc.start();
    } catch (e) {
      dbg('Audio init failed:', e.message || e);
    }
  }
  // resume audio on first user gesture
  ['touchstart', 'mousedown', 'keydown'].forEach(ev => {
    window.addEventListener(ev, () => { if (!audioCtx) initAudio(); }, { once: true, passive: true });
  });
  function updateEngineSound(speedNormalized) {
    if (!engineOsc || !engineGain) return;
    const freq = 80 + speedNormalized * 900; // Hz
    const g = 0.04 + speedNormalized * 0.45; // gain
    engineOsc.frequency.linearRampToValueAtTime(freq, audioCtx.currentTime + 0.05);
    engineGain.gain.linearRampToValueAtTime(g, audioCtx.currentTime + 0.05);
  }

  // -------------------------
  // Main update loop
  // -------------------------
  const startTime = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dtMS = engine.getDeltaTime(); // ms from engine (stable)
    const dt = dtMS / 1000.0;
    // --- longitudinal (forward) ---
    // simple throttle/brake -> acceleration
    if (input.accel) {
      velocity += PARAM.accelPower * dt;
    } else if (input.brake) {
      velocity -= PARAM.brakePower * dt;
    } else {
      velocity *= Math.pow(PARAM.engineDrag, dt * 60); // natural drag
    }
    // clamp
    velocity = Math.max(-8, Math.min(PARAM.maxSpeed, velocity));

    // --- steering ---
    const steerTarget = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const steerAngleTarget = steerTarget * PARAM.maxSteer;
    // smooth approach
    wheelSteer += (steerAngleTarget - wheelSteer) * Math.min(1, PARAM.steerSpeed * dt);

    // steering effect on chassis rotation
    // turn rate is proportional to wheelSteer and speed (smaller at very low speed)
    const turnFactor = 0.8 + Math.min(4.0, Math.abs(velocity) / 6.0);
    const rotationDelta = wheelSteer * (velocity / PARAM.maxSpeed) * 1.4 * dt * turnFactor;
    chassis.rotation.y += rotationDelta;

    // --- lateral drift simulation ---
    // compute lateral "slip" based on difference between heading and movement
    // when drifting (pressed), reduce grip
    const grip = input.drift ? (PARAM.grip * PARAM.driftGrip) : PARAM.grip;
    // treat lateralOffset as small sideways displacement relative to chassis heading (visual)
    lateralOffset += -wheelSteer * (velocity / PARAM.maxSpeed) * 4.0 * dt * (input.drift ? 1.8 : 1.0);
    lateralOffset *= 0.96; // settle

    // --- position update (move forward along chassis forward vector) ---
    // forward vector in world space:
    const forward = new BABYLON.Vector3(Math.sin(chassis.rotation.y), 0, Math.cos(chassis.rotation.y));
    // Apply movement (scaled down for comfortable speed in scene)
    const moveScale = 0.12; // tweakable visual scale
    const step = forward.scale(velocity * moveScale * dt * 60);
    chassis.position.addInPlace(step);

    // simulate small lateral offset visually by moving chassis sideways a little
    const rightVec = new BABYLON.Vector3(Math.cos(chassis.rotation.y), 0, -Math.sin(chassis.rotation.y));
    chassis.position.addInPlace(rightVec.scale(lateralOffset * 0.02));

    // body tilt (roll) and pitch
    // roll: tilt opposite to steering direction and scale with speed
    const roll = -wheelSteer * Math.min(1, Math.abs(velocity) / (PARAM.maxSpeed * 0.6)) * PARAM.tiltFactor;
    const pitch = (input.accel ? -1 : (input.brake ? 0.5 : 0)) * Math.min(0.35, Math.abs(velocity) / (PARAM.maxSpeed)) * PARAM.pitchFactor;
    // smooth interpolation
    chassis.rotation.z += (roll - chassis.rotation.z) * Math.min(1, 6 * dt);
    chassis.rotation.x += (pitch - chassis.rotation.x) * Math.min(1, 6 * dt);

    // wheel spinning visuals
    wheelSpin += velocity * 0.12 * dt * 60;
    // spin rotation (x) for each wheel
    [wheelFL, wheelFR, wheelBL, wheelBR].forEach((w, idx) => {
      // front wheels visually steer about local Y
      if (idx === 0 || idx === 1) { // FL, FR
        w.rotation.y = -wheelSteer * 0.9; // slight local rotation for steering
      }
      // spin rotation on local X
      w.rotation.x += wheelSpin;
    });

    // update camera target and smoothing handled by FollowCamera
    camera.lockedTarget = chassis;

    // HUD update
    const displaySpeedKmh = Math.round(Math.abs(velocity) * 3.6 * 1.2); // tune multiplier to look like real numbers
    if (speedEl) speedEl.innerText = displaySpeedKmh + ' km/h';
    if (timerEl) {
      const s = Math.floor((now - startTime) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      timerEl.innerText = `${mm}:${ss}`;
    }

    // engine sound (normalized)
    if (audioCtx && engineOsc) {
      const norm = Math.min(1, Math.abs(velocity) / PARAM.maxSpeed);
      updateEngineSound(norm);
    }
  });

  // engine.run
  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener('resize', () => engine.resize());

  // Basic collision keep car on road: simple clamping X position
  // if chassis drifts too far from center of road, gently correct / bounce
  scene.registerBeforeRender(() => {
    const maxLat = (roadWidth / 2) - 1.2;
    if (chassis.position.x > maxLat) {
      chassis.position.x = maxLat;
      velocity *= 0.84;
    }
    if (chassis.position.x < -maxLat) {
      chassis.position.x = -maxLat;
      velocity *= 0.84;
    }
  });

  // small helper: show debug on double-tap or ctrl+d
  window.addEventListener('keydown', e => {
    if (e.key === 'D' || (e.ctrlKey && e.key === 'd')) {
      debugEl.style.display = debugEl.style.display === 'none' ? 'block' : 'none';
    }
  });

  // initial camera adjustment
  camera.radius = 16;
  camera.heightOffset = 4.5;

  // final message
  dbg('Phase 2 loaded — kinematic 3D car (wheels, tilt, environment, engine sound).');

})();
