// js/main.js
import { createWorld } from "./world.js";
import { createPlayerCar } from "./car.js";

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
});

let scene;
let player;
let world;

window.inputState = {
  steeringValue: 0,
  accelerate: false,
  brake: false,
};

// ---------- INPUT (mobile + desktop safe) ----------
function setupInput() {
  const gas = document.getElementById("btn-gas");
  const brake = document.getElementById("btn-brake");
  const steer = document.getElementById("steering-wheel");

  if (gas) {
    gas.addEventListener("touchstart", () => (inputState.accelerate = true));
    gas.addEventListener("touchend", () => (inputState.accelerate = false));
    gas.addEventListener("mousedown", () => (inputState.accelerate = true));
    gas.addEventListener("mouseup", () => (inputState.accelerate = false));
  }

  if (brake) {
    brake.addEventListener("touchstart", () => (inputState.brake = true));
    brake.addEventListener("touchend", () => (inputState.brake = false));
    brake.addEventListener("mousedown", () => (inputState.brake = true));
    brake.addEventListener("mouseup", () => (inputState.brake = false));
  }

  if (steer) {
    let centerX = null;

    steer.addEventListener("touchstart", (e) => {
      centerX = e.touches[0].clientX;
    });

    steer.addEventListener("touchmove", (e) => {
      const dx = e.touches[0].clientX - centerX;
      inputState.steeringValue = BABYLON.Scalar.Clamp(dx / 120, -1, 1);
    });

    steer.addEventListener("touchend", () => {
      inputState.steeringValue = 0;
      centerX = null;
    });
  }

  // Keyboard fallback
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") inputState.accelerate = true;
    if (e.key === "ArrowDown") inputState.brake = true;
    if (e.key === "ArrowLeft") inputState.steeringValue = -1;
    if (e.key === "ArrowRight") inputState.steeringValue = 1;
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowUp") inputState.accelerate = false;
    if (e.key === "ArrowDown") inputState.brake = false;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight")
      inputState.steeringValue = 0;
  });
}

// ---------- SCENE ----------
async function createScene() {
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.55, 0.8, 0.95);

  // Camera (3rd person follow)
  const camera = new BABYLON.FollowCamera(
    "followCam",
    new BABYLON.Vector3(0, 6, -10),
    scene
  );
  camera.radius = 10;
  camera.heightOffset = 4;
  camera.rotationOffset = 180;
  camera.attachControl(canvas, true);

  // Light
  const sun = new BABYLON.DirectionalLight(
    "sun",
    new BABYLON.Vector3(-0.3, -1, 0.3),
    scene
  );
  sun.position = new BABYLON.Vector3(30, 60, -30);
  sun.intensity = 1.2;

  new BABYLON.HemisphericLight(
    "sky",
    new BABYLON.Vector3(0, 1, 0),
    scene
  );

  // World
  world = createWorld(scene);

  // Player car
  player = await createPlayerCar(scene, true);
  camera.lockedTarget = player;

  setupInput();

  return scene;
}

// ---------- GAME LOOP ----------
createScene().then(() => {
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;

    if (player && player.update) {
      player.update(dt, world);
    }

    // HUD speed
    const speedEl = document.getElementById("hud-speed");
    if (speedEl && player?._approxSpeed !== undefined) {
      speedEl.innerText = Math.abs(player._approxSpeed * 3.6).toFixed(0);
    }

    scene.render();
  });
});

// ---------- RESIZE ----------
window.addEventListener("resize", () => {
  engine.resize();
});
