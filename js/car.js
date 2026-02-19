// js/car.js
// Player car creation + movement logic

window.createPlayerCar = async function (scene) {

  const carRoot = new BABYLON.TransformNode("carRoot", scene);

  let carMesh = null;
  let wheels = [];

  /* ---------------- LOAD CAR MODEL ---------------- */
  try {
    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      "",
      "assets/car/",
      "car.glb",
      scene
    );

    carMesh = result.meshes[0];
    carMesh.parent = carRoot;
    carMesh.scaling.setAll(1.2);

    // auto-detect wheels
    result.meshes.forEach(m => {
      if (m.name.toLowerCase().includes("wheel")) {
        wheels.push(m);
      }
    });

  } catch (e) {
    console.warn("car.glb not found — using fallback car");

    // fallback body
    carMesh = BABYLON.MeshBuilder.CreateBox(
      "carBody",
      { width: 1.6, height: 0.6, depth: 3 },
      scene
    );
    carMesh.parent = carRoot;
    carMesh.position.y = 0.6;

    const mat = new BABYLON.StandardMaterial("carMat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.8, 0.1, 0.1);
    carMesh.material = mat;

    // fallback wheels
    const wheelPositions = [
      [-0.8, 0.2, 1.2],
      [0.8, 0.2, 1.2],
      [-0.8, 0.2, -1.2],
      [0.8, 0.2, -1.2],
    ];

    wheelPositions.forEach(p => {
      const w = BABYLON.MeshBuilder.CreateCylinder(
        "wheel",
        { diameter: 0.6, height: 0.3 },
        scene
      );
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], p[1], p[2]);
      w.parent = carRoot;
      wheels.push(w);
    });
  }

  /* ---------------- INITIAL POSITION ---------------- */
  carRoot.position.set(0, 3, 60);
  carRoot.rotationQuaternion = BABYLON.Quaternion.Identity();

  /* ---------------- MOVEMENT STATE ---------------- */
  let speed = 0;
  let steering = 0;

  const MAX_SPEED = 1.2;
  const ACCELERATION = 0.025;
  const BRAKE = 0.05;
  const TURN_SPEED = 0.04;
  const FRICTION = 0.98;
  const GRAVITY = 0.04;

  /* ---------------- INPUT STATE ---------------- */
  if (!window.inputState) {
    window.inputState = {
      accelerate: false,
      brake: false,
      steer: 0
    };
  }

  /* ---------------- UPDATE LOOP ---------------- */
  scene.onBeforeRenderObservable.add(() => {

    // acceleration
    if (window.inputState.accelerate) {
      speed += ACCELERATION;
    }
    if (window.inputState.brake) {
      speed -= BRAKE;
    }

    speed *= FRICTION;
    speed = BABYLON.Scalar.Clamp(speed, -0.4, MAX_SPEED);

    // steering
    steering = BABYLON.Scalar.Lerp(
      steering,
      window.inputState.steer,
      0.15
    );

    carRoot.rotation.y += steering * TURN_SPEED * speed * 2;

    // forward movement
    const forward = carRoot.forward.scale(speed);
    carRoot.position.addInPlace(forward);

    // gravity
    carRoot.position.y -= GRAVITY;

    // wheel rotation
    wheels.forEach(w => {
      w.rotation.x += speed * 2.5;
    });

    // tilt based on steering
    carRoot.rotation.z = -steering * 0.25;

    // update HUD speed
    const kmh = Math.max(0, Math.floor(speed * 80));
    const speedEl = document.getElementById("speed");
    if (speedEl) speedEl.innerText = km/h;

  });

  return carRoot;
};
