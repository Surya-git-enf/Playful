// js/main.js
import { createWorld } from "./world.js";
import { CarController } from "./car.js";
import { GameUI } from "./ui.js";

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

const createScene = () => {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.6, 0.85, 1.0, 1); // sky blue

  // ----- CAMERA (3rd person follow) -----
  const camera = new BABYLON.FollowCamera(
    "followCamera",
    new BABYLON.Vector3(0, 5, -10),
    scene
  );
  camera.radius = 10;
  camera.heightOffset = 3;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.05;
  camera.maxCameraSpeed = 20;
  camera.attachControl(canvas, true);

  // ----- LIGHTS -----
  const hemi = new BABYLON.HemisphericLight(
    "hemi",
    new BABYLON.Vector3(0, 1, 0),
    scene
  );
  hemi.intensity = 0.8;

  const sun = new BABYLON.DirectionalLight(
    "sun",
    new BABYLON.Vector3(-0.5, -1, -0.5),
    scene
  );
  sun.position = new BABYLON.Vector3(50, 100, 50);
  sun.intensity = 1.0;

  // ----- UI -----
  const ui = new GameUI();

  ui.onFail = () => {
    document.getElementById("failScreen").style.display = "flex";
  };

  ui.onSuccess = () => {
    document.getElementById("successScreen").style.display = "flex";
  };

  // ----- WORLD (road + mountain) -----
  createWorld(scene);

  // ----- CAR -----
  const car = new CarController(scene, camera, ui);

  // ----- GAME LOOP -----
  scene.onBeforeRenderObservable.add(() => {
    car.update(); // 🔥 THIS IS THE KEY FIX
  });

  return scene;
};

const scene = createScene();

// ----- RESIZE -----
window.addEventListener("resize", () => {
  engine.resize();
});

// ----- RENDER LOOP -----
engine.runRenderLoop(() => {
  scene.render();
});
