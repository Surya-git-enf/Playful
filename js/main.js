// js/main.js
// Orchestrator: boot, create scene, world, car, camera, HUD, overlays, input integration.

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true });

  // create scene
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.56, 0.78, 0.98);

  // world
  const worldInfo = createWorld(scene);
  const finishTrigger = worldInfo.finishTrigger;
  window.currentLevel = window.currentLevel || 1;

  // create player car
  const player = createPlayerCar(scene);
  // initial spawn: near start of path (approx)
  player.root.position = new BABYLON.Vector3(0, 1.8, -720);

  // camera: follow camera with smoothing
  const cam = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0, 6, -12), scene);
  cam.setTarget(player.root.position);
  scene.activeCamera = cam;
  cam.attachControl(canvas, true);

  // smoothing follow in render loop
  const camOffset = new BABYLON.Vector3(0, 6, -12);

  // events for overlays
  window.addEventListener('game:retry', () => {
    UI.hideRetry(); UI.hideSuccess();
    player.root.position = new BABYLON.Vector3(0, 1.8, -720 - (window.currentLevel - 1) * 20);
    player.root.rotation = new BABYLON.Vector3(0, 0, 0);
  });

  window.addEventListener('game:nextlevel', () => {
    UI.hideSuccess();
    window.currentLevel = (window.currentLevel || 1) + 1;
    // jump start position a little deeper so next is different
    player.root.position = new BABYLON.Vector3(0, 1.8, -740 - (window.currentLevel - 1) * 40);
  });

  window.addEventListener('game:togglecam', () => {
    // quick toggle between close third-person and farther third-person
    if (cam.radius === undefined) {
      // we are using UniversalCamera — do a param toggle using a stored state
      cam.position = cam.position.add(new BABYLON.Vector3(0, 0, 0)); // no-op, toggle handled in loop
      cam._mountFar = !cam._mountFar;
    } else {
      cam._mountFar = !cam._mountFar;
    }
  });

  // main loop
  let last = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.045, (now - last) / 1000);
    last = now;

    // update player
    if (player && player.update) player.update(dt);

    // camera smoothing: target position behind the car
    const wanted = player.root.position.add(BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0, 6, -14), player.root.getWorldMatrix().getRotationMatrix()));
    // Lerp current cam position toward wanted
    cam.position = BABYLON.Vector3.Lerp(cam.position, wanted, 0.12);
    cam.setTarget(BABYLON.Vector3.Lerp(cam.getTarget ? cam.getTarget() : player.root.position, player.root.position, 0.22));

    // HUD
    const kmh = Math.round(Math.abs(player._approxSpeed || 0) * 3.6);
    UI.updateHUD(kmh, window.currentLevel, player.getHealth && player.getHealth());

    // finish detection roughly by distance
    if (finishTrigger) {
      const d = BABYLON.Vector3.Distance(player.root.position, finishTrigger.position);
      if (d < 8) {
        UI.showSuccess();
      }
    }

    // fall detection (off map)
    if (player.root.position.y < -25 || Math.abs(player.root.position.x) > 1200) {
      UI.showRetry();
    }

    scene.render();
  });

  window.addEventListener('resize', () => engine.resize());
});
