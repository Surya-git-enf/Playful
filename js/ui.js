// js/ui.js
(function(){
  // global inputState used by car
  window.inputState = window.inputState || { forward:false, backward:false, left:false, right:false, drift:false, steeringValue:0 };

  // prevent selection / default touch gestures
  document.addEventListener('selectstart', e => e.preventDefault());
  document.addEventListener('touchmove', e => {}, {passive:false});

  // bind buttons that exist in HTML
  function bind(id, prop) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', e=>{ e.preventDefault(); window.inputState[prop] = true; }, {passive:false});
    el.addEventListener('pointerup',   e=>{ e.preventDefault(); window.inputState[prop] = false; }, {passive:false});
    el.addEventListener('pointerout',  e=>{ e.preventDefault(); window.inputState[prop] = false; }, {passive:false});
    el.addEventListener('pointercancel', e=>{ e.preventDefault(); window.inputState[prop] = false; }, {passive:false});
  }
  bind('accBtn','forward'); bind('brakeBtn','backward');
  // keep left/right buttons as discrete fallback
  bind('leftBtn','left'); bind('rightBtn','right'); bind('driftBtn','drift');

  // keyboard fallback
  window.addEventListener('keydown', e=>{
    const k = e.key.toLowerCase();
    if (k==='w' || k==='arrowup') window.inputState.forward = true;
    if (k==='s' || k==='arrowdown') window.inputState.backward = true;
    if (k==='a' || k==='arrowleft') window.inputState.left = true;
    if (k==='d' || k==='arrowright') window.inputState.right = true;
    if (k===' ') window.inputState.drift = true;
    if (k==='c') window.dispatchEvent(new CustomEvent('game:togglecam'));
  });
  window.addEventListener('keyup', e=>{
    const k = e.key.toLowerCase();
    if (k==='w' || k==='arrowup') window.inputState.forward = false;
    if (k==='s' || k==='arrowdown') window.inputState.backward = false;
    if (k==='a' || k==='arrowleft') window.inputState.left = false;
    if (k==='d' || k==='arrowright') window.inputState.right = false;
    if (k===' ') window.inputState.drift = false;
  });

  // steering area: left half of screen => continuous steeringValue [-1..1]
  let steerArea = document.getElementById('steerArea');
  if (!steerArea) {
    steerArea = document.createElement('div');
    steerArea.id = 'steerArea';
    Object.assign(steerArea.style, { position:'fixed', left:'0', bottom:'0', width:'50%', height:'70%', zIndex:9998, touchAction:'none' });
    document.body.appendChild(steerArea);
  }

  let activeId = null, centerX = null;
  function updateSteer(clientX) {
    if (!centerX) centerX = steerArea.getBoundingClientRect().left + steerArea.getBoundingClientRect().width/2;
    const half = steerArea.getBoundingClientRect().width/2;
    let v = (clientX - centerX) / half;
    v = Math.max(-1, Math.min(1, v));
    if (Math.abs(v) < 0.05) v = 0;
    window.inputState.steeringValue = v;
    window.inputState.left = v < -0.15;
    window.inputState.right = v > 0.15;
  }

  steerArea.addEventListener('pointerdown', e=>{ e.preventDefault(); steerArea.setPointerCapture(e.pointerId); activeId = e.pointerId; centerX = null; updateSteer(e.clientX); }, {passive:false});
  steerArea.addEventListener('pointermove', e=>{ if (activeId===e.pointerId) { e.preventDefault(); updateSteer(e.clientX); } }, {passive:false});
  steerArea.addEventListener('pointerup', e=>{ if (activeId===e.pointerId) { e.preventDefault(); steerArea.releasePointerCapture(e.pointerId); activeId = null; window.inputState.steeringValue = 0; window.inputState.left=false; window.inputState.right=false; } }, {passive:false});
  steerArea.addEventListener('pointercancel', e=>{ if (activeId===e.pointerId) { e.preventDefault(); steerArea.releasePointerCapture(e.pointerId); activeId=null; window.inputState.steeringValue=0; window.inputState.left=false; window.inputState.right=false; } }, {passive:false});

  // orientation overlay
  function ensureOrientationOverlay() {
    let o = document.getElementById('orientationOverlay');
    if (!o) {
      o = document.createElement('div'); o.id = 'orientationOverlay';
      Object.assign(o.style, { position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.85)', color:'#fff', zIndex:99990, textAlign:'center', padding:'20px' });
      o.innerHTML = '<div>Please rotate your device to landscape for the best experience.<br/><small>Tap to continue anyway.</small></div>';
      document.body.appendChild(o);
      o.addEventListener('pointerdown', ()=> o.style.display='none');
    }
    function check() { if (window.innerWidth < window.innerHeight) o.style.display='flex'; else o.style.display='none'; }
    window.addEventListener('resize', check); window.addEventListener('orientationchange', check); check();
  }
  ensureOrientationOverlay();

  // UI helpers for overlays
  window.UI = window.UI || {};
  UI.showRetry = ()=> document.getElementById('overlay-retry').classList.remove('hidden');
  UI.hideRetry = ()=> document.getElementById('overlay-retry').classList.add('hidden');
  UI.showSuccess = ()=> document.getElementById('overlay-success').classList.remove('hidden');
  UI.hideSuccess = ()=> document.getElementById('overlay-success').classList.add('hidden');

  // wire overlay buttons to events
  const retryBtn = document.getElementById('retryBtn'); if (retryBtn) retryBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:retry')));
  const menuBtn = document.getElementById('menuBtn'); if (menuBtn) menuBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:menu')));
  const nextBtn = document.getElementById('nextLevelBtn'); if (nextBtn) nextBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:nextlevel')));
  const playAgainBtn = document.getElementById('playAgainBtn'); if (playAgainBtn) playAgainBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:retry')));

  // cam button
  const camBtn = document.getElementById('camBtn'); if (camBtn) camBtn.addEventListener('click', ()=> window.dispatchEvent(new CustomEvent('game:togglecam')));

  // HUD update helper (main loop calls)
  UI.updateHUD = (speedKmh, level, health) => {
    const s = document.getElementById('speed'); if (s) s.innerText = (speedKmh||0) + ' km/h';
    const lv = document.getElementById('level'); if (lv) lv.innerText = 'Level ' + (level || 1);
    // health element optional
    const hp = document.getElementById('health'); if (hp) hp.innerText = '❤️ ' + (health || 100);
  };

})();
