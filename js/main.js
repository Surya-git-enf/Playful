// main.js
(function(){
  const canvas = document.getElementById('renderCanvas');
  const engine = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer:true, stencil:true});
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.53,0.78,0.95);

  // build world, returns road info
  const world = buildWorld(scene);
  const roadWidth = world.roadWidth;

  // player car
  const player = createPlayerCar(scene);
  player.root.position = new BABYLON.Vector3(0,0,6);

  // camera - follow + first person toggle
  const followCam = new BABYLON.FollowCamera("follow", new BABYLON.Vector3(0,6,-12), scene);
  followCam.radius = 16; followCam.heightOffset = 4.5; followCam.rotationOffset = 180; followCam.cameraAcceleration = 0.04;
  followCam.lockedTarget = player.root;
  followCam.attachControl(canvas, true);
  const firstCam = new BABYLON.UniversalCamera("first", new BABYLON.Vector3(0,1.6,0), scene);
  firstCam.parent = player.root; firstCam.position = new BABYLON.Vector3(0,1.6,0.6); firstCam.rotation = new BABYLON.Vector3(0,Math.PI,0);
  scene.activeCamera = followCam;

  // traffic: spawn some cars in both directions in lanes
  const traffic = [];
  const laneOffset = 2.8; // two-way lanes: left lane (negative x), right lane (positive x)
  for (let i=0;i<10;i++){
    // some go negative z (dir -1) in right side lane
    traffic.push(createTrafficCar(scene, laneOffset, 80 + i*28 + Math.random()*30, -1));
    // some go positive z (dir +1) in left side lane
    traffic.push(createTrafficCar(scene, -laneOffset, -20 - i*34 - Math.random()*40, +1));
  }

  // input state
  const input = {left:false,right:false,accel:false,brake:false,drift:false};

  // bind UI buttons (touch + mouse)
  function wireHold(id, prop){
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e)=>{ input[prop] = true; e.preventDefault(); }, {passive:false});
    el.addEventListener('pointerup',   (e)=>{ input[prop] = false; e.preventDefault(); }, {passive:false});
    el.addEventListener('pointerout',  (e)=>{ input[prop] = false; e.preventDefault(); }, {passive:false});
    el.addEventListener('pointercancel',(e)=>{ input[prop] = false; e.preventDefault(); }, {passive:false});
  }
  wireHold('leftBtn','left'); wireHold('rightBtn','right'); wireHold('accBtn','accel'); wireHold('brakeBtn','brake'); wireHold('driftBtn','drift');

  // keyboard fallback
  window.addEventListener('keydown',(e)=>{
    if (e.key==='ArrowLeft' || e.key==='a') input.left = true;
    if (e.key==='ArrowRight' || e.key==='d') input.right = true;
    if (e.key==='ArrowUp' || e.key==='w') input.accel = true;
    if (e.key==='ArrowDown' || e.key==='s') input.brake = true;
    if (e.key===' ') input.drift = true;
  });
  window.addEventListener('keyup',(e)=>{
    if (e.key==='ArrowLeft' || e.key==='a') input.left = false;
    if (e.key==='ArrowRight' || e.key==='d') input.right = false;
    if (e.key==='ArrowUp' || e.key==='w') input.accel = false;
    if (e.key==='ArrowDown' || e.key==='s') input.brake = false;
    if (e.key===' ') input.drift = false;
  });

  // cam toggle
  document.getElementById('camBtn').addEventListener('click', ()=>{
    try{ scene.activeCamera.detachControl(canvas); }catch(e){}
    scene.activeCamera = scene.activeCamera === followCam ? firstCam : followCam;
    scene.activeCamera.attachControl(canvas, true);
  });

  // main loop
  let last = performance.now();
  scene.onBeforeRenderObservable.add(()=>{
    const now = performance.now();
    const dt = (now - last) / 1000; last = now;
    // update player
    player.update(dt, input);

    // constrain player to road X region (allow some offroad)
    const maxX = (roadWidth/2) - 1.1;
    if (player.root.position.x > maxX){ player.root.position.x = maxX; }
    if (player.root.position.x < -maxX){ player.root.position.x = -maxX; }

    // traffic update
    for (const t of traffic) t.update(dt);

    // basic collision handling: if player close to traffic, slow the player (simple)
    for (const t of traffic) {
      const dist = BABYLON.Vector3.Distance(player.root.position, t.mesh.position);
      if (dist < 2.0) {
        // simple bounce/slow
        // push player back slightly
        const push = player.root.position.subtract(t.mesh.position).normalize().scale(0.6);
        player.root.position.addInPlace(push);
      }
    }

    // HUD speed display (approx)
    const approxSpeed = Math.round(Math.abs(player._approxSpeed || 0) * 3.6);
    document.getElementById('speed').innerText = approxSpeed + " km/h";
  });

  engine.runRenderLoop(()=>scene.render());
  window.addEventListener('resize', ()=>engine.resize());
})();
