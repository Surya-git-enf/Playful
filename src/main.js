
// src/main.js
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("renderCanvas");
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

  // audio engine (simple engine tone)
  let audioCtx = null;
  let oscillator = null;
  let engineGain = null;
  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    oscillator = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = 80; // base engine tone
    engineGain.gain.value = 0; // start silent
    oscillator.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    oscillator.start();
  }
  function setEngineVolume(v) {
    if (!engineGain) return;
    engineGain.gain.linearRampToValueAtTime(v, audioCtx.currentTime + 0.05);
  }
  // Scene creation
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.06, 0.12, 0.18);

  // Enable physics with Cannon plugin
  const cannonPlugin = new BABYLON.CannonJSPlugin();
  scene.enablePhysics(new BABYLON.Vector3(0, -9.82, 0), cannonPlugin);

  // Skylight + directional
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.9;
  const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.5, -1, -0.6), scene);
  dir.position = new BABYLON.Vector3(30, 60, 30);
  dir.intensity = 0.9;

  // Ground (with visible texture-like material)
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 800, height: 800 }, scene);
  ground.position.y = 0;
  const groundMat = new BABYLON.StandardMaterial("gmat", scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.12, 0.5, 0.12);
  ground.material = groundMat;
  ground.receiveShadows = true;
  ground.physicsImpostor = new BABYLON.PhysicsImpostor(ground, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, friction: 5 }, scene);

  // Add a few styled ramps and obstacles so the scene looks alive
  const addRamp = (x, z, rotX = -0.45) => {
    const r = BABYLON.MeshBuilder.CreateBox("ramp", { width: 12, height: 1, depth: 18 }, scene);
    r.position = new BABYLON.Vector3(x, 0.5, z);
    r.rotation.x = rotX;
    const mat = new BABYLON.StandardMaterial("rmat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.45, 0.28, 0.12);
    r.material = mat;
    r.physicsImpostor = new BABYLON.PhysicsImpostor(r, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0 }, scene);
  };
  for (let i = 0; i < 10; i++) addRamp((i % 2 ? -12 : 12), i * 80 + 40, (i % 3 ? -0.35 : -0.6));

  // Decorative pillars
  for (let i = 0; i < 12; i++) {
    const b = BABYLON.MeshBuilder.CreateBox("b" + i, { size: 4 }, scene);
    b.position = new BABYLON.Vector3(((i % 2) ? -20 : 20), 2, i * 60 + 60);
    b.material = new BABYLON.StandardMaterial("m" + i, scene);
    b.material.diffuseColor = new BABYLON.Color3(0.6, 0.15, 0.15);
    b.physicsImpostor = new BABYLON.PhysicsImpostor(b, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0 }, scene);
  }

  // Car: chassis + proper vehicle using RaycastVehicle (Cannon)
  const chassis = BABYLON.MeshBuilder.CreateBox("chassis", { width: 2.0, height: 0.6, depth: 4.2 }, scene);
  const carMaterial = new BABYLON.StandardMaterial("carMat", scene);
  carMaterial.diffuseColor = new BABYLON.Color3(0.9, 0.12, 0.15); // red
  chassis.material = carMaterial;
  chassis.position = new BABYLON.Vector3(0, 4, -10);
  chassis.physicsImpostor = new BABYLON.PhysicsImpostor(chassis, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 220 }, scene);

  // create visual wheels
  const wheelMat = new BABYLON.StandardMaterial("wheelMat", scene);
  wheelMat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.09);

  // RaycastVehicle wrapper provided by Babylon on top of Cannon (we use built-in helper)
  // Create vehicle with configuration
  const vehicle = new BABYLON.RaycastVehicle({
    chassisMesh: chassis,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2
  }, scene);

  function makeWheel(isFront, x, z) {
    const wm = BABYLON.MeshBuilder.CreateCylinder("wheel", { diameter: 0.8, height: 0.45, tessellation: 24 }, scene);
    wm.rotation.z = Math.PI / 2;
    wm.material = wheelMat;
    vehicle.addWheel({
      wheelMesh: wm,
      isFrontWheel: isFront,
      radius: 0.4,
      directionLocal: new BABYLON.Vector3(0, -1, 0),
      axleLocal: new BABYLON.Vector3(1, 0, 0),
      suspensionRestLength: 0.5,
      suspensionStiffness: 28,
      dampingRelaxation: 3,
      dampingCompression: 4.4,
      frictionSlip: 5,
      rollInfluence: 0.01,
      chassisConnectionPointLocal: new BABYLON.Vector3(x, -0.4, z)
    });
  }

  // Add wheels: front then rear (x offset, z position)
  makeWheel(true, -0.9, 1.75);
  makeWheel(true, 0.9, 1.75);
  makeWheel(false, -0.9, -1.75);
  makeWheel(false, 0.9, -1.75);

  vehicle.attachToScene();

  // Set up a follow camera (camera moves smoothly behind car)
  const follow = new BABYLON.FollowCamera("followCam", new BABYLON.Vector3(0, 6, -20), scene);
  follow.radius = 18;
  follow.heightOffset = 5;
  follow.rotationOffset = 180;
  follow.cameraAcceleration = 0.08;
  follow.maxCameraSpeed = 50;
  follow.lockedTarget = chassis;

  // shadows
  const shadowGen = new BABYLON.ShadowGenerator(2048, dir);
  shadowGen.addShadowCaster(chassis);
  shadowGen.useBlurExponentialShadowMap = true;

  // simple world bounds / respawn
  scene.registerBeforeRender(() => {
    if (chassis.position.y < -50) {
      chassis.physicsImpostor.setLinearVelocity(new BABYLON.Vector3(0,0,0));
      chassis.physicsImpostor.setAngularVelocity(new BABYLON.Vector3(0,0,0));
      chassis.position = new BABYLON.Vector3(0, 6, -10);
      chassis.rotation = BABYLON.Vector3.Zero();
    }
  });

  // Controls (keyboard + touch)
  const input = { left:false, right:false, forward:false, brake:false };

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

  // touch UI
  document.getElementById("leftBtn").addEventListener("touchstart", (ev)=>{ input.left=true; ev.preventDefault(); });
  document.getElementById("leftBtn").addEventListener("touchend", ()=>{ input.left=false; });

  document.getElementById("rightBtn").addEventListener("touchstart", (ev)=>{ input.right=true; ev.preventDefault(); });
  document.getElementById("rightBtn").addEventListener("touchend", ()=>{ input.right=false; });

  document.getElementById("accBtn").addEventListener("touchstart", (ev)=>{ input.forward=true; ev.preventDefault(); });
  document.getElementById("accBtn").addEventListener("touchend", ()=>{ input.forward=false; });

  document.getElementById("brakeBtn").addEventListener("touchstart", (ev)=>{ input.brake=true; ev.preventDefault(); });
  document.getElementById("brakeBtn").addEventListener("touchend", ()=>{ input.brake=false; });

  // game parameters
  const MAX_ENGINE = 2200;
  const MAX_STEER = 0.5;
  const BRAKE_FORCE = 60;
  const REVERSE_FORCE = -600;

  // engine sound init when user starts
  document.getElementById("startBtn").addEventListener("click", async () => {
    // request fullscreen for immersive feel
    if (canvas.requestFullscreen) {
      await canvas.requestFullscreen().catch(()=>{});
    }
    // resume audio context on gesture
    initAudio();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    document.getElementById("overlay").style.display = "none";
  });

  // main physics update
  scene.onBeforeRenderObservable.add(() => {
    // steering
    let steer = 0;
    if (input.left) steer = -MAX_STEER;
    if (input.right) steer = MAX_STEER;
    vehicle.setSteeringValue(steer, 0);
    vehicle.setSteeringValue(steer, 1);

    // engine/brake
    if (input.forward) {
      vehicle.applyEngineForce(MAX_ENGINE, 2);
      vehicle.applyEngineForce(MAX_ENGINE, 3);
      setEngineVolume(0.35); // engine sound on
    } else {
      // no throttle -> release engine force
      vehicle.applyEngineForce(0, 2);
      vehicle.applyEngineForce(0, 3);
      setEngineVolume(0.03); // idle
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

    // small visual: rotate wheel meshes visually to match motion
    // (vehicle.wheelInfos is available - rotate visuals approx)
    // optional: you can rotate wheel meshes by speed - skipped for brevity
  });

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener("resize", () => engine.resize());
});
