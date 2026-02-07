// src/main.js
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("renderCanvas");
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

  // HUD elements
  const speedEl = document.getElementById("speed");
  const distanceEl = document.getElementById("distance");
  const timerEl = document.getElementById("timer");

  // audio: engine tone + skid sound (synth noise burst)
  let audioCtx = null;
  let engineOsc = null;
  let engineGain = null;
  let skidNoise = null;
  let skidGain = null;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // engine oscillator (sawtooth)
    engineOsc = audioCtx.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 90;
    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();

    // skid noise (buffer white noise)
    const bufferSize = audioCtx.sampleRate * 1.0;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    skidNoise = audioCtx.createBufferSource();
    skidNoise.buffer = noiseBuffer;
    skidGain = audioCtx.createGain();
    skidGain.gain.value = 0;
    skidNoise.loop = true;
    skidNoise.connect(skidGain);
    skidGain.connect(audioCtx.destination);
    skidNoise.start();
  }

  function setEngineVolume(v) {
    if (!engineGain) return;
    engineGain.gain.linearRampToValueAtTime(Math.max(0, v), audioCtx.currentTime + 0.05);
    // also modulate pitch slightly based on v
    engineOsc.frequency.linearRampToValueAtTime(80 + v * 220, audioCtx.currentTime + 0.05);
  }

  function playSkid(level) {
    if (!skidGain) return;
    // level 0..1
    skidGain.gain.cancelScheduledValues(audioCtx.currentTime);
    skidGain.gain.linearRampToValueAtTime(Math.min(0.4, level * 0.6), audioCtx.currentTime + 0.01);
    // quick fade out
    skidGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.35);
  }

  // Scene
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.06, 0.12, 0.18);

  // Physics
  const cannonPlugin = new BABYLON.CannonJSPlugin();
  scene.enablePhysics(new BABYLON.Vector3(0, -9.82, 0), cannonPlugin);

  // Lights
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.95;
  const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.3, -1, -0.4), scene);
  dir.position = new BABYLON.Vector3(40, 80, 40);
  dir.intensity = 0.9;

  // Ground
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 1200, height: 1200 }, scene);
  ground.position.y = 0;
  const groundMat = new BABYLON.StandardMaterial("gmat", scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.12, 0.5, 0.12);
  ground.material = groundMat;
  ground.receiveShadows = true;
  ground.physicsImpostor = new BABYLON.PhysicsImpostor(ground, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, friction: 6 }, scene);

  // Decorative ramps and objects
  const addRamp = (x, z, rotX = -0.45) => {
    const r = BABYLON.MeshBuilder.CreateBox("ramp" + x + "_" + z, { width: 12, height: 1, depth: 18 }, scene);
    r.position = new BABYLON.Vector3(x, 0.5, z);
    r.rotation.x = rotX;
    const mat = new BABYLON.StandardMaterial("rmat" + x + z, scene);
    mat.diffuseColor = new BABYLON.Color3(0.45, 0.28, 0.12);
    r.material = mat;
    r.physicsImpostor = new BABYLON.PhysicsImpostor(r, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0 }, scene);
    return r;
  };
  for (let i = 0; i < 12; i++) addRamp((i % 2 ? -18 : 18), i * 90 + 50, (i % 3 ? -0.35 : -0.6));

  // Pillars
  for (let i = 0; i < 14; i++) {
    const b = BABYLON.MeshBuilder.CreateBox("b" + i, { size: 4 }, scene);
    b.position = new BABYLON.Vector3(((i % 2) ? -30 : 30), 2, i * 70 + 70);
    b.material = new BABYLON.StandardMaterial("bm" + i, scene);
    b.material.diffuseColor = new BABYLON.Color3(0.6, 0.15, 0.15);
    b.physicsImpostor = new BABYLON.PhysicsImpostor(b, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0 }, scene);
  }

  // Car chassis (red)
  const chassis = BABYLON.MeshBuilder.CreateBox("chassis", { width: 2.0, height: 0.6, depth: 4.4 }, scene);
  const carMat = new BABYLON.StandardMaterial("carMat", scene);
  carMat.diffuseColor = new BABYLON.Color3(0.9, 0.12, 0.15);
  chassis.material = carMat;
  chassis.position = new BABYLON.Vector3(0, 4, -12);
  chassis.physicsImpostor = new BABYLON.PhysicsImpostor(chassis, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 250 }, scene);

  // Wheel visuals + RaycastVehicle (Cannon)
  const wheelMat = new BABYLON.StandardMaterial("wheelMat", scene);
  wheelMat.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.06);

  const vehicle = new BABYLON.RaycastVehicle({
    chassisMesh: chassis,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2
  }, scene);

  const wheelMeshes = [];
  function addWheel(isFront, x, z, nameIdx) {
    const wheel = BABYLON.MeshBuilder.CreateCylinder("wheel_" + nameIdx, { diameter: 0.8, height: 0.45, tessellation: 24 }, scene);
    wheel.rotation.z = Math.PI / 2;
    wheel.material = wheelMat;
    wheel.isPickable = false;
    vehicle.addWheel({
      wheelMesh: wheel,
      isFrontWheel: isFront,
      radius: 0.4,
      directionLocal: new BABYLON.Vector3(0, -1, 0),
      axleLocal: new BABYLON.Vector3(1, 0, 0),
      suspensionRestLength: 0.5,
      suspensionStiffness: 28,
      dampingRelaxation: 3,
      dampingCompression: 4.4,
      frictionSlip: 6,
      rollInfluence: 0.01,
      chassisConnectionPointLocal: new BABYLON.Vector3(x, -0.35, z)
    });
    wheelMeshes.push(wheel);
  }

  addWheel(true, -0.95, 1.9, "fl");
  addWheel(true, 0.95, 1.9, "fr");
  addWheel(false, -0.95, -1.9, "rl");
  addWheel(false, 0.95, -1.9, "rr");

  vehicle.attachToScene();

  // Camera (Follow)
  const follow = new BABYLON.FollowCamera("followCam", new BABYLON.Vector3(0, 6, -18), scene);
  follow.radius = 20;
  follow.heightOffset = 6;
  follow.rotationOffset = 180;
  follow.cameraAcceleration = 0.05;
  follow.maxCameraSpeed = 80;
  follow.lockedTarget = chassis;

  // Shadows
  const shadowGen = new BABYLON.ShadowGenerator(2048, dir);
  shadowGen.addShadowCaster(chassis);
  wheelMeshes.forEach(w => shadowGen.addShadowCaster(w));
  shadowGen.useBlurExponentialShadowMap = true;

  // Input & controls
  const input = { left:false, right:false, forward:false, brake:false };
  let deviceGamma = 0;

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a") input.left = true;
    if (e.key === "ArrowRight" || e.key === "d") input.right = true;
    if (e.key === "ArrowUp" || e.key === "w") input.forward = true;
    if (e.key === "ArrowDown" || e.key === "s") input.brake = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a") input.left = false;
    if (e.key === "ArrowRight" || e.key === "d") input.right = false;
    if (e.key === "ArrowUp" || e.key === "w") input.forward = false;
    if (e.key === "ArrowDown" || e.key === "s") input.brake = false;
  });

  // Touch UI
  document.getElementById("leftBtn").addEventListener("touchstart", (ev)=>{ input.left=true; ev.preventDefault(); });
  document.getElementById("leftBtn").addEventListener("touchend", ()=>{ input.left=false; });

  document.getElementById("rightBtn").addEventListener("touchstart", (ev)=>{ input.right=true; ev.preventDefault(); });
  document.getElementById("rightBtn").addEventListener("touchend", ()=>{ input.right=false; });

  document.getElementById("accBtn").addEventListener("touchstart", (ev)=>{ input.forward=true; ev.preventDefault(); });
  document.getElementById("accBtn").addEventListener("touchend", ()=>{ input.forward=false; });

  document.getElementById("brakeBtn").addEventListener("touchstart", (ev)=>{ input.brake=true; ev.preventDefault(); });
  document.getElementById("brakeBtn").addEventListener("touchend", ()=>{ input.brake=false; });

  // Device tilt steering
  window.addEventListener("deviceorientation", (e) => {
    // gamma is left-right tilt in degrees (-90..90)
    if (e.gamma !== null) deviceGamma = e.gamma;
  });

  // Game params
  const MAX_ENGINE = 2400;
  const MAX_STEER = 0.55;
  const BRAKE_FORCE = 80;
  const IDLE_ENGINE_VOL = 0.02;

  // State for HUD
  let startTime = null;
  let lastZ = chassis.position.z;
  let distance = 0;

  // Start button: fullscreen & audio gesture
  document.getElementById("startBtn").addEventListener("click", async () => {
    // request fullscreen for immersive feel
    try { await canvas.requestFullscreen(); } catch(e){}
    initAudio();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    document.getElementById("overlay").style.display = "none";
    startTime = performance.now();
  });

  // helper: get forward and right vectors of chassis in world space
  function getForward(mesh) {
    // direction local Z axis
    return mesh.getDirection(BABYLON.Axis.Z).normalize();
  }
  function getRight(mesh) {
    return mesh.getDirection(BABYLON.Axis.X).normalize();
  }

  // main loop controls
  scene.onBeforeRenderObservable.add(() => {
    // device tilt influence - map gamma (-45..45) to steer
    let tiltSteer = 0;
    if (Math.abs(deviceGamma) > 4) {
      tiltSteer = (deviceGamma / 45) * MAX_STEER;
      tiltSteer = Math.max(-MAX_STEER, Math.min(MAX_STEER, tiltSteer));
    }

    // steering
    let steer = 0;
    if (input.left) steer = -MAX_STEER;
    if (input.right) steer = MAX_STEER;
    // combine tilt and button, clamp
    steer = Math.max(-MAX_STEER, Math.min(MAX_STEER, steer + tiltSteer));
    vehicle.setSteeringValue(steer, 0);
    vehicle.setSteeringValue(steer, 1);

    // engine/brake
    if (input.forward) {
      vehicle.applyEngineForce(MAX_ENGINE, 2);
      vehicle.applyEngineForce(MAX_ENGINE, 3);
      setEngineVolume(0.35);
    } else {
      vehicle.applyEngineForce(0, 2);
      vehicle.applyEngineForce(0, 3);
      setEngineVolume(IDLE_ENGINE_VOL);
    }

    if (input.brake) {
      vehicle.setBrake(BRAKE_FORCE, 0);
      vehicle.setBrake(BRAKE_FORCE, 1);
      vehicle.setBrake(BRAKE_FORCE, 2);
      vehicle.setBrake(BRAKE_FORCE, 3);
    } else {
      vehicle.setBrake(0, 0);
      vehicle.setBrake(0, 1);
      vehicle.setBrake(0, 2);
      vehicle.setBrake(0, 3);
    }

    // visual wheel rotation: approximate by linear speed
    const lv = chassis.physicsImpostor.getLinearVelocity() || new BABYLON.Vector3(0,0,0);
    const forward = getForward(chassis);
    const fSpeed = BABYLON.Vector3.Dot(lv, forward); // forward component
    const wheelAngular = fSpeed / 0.4; // approx (v = r * omega) -> omega = v/r
    for (let i = 0; i < wheelMeshes.length; i++) {
      // wheels were created with rotation.z = PI/2; rotate around local X to spin forward
      wheelMeshes[i].rotation.x += wheelAngular * scene.getAnimationRatio() * 0.016;
      // keep wheels visually attached to chassis
      const conn = vehicle.wheelsMesh[i];
      if (conn) {
        // wheel position provided by wheel mesh (vehicle handles world transform) - ensure visible
      }
    }

    // skid detection: lateral speed (dot with right vector)
    const right = getRight(chassis);
    const lateral = BABYLON.Vector3.Dot(lv, right);
    const skidAbs = Math.abs(lateral);
    if (skidAbs > 5.8) {
      // play a skid sound proportional to lateral amount
      const level = Math.min(1.0, (skidAbs - 5.8) / 8);
      playSkid(level);
    }

    // HUD updates (speed and distance/time)
    const speedMs = lv.length();
    const speedKmh = Math.round(speedMs * 3.6 * 3); // tuned multiplier for in-game feeling
    speedEl.innerText = `${speedKmh} km/h`;

    // distance traveled along +z (approx)
    const currZ = chassis.position.z;
    distance += Math.max(0, currZ - lastZ);
    lastZ = currZ;
    distanceEl.innerText = `${Math.round(distance)} m`;

    // timer
    if (startTime) {
      const elapsed = Math.floor((performance.now() - startTime) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      timerEl.innerText = `${mm}:${ss}`;
    }

    // minor stabilization: if car flips beyond extreme pitch, nudge orientation slowly
    const up = chassis.up;
    if (chassis.position.y > 0 && Math.abs(chassis.rotation.x) > 1.9) {
      // reset small rotation
      chassis.rotation.x *= 0.98;
      chassis.rotation.z *= 0.98;
    }
  });

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener("resize", () => engine.resize());
});
