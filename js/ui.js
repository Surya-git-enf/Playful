// js/ui.js
// Professional steering wheel (left) + pedals (right) + HUD overlay control
// Exposes window.inputState and UI helpers (UI.showRetry/UI.showSuccess/UI.updateHUD)

(function () {
  // --- Input state exposed for car.js ---
  window.inputState = window.inputState || {
    forward: false,
    backward: false,
    left: false,
    right: false,
    drift: false,
    steeringValue: 0 // continuous -1 .. 1
  };

  // Prevent browser selection and default gestures that steal pointer
  document.addEventListener('selectstart', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => {}, { passive: false });

  // --- Utility: safe vibration ---
  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }

  // --- Create visual steering wheel (if not present) ---
  let steeringWheel = document.getElementById('steeringWheel');
  if (!steeringWheel) {
    steeringWheel = document.createElement('div');
    steeringWheel.id = 'steeringWheel';
    // put it inside leftControls if exists, else append to body on left
    const leftCol = document.getElementById('leftControls');
    if (leftCol) leftCol.prepend(steeringWheel);
    else document.body.appendChild(steeringWheel);
  }

  // Wheel inner circle (visual rim)
  if (!steeringWheel.querySelector('.rim')) {
    steeringWheel.innerHTML = '<div class="rim"><div class="hub"></div></div>';
  }

  // --- Create / style pedal elements if not present (we use accBtn & brakeBtn existing IDs) ---
  // ensure accBtn and brakeBtn exist; if not create them in rightControls
  function ensurePedal(id, text, parentId) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('button');
      el.id = id;
      el.className = 'ctrl pedal';
      el.innerText = text;
      const rightCol = document.getElementById(parentId || 'rightControls');
      if (rightCol) rightCol.appendChild(el); else document.body.appendChild(el);
    }
    return el;
  }
  const accBtn = ensurePedal('accBtn', '▲');
  const brakeBtn = ensurePedal('brakeBtn', '▼');

  // Ensure driftBtn still exists (optional)
  ensurePedal('driftBtn', 'DRIFT', 'bottomCenter');

  // --- Steering wheel behavior ---
  // Steering uses horizontal drag inside wheel area; continuous steeringValue set -1..1.
  const rim = steeringWheel.querySelector('.rim');
  let activePointer = null;
  let centerX = 0;
  let centerY = 0;
  let wheelRadius = 1;
  let currentRotation = 0; // degrees visually applied
  const MAX_DEG = 70; // max rotation visual degrees for full lock

  function recalcWheelGeometry() {
    const rect = rim.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    wheelRadius = Math.max(1, rect.width / 2);
  }

  // smooth return animation when pointer up
  let returnAnimId = null;
  function animateWheelToZero(duration = 160) {
    const start = performance.now();
    const from = currentRotation;
    if (returnAnimId) cancelAnimationFrame(returnAnimId);
    function step(t) {
      const p = Math.min(1, (t - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      const val = from + (0 - from) * ease;
      currentRotation = val;
      rim.style.transform = `rotate(${val}deg)`;
      // update steeringValue accordingly
      window.inputState.steeringValue = Math.max(-1, Math.min(1, val / MAX_DEG));
      if (p < 1) returnAnimId = requestAnimationFrame(step);
      else {
        returnAnimId = null;
        window.inputState.steeringValue = 0;
        window.inputState.left = false;
        window.inputState.right = false;
      }
    }
    returnAnimId = requestAnimationFrame(step);
  }

  function onWheelPointerDown(ev) {
    ev.preventDefault();
    recalcWheelGeometry();
    activePointer = ev.pointerId;
    rim.setPointerCapture(activePointer);
    vibrate(20);
    // cancel any return anim
    if (returnAnimId) { cancelAnimationFrame(returnAnimId); returnAnimId = null; }
    onWheelPointerMove(ev);
  }

  function onWheelPointerMove(ev) {
    if (activePointer !== ev.pointerId) return;
    ev.preventDefault();
    const dx = ev.clientX - centerX;
    // map dx to -1..1, clamp
    let v = dx / wheelRadius;
    v = Math.max(-1, Math.min(1, v));
    // visual rotation degrees
    currentRotation = v * MAX_DEG;
    rim.style.transform = `rotate(${currentRotation}deg)`;
    window.inputState.steeringValue = v;
    // fallback booleans for older code
    window.inputState.left = v < -0.18;
    window.inputState.right = v > 0.18;
  }

  function onWheelPointerUp(ev) {
    if (activePointer !== ev.pointerId) return;
    ev.preventDefault();
    try { rim.releasePointerCapture(ev.pointerId); } catch (e) {}
    activePointer = null;
    // animate return to center
    animateWheelToZero(180);
    vibrate(10);
  }

  rim.addEventListener('pointerdown', onWheelPointerDown, { passive: false });
  rim.addEventListener('pointermove', onWheelPointerMove, { passive: false });
  rim.addEventListener('pointerup', onWheelPointerUp, { passive: false });
  rim.addEventListener('pointercancel', onWheelPointerUp, { passive: false });
  // also allow dragging the whole leftControls area as fallback
  const leftControls = document.getElementById('leftControls');
  if (leftControls) {
    leftControls.addEventListener('pointerdown', onWheelPointerDown, { passive: false });
    leftControls.addEventListener('pointermove', onWheelPointerMove, { passive: false });
    leftControls.addEventListener('pointerup', onWheelPointerUp, { passive: false });
    leftControls.addEventListener('pointercancel', onWheelPointerUp, { passive: false });
  }

  // keyboard fallback for steering (A/D or arrows)
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') { window.inputState.left = true; window.inputState.steeringValue = -0.9; }
    if (k === 'd' || k === 'arrowright') { window.inputState.right = true; window.inputState.steeringValue = 0.9; }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') { window.inputState.left = false; window.inputState.steeringValue = 0; }
    if (k === 'd' || k === 'arrowright') { window.inputState.right = false; window.inputState.steeringValue = 0; }
  });

  // --- Pedal binding (accelerator & brake) ---
  function bindHold(el, prop) {
    if (!el) return;
    el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); window.inputState[prop] = true; vibrate(8); }, { passive: false });
    el.addEventListener('pointerup', (ev) => { ev.preventDefault(); window.inputState[prop] = false; }, { passive: false });
    el.addEventListener('pointerout', (ev) => { ev.preventDefault(); window.inputState[prop] = false; }, { passive: false });
    el.addEventListener('pointercancel', (ev) => { ev.preventDefault(); window.inputState[prop] = false; }, { passive: false });
  }
  bindHold(accBtn, 'forward');
  bindHold(brakeBtn, 'backward');

  // keep drift button behavior
  const driftEl = document.getElementById('driftBtn');
  if (driftEl) bindHold(driftEl, 'drift');

  // --- Orientation overlay (tap to dismiss) ---
  function ensureOrientationOverlay() {
    let o = document.getElementById('orientationOverlay');
    if (!o) {
      o = document.createElement('div');
      o.id = 'orientationOverlay';
      Object.assign(o.style, {
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.82)', color: '#fff', zIndex: 99990, textAlign: 'center', padding: '20px'
      });
      o.innerHTML = '<div>Please rotate your device to landscape for the best experience.<br/><small>Tap anywhere to continue.</small></div>';
      document.body.appendChild(o);
      o.addEventListener('pointerdown', () => { o.style.display = 'none'; }, { passive: true });
    }
    function check() { if (window.innerWidth < window.innerHeight) o.style.display = 'flex'; else o.style.display = 'none'; }
    window.addEventListener('resize', check); window.addEventListener('orientationchange', check); check();
  }
  ensureOrientationOverlay();

  // --- UI overlay helpers (same API) ---
  window.UI = window.UI || {};
  UI.showRetry = () => { const el = document.getElementById('overlay-retry'); if (el) el.classList.remove('hidden'); };
  UI.hideRetry = () => { const el = document.getElementById('overlay-retry'); if (el) el.classList.add('hidden'); };
  UI.showSuccess = () => { const el = document.getElementById('overlay-success'); if (el) el.classList.remove('hidden'); };
  UI.hideSuccess = () => { const el = document.getElementById('overlay-success'); if (el) el.classList.add('hidden'); };

  // wire overlay buttons to events
  const retryBtn = document.getElementById('retryBtn'); if (retryBtn) retryBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:retry')));
  const menuBtn = document.getElementById('menuBtn'); if (menuBtn) menuBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:menu')));
  const nextLevelBtn = document.getElementById('nextLevelBtn'); if (nextLevelBtn) nextLevelBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:nextlevel')));
  const playAgainBtn = document.getElementById('playAgainBtn'); if (playAgainBtn) playAgainBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:retry')));

  // cam button dispatch
  const camBtn = document.getElementById('camBtn');
  if (camBtn) camBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:togglecam')));

  // HUD update helper
  UI.updateHUD = function(speedKmh, level, health) {
    const s = document.getElementById('speed'); if (s) s.innerText = (speedKmh || 0) + ' km/h';
    const lv = document.getElementById('level'); if (lv) lv.innerText = 'Level ' + (level || 1);
    const hp = document.getElementById('health'); if (hp) hp.innerText = '❤️ ' + (health || 100);
  };

  // expose a small debug method to programmatically set wheel
  window.__setVirtualWheel = function(v) {
    v = Math.max(-1, Math.min(1, v));
    currentRotation = v * MAX_DEG;
    rim.style.transform = `rotate(${currentRotation}deg)`;
    window.inputState.steeringValue = v;
    window.inputState.left = v < -0.18;
    window.inputState.right = v > 0.18;
  };

  // update geometry on resize
  window.addEventListener('resize', () => {
    try { recalcWheelGeometry(); } catch (e) {}
  });

  // initial geometry calc (defer to allow layout)
  setTimeout(recalcWheelGeometry, 120);
})();
