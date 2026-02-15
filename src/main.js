const canvas = document.getElementById("game");
const engine = new BABYLON.Engine(canvas, true);

const scene = new BABYLON.Scene(engine);

createWorld(scene);
const car = createCar(scene);

// CAMERA
const camera = new BABYLON.FollowCamera(
  "cam",
  new BABYLON.Vector3(0, 5, -10),
  scene
);
camera.lockedTarget = car;
camera.radius = 10;
camera.heightOffset = 3;
camera.rotationOffset = 180;

// MOVEMENT
let speed = 0;
let steer = 0;

function bind(id, action) {
  const btn = document.getElementById(id);
  btn.addEventListener("touchstart", () => action(true));
  btn.addEventListener("touchend", () => action(false));
}

bind("acc", v => speed = v ? 0.2 : 0);
bind("brake", v => speed = v ? -0.1 : 0);
bind("left", v => steer = v ? 0.04 : 0);
bind("right", v => steer = v ? -0.04 : 0);

// LOOP
scene.onBeforeRenderObservable.add(() => {
  car.rotation.y += steer;
  car.moveWithCollisions(car.forward.scale(speed));
});

engine.runRenderLoop(() => scene.render());
