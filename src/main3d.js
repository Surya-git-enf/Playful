// src/main3d.js
// 3D car game — Try Babylon + Cannon RaycastVehicle; fallback to kinematic 3D if physics not available.
// Non-module script; will run on GitHub Pages / mobile. Keep in single file for easy copy/paste.

(function(){
  const canvas = document.getElementById('renderCanvas');
  const debugEl = document.getElementById('debug');
  const modeEl = document.getElementById('mode');
  const speedEl = document.getElementById('speed');
  const timerEl = document.getElementById('timer');
  const startBtn = document.getElementById('startBtn');

  function dbg(...a){ try { debugEl.style.display = 'block'; debugEl.innerText += a.join(' ') + '\n'; debugEl.scrollTop = debugEl.scrollHeight; } catch(e){ console.log(...a); } }

  // Controls
  const input = {left:false,right:false,accel:false,brake:false,drift:false};
  function wireBtn(id, prop){
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e=>{ input[prop]=true; e.preventDefault(); }, {passive:false});
    el.addEventListener('touchend',   e=>{ input[prop]=false; e.preventDefault(); }, {passive:false});
    el.addEventListener('mousedown', e=>{ input[prop]=true; });
    el.addEventListener('mouseup',   e=>{ input[prop]=false; });
  }
  wireBtn('leftBtn','left'); wireBtn('rightBtn','right'); wireBtn('accBtn','accel'); wireBtn('brakeBtn','brake'); wireBtn('driftBtn','drift');
  window.addEventListener('keydown', e=>{
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
    if (e.key === 'ArrowUp' || e.key === 'w') input.accel = true;
    if (e.key === 'ArrowDown' || e.key === 's') input.brake = true;
    if (e.key === ' ') input.drift = true;
  });
  window.addEventListener('keyup', e=>{
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
    if (e.key === 'ArrowUp' || e.key === 'w') input.accel = false;
    if (e.key === 'ArrowDown' || e.key === 's') input.brake = false;
    if (e.key === ' ') input.drift = false;
  });

  // Start button: fullscreen + resume audio if needed
  startBtn.addEventListener('click', async ()=>{
    try { await canvas.requestFullscreen(); } catch(e){}
    startBtn.style.display = 'none';
  });

  // Wait for Babylon global
  function waitBabylon(cb, tries=0){
    if (window.BABYLON) return cb();
    if (tries > 60) return cb(new Error('Babylon not found'));
    setTimeout(()=> waitBabylon(cb, tries+1), 80);
  }

  waitBabylon(init);

  function init(err){
    if (err) { dbg('Babylon not loaded — aborting 3D init.'); return; }
    const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true });
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.48,0.75,0.95);

    // Camera + lights
    const camera = new BABYLON.FollowCamera('follow', new BABYLON.Vector3(0,5,-12), scene);
    camera.radius = 14; camera.heightOffset = 4; camera.rotationOffset = 180; camera.cameraAcceleration = 0.05;
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.9;
    const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.4,-1,-0.3), scene); sun.position = new BABYLON.Vector3(40,80,40);

    // environment
    const ground = BABYLON.MeshBuilder.CreateGround('ground', {width:1600, height:1600}, scene);
    const gm = new BABYLON.StandardMaterial('gm', scene); gm.diffuseColor = new BABYLON.Color3(0.13,0.45,0.12); ground.material = gm;
    ground.receiveShadows = true;

    // road
    const roadW = 12;
    const road = BABYLON.MeshBuilder.CreateGround('road', {width: roadW, height: 2000}, scene);
    road.position.y = 0.02; road.position.z = 600;
    const rm = new BABYLON.StandardMaterial('rm', scene); rm.diffuseColor = new BABYLON.Color3(0.06,0.06,0.06); road.material = rm;

    // lane dividers
    for (let i=0;i<120;i++){
      const d = BABYLON.MeshBuilder.CreateBox('div'+i, {width:0.15, height:0.01, depth: 2}, scene);
      d.position = new BABYLON.Vector3(0, 0.02, i*16 + 20);
      d.material = new BABYLON.StandardMaterial('divm'+i, scene);
      d.material.diffuseColor = new BABYLON.Color3(1,1,1);
    }

    // roadside buildings & trees
    function addBuilding(x,z,w,h){
      const b = BABYLON.MeshBuilder.CreateBox('b'+x+z, {width:w, height:h, depth: Math.max(8,w/2)}, scene);
      b.position = new BABYLON.Vector3(x, h/2, z);
      const m = new BABYLON.StandardMaterial('bm'+x+z, scene);
      m.diffuseColor = new BABYLON.Color3(0.2 + Math.random()*0.4, 0.2, 0.2 + Math.random()*0.4);
      b.material = m;
      b.receiveShadows = true;
      b.checkCollisions = true;
    }
    for (let i=0;i<40;i++){
      const z = 40 + i*60 + Math.random()*30;
      addBuilding(-20 - Math.random()*18, z, 10 + Math.random()*20, 12 + Math.random()*40);
      addBuilding(20 + Math.random()*18, z, 10 + Math.random()*20, 12 + Math.random()*40);
    }

    function addTree(x,z){
      const trunk = BABYLON.MeshBuilder.CreateCylinder('t'+x+z, {height:3, diameterTop:0.6, diameterBottom:0.6}, scene);
      trunk.position = new BABYLON.Vector3(x, 1.5, z);
      const leaves = BABYLON.MeshBuilder.CreateSphere('l'+x+z, {diameter:2.5}, scene);
      leaves.position = new BABYLON.Vector3(x, 3.2, z);
      const tm = new BABYLON.StandardMaterial('tm'+x+z, scene); tm.diffuseColor = new BABYLON.Color3(0.46,0.7,0.26);
      leaves.material = tm;
      trunk.material = new BABYLON.StandardMaterial('trm'+x+z, scene); trunk.material.diffuseColor = new BABYLON.Color3(0.35,0.18,0.06);
    }
    for (let i=0;i<40;i++){
      addTree(-38, 40 + i*45 + (Math.random()*20-10));
      addTree(38, 40 + i*45 + (Math.random()*20-10));
    }

    // car meshes (chassis + wheels)
    const chassis = BABYLON.MeshBuilder.CreateBox('chassis', {width: 2.2, height:0.6, depth:4.4}, scene);
    chassis.position = new BABYLON.Vector3(0,1.6, 0);
    const chMat = new BABYLON.StandardMaterial('chm', scene); chMat.diffuseColor = new BABYLON.Color3(0.9,0.12,0.12);
    chassis.material = chMat;
    chassis.receiveShadows = true; chassis.checkCollisions = true;

    const makeWheel = (name) => {
      const w = BABYLON.MeshBuilder.CreateCylinder(name, {diameter:0.7, height:0.36, tessellation:24}, scene);
      w.rotation.z = Math.PI/2; w.material = new BABYLON.StandardMaterial(name+'m', scene); w.material.diffuseColor = new BABYLON.Color3(0.08,0.08,0.08);
      return w;
    };

    const wFL = makeWheel('wFL'); const wFR = makeWheel('wFR'); const wBL = makeWheel('wBL'); const wBR = makeWheel('wBR');

    // shadow generator (for nicer visuals)
    const shadowGen = new BABYLON.ShadowGenerator(2048, sun);
    shadowGen.addShadowCaster(chassis);
    [wFL,wFR,wBL,wBR].forEach(w=>shadowGen.addShadowCaster(w));
    shadowGen.useBlurExponentialShadowMap = true;

    // Try enabling physics with Cannon and RaycastVehicle. If it fails, fallback to kinematic vehicle.
    let physicsEnabled = false;
    let vehicle = null;

    try {
      if (window.CANNON) {
        const cannonPlugin = new BABYLON.CannonJSPlugin();
        scene.enablePhysics(new BABYLON.Vector3(0,-9.82,0), cannonPlugin);
        // prepare chassis physics (we will rely on RaycastVehicle)
        chassis.physicsImpostor = new BABYLON.PhysicsImpostor(chassis, BABYLON.PhysicsImpostor.BoxImpostor, { mass:350 }, scene);

        // create raycast vehicle
        vehicle = new BABYLON.RaycastVehicle({ chassisMesh: chassis, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 }, scene);

        function addWheelToVehicle(m, isFront, x, z){
          vehicle.addWheel({
            wheelMesh: m,
            isFrontWheel: isFront,
            radius: 0.36,
            directionLocal: new BABYLON.Vector3(0, -1, 0),
            axleLocal: new BABYLON.Vector3(1, 0, 0),
            suspensionRestLength: 0.5,
            suspensionStiffness: 26,
            dampingRelaxation: 2.5,
            dampingCompression: 4.2,
            frictionSlip: 6,
            rollInfluence: 0.01,
            chassisConnectionPointLocal: new BABYLON.Vector3(x, -0.4, z)
          });
        }
        addWheelToVehicle(wFL, true, -0.95, 1.8);
        addWheelToVehicle(wFR, true, 0.95, 1.8);
        addWheelToVehicle(wBL, false, -0.95, -1.8);
        addWheelToVehicle(wBR, false, 0.95, -1.8);

        vehicle.attachToScene();
        physicsEnabled = true;
        dbg('Physics: Cannon + RaycastVehicle READY');
        modeEl.innerText = '3D Physics';
      } else {
        dbg('Cannon not found; skipping physics init');
      }
    } catch(e){
      dbg('Physics init failed:', e && e.message ? e.message : e);
      physicsEnabled = false;
    }

    // Kinematic fallback variables (if physics not available)
    const kin = {
      velocity: new BABYLON.Vector3.Zero(),
      speed: 0,
      maxSpeed: 20,
      steer: 0,
      maxSteer: 0.55
    };
    if (!physicsEnabled) { modeEl.innerText = '3D (kinematic)'; dbg('Using kinematic 3D fallback'); }

    // camera lock target
    camera.lockedTarget = chassis;

    // control parameters
    const MAX_ENGINE = 2400;
    const MAX_BRAKE = 320;
    const MAX_STEER = 0.55;

    // HUD and timing
    const startTime = performance.now();

    // main update
    scene.onBeforeRenderObservable.add(()=> {
      // controls -> compute steering, throttle, brake
      let steer = 0;
      if (input.left) steer = -MAX_STEER;
      if (input.right) steer = MAX_STEER;

      if (physicsEnabled && vehicle) {
        // steering for front wheels
        vehicle.setSteeringValue(steer, 0);
        vehicle.setSteeringValue(steer, 1);

        // engine/brake to rear wheels (2,3)
        if (input.accel) {
          vehicle.applyEngineForce(MAX_ENGINE, 2);
          vehicle.applyEngineForce(MAX_ENGINE, 3);
        } else {
          vehicle.applyEngineForce(0,2); vehicle.applyEngineForce(0,3);
        }
        if (input.brake) {
          vehicle.setBrake(MAX_BRAKE, 0); vehicle.setBrake(MAX_BRAKE,1); vehicle.setBrake(MAX_BRAKE,2); vehicle.setBrake(MAX_BRAKE,3);
        } else {
          vehicle.setBrake(0,0); vehicle.setBrake(0,1); vehicle.setBrake(0,2); vehicle.setBrake(0,3);
        }

        // adjust rear friction for drift
        try {
          const infos = vehicle.wheelInfos || vehicle._wheelInfos || [];
          for (let i=0;i<infos.length;i++){
            const isRear = (i>=2);
            infos[i].frictionSlip = isRear ? (input.drift ? 0.9 : 5.0) : 5.0;
          }
        } catch(e){ /* ignore */ }

        // update wheel visuals are handled by Babylon if wheelMesh provided
        // update HUD speed using chassis physics linear velocity
        if (chassis.physicsImpostor) {
          const lv = chassis.physicsImpostor.getLinearVelocity() || new BABYLON.Vector3(0,0,0);
          const spd = lv.length();
          if (speedEl) speedEl.innerText = `${Math.round(spd * 3.6)} km/h`;
        }
      } else {
        // Kinematic: simple but natural-feeling model (bicycle-like)
        // dt from engine.getDeltaTime
        const dt = engine.getDeltaTime() / 1000;
        // steering interpolation
        kin.steer += (steer - kin.steer) * Math.min(1, 6 * dt);
        // throttle/brake
        if (input.accel) kin.speed += 16 * dt; else kin.speed -= 8 * dt;
        if (input.brake) kin.speed -= 32 * dt;
        kin.speed = Math.max(-6, Math.min(kin.maxSpeed, kin.speed));
        // apply friction when no input
        if (!input.accel && !input.brake) kin.speed *= 0.992;

        // turning radius effect
        const angular = kin.speed * kin.steer * 0.06;
        chassis.rotation.y += angular * dt * 60;

        // compute forward vector from chassis rotation
        const forward = chassis.forward.normalize();
        chassis.position.addInPlace(forward.scale(kin.speed * dt * 60));

        // wheel visuals: spin based on kin.speed
        const spin = kin.speed * 2.2;
        [wFL,wFR,wBL,wBR].forEach(w => { w.rotation.x += spin * engine.getDeltaTime()/1000; });
        // rotate front wheels by steer angle for visuals
        wFL.rotation.y = -kin.steer; wFR.rotation.y = -kin.steer;

        // HUD speed
        if (speedEl) speedEl.innerText = `${Math.round(Math.abs(kin.speed) * 12)} km/h`;
      }

      // update timer
      const s = Math.floor((performance.now() - startTime)/1000);
      if (timerEl) timerEl.innerText = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

    }); // end onBeforeRender

    // Nice camera smoothing
    camera.attachControl(canvas, true);

    // fallback: if physics was requested but vehicle has problems, show debug and fallback
    engine.runRenderLoop(()=> {
      scene.render();
    });

    window.addEventListener('resize', ()=> engine.resize());

    // final message
    dbg('Scene ready. Physics: ' + (physicsEnabled ? 'ENABLED' : 'DISABLED (kinematic fallback)'));
    modeEl.innerText = physicsEnabled ? '3D (Physics)' : '3D (Kinematic)';
  } // init
})();
