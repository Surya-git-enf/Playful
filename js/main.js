// js/main.js
// Game entry point

window.addEventListener("DOMContentLoaded", async () => {

  /* ---------------- CANVAS & ENGINE ---------------- */
  const canvas = document.getElementById("renderCanvas");

  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true
  });

  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.6, 0.85, 1); // sky blue

  /* ---------------- CAMERA ---------------- */
  const camera = new BABYLON.FollowCamera(
    "followCam",
    new BABYLON.Vector3(0, 6, -12),
    scene
  );

  camera.radius = 14;
  camera.heightOffset = 4;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.05;
  camera.maxCameraSpeed = 5;
  camera.attachControl(canvas, true);

  /* ---------------- WORLD ---------------- */
  const world = createWorld(scene);

  /* ---------------- UI ---------------- */
  initUI();

  /* ---------------- CAR ---------------- */
  const car = await createPlayerCar(scene);
  camera.lockedTarget = car;

  /* ---------------- ROAD CONSTRAINT ---------------- */
  scene.onBeforeRenderObservable.add(() => {
    // prevent car from going too far left/right off road
    car.position.x = BABYLON.Scalar.Clamp(
      car.position.x,
      -6,
      6
    );
  });

  /* ---------------- FINISH CHECK ---------------- */
  scene.onBeforeRenderObservable.add(() => {
    if (!world.finish) return;

    const dist = BABYLON.Vector3.Distance(
      car.position,
      world.finish.position
    );

    if (dist < 4) {
      showWinScreen();
    }
  });

  /* ---------------- RENDER LOOP ---------------- */
  engine.runRenderLoop(() => {
    scene.render();
  });

  /* ---------------- RESIZE ---------------- */
  window.addEventListener("resize", () => {
    engine.resize();
  });

});


/* ================= UI SCREENS ================= */

function showWinScreen() {
  const win = document.getElementById("winScreen");
  if (win) win.style.display = "flex";
}

function retryGame() {
  location.reload();
}
