// js/main.js

window.addEventListener("DOMContentLoaded", () => {

  const canvas = document.getElementById("renderCanvas");

  /* ===== PREVENT BROWSER KEYS / SELECTION ===== */
  window.addEventListener("keydown", e => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) {
      e.preventDefault();
    }
  });

  canvas.style.touchAction = "none";

  /* ===== ENGINE ===== */
  const engine = new BABYLON.Engine(canvas, true);

  const createScene = () => {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.6, 0.8, 1);

    /* ===== CAMERA (3RD PERSON) ===== */
    const camera = new BABYLON.FollowCamera(
      "followCam",
      new BABYLON.Vector3(0, 6, -15),
      scene
    );
    camera.radius = 18;
    camera.heightOffset = 6;
    camera.rotationOffset = 180;
    camera.cameraAcceleration = 0.05;
    camera.maxCameraSpeed = 20;
    camera.attachControl(canvas, true);

    /* ===== WORLD ===== */
    createWorld(scene);

    /* ===== CAR ===== */
    const car = createCar(scene);
    camera.lockedTarget = car.body;

    /* ===== TRAFFIC ===== */
    createTraffic(scene, car);

    /* ===== CAMERA TOGGLE ===== */
    let firstPerson = false;
    window.addEventListener("keydown", e => {
      if (e.key.toLowerCase() === "c") {
        firstPerson = !firstPerson;
        if (firstPerson) {
          camera.radius = 0.5;
          camera.heightOffset = 1.2;
        } else {
          camera.radius = 18;
          camera.heightOffset = 6;
        }
      }
    });

    /* ===== GAME LOOP ===== */
    scene.onBeforeRenderObservable.add(() => {
      car.update();
    });

    return scene;
  };

  const scene = createScene();

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener("resize", () => {
    engine.resize();
  });

});
