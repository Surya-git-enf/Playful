// src/main.js
// Babylon + Cannon RaycastVehicle car simulator with drifting + environment
(function(){
  const debugEl = document.getElementById('debug');
  function dbg(...args){
    if (!debugEl) return;
    debugEl.style.display = 'block';
    debugEl.innerText += args.join(' ') + '\n';
    debugEl.scrollTop = debugEl.scrollHeight;
    console.log(...args);
  }

  // Wait for Babylon
  function onBabylonReady(cb, tries=0){
    if (window.BABYLON) return cb();
    if (tries > 60) return dbg('Babylon not found');
    setTimeout(()=> onBabylonReady(cb, tries+1), 80);
  }

  onBabylonReady(init);

  function init(){
    dbg('Initializing scene...');

    const canvas = document.getElementById('renderCanvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true });
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.6,0.86,1);

    // physics
    const cannonPlugin = new BABYLON.CannonJSPlugin();
    scene.enablePhysics(new BABYLON.Vector3(0, -9.82, 0), cannonPlugin);

    // lights
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.9;
    const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.5, -1, -0.3), scene);
    sun.position = new BABYLON.Vector3(40,80,40);
    sun.intensity = 0.9;

    // Shadow generator
    const shadowGen = new BABYLON.ShadowGenerator(2048, sun);
    shadowGen.useBlurExponentialShadowMap = true;

    // Environment: ground + road + lane dividers + buildings + trees
    const ground = BABYLON.MeshBuilder.CreateGround('ground', {width: 1600, height: 1600}, scene);
    const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.12,0.47,0.15);
    ground.material = groundMat;
    ground.receiveShadows = true;
    ground.physicsImpostor = new BABYLON.PhysicsImpostor(ground, BABYLON.PhysicsImpostor.BoxImpostor, {mass:0, friction:5, restitution:0}, scene);

    // Road: long narrow plane (centered along z). We'll slightly raise road above ground to avoid z-fighting.
    const roadWidth = 10;
    const roadLength = 2000;
    const road = BABYLON.MeshBuilder.CreateGround('road', {width: roadWidth, height: roadLength}, scene);
    road.rotation.x = 0; // already flat
    road.position.y = 0.01;
    road.position.z = roadLength/2 - 200; // start ahead of origin
    const roadMat = new BABYLON.StandardMaterial('roadMat', scene);
    roadMat.diffuseColor = new BABYLON.Color3(0.08,0.08,0.08);
    road.material = roadMat;
    road.receiveShadows = true;
    // Make road non-physical separate from ground (we rely on raycast vehicle)
    // Add lane dividers
    const dividerCount = 120;
    for (let i=0;i<dividerCount;i++){
      const d = BABYLON.MeshBuilder.CreateBox('div'+i, {width:0.2, height:0.02, depth:1.8}, scene);
      d.position = new BABYLON.Vector3(0, 0.02, i*16 + 8);
      d.material = new BABYLON.StandardMaterial('divmat'+i, scene);
      d.material.diffuseColor = new BABYLON.Color3(1,1,1);
      d.material.emissiveColor = new BABYLON.Color3(1,1,1);
    }

    // Buildings
    function addBuilding(x, z, w, h, d){
      const b = BABYLON.MeshBuilder.CreateBox('b'+x+'_'+z, {width:w, height:h, depth:d}, scene);
      b.position = new BABYLON.Vector3(x, h/2, z);
      const mat = new BABYLON.StandardMaterial('bm'+x+z, scene);
      mat.diffuseColor = new BABYLON.Color3(0.2 + Math.random()*0.4, 0.2, 0.2 + Math.random()*0.4);
      b.material = mat;
      b.receiveShadows = true;
    }
    for (let i=0;i<30;i++){
      const z = 40 + i*60 + (Math.random()*20-10);
      addBuilding(-20 - (Math.random()*10), z, 12+Math.random()*8, 12+Math.random()*30, 8+Math.random()*6);
      addBuilding(20 + (Math.random()*10), z, 12+Math.random()*8, 12+Math.random()*30, 8+Math.random()*6);
    }

    // Trees (simple cylinders + spheres)
    function addTree(x,z){
      const trunk = BABYLON.MeshBuilder.CreateCylinder('tr'+x+'_'+z, {height:3, diameter:0.6}, scene);
      trunk.position = new BABYLON.Vector3(x,1.5,z);
      const trunkMat = new BABYLON.StandardMaterial('tm'+x+z, scene);
      trunkMat.diffuseColor = new BABYLON.Color3(0.35,0.18,0.06);
      trunk.material = trunkMat;
      const leaves = BABYLON.MeshBuilder.CreateSphere('leaf'+x+'_'+z, {diameter:2.5}, scene);
      leaves.position = new BABYLON.Vector3(x,3.2,z);
      const leafMat = new BABYLON.StandardMaterial('lm'+x+z, scene);
      leafMat.diffuseColor = new BABYLON.Color3(0.05,0.45,0.12);
      leaves.material = leafMat;
    }
    for (let i=0;i<40;i++){
      addTree(-38, 40 + i*45 + (Math.random()*20-10));
      addTree(38, 40 + i*45 + (Math.random()*20-10));
    }

    // Car chassis: physics body (box)
    const chassis = BABYLON.MeshBuilder.CreateBox('chassis', {width:2.2, height:0.6, depth:4.6}, scene);
    const chassisMat = new BABYLON.StandardMaterial('chMat', scene);
    chassisMat.diffuseColor = new BABYLON.Color3(0.86,0.16,0.12); // bright red
    chassis.material = chassisMat;
    chassis.position = new BABYLON.Vector3(0, 1.8, 0);
    // set physics impostor (mass)
    chassis.physicsImpostor = new BABYLON.PhysicsImpostor(chassis, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 300}, scene);
    shadowGen.addShadowCaster(chassis);

    // Create wheel meshes first and reuse them in addWheel call
    const wheelMeshFactory = (name) => {
      const wheel = BABYLON.MeshBuilder.CreateCylinder(name, {diameter:0.8, height:0.45, tessellation:24}, scene);
      wheel.rotation.z = Math.PI/2; // align cylinder axis
      const wm = new BABYLON.StandardMaterial(name+'m', scene);
      wm.diffuseColor = new BABYLON.Color3(0.08,0.08,0.08);
      wheel.material = wm;
      shadowGen.addShadowCaster(wheel);
      return wheel;
    };
    const wheelFL = wheelMeshFactory('wfl');
    const wheelFR = wheelMeshFactory('wfr');
    const wheelBL = wheelMeshFactory('wbl');
    const wheelBR = wheelMeshFactory('wbr');

    // Setup raycast vehicle
    const vehicle = new BABYLON.RaycastVehicle({
      chassisMesh: chassis,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2
    }, scene);

    // Helper to add a wheel using the prepared mesh
    function addWheel(wheelMesh, isFront, posX, posZ){
      vehicle.addWheel({
        wheelMesh: wheelMesh,
        isFrontWheel: isFront,
        radius: 0.4,
        directionLocal: new BABYLON.Vector3(0, -1, 0),
        axleLocal: new BABYLON.Vector3(1, 0, 0),
        suspensionRestLength: 0.55,
        suspensionStiffness: 30,
        dampingRelaxation: 2.4,
        dampingCompression: 4.2,
        frictionSlip: 5.0,
        rollInfluence: 0.01,
        chassisConnectionPointLocal: new BABYLON.Vector3(posX, -0.5, posZ)
      });
    }

    // front wheels (x offset, z forward)
    addWheel(wheelFL, true, -0.95, 1.7);
    addWheel(wheelFR, true, 0.95, 1.7);
    // rear wheels
    addWheel(wheelBL, false, -0.95, -1.7);
    addWheel(wheelBR, false, 0.95, -1.7);

    vehicle.attachToScene();
    dbg('Vehicle created with wheels attached');

    // Camera: follow the car
    const cam = new BABYLON.FollowCamera('follow', new BABYLON.Vector3(0,2,-8), scene);
    cam.radius = 12;
    cam.heightOffset = 3.5;
    cam.rotationOffset = 180;
    cam.cameraAcceleration = 0.08;
    cam.maxCameraSpeed = 80;
    cam.lockedTarget = chassis;
    cam.attachControl(canvas, true);

    // Input state
    const state = {left:false, right:false, accel:false, brake:false, drift:false};
    const keys = {};
    window.addEventListener('keydown', (e)=>{
      if (e.key === 'ArrowLeft' || e.key === 'a') state.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') state.right = true;
      if (e.key === 'ArrowUp' || e.key === 'w') state.accel = true;
      if (e.key === 'ArrowDown' || e.key === 's') state.brake = true;
      if (e.key === ' ') state.drift = true; // spacebar for drift
    });
    window.addEventListener('keyup', (e)=>{
      if (e.key === 'ArrowLeft' || e.key === 'a') state.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') state.right = false;
      if (e.key === 'ArrowUp' || e.key === 'w') state.accel = false;
      if (e.key === 'ArrowDown' || e.key === 's') state.brake = false;
      if (e.key === ' ') state.drift = false;
    });

    // On-screen touch buttons
    function wireTouch(id, prop){
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', e=>{ state[prop] = true; e.preventDefault(); }, {passive:false});
      el.addEventListener('touchend', e=>{ state[prop] = false; e.preventDefault(); }, {passive:false});
    }
    wireTouch('leftBtn','left'); wireTouch('rightBtn','right');
    wireTouch('accBtn','accel'); wireTouch('brakeBtn','brake');
    const driftBtn = document.getElementById('driftBtn');
    if (driftBtn){
      driftBtn.addEventListener('touchstart', e=>{ state.drift = true; e.preventDefault(); }, {passive:false});
      driftBtn.addEventListener('touchend', e=>{ state.drift = false; e.preventDefault(); }, {passive:false});
    }

    // Vehicle control params
    const MAX_ENGINE_FORCE = 2800; // forward force
    const MAX_BRAKE = 120; // brake force
    const MAX_STEERING = 0.55; // radians

    // HUD elements
    const speedEl = document.getElementById('speed');
    const gearEl = document.getElementById('gear');
    const timerEl = document.getElementById('timer');
    let startTime = performance.now();

    // Main physics update loop
    scene.onBeforeRenderObservable.add(()=>{
      // steering target
      let steer = 0;
      if (state.left) steer = -MAX_STEERING;
      if (state.right) steer = MAX_STEERING;

      // combine device tilt later if needed

      // apply steering to front wheels (0,1 are front)
      vehicle.setSteeringValue(steer, 0);
      vehicle.setSteeringValue(steer, 1);

      // engine/brake forces applied to rear wheels (2,3)
      if (state.accel){
        vehicle.applyEngineForce(MAX_ENGINE_FORCE, 2);
        vehicle.applyEngineForce(MAX_ENGINE_FORCE, 3);
      } else if (state.brake){
        // strong brake on all wheels
        vehicle.setBrake(MAX_BRAKE, 0);
        vehicle.setBrake(MAX_BRAKE, 1);
        vehicle.setBrake(MAX_BRAKE, 2);
        vehicle.setBrake(MAX_BRAKE, 3);
        // remove engine force
        vehicle.applyEngineForce(0,2); vehicle.applyEngineForce(0,3);
      } else {
        // no throttle & no brake
        vehicle.applyEngineForce(0,2); vehicle.applyEngineForce(0,3);
        vehicle.setBrake(0,0); vehicle.setBrake(0,1); vehicle.setBrake(0,2); vehicle.setBrake(0,3);
      }

      // Drifting mechanic: when turning at speed or drift button pressed,
      // reduce rear wheels frictionSlip so rear slides.
      // wheelInfos accessible via vehicle.getWheelInfo?
      // In Babylon, vehicle._wheelInfos is private; but vehicle.wheelInfos exists.
      const speedVec = chassis.physicsImpostor.getLinearVelocity() || new BABYLON.Vector3(0,0,0);
      const forwardVec = chassis.getDirection(BABYLON.Axis.Z);
      const forwardSpeed = BABYLON.Vector3.Dot(speedVec, forwardVec);

      // Determine drift condition
      const turning = Math.abs(steer) > 0.12;
      const fastEnough = forwardSpeed > 3.5; // tune threshold
      const driftActive = state.drift || (turning && fastEnough && state.accel);

      // Modify frictionSlip of wheels (apply to internal wheel info array)
      // We try to set wheelInfos[i].frictionSlip if exists
      try {
        const infos = vehicle.wheelInfos || vehicle._wheelInfos || [];
        for (let i = 0; i < infos.length; i++){
          const isRear = (i >= 2); // assume last two are rear
          if (isRear) {
            infos[i].frictionSlip = driftActive ? 0.8 : 5.0; // low slip while drifting
          } else {
            infos[i].frictionSlip = 5.0;
          }
        }
      } catch(e){ /* ignore if not available */ }

      // small "assist" torque for nicer handling: reduce angular velocity to avoid flips
      const ang = chassis.physicsImpostor.getAngularVelocity();
      if (ang && Math.abs(ang.x) > 0.7){
        chassis.physicsImpostor.setAngularVelocity(new BABYLON.Vector3(ang.x * 0.9, ang.y * 0.95, ang.z * 0.9));
      }

      // HUD: speed (m/s -> km/h)
      const spd = speedVec.length();
      if (speedEl) speedEl.innerText = `${Math.round(spd * 3.6)} km/h`;
      if (gearEl) gearEl.innerText = driftActive ? 'Drift' : (state.brake ? 'Brake' : 'Drive');
      if (timerEl){
        const s = Math.floor((performance.now()-startTime)/1000);
        const mm = String(Math.floor(s/60)).padStart(2,'0');
        const ss = String(s%60).padStart(2,'0');
        timerEl.innerText = `${mm}:${ss}`;
      }
    });

    // Render
    engine.runRenderLoop(()=> scene.render());
    window.addEventListener('resize', ()=> engine.resize());

    dbg('Simulation started. Use arrow keys or on-screen buttons. Space or DRIFT for drift.');
  } // init()
})();
