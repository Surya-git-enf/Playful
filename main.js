const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color3(0.55, 0.8, 0.95);

// CAMERA
const camera = new BABYLON.FollowCamera(
  "cam",
  new BABYLON.Vector3(0, 6, -12),
  scene
);
camera.radius = 18;
camera.heightOffset = 6;
camera.rotationOffset = 180;
camera.cameraAcceleration = 0.05;
camera.maxCameraSpeed = 20;
camera.attachControl(canvas, true);

// LIGHT
new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);

// GROUND (ROAD)
const ground = BABYLON.MeshBuilder.CreateGround("ground", {
  width: 500,
  height: 40
}, scene);

const groundMat = new BABYLON.StandardMaterial("gmat", scene);
groundMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
ground.material = groundMat;

// CAR BODY
const car = BABYLON.MeshBuilder.CreateBox("car", {
  width: 1.8,
  height: 0.8,
  depth: 3.8
}, scene);

car.position.y = 0.5;

const carMat = new BABYLON.StandardMaterial("cmat", scene);
carMat.diffuseColor = new BABYLON.Color3(1, 0, 0);
car.material = carMat;

camera.lockedTarget = car;

// INPUT
const keys = {};
window.addEventListener("keydown", e => keys[e.key] = true);
window.addEventListener("keyup", e => keys[e.key] = false);

// CAR PARAMETERS (ARCADE-SIM)
let speed = 0;
let steer = 0;
let drift = false;

const MAX_SPEED = 120;
const ACCEL = 0.15;
const BRAKE = 0.2;
const TURN_RATE = 0.035;
const DRIFT_LOSS = 0.96;

// DRIFT BUTTON
document.getElementById("driftBtn").onclick = () => {
  drift = !drift;
  document.getElementById("driftBtn").style.background = drift ? "orange" : "red";
};

// GAME LOOP
scene.onBeforeRenderObservable.add(() => {
  // ACCELERATION
  if (keys["ArrowUp"]) speed += ACCEL;
  if (keys["ArrowDown"]) speed -= BRAKE;

  speed = Math.max(Math.min(speed, MAX_SPEED), -30);
  speed *= 0.99;

  // STEERING
  if (keys["ArrowLeft"]) steer -= TURN_RATE;
  if (keys["ArrowRight"]) steer += TURN_RATE;
  steer *= 0.9;

  // DRIFT EFFECT
  const driftFactor = drift ? 0.92 : 1;
  speed *= driftFactor;

  // APPLY ROTATION
  car.rotation.y += steer * (speed / MAX_SPEED);

  // MOVE FORWARD
  car.position.x += Math.sin(car.rotation.y) * speed * 0.05;
  car.position.z += Math.cos(car.rotation.y) * speed * 0.05;

  // HUD
  document.getElementById("speed").innerText =
    Math.abs(speed).toFixed(0) + " km/h";
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
