
// src/main.js
// Tries Babylon 3D first. If Babylon/Cannon fail or error, falls back to a robust 2D Canvas simulator.
// Works on mobile and desktop. Keyboard and touch controls supported.

(function(){
  const debugEl = document.getElementById('debug');
  const speedEl = document.getElementById('speed');
  const modeEl  = document.getElementById('mode');
  const timerEl = document.getElementById('timer');
  const canvas = document.getElementById('renderCanvas');

  function dbg(...args){
    const s = args.join(' ');
    debugEl.innerText += s + '\n';
    debugEl.scrollTop = debugEl.scrollHeight;
    console.log(...args);
  }

  window.addEventListener('error', (ev) => {
    dbg('UNCAUGHT ERROR: ' + (ev && ev.message ? ev.message : String(ev)));
  });

  // Helper to wire touch UI
  function wireTouch(id, prop, state){
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => { state[prop] = true; e.preventDefault(); }, {passive:false});
    el.addEventListener('touchend',   e => { state[prop] = false; e.preventDefault(); }, {passive:false});
    // also mouse support
    el.addEventListener('mousedown', e => { state[prop] = true; e.preventDefault(); });
    el.addEventListener('mouseup',   e => { state[prop] = false; e.preventDefault(); });
  }

  // Try to start Babylon scene if available; else fallback after timeout
  const TRY_BABYLON_MS = 2000;
  let tried3D = false;

  function tryBabylonThenFallback(){
    if (tried3D) return;
    tried3D = true;

    // If global BABYLON exists, try building a very small 3D scene (no heavy physics)
    if (window.BABYLON){
      dbg('Babylon found — attempting 3D scene (light) ...');
      try {
        startSimpleBabylon();
        return;
      } catch (e) {
        dbg('3D scene failed:', e && e.message ? e.message : e);
        // fall through to 2D fallback
      }
    } else {
      dbg('Babylon not available in this environment.');
    }

    dbg('Falling back to 2D canvas simulator.');
    start2DFallback();
  }

  // Wait TRY_BABYLON_MS for BABYLON to appear, then decide
  setTimeout(tryBabylonThenFallback, TRY_BABYLON_MS);
  // But also try immediately if present
  if (window.BABYLON) tryBabylonThenFallback();

  // ---------- Light 3D scene (no heavy physics) ----------
  function startSimpleBabylon(){
    modeEl.innerText = '3D (simple)';
    // Configure canvas for Babylon
    canvas.style.touchAction = 'none';
    const engine = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer:true, stencil:true});
    dbg('Babylon Engine created');

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.52,0.75,0.96);

    // Camera
    const camera = new BABYLON.FollowCamera('cam', new BABYLON.Vector3(0,6,-16), scene);
    camera.radius = 16; camera.heightOffset = 4; camera.rotationOffset = 180; camera.cameraAcceleration = 0.06;
    camera.maxCameraSpeed = 80;

    // Light
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.9;
    const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.5,-1,-0.3), scene);
    sun.position = new BABYLON.Vector3(40,80,40);

    // Ground and road
    const ground = BABYLON.MeshBuilder.CreateGround('g', {width:500, height:2000}, scene);
    const gm = new BABYLON.StandardMaterial('gm', scene); gm.diffuseColor = new BABYLON.Color3(0.12,0.45,0.12); ground.material = gm;

    const road = BABYLON.MeshBuilder.CreateGround('road', {width:12, height:1200}, scene);
    road.position.z = 500; road.position.y = 0.02;
    const rm = new BABYLON.StandardMaterial('rm', scene); rm.diffuseColor = new BABYLON.Color3(0.06,0.06,0.06); road.material = rm;

    // simple car (box) + wheels (visual), non-physics
    const car = BABYLON.MeshBuilder.CreateBox('car', {width:2.2, height:0.7, depth:4.6}, scene);
    const cm = new BABYLON.StandardMaterial('cm', scene); cm.diffuseColor = new BABYLON.Color3(0.9,0.12,0.12); car.material = cm;
    car.position.y = 0.7; car.position.z = 0;

    function makeWheel(name, x,z){
      const w = BABYLON.MeshBuilder.CreateCylinder(name, {diameter:0.7, height:0.35, tessellation:20}, scene);
      w.rotation.z = Math.PI/2; w.material = new BABYLON.StandardMaterial(name+'m', scene); w.material.diffuseColor = new BABYLON.Color3(0.08,0.08,0.08);
      w.position = new BABYLON.Vector3(car.position.x + x, 0.25, car.position.z + z);
      return w;
    }
    const wfl = makeWheel('wfl', -0.95, 1.6);
    const wfr = makeWheel('wfr',  0.95, 1.6);
    const wbl = makeWheel('wbl', -0.95, -1.6);
    const wbr = makeWheel('wbr',  0.95, -1.6);

    camera.lockedTarget = car;

    // Input state
    const state = {left:false, right:false, accel:false, brake:false, drift:false};
    window.addEventListener('keydown', (e)=> {
      if (e.key === 'ArrowLeft' || e.key === 'a') state.left=true;
      if (e.key === 'ArrowRight' || e.key === 'd') state.right=true;
      if (e.key === 'ArrowUp' || e.key === 'w') state.accel=true;
      if (e.key === 'ArrowDown' || e.key === 's') state.brake=true;
      if (e.key === ' ') state.drift=true;
    });
    window.addEventListener('keyup', (e)=> {
      if (e.key === 'ArrowLeft' || e.key === 'a') state.left=false;
      if (e.key === 'ArrowRight' || e.key === 'd') state.right=false;
      if (e.key === 'ArrowUp' || e.key === 'w') state.accel=false;
      if (e.key === 'ArrowDown' || e.key === 's') state.brake=false;
      if (e.key === ' ') state.drift=false;
    });

    // touch wiring
    wireTouch('leftBtn','left', state);
    wireTouch('rightBtn','right', state);
    wireTouch('accBtn','accel', state);
    wireTouch('brakeBtn','brake', state);
    const driftBtn = document.getElementById('driftBtn');
    if (driftBtn){
      driftBtn.addEventListener('touchstart', e => { state.drift = true; e.preventDefault(); }, {passive:false});
      driftBtn.addEventListener('touchend', e => { state.drift = false; e.preventDefault(); }, {passive:false});
      driftBtn.addEventListener('mousedown', e => { state.drift = true; e.preventDefault(); });
      driftBtn.addEventListener('mouseup', e => { state.drift = false; e.preventDefault(); });
    }

    // Simple kinematic handling (arcade)
    let velocity = 0;
    const MAX_SPEED = 6.0;
    const ACC = 0.12;
    const BRAKE = 0.24;
    const FRICTION = 0.985;
    let lastTime = performance.now();
    let distance = 0;
    const startTime = performance.now();

    engine.runRenderLoop(()=>{
      const now = performance.now();
      const dt = Math.min(0.04, (now - lastTime)/1000);
      lastTime = now;

      // acceleration
      if (state.accel) velocity += ACC * (1 + Math.min(1, velocity/4));
      if (state.brake) velocity -= BRAKE;
      if (!state.accel && !state.brake) velocity *= FRICTION;
      velocity = Math.max(-2.5, Math.min(MAX_SPEED, velocity));

      // steering rotates car; steering effect scaled by speed
      if (state.left) car.rotation.y -= 0.035 * (1 + Math.abs(velocity)/4);
      if (state.right) car.rotation.y += 0.035 * (1 + Math.abs(velocity)/4);

      // drift: add slight drift lateral offset when drift active
      let lateral = 0;
      if (state.drift && Math.abs(velocity) > 1.5) {
        lateral = Math.sign((state.left? -1:0) + (state.right? 1:0)) * 0.12 * (Math.abs(velocity)/4);
      }

      // move
      const forward = new BABYLON.Vector3(Math.sin(car.rotation.y + lateral), 0, Math.cos(car.rotation.y + lateral));
      car.position.addInPlace(forward.scale(velocity));
      // update wheels positions visually
      const carPos = car.position;
      wfl.position = carPos.add(new BABYLON.Vector3(-0.95, -0.42, 1.6));
      wfr.position = carPos.add(new BABYLON.Vector3(0.95, -0.42, 1.6));
      wbl.position = carPos.add(new BABYLON.Vector3(-0.95, -0.42, -1.6));
      wbr.position = carPos.add(new BABYLON.Vector3(0.95, -0.42, -1.6));

      // wheel spin visual: rotate around local X proportional to speed
      const spin = velocity * 1.6;
      [wfl,wfr,wbl,wbr].forEach(w => w.rotation.x += spin);

      // HUD
      if (speedEl) speedEl.innerText = `${Math.round(Math.abs(velocity) * 30)} km/h`;
      if (modeEl) modeEl.innerText = '3D (fallback-lite)';
      if (timerEl) {
        const s = Math.floor((now - startTime)/1000);
        timerEl.innerText = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
      }

      engine.resize();
      scene.render();
    });

    dbg('3D (simple) scene running — if you want full physics we can enable Cannon but that may fail on some mobiles.');
    return true;
  }

  // ---------- Robust 2D Canvas fallback (guaranteed) ----------
  function start2DFallback(){
    modeEl.innerText = '2D fallback';
    dbg('Starting 2D fallback (guaranteed).');

    // Setup canvas for 2D
    canvas.width = Math.max(800, window.innerWidth * devicePixelRatio);
    canvas.height = Math.max(600, window.innerHeight * devicePixelRatio);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      dbg('2D canvas context not available — abort.');
      return;
    }

    // Input state
    const state = {left:false, right:false, accel:false, brake:false, drift:false};
    window.addEventListener('keydown', (e)=> {
      if (e.key === 'ArrowLeft' || e.key === 'a') state.left=true;
      if (e.key === 'ArrowRight' || e.key === 'd') state.right=true;
      if (e.key === 'ArrowUp' || e.key === 'w') state.accel=true;
      if (e.key === 'ArrowDown' || e.key === 's') state.brake=true;
      if (e.key === ' ') state.drift=true;
    });
    window.addEventListener('keyup', (e)=> {
      if (e.key === 'ArrowLeft' || e.key === 'a') state.left=false;
      if (e.key === 'ArrowRight' || e.key === 'd') state.right=false;
      if (e.key === 'ArrowUp' || e.key === 'w') state.accel=false;
      if (e.key === 'ArrowDown' || e.key === 's') state.brake=false;
      if (e.key === ' ') state.drift=false;
    });

    // wire touch/mouse controls
    wireTouch('leftBtn','left', state);
    wireTouch('rightBtn','right', state);
    wireTouch('accBtn','accel', state);
    wireTouch('brakeBtn','brake', state);
    const driftBtn = document.getElementById('driftBtn');
    if (driftBtn){
      driftBtn.addEventListener('touchstart', e=>{ state.drift = true; e.preventDefault(); }, {passive:false});
      driftBtn.addEventListener('touchend', e=>{ state.drift = false; e.preventDefault(); }, {passive:false});
      driftBtn.addEventListener('mousedown', e=>{ state.drift = true; });
      driftBtn.addEventListener('mouseup', e=>{ state.drift = false; });
    }

    // World + car state (simple kinematic)
    const world = {
      roadWidth: Math.min(120, canvas.width * 0.2),
      roadLength: 10000
    };

    // Car properties
    const car = {
      x: canvas.width/2,
      y: canvas.height*0.6,
      angle: 0,    // radians, 0 points -z (up)
      speed: 0,
      width: 58,
      height: 120,
      wheelRot: 0,
      skidTrails: []
    };

    // convert screen coords to world-like coords: we'll simulate forward movement by moving background
    let worldOffsetZ = 0;
    const MAX_SPEED = 18;
    const ACC = 0.45;
    const BRAKE = 0.9;
    const FRICTION = 0.96;
    let last = performance.now();
    const startTime = performance.now();

    function resizeCanvas(){
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      car.x = canvas.width/2;
      car.y = canvas.height*0.66;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // draw helpers
    function drawRoad(ctx){
      const w = Math.min( Math.max(180, canvas.width*0.4), 900 );
      const left = (canvas.width - w)/2;
      ctx.fillStyle = '#2b2b2b';
      ctx.fillRect(left, 0, w, canvas.height);
      // lane divider (dashed)
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.setLineDash([40, 30]);
      ctx.beginPath();
      ctx.moveTo(canvas.width/2, 0);
      ctx.lineTo(canvas.width/2, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
      // road shoulder
      ctx.fillStyle = '#244';
      ctx.fillRect(left-40, 0, 40, canvas.height);
      ctx.fillRect(left+w, 0, 40, canvas.height);
    }

    function drawBuildingsAndTrees(ctx, offset){
      // pattern of repeated buildings / trees along z using offset
      const step = 220;
      const start = Math.floor(offset/step) * step - step;
      for (let z = start; z < offset + 2000; z += step){
        // left buildings
        const bH = 60 + ((z/50)|0) % 120;
        const bx = (canvas.width - world.roadWidth)/2 - 140;
        const by = ((z - offset) * 0.3) + 40;
        ctx.fillStyle = '#6b6b7a';
        ctx.fillRect(bx, by, 100, bH);
        // right side
        const bxr = (canvas.width + world.roadWidth)/2 + 40;
        ctx.fillStyle = '#5f6f8a';
        ctx.fillRect(bxr, by, 100, bH - 10);

        // trees near road
        ctx.fillStyle = '#3c7a2b';
        ctx.beginPath();
        const tx = (canvas.width - world.roadWidth)/2 - 70;
        const ty = by - 28;
        ctx.ellipse(tx, ty, 20, 28, 0, 0, Math.PI*2);
        ctx.fill();
        const tx2 = (canvas.width + world.roadWidth)/2 + 110;
        ctx.beginPath();
        ctx.ellipse(tx2, ty, 22, 30, 0, 0, Math.PI*2);
        ctx.fill();
      }
    }

    function drawCar(ctx){
      // draw car with rotation at center
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(-car.angle); // negative so left arrow rotates left
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, car.height*0.28, car.width*0.6, car.height*0.18, 0, 0, Math.PI*2);
      ctx.fill();

      // body
      ctx.fillStyle = '#e53935';
      roundRect(ctx, -car.width/2, -car.height/2, car.width, car.height, 12);
      ctx.fill();

      // windows
      ctx.fillStyle = '#1f2b3d';
      roundRect(ctx, -car.width/2+8, -car.height/2+10, car.width-16, car.height*0.32, 6);
      ctx.fill();

      // wheels positions (visual only)
      const wheelW = 14, wheelH = 32;
      const axles = [
        {x: -car.width*0.44, y: car.height*0.28},
        {x:  car.width*0.44, y: car.height*0.28},
        {x: -car.width*0.44, y:-car.height*0.34},
        {x:  car.width*0.44, y:-car.height*0.34},
      ];
      ctx.fillStyle = '#111';
      for (let i=0;i<4;i++){
        const ax = axles[i].x, ay = axles[i].y;
        ctx.save();
        ctx.translate(ax, ay);
        // rotate front wheels a bit for steering (front two)
        if (i < 2) ctx.rotate(car.wheelAng || 0);
        ctx.fillRect(-wheelW/2, -wheelH/2, wheelW, wheelH);
        ctx.restore();
      }

      ctx.restore();
    }

    function roundRect(ctx,x,y,w,h,r){
      ctx.beginPath();
      ctx.moveTo(x+r, y);
      ctx.lineTo(x+w-r, y);
      ctx.quadraticCurveTo(x+w, y, x+w, y+r);
      ctx.lineTo(x+w, y+h-r);
      ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
      ctx.lineTo(x+r, y+h);
      ctx.quadraticCurveTo(x, y+h, x, y+h-r);
      ctx.lineTo(x, y+r);
      ctx.quadraticCurveTo(x, y, x+r, y);
      ctx.closePath();
    }

    // skid trails stored as {x,y,alpha,life}
    function updateSkid(dt){
      // remove dead
      for (let i = car.skidTrails.length-1; i>=0; i--){
        car.skidTrails[i].life -= dt;
        if (car.skidTrails[i].life <= 0) car.skidTrails.splice(i,1);
      }
      // add new if drifting and moving fast
      if ((state.drift || (Math.abs(car.angleDelta || 0) > 0.04 && Math.abs(car.speed)>6)) && Math.abs(car.speed) > 3){
        car.skidTrails.push({x: car.x - Math.sin(car.angle)*10, y: car.y + Math.cos(car.angle)*10, alpha:0.95, life:0.8});
      }
    }

    function drawSkids(ctx){
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      for (const s of car.skidTrails){
        ctx.fillStyle = `rgba(10,10,10,${Math.max(0, s.life/1)})`;
        ctx.fillRect(s.x - 6, s.y - 2, 12, 4);
      }
      ctx.restore();
    }

    // main loop
    let lastT = performance.now();
    function loop(t){
      const dt = Math.min(0.05, (t - lastT)/1000);
      lastT = t;

      // physics-like updates
      if (state.accel) car.speed += ACC * dt * 60;
      if (state.brake) car.speed -= BRAKE * dt * 60;
      if (!state.accel && !state.brake) car.speed *= FRICTION;

      car.speed = Math.max(-MAX_SPEED/2, Math.min(MAX_SPEED, car.speed));

      // steering scaled by speed
      const steerBase = 0.03;
      const steerEffect = steerBase * (1 + Math.min(2.2, Math.abs(car.speed)/6));
      if (state.left) car.angle += steerEffect * dt * 60;
      if (state.right) car.angle -= steerEffect * dt * 60;

      // drifting: when drift engaged or aggressive steering at speed, modify speed & sideways "slide"
      let slide = 0;
      if (state.drift) {
        // slight speed loss, add sideways slide
        car.speed *= 0.997;
        slide = 8 * Math.sign(car.angle > 0 ? 1 : -1);
      } else if (Math.abs(car.angle) > 0.25 && Math.abs(car.speed) > 8) {
        slide = 3;
      }

      // move forward (we simulate movement by moving mash of background elements)
      worldOffsetZ += car.speed * dt * 60;
      // for 2D look, y doesn't change; car stays center-bottom
      // wheel rotation visual
      car.wheelRot += car.speed * 0.15;
      car.wheelAng = (state.left? 0.35 : (state.right? -0.35 : 0)) * Math.min(1, Math.abs(car.speed)/6);

      // update skid trails
      updateSkid(dt);

      // clear
      ctx.clearRect(0,0,canvas.width,canvas.height);

      // draw background: sky gradient
      const g = ctx.createLinearGradient(0,0,0,canvas.height);
      g.addColorStop(0, '#6aa0ff'); g.addColorStop(1, '#1b365a');
      ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);

      // environment (buildings & trees)
      drawBuildingsAndTrees(ctx, worldOffsetZ);

      // road + environment
      drawRoad(ctx);

      // skids
      drawSkids(ctx);

      // draw car above
      drawCar(ctx);

      // HUD updates
      if (speedEl) speedEl.innerText = `${Math.round(Math.abs(car.speed)*6)} km/h`;
      if (timerEl) {
        const s = Math.floor((t - startTime)/1000);
        timerEl.innerText = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
      }

      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
    dbg('2D fallback running — guaranteed visible. Use controls or arrow keys.');
  } // end start2DFallback

  // ensure user sees something if neither branch runs in time
  setTimeout(()=> {
    if (!tried3D) { dbg('No engine started yet, attempting fallback now.'); tryBabylonThenFallback(); }
  }, 3000);

})();
