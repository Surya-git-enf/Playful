// js/ui.js
// Responsible for: inputState binding (touch + keyboard), steering touch area,
// HUD updates, rotate-to-landscape overlay, camera/fullscreen button, retry/success overlays.
// This file should be loaded BEFORE main.js so main can read window.inputState.

(function() {
  // Ensure global inputState exists (car.js expects inputState global)
  window.inputState = window.inputState || {
    forward: false,
    backward: false,
    left: false,
    right: false,
    drift: false,
    steeringValue: 0 // -1..1 continuous steering (optional)
  };

  // Prevent text selection & default gestures
  document.addEventListener('selectstart', e => e.preventDefault());
  document.addEventListener('pointermove', e => {}, {passive:false});

  // Helper to bind a button id to an inputState prop
  function bindButton(id, prop) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); window.inputState[prop] = true; }, {passive:false});
    el.addEventListener('pointerup',   (e) => { e.preventDefault(); window.inputState[prop] = false; }, {passive:false});
    el.addEventListener('pointercancel',(e) => { e.preventDefault(); window.inputState[prop] = false; }, {passive:false});
    el.addEventListener('pointerout',   (e) => { e.preventDefault(); window.inputState[prop] = false; }, {passive:false});
  }

  // Bind the buttons that exist in index.html
  bindButton('accBtn', 'forward');
  bindButton('brakeBtn','backward');
  bindButton('leftBtn','left');   // also used as discrete steering fallback
  bindButton('rightBtn','right');
  bindButton('driftBtn','drift');

  // Keyboard fallback (desktop)
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') window.inputState.forward = true;
    if (k === 'arrowdown' || k === 's') window.inputState.backward = true;
    if (k === 'arrowleft' || k === 'a') window.inputState.left = true;
    if (k === 'arrowright' || k === 'd') window.inputState.right = true;
    if (k === ' ') window.inputState.drift = true;
    // toggle camera with C
    if (k === 'c') {
      const camBtn = document.getElementById('camBtn');
      if (camBtn) camBtn.click();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') window.inputState.forward = false;
    if (k === 'arrowdown' || k === 's') window.inputState.backward = false;
    if (k === 'arrowleft' || k === 'a') window.inputState.left = false;
    if (k === 'arrowright' || k === 'd') window.inputState.right = false;
    if (k === ' ') window.inputState.drift = false;
  });

  // --- Steer by dragging on the left half of screen (virtual steering wheel) ---
  // Create a steering overlay area if not present (left 50% of screen)
  let steerArea = document.getElementById('steerArea');
  if (!steerArea) {
    steerArea = document.createElement('div');
    steerArea.id = 'steerArea';
    // style via JS to avoid changing CSS files; small, transparent area
    Object.assign(steerArea.style, {
      position: 'fixed',
      left: '0',
      bottom: '0',
      width: '50%',
      height: '60%',
      zIndex: 9999,
      touchAction: 'none',
      // visual debug: uncomment if you need to see it
      // background: 'rgba(255,0,0,0.05)'
    });
    document.body.appendChild(steerArea);
  }

  let activePointerId = null;
  let startX = 0;
  let centerX = null;
  const deadZone = 12; // pixels near center ignore

  steerArea.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    steerArea.setPointerCapture(ev.pointerId);
    activePointerId = ev.pointerId;
    startX = ev.clientX;
    centerX = steerArea.getBoundingClientRect().left + steerArea.getBoundingClientRect().width / 2;
    // initial steering value
    updateSteeringFromX(ev.clientX);
  }, {passive:false});

  steerArea.addEventListener('pointermove', (ev) => {
    if (activePointerId !== ev.pointerId) return;
    ev.preventDefault();
    updateSteeringFromX(ev.clientX);
  }, {passive:false});

  steerArea.addEventListener('pointerup', (ev) => {
    if (activePointerId !== ev.pointerId) return;
    ev.preventDefault();
    steerArea.releasePointerCapture(ev.pointerId);
    activePointerId = null;
    // reset steering
    window.inputState.steeringValue = 0;
    window.inputState.left = false;
    window.inputState.right = false;
  }, {passive:false});

  steerArea.addEventListener('pointercancel', (ev) => {
    if (activePointerId !== ev.pointerId) return;
    ev.preventDefault();
    steerArea.releasePointerCapture(ev.pointerId);
    activePointerId = null;
    window.inputState.steeringValue = 0;
    window.inputState.left = false;
    window.inputState.right = false;
  }, {passive:false});

  function updateSteeringFromX(x) {
    if (centerX === null) centerX = steerArea.getBoundingClientRect().left + steerArea.getBoundingClientRect().width/2;
    const dx = x - centerX;
    // normalize to -1..1 based on half-width
    const halfW = steerArea.getBoundingClientRect().width/2;
    let v = Math.max(-1, Math.min(1, dx / halfW));
    // apply dead zone to let center relax
    if (Math.abs(v) < 0.05) v = 0;
    window.inputState.steeringValue = v;
    // provide fallback booleans for car.js that uses left/right booleans:
    window.inputState.left = (v < -0.15);
    window.inputState.right = (v > 0.15);
  }

  // --- Orientation helper: show overlay if portrait (force rotate) ---
  function addOrientationOverlay() {
    let o = document.getElementById('orientationOverlay');
    if (!o) {
      o = document.createElement('div');
      o.id = 'orientationOverlay';
      Object.assign(o.style, {
        position: 'fixed', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.85)', color:'#fff', zIndex: 99999, fontSize: '18px',
        textAlign: 'center', padding: '20px'
      });
      o.innerHTML = '<div>Please rotate your device to landscape for the best experience.<br><small>Tap anywhere to continue anyway.</small></div>';
      document.body.appendChild(o);
      o.addEventListener('pointerdown', ()=>{ o.style.display = 'none'; });
    }
    return o;
  }
  const orientationOverlay = addOrientationOverlay();

  function checkOrientation() {
    // if width < height, show overlay
    if (window.innerWidth < window.innerHeight) {
      orientationOverlay.style.display = 'flex';
    } else {
      orientationOverlay.style.display = 'none';
    }
  }
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  checkOrientation();

  // --- HUD / overlays handling functions (retry/success) ---
  window.UI = window.UI || {};
  UI.showRetry = function() {
    const o = document.getElementById('overlay-retry') || document.getElementById('retryOverlay');
    if (o) o.classList.remove('hidden');
  };
  UI.hideRetry = function() {
    const o = document.getElementById('overlay-retry') || document.getElementById('retryOverlay');
    if (o) o.classList.add('hidden');
  };
  UI.showSuccess = function() {
    const o = document.getElementById('overlay-success') || document.getElementById('successOverlay');
    if (o) o.classList.remove('hidden');
  };
  UI.hideSuccess = function() {
    const o = document.getElementById('overlay-success') || document.getElementById('successOverlay');
    if (o) o.classList.add('hidden');
  };

  // wire retry / success buttons if present
  const retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', () => {
    UI.hideRetry();
    // custom event to main to reset level
    window.dispatchEvent(new CustomEvent('game:retry'));
  });

  const menuBtn = document.getElementById('menuBtn');
  if (menuBtn) menuBtn.addEventListener('click', () => {
    UI.hideRetry();
    // send event: back to menu (main should handle)
    window.dispatchEvent(new CustomEvent('game:menu'));
  });

  const nextLevelBtn = document.getElementById('nextLevelBtn');
  if (nextLevelBtn) nextLevelBtn.addEventListener('click', () => {
    UI.hideSuccess();
    window.dispatchEvent(new CustomEvent('game:nextlevel'));
  });
  const playAgainBtn = document.getElementById('playAgainBtn');
  if (playAgainBtn) playAgainBtn.addEventListener('click', () => {
    UI.hideSuccess();
    window.dispatchEvent(new CustomEvent('game:retry'));
  });

  // cam button: if present, let it dispatch event (main.js will toggle)
  const camBtn = document.getElementById('camBtn');
  if (camBtn) {
    camBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('game:togglecam'));
    });
  }

  // small HUD updater for speed & health (main loop can update; exposing helper)
  UI.updateHUD = function(speedKmh, health) {
    const s = document.getElementById('speed');
    if (s) s.innerText = (speedKmh || 0) + ' km/h';
    const h = document.getElementById('level');
    if (h && window.currentLevel) h.innerText = 'Level ' + window.currentLevel;
    const healthEl = document.getElementById('health');
    if (healthEl) healthEl.innerText = '❤️ ' + (health || 100);
  };

  // small helper: request fullscreen on first touch to improve mobile behaviour
  function handleFirstInteraction() {
    document.removeEventListener('pointerdown', handleFirstInteraction);
    if (document.fullscreenEnabled) {
      try { document.documentElement.requestFullscreen().catch(()=>{}); } catch(e){}
    }
  }
  document.addEventListener('pointerdown', handleFirstInteraction, {once:true, passive:true});

  // expose inputState for other scripts
  window.getInputState = () => window.inputState;
})();
