// js/ui.js
// Mobile driving controls (steering + pedals)
// This version keeps two sets of names in sync so different car scripts work:
// - accelerate / brake / steer  (used by UI examples)
// - forward / backward / steeringValue (used by some car scripts)

(function () {
  // Primary input state we control
  window.inputState = window.inputState || {
    // UI-native names
    accelerate: false,
    brake: false,
    steer: 0,
    drift: false,
    // mirrored names for other scripts
    forward: false,
    backward: false,
    steeringValue: 0
  };

  // helper: sync mirror names (call whenever core inputs change)
  function syncMirrors() {
    const s = window.inputState;
    s.forward = !!s.accelerate;
    s.backward = !!s.brake;
    // prefer explicit steeringValue if set; otherwise map from steer
    if (typeof s.steeringValue !== "number" || isNaN(s.steeringValue)) s.steeringValue = s.steer;
    else s.steer = s.steeringValue;
    s.steeringValue = s.steer;
  }

  // prevent text selection on touch
  document.addEventListener('selectstart', e => e.preventDefault());
  document.addEventListener('touchmove', e => {}, { passive:false });

  // create steering wheel element if not present in DOM
  let steeringWheel = document.getElementById('steeringWheel') || document.getElementById('steering-wheel') || document.getElementById('steeringWheel') ;
  if (!steeringWheel) {
    steeringWheel = document.createElement('div');
    steeringWheel.id = 'steeringWheel';
    steeringWheel.innerHTML = '<div class="rim"><div class="hub"></div></div>';
    steeringWheel.style.position = 'absolute';
    steeringWheel.style.left = '12px';
    steeringWheel.style.bottom = '32px';
    steeringWheel.style.width = '140px';
    steeringWheel.style.height = '140px';
    steeringWheel.style.pointerEvents = 'auto';
    const leftCol = document.getElementById('leftControls') || document.body;
    leftCol.appendChild(steeringWheel);
  }
  const rim = steeringWheel.querySelector('.rim') || steeringWheel;

  // create pedals if not present
  function ensureBtn(id, text, parentId) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('button');
      el.id = id;
      el.className = 'ctrl pedal';
      el.innerText = text;
      const parent = document.getElementById(parentId) || document.getElementById('rightControls') || document.body;
      parent.appendChild(el);
    }
    return el;
  }

  const accBtn = ensureBtn('accBtn','▲','rightControls');
  const brakeBtn = ensureBtn('brakeBtn','▼','rightControls');
  const driftBtn = ensureBtn('driftBtn','DRIFT','bottomCenter');

  // steering geometry
  let activePointer = null;
  let centerX = 0;
  let centerY = 0;
  let wheelRadius = 1;
  let currentRotation = 0;
  const MAX_DEG = 70;

  function recalcWheelGeometry() {
    const rect = rim.getBoundingClientRect();
    centerX = rect.left + rect.width/2;
    centerY = rect.top + rect.height/2;
    wheelRadius = Math.max(1, rect.width/2);
  }
  setTimeout(recalcWheelGeometry, 120);
  window.addEventListener('resize', recalcWheelGeometry);

  // animate wheel back to zero on release
  let returnAnimId = null;
  function animateWheelToZero(duration = 180) {
    const start = performance.now();
    const from = currentRotation;
    if (returnAnimId) cancelAnimationFrame(returnAnimId);
    function step(t) {
      const p = Math.min(1, (t - start) / duration);
      const ease = 1 - Math.pow(1-p, 3);
      const val = from + (0 - from) * ease;
      currentRotation = val;
      rim.style.transform = `rotate(${val}deg)`;
      window.inputState.steer = Math.max(-1, Math.min(1, val / MAX_DEG));
      syncMirrors();
      if (p < 1) returnAnimId = requestAnimationFrame(step);
      else { returnAnimId = null; window.inputState.steer = 0; window.inputState.left=false; window.inputState.right=false; syncMirrors(); }
    }
    returnAnimId = requestAnimationFrame(step);
  }

  function onWheelPointerDown(ev) {
    ev.preventDefault();
    recalcWheelGeometry();
    activePointer = ev.pointerId !== undefined ? ev.pointerId : (ev.changedTouches ? ev.changedTouches[0].identifier : 1);
    try { ev.target.setPointerCapture && ev.target.setPointerCapture(activePointer); } catch(e){}
    if (returnAnimId) { cancelAnimationFrame(returnAnimId); returnAnimId = null; }
    onWheelPointerMove(ev);
  }
  function onWheelPointerMove(ev) {
    // support touch events too
    const clientX = ev.clientX !== undefined ? ev.clientX : (ev.changedTouches ? ev.changedTouches[0].clientX : null);
    if (clientX === null) return;
    const dx = clientX - centerX;
    let v = dx / wheelRadius;
    v = Math.max(-1, Math.min(1, v));
    currentRotation = v * MAX_DEG;
    rim.style.transform = `rotate(${currentRotation}deg)`;
    window.inputState.steer = v;
    syncMirrors();
    window.inputState.left = v < -0.18; window.inputState.right = v > 0.18;
  }
  function onWheelPointerUp(ev) {
    try { ev.target.releasePointerCapture && ev.target.releasePointerCapture(activePointer); } catch(e){}
    activePointer = null;
    animateWheelToZero(200);
  }

  // pointer events (works for mouse + touch with pointer support)
  rim.addEventListener('pointerdown', onWheelPointerDown, { passive:false });
  rim.addEventListener('pointermove', onWheelPointerMove, { passive:false });
  rim.addEventListener('pointerup', onWheelPointerUp, { passive:false });
  rim.addEventListener('pointercancel', onWheelPointerUp, { passive:false });

  // keyboard fallback (for desktop testing)
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k==='a' || k==='arrowleft') { window.inputState.left=true; window.inputState.steer = -1; syncMirrors(); }
    if (k==='d' || k==='arrowright') { window.inputState.right=true; window.inputState.steer = 1; syncMirrors(); }
    if (k==='w' || k==='arrowup') { window.inputState.accelerate=true; syncMirrors(); }
    if (k==='s' || k==='arrowdown') { window.inputState.brake=true; syncMirrors(); }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k==='a' || k==='arrowleft') { window.inputState.left=false; window.inputState.steer = 0; syncMirrors(); }
    if (k==='d' || k==='arrowright') { window.inputState.right=false; window.inputState.steer = 0; syncMirrors(); }
    if (k==='w' || k==='arrowup') { window.inputState.accelerate=false; syncMirrors(); }
    if (k==='s' || k==='arrowdown') { window.inputState.brake=false; syncMirrors(); }
  });

  // hold events for accelerator & brake (pointer events)
  function bindHold(el, prop) {
    if (!el) return;
    el.addEventListener('pointerdown', ev => { ev.preventDefault(); window.inputState[prop] = true; syncMirrors(); }, { passive:false });
    el.addEventListener('pointerup', ev => { ev.preventDefault(); window.inputState[prop] = false; syncMirrors(); }, { passive:false });
    el.addEventListener('pointercancel', ev => { ev.preventDefault(); window.inputState[prop] = false; syncMirrors(); }, { passive:false });
    el.addEventListener('pointerout', ev => { ev.preventDefault(); window.inputState[prop] = false; syncMirrors(); }, { passive:false });
  }

  bindHold(accBtn, 'accelerate');
  bindHold(brakeBtn, 'brake');
  bindHold(driftBtn, 'drift');

  // camera toggle button (if present)
  const camBtn = document.getElementById('camBtn');
  if (camBtn) camBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('game:togglecam')));

  // overlays / HUD helpers (if you use UI.show/hide)
  window.UI = window.UI || {};
  UI.showRetry = () => document.getElementById('overlay-retry') && document.getElementById('overlay-retry').classList.remove('hidden');
  UI.hideRetry = () => document.getElementById('overlay-retry') && document.getElementById('overlay-retry').classList.add('hidden');
  UI.showSuccess = () => document.getElementById('overlay-success') && document.getElementById('overlay-success').classList.remove('hidden');
  UI.hideSuccess = () => document.getElementById('overlay-success') && document.getElementById('overlay-success').classList.add('hidden');

  // bind overlay buttons if present
  const retryBtn = document.getElementById('retryBtn'); if (retryBtn) retryBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:retry')));
  const menuBtn = document.getElementById('menuBtn'); if (menuBtn) menuBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:menu')));
  const nextBtn = document.getElementById('nextLevelBtn'); if (nextBtn) nextBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:nextlevel')));
  const playAgainBtn = document.getElementById('playAgainBtn'); if (playAgainBtn) playAgainBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:retry')));

  // HUD updater helper
  window.UI.updateHUD = (speedKmh, level, health) => {
    const s = document.getElementById('speed'); if (s) s.innerText = (speedKmh||0) + ' km/h';
    const lv = document.getElementById('level'); if (lv) lv.innerText = 'Level ' + (level || 1);
  };

  // final sync at end to ensure mirrored fields are set on load
  syncMirrors();
})();
