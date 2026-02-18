// js/main.js
window.addEventListener('DOMContentLoaded', ()=> {
  const canvas = document.getElementById('renderCanvas');
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true });

  // create scene
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.6,0.8,1);

  // world - builds mountain & environment
  const worldInfo = createWorld(scene);
  const finishTrigger = worldInfo.finishTrigger;
  const finishMesh = worldInfo.finishMesh;
  window.currentLevel = 1;

  // player car
  const player = createPlayerCar(scene);
  player.root.position = new BABYLON.Vector3(0, 2, -260);
  // camera: follow + toggle to first-person
  const followCam = new BABYLON.FollowCamera('followCam', player.root.position.add(new BABYLON.Vector3(0,6,-12)), scene);
  followCam.lockedTarget = player.root; followCam.radius = 14; followCam.heightOffset = 5; followCam.rotationOffset = 180; followCam.cameraAcceleration = 0.05;
  const firstCam = new BABYLON.UniversalCamera('firstCam', new BABYLON.Vector3(0,1.6,0), scene);
  firstCam.parent = player.root; firstCam.position = new BABYLON.Vector3(0,1.6,0.8); firstCam.rotation = new BABYLON.Vector3(0,Math.PI,0);
  scene.activeCamera = followCam;
  scene.activeCamera.attachControl(canvas, true);

  // events: retry / next level / toggle cam
  window.addEventListener('game:retry', ()=> {
    // reset car position & hide overlays
    UI.hideRetry(); UI.hideSuccess();
    player.root.position = new BABYLON.Vector3(0,2,-260);
    player.root.rotation = BABYLON.Vector3.Zero();
  });
  window.addEventListener('game:nextlevel', ()=> {
    UI.hideSuccess();
    // simple increase: teleport to a steeper starting Z (for quick demo)
    window.currentLevel = (window.currentLevel || 1) + 1;
    player.root.position = new BABYLON.Vector3(0,2,-260 - (window.currentLevel-1)*40);
  });
  window.addEventListener('game:togglecam', ()=> {
    scene.activeCamera = scene.activeCamera === followCam ? firstCam : followCam;
    try { scene.activeCamera.attachControl(canvas, true); } catch (e) {}
  });

  // main loop
  let last = performance.now();
  engine.runRenderLoop(()=> {
    const now = performance.now(); const dt = Math.min(0.04,(now - last)/1000); last = now;
    // update car with dt (ui.js sets window.inputState)
    if (player && player.update) player.update(dt);
    // hud update
    const kmh = Math.round(Math.abs(player._approxSpeed || 0) * 3.6);
    UI.updateHUD(kmh, window.currentLevel, player.getHealth && player.getHealth());

    // finish detection: simple intersection test (distance)
    if (finishTrigger) {
      const dist = BABYLON.Vector3.Distance(player.root.position, finishTrigger.position);
      if (dist < 6) {
        // show success overlay
        UI.showSuccess();
        // pause movement by relocating player slightly away so not retrigger
        player.root.position.z += 8;
      }
    }

    // fall detection
    if (player.root.position.y < -10) {
      UI.showRetry();
    }

    scene.render();
    last = now;
  });

  window.addEventListener('resize', ()=> engine.resize());
});
