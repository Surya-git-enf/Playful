// js/main.js
window.addEventListener('DOMContentLoaded', ()=> {
  const canvas = document.getElementById('renderCanvas');
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true });

  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.56,0.78,0.98);

  const worldInfo = createWorld(scene);
  const finishTrigger = worldInfo.finishTrigger;
  window.currentLevel = window.currentLevel || 1;

  const player = createPlayerCar(scene);
  player.root.position = new BABYLON.Vector3(0, 1.8, -720);

  // cinematic camera presets & toggle
  const cam = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0,6,-18), scene);
  cam.fov = 0.92; cam.minZ = 0.1; scene.activeCamera = cam; cam.attachControl(canvas, true);
  const camPresets = [
    { offset: new BABYLON.Vector3(0,6.0,-18.0), lookAt: new BABYLON.Vector3(0,1.6,2) },
    { offset: new BABYLON.Vector3(0,4.0,-9.0), lookAt: new BABYLON.Vector3(0,1.2,1.6) },
    { offset: new BABYLON.Vector3(0,1.8,0.9), lookAt: new BABYLON.Vector3(0,1.2,3.6) }
  ];
  let currentCamIndex = 0;
  window.addEventListener('game:togglecam', ()=> { currentCamIndex = (currentCamIndex + 1) % camPresets.length; });

  // event handlers
  window.addEventListener('game:retry', ()=> {
    UI.hideRetry(); UI.hideSuccess();
    player.root.position = new BABYLON.Vector3(0,1.8,-720 - (window.currentLevel - 1) * 20);
    player.root.rotation = new BABYLON.Vector3(0,0,0);
  });
  window.addEventListener('game:nextlevel', ()=> {
    UI.hideSuccess(); window.currentLevel = (window.currentLevel || 1) + 1;
    player.root.position = new BABYLON.Vector3(0,1.8,-740 - (window.currentLevel - 1) * 40);
  });

  // helper to update camera each frame
  function updateCameraSmooth() {
    const preset = camPresets[currentCamIndex];
    const ang = player.root.rotation.y;
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const off = preset.offset;
    const transformed = new BABYLON.Vector3(
      off.x * cosA - off.z * sinA,
      off.y,
      off.x * sinA + off.z * cosA
    );
    const desiredPos = player.root.position.add(transformed);
    cam.position = BABYLON.Vector3.Lerp(cam.position, desiredPos, 0.12);
    const look = preset.lookAt;
    const lookWorld = new BABYLON.Vector3(
      look.x * cosA - look.z * sinA,
      look.y,
      look.x * sinA + look.z * cosA
    );
    const desiredTarget = player.root.position.add(lookWorld);
    const currentTarget = cam.getTarget ? cam.getTarget() : player.root.position;
    const newTarget = BABYLON.Vector3.Lerp(currentTarget, desiredTarget, 0.18);
    cam.setTarget(newTarget);
  }

  // main loop
  let last = performance.now();
  engine.runRenderLoop(()=> {
    const now = performance.now();
    const dt = Math.min(0.045, (now - last) / 1000);
    last = now;

    if (player && player.update) player.update(dt);

    updateCameraSmooth();

    const kmh = Math.round(Math.abs(player._approxSpeed || 0) * 3.6);
    UI.updateHUD(kmh, window.currentLevel, player.getHealth && player.getHealth());

    if (finishTrigger) {
      const d = BABYLON.Vector3.Distance(player.root.position, finishTrigger.position);
      if (d < 8) UI.showSuccess();
    }

    if (player.root.position.y < -25 || Math.abs(player.root.position.x) > 1200) UI.showRetry();

    scene.render();
  });

  window.addEventListener('resize', ()=> engine.resize());
});
