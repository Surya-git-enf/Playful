// src/main.js - Robust 2D car simulator (improved)
// Arcade-but-realistic physics, collisions, drift, obstacles, buildings, sound (synth).
(function () {
  // DOM
  const canvas = document.getElementById('renderCanvas');
  const speedEl = document.getElementById('speed');
  const distEl = document.getElementById('distance');
  const timerEl = document.getElementById('timer');
  const debugEl = document.getElementById('debug');

  // Resize canvas to device pixels
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    if (debugEl) debugEl.style.display = 'block';
    console.error('Canvas 2D not supported.');
    return;
  }

  // Debug helper
  function dbg(msg) {
    if (!debugEl) return;
    debugEl.style.display = 'block';
    debugEl.innerText += msg + '\n';
    debugEl.scrollTop = debugEl.scrollHeight;
    console.log(msg);
  }

  // Input state
  const input = { left: false, right: false, accel: false, brake: false, drift: false };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
    if (e.key === 'ArrowUp' || e.key === 'w') input.accel = true;
    if (e.key === 'ArrowDown' || e.key === 's') input.brake = true;
    if (e.key === ' ' || e.key === 'Spacebar') input.drift = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
    if (e.key === 'ArrowUp' || e.key === 'w') input.accel = false;
    if (e.key === 'ArrowDown' || e.key === 's') input.brake = false;
    if (e.key === ' ' || e.key === 'Spacebar') input.drift = false;
  });

  // Touch/mouse buttons wiring
  function wireBtn(id, prop) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (ev) => { input[prop] = true; ev.preventDefault(); }, { passive: false });
    el.addEventListener('touchend', (ev) => { input[prop] = false; ev.preventDefault(); }, { passive: false });
    el.addEventListener('mousedown', (ev) => { input[prop] = true; ev.preventDefault(); });
    el.addEventListener('mouseup', (ev) => { input[prop] = false; ev.preventDefault(); });
    el.addEventListener('mouseleave', (ev) => { input[prop] = false; });
  }
  wireBtn('leftBtn', 'left');
  wireBtn('rightBtn', 'right');
  wireBtn('accBtn', 'accel');
  wireBtn('brakeBtn', 'brake');
  wireBtn('driftBtn', 'drift');

  // Audio (simple synth for engine + crash)
  let audioCtx = null;
  let engineOsc = null;
  let engineGain = null;
  let crashGain = null;
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = audioCtx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 90;
      engineGain = audioCtx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(audioCtx.destination);
      engineOsc.start();

      crashGain = audioCtx.createGain();
      crashGain.gain.value = 0;
      crashGain.connect(audioCtx.destination);
    } catch (e) {
      dbg('Audio init failed: ' + e.message);
    }
  }
  // resume on first user interaction
  ['touchstart', 'mousedown', 'keydown'].forEach(evt => {
    window.addEventListener(evt, () => { if (!audioCtx) initAudio(); }, { once: true, passive: true });
  });

  function setEngineTone(power) {
    if (!engineGain || !engineOsc) return;
    const targetGain = Math.min(0.45, 0.05 + power * 0.7);
    engineGain.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 0.05);
    engineOsc.frequency.linearRampToValueAtTime(80 + power * 420, audioCtx.currentTime + 0.05);
  }
  function playCrash() {
    if (!audioCtx || !crashGain) return;
    const o = audioCtx.createOscillator();
    o.type = 'square';
    o.frequency.value = 140;
    o.connect(crashGain);
    crashGain.gain.cancelScheduledValues(audioCtx.currentTime);
    crashGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    crashGain.gain.exponentialRampToValueAtTime(0.4, audioCtx.currentTime + 0.02);
    crashGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    o.start();
    o.stop(audioCtx.currentTime + 0.35);
  }

  // World geometry + visuals
  let W = canvas.width, H = canvas.height;
  function updateWH() { W = canvas.width; H = canvas.height; }
  updateWH();

  // Car state (center-bottom view)
  const car = {
    px: W / 2,
    py: H * 0.7,
    angle: 0,           // radians (0 = forward/up the screen)
    speed: 0,
    width: Math.max(54, W * 0.08),
    height: Math.max(110, H * 0.16),
    wheelAng: 0,
    wheelRot: 0,
    crashed: false
  };

  // Road & environment state
  let world = {
    offsetZ: 0,
    roadW: Math.max( Math.min( W * 0.45, 700 ), 220),
    buildings: [],
    trees: [],
    obstacles: []
  };

  // Populate buildings/trees/obstacles along road
  function seedWorld() {
    world.buildings = [];
    world.trees = [];
    world.obstacles = [];
    for (let i = 0; i < 80; i++) {
      const z = i * 200 + 80;
      world.buildings.push({ side: -1, x: - (world.roadW / 2) - 140 - Math.random() * 40, z, w: 80 + Math.random()*120, h: 80 + Math.random()*180 });
      world.buildings.push({ side: 1, x: (world.roadW / 2) + 60 + Math.random() * 40, z, w: 80 + Math.random()*120, h: 80 + Math.random()*180 });
      // trees near road
      world.trees.push({ x: - (world.roadW / 2) - 60, z: z + (Math.random()*60-30), size: 18 + Math.random()*14 });
      world.trees.push({ x: (world.roadW / 2) + 100, z: z + (Math.random()*60-30), size: 18 + Math.random()*14 });
      // obstacles occasionally
      if (Math.random() < 0.22) {
        const ox = (Math.random() * (world.roadW - 120)) - (world.roadW/2 - 60);
        world.obstacles.push({ x: ox, z: z + 40, w: 36 + Math.random()*40, h: 36 + Math.random()*40, hit: false });
      }
    }
  }
  seedWorld();

  // Collision helper (rect collision in screen coords)
  function rectsIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
    return !(bx > ax + aw || bx + bw < ax || by > ay + ah || by + bh < ay);
  }

  // Controls physics parameters (tweak these for realism)
  const PARAM = {
    ACC: 0.45,             // acceleration per second (pixels/frame scale)
    BRAKE: 1.8,
    MAX_SPEED: 22,        // top speed (tuned for feeling)
    FRICTION: 0.985,
    STEER_BASE: 0.038,    // base steering per frame
    STEER_SPEED_SCALE: 0.015,
    DRIFT_SLIDE: 0.16,    // lateral slide factor when drifting
    COLLIDE_SLOW: 0.28    // slow factor on collision
  };

  // HUD stats
  let distanceMeters = 0;
  const pxToMeters = 0.2; // for display only (arbitrary)
  let startTime = performance.now();

  // Resize response
  function onResize() {
    resize();
    updateWH();
    car.width = Math.max(54, W * 0.08);
    car.height = Math.max(110, H * 0.16);
    world.roadW = Math.max( Math.min( W * 0.45, 700 ), 220);
  }
  window.addEventListener('resize', onResize);

  // Game loop
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;

    // update world offset based on car speed (simulate forward motion)
    const sp = car.speed;
    world.offsetZ += sp * dt * 60; // scale to get visible motion
    distanceMeters += Math.max(0, sp) * dt * pxToMeters * 10;

    // Input -> physics
    if (input.accel && !car.crashed) {
      car.speed += PARAM.ACC * dt * 60;
    } else if (input.brake && !car.crashed) {
      car.speed -= PARAM.BRAKE * dt * 60;
    } else {
      car.speed *= PARAM.FRICTION;
    }
    // clamp
    car.speed = Math.max(-PARAM.MAX_SPEED/2, Math.min(PARAM.MAX_SPEED, car.speed));

    // steering: effect scales with speed
    const steerEffect = PARAM.STEER_BASE * (1 + Math.min(2.2, Math.abs(car.speed) / 6));
    if (input.left) car.wheelAng = Math.max(-0.7, car.wheelAng - steerEffect);
    else if (input.right) car.wheelAng = Math.min(0.7, car.wheelAng + steerEffect);
    else car.wheelAng *= 0.92; // self center

    // angle change: steering + drift
    let steerTurn = car.wheelAng * (0.018 + Math.abs(car.speed) * PARAM.STEER_SPEED_SCALE);
    if (car.speed < 0) steerTurn *= -1; // reverse steering direction when reversing

    // drift effect: lateral slide
    let lateralSlide = 0;
    const isDrifting = input.drift && Math.abs(car.speed) > 6;
    if (isDrifting) {
      lateralSlide = Math.sign(car.wheelAng || 0) * PARAM.DRIFT_SLIDE * Math.min(1, Math.abs(car.speed)/18);
    }

    car.angle += steerTurn;
    // forward movement mapped to screen: forward moves the background (world) and car has slight sway
    // We keep car visually steady but allow slight lateral "slip" to simulate drift
    // wheelRot for animation
    car.wheelRot += car.speed * 0.12;

    // Collision detection with obstacles (project obstacle z -> screen Y roughly)
    // For each active obstacle, compute screen position and test intersection with car rect
    const carRect = {
      w: car.width,
      h: car.height,
      x: car.px - car.width/2,
      y: car.py - car.height/2
    };

    // update obstacles list: remove far past obstacles for performance
    // but we need them for collisions until passed
    for (const obs of world.obstacles) {
      const relZ = obs.z - world.offsetZ;
      // screen Y mapping: objects with smaller relZ are closer to bottom (bigger Y)
      // We'll compute screen y = base + scale * relZ
      // Keep consistent mapping: z from 0..2000 maps to y from some range
    }

    // Collision check loop
    for (const obs of world.obstacles) {
      if (obs.hit) continue;
      const relZ = obs.z - world.offsetZ;
      if (relZ < -300) continue; // passed long ago
      // map relZ to screen Y
      const perspective = 1 - Math.max(0, Math.min(1, (relZ) / 1200)); // 1 near, 0 far
      const roadCenterX = W/2;
      const screenX = roadCenterX + (obs.x) * (0.9); // small horizontal scale
      const screenY = H * 0.45 + (1 - perspective) * H * 0.35; // closer -> lower on screen
      const obsW = obs.w * (0.7 + perspective * 0.6);
      const obsH = obs.h * (0.4 + perspective * 0.6);

      if (rectsIntersect(carRect.x, carRect.y, carRect.w, carRect.h, screenX - obsW/2, screenY - obsH/2, obsW, obsH)) {
        // collision!
        obs.hit = true;
        car.speed *= (1 - PARAM.COLLIDE_SLOW);
        car.crashed = true;
        playCrashVisual();
        try { playCrash(); } catch(e){}
        // small timeout to recover
        setTimeout(() => { car.crashed = false; }, 450 + Math.abs(car.speed)*20);
      }
    }

    // draw frame
    drawFrame();

    // HUD
    if (speedEl) speedEl.innerText = `${Math.round(Math.abs(car.speed) * 6)} km/h`;
    if (distEl) distEl.innerText = `${Math.round(distanceMeters)} m`;
    if (timerEl) {
      const s = Math.floor((now - startTime) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      timerEl.innerText = `${mm}:${ss}`;
    }

    // engine sound update
    if (audioCtx && engineGain) {
      const p = Math.min(1, Math.max(0, Math.abs(car.speed) / PARAM.MAX_SPEED));
      setEngineTone(p);
    }

    requestAnimationFrame(loop);
  }

  // crash visual (flash)
  function playCrashVisual() {
    // small flash overlay
    const start = performance.now();
    const flash = () => {
      const now = performance.now();
      const t = (now - start) / 300;
      if (t > 1) return;
      ctx.fillStyle = `rgba(255,120,120,${0.28 * (1 - t)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      requestAnimationFrame(flash);
    };
    flash();
  }

  // drawing function: road, buildings, trees, obstacles, car
  function drawFrame() {
    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const Wpx = canvas.width;
    const Hpx = canvas.height;

    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, Hpx);
    g.addColorStop(0, '#6aa0ff'); g.addColorStop(1, '#12344a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, Wpx, Hpx);

    // perspective mapping helpers
    const roadCenterX = Wpx / 2;
    const roadHalf = world.roadW / 2;

    // draw distant buildings & trees in layers based on z relative to offset
    // We'll draw segments ahead of car
    for (let i = 0; i < world.buildings.length; i++) {
      const b = world.buildings[i];
      const relZ = b.z - world.offsetZ;
      if (relZ < -200 || relZ > 1800) continue;
      const pct = Math.max(0.01, 1 - relZ / 1600);
      const screenY = Hpx * 0.25 + (1 - pct) * Hpx * 0.55;
      const scale = 0.6 + pct * 1.2;
      const bx = roadCenterX + b.x * 1.0;
      ctx.fillStyle = b.side < 0 ? '#6b6b7a' : '#5f6f8a';
      const bw = b.w * scale, bh = b.h * scale;
      ctx.fillRect(bx, screenY - bh, bw, bh);
      // windows
      ctx.fillStyle = 'rgba(255,255,220,0.06)';
      for (let r = 0; r < Math.floor(bh / 20); r++) {
        for (let c = 0; c < Math.floor(bw / 18); c++) {
          if (Math.random() < 0.18) continue;
          ctx.fillRect(bx + 6 + c * 18, screenY - bh + 6 + r * 18, 10, 10);
        }
      }
    }

    // trees
    for (let i = 0; i < world.trees.length; i++) {
      const t = world.trees[i];
      const relZ = t.z - world.offsetZ;
      if (relZ < -200 || relZ > 2000) continue;
      const pct = Math.max(0.01, 1 - relZ / 1600);
      const sy = Hpx * 0.25 + (1 - pct) * Hpx * 0.55;
      const sx = roadCenterX + t.x * (0.9);
      ctx.fillStyle = '#5b8b3a';
      ctx.beginPath();
      ctx.ellipse(sx, sy - 10, t.size * pct, t.size * pct * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5b3a2a';
      ctx.fillRect(sx - 6 * pct, sy + 2 * pct, 8 * pct, 18 * pct);
    }

    // road shoulder
    ctx.fillStyle = '#1b2b3b';
    ctx.fillRect(0, Hpx * 0.45, (roadCenterX - world.roadW / 2) - 40, Hpx * 0.55);
    ctx.fillRect((roadCenterX + world.roadW / 2) + 40, Hpx * 0.45, (roadCenterX - world.roadW / 2) - 40, Hpx * 0.55);

    // road (perspective: narrow toward top)
    // We'll draw a trapezoid representing the road
    const topWidth = world.roadW * 0.32;
    const bottomWidth = world.roadW;
    const topY = Hpx * 0.12;
    const bottomY = Hpx * 0.95;
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.moveTo(roadCenterX - bottomWidth / 2, bottomY);
    ctx.lineTo(roadCenterX - topWidth / 2, topY);
    ctx.lineTo(roadCenterX + topWidth / 2, topY);
    ctx.lineTo(roadCenterX + bottomWidth / 2, bottomY);
    ctx.closePath();
    ctx.fill();

    // lane center dashed
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.setLineDash([40, 30]);
    ctx.beginPath();
    // center from bottom to top
    ctx.moveTo(roadCenterX, bottomY);
    ctx.lineTo(roadCenterX, topY);
    ctx.stroke();
    ctx.setLineDash([]);

    // draw obstacles (boxes) with perspective scale
    for (let i = 0; i < world.obstacles.length; i++) {
      const o = world.obstacles[i];
      const relZ = o.z - world.offsetZ;
      if (relZ < -100 || relZ > 2000) continue;
      const pct = Math.max(0.02, 1 - relZ / 1600);
      const sx = roadCenterX + o.x * (0.9);
      const sy = Hpx * 0.45 + (1 - pct) * Hpx * 0.5;
      const ow = o.w * pct;
      const oh = o.h * pct;
      ctx.fillStyle = o.hit ? '#552' : '#6b3a3a';
      ctx.fillRect(sx - ow / 2, sy - oh / 2, ow, oh);
      // subtle shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(sx - ow / 2 + 6 * pct, sy + oh / 2, ow * 0.8, 6 * pct);
    }

    // draw skids if any (not implemented heavy) - keep it minimal

    // draw car at lower center
    ctx.save();
    ctx.translate(car.px, car.py);
    ctx.rotate(-car.angle); // negative to match steering direction
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, car.height * 0.34, car.width * 0.58, car.height * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = '#e53935';
    roundRect(ctx, -car.width / 2, -car.height / 2, car.width, car.height, 14);
    ctx.fill();

    // window
    ctx.fillStyle = '#132233';
    roundRect(ctx, -car.width / 2 + 10, -car.height / 2 + 16, car.width - 20, car.height * 0.34, 6);
    ctx.fill();

    // wheels (visual)
    const whW = Math.max(12, car.width * 0.2);
    const whH = Math.max(30, car.height * 0.28);
    const axles = [
      { x: -car.width * 0.38, y: car.height * 0.28 },
      { x: car.width * 0.38, y: car.height * 0.28 },
      { x: -car.width * 0.38, y: -car.height * 0.34 },
      { x: car.width * 0.38, y: -car.height * 0.34 }
    ];
    ctx.fillStyle = '#111';
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(axles[i].x, axles[i].y);
      if (i < 2) ctx.rotate(car.wheelAng || 0);
      // spin animation front/back use wheelRot
      ctx.fillRect(-whW / 2, -whH / 2, whW, whH);
      ctx.restore();
    }

    ctx.restore();
  }

  // Rounded rect helper
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x + r, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // start the loop
  let started = false;
  function start() {
    if (started) return;
    started = true;
    last = performance.now();
    requestAnimationFrame(loop);
    dbg('Game started: use arrows/WASD or on-screen buttons. Hold DRIFT for drifts.');
  }

  // small helper to ensure button events trigger start/resume audio
  ['touchstart','mousedown','keydown'].forEach(ev => window.addEventListener(ev, () => {
    if (!audioCtx) initAudio();
    start();
  }, { once: true, passive: true }));

  // allow manual restart/seed when needed
  function resetGame(){
    world.offsetZ = 0;
    distanceMeters = 0;
    car.speed = 0;
    car.angle = 0;
    seedWorld();
  }

  // expose debug controls in console for you
  window.PLAYFUL = { resetGame, dbg };

  // initial call
  start();

})();
