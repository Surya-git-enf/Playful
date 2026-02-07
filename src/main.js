window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("renderCanvas");
  const engine = new BABYLON.Engine(canvas, true);

  const scene = new BABYLON.Scene(engine);
  scene.enablePhysics(
    new BABYLON.Vector3(0, -9.82, 0),
    new BABYLON.CannonJSPlugin()
  );

  // CAMERA (FOLLOW CAR – NOT ROTATING CAR)
  const camera = new BABYLON.FollowCamera("cam",
    new BABYLON.Vector3(0, 6, -15),
    scene
  );
  camera.radius = 18;
  camera.heightOffset = 6;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.05;
  camera.maxCameraSpeed = 10;

  // LIGHT
  new BABYLON.HemisphericLight("light",
    new BABYLON.Vector3(0, 1, 0),
    scene
  );

  // GROUND
  const ground = BABYLON.MeshBuilder.CreateGround("ground", {
    width: 500,
    height: 500
  }, scene);
  ground.physicsImpostor = new BABYLON.PhysicsImpostor(
    ground,
    BABYLON.PhysicsImpostor.BoxImpostor,
    { mass: 0, friction: 2, restitution: 0 },
    scene
  );

  // CAR BODY (RED)
  const chassis = BABYLON.MeshBuilder.CreateBox("chassis", {
    width: 1.8,
    height: 0.6,
    depth: 4
  }, scene);

  const carMat = new BABYLON.StandardMaterial("carMat", scene);
  carMat.diffuseColor = new BABYLON.Color3(1, 0, 0); // RED CAR
  chassis.material = carMat;

  chassis.position.y = 2;

  chassis.physicsImpostor = new BABYLON.PhysicsImpostor(
    chassis,
    BABYLON.PhysicsImpostor.BoxImpostor,
    { mass: 150 },
    scene
  );

  camera.lockedTarget = chassis;

  // VEHICLE
  const vehicle = new BABYLON.RaycastVehicle({
    chassisMesh: chassis,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2
  }, scene);

  const wheelMat = new BABYLON.StandardMaterial("wheelMat", scene);
  wheelMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

  function addWheel(isFront, x, z) {
    const wheelMesh = BABYLON.MeshBuilder.CreateCylinder("wheel", {
      diameter: 0.8,
      height: 0.4
    }, scene);
    wheelMesh.rotation.z = Math.PI / 2;
    wheelMesh.material = wheelMat;

    vehicle.addWheel({
      wheelMesh,
      isFrontWheel: isFront,
      radius: 0.4,
      directionLocal: new BABYLON.Vector3(0, -1, 0),
      axleLocal: new BABYLON.Vector3(1, 0, 0),
      suspensionRestLength: 0.4,
      suspensionStiffness: 20,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      frictionSlip: 5,
      rollInfluence: 0.01,
      chassisConnectionPointLocal: new BABYLON.Vector3(x, -0.3, z)
    });
  }

  // FRONT WHEELS
  addWheel(true, -0.9, 1.6);
  addWheel(true, 0.9, 1.6);

  // REAR WHEELS
  addWheel(false, -0.9, -1.6);
  addWheel(false, 0.9, -1.6);

  vehicle.attachToScene();

  // CONTROLS
  let engineForce = 0;
  let steering = 0;
  let braking = 0;

  window.addEventListener("keydown", e => {
    if (e.key === "ArrowUp") engineForce = 1200;
    if (e.key === "ArrowDown") braking = 15;
    if (e.key === "ArrowLeft") steering = -0.4;
    if (e.key === "ArrowRight") steering = 0.4;
  });

  window.addEventListener("keyup", e => {
    engineForce = 0;
    braking = 0;
    steering = 0;
  });

  scene.onBeforeRenderObservable.add(() => {
    vehicle.applyEngineForce(engineForce, 2);
    vehicle.applyEngineForce(engineForce, 3);

    vehicle.setSteeringValue(steering, 0);
    vehicle.setSteeringValue(steering, 1);

    vehicle.setBrake(braking, 0);
    vehicle.setBrake(braking, 1);
    vehicle.setBrake(braking, 2);
    vehicle.setBrake(braking, 3);
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
});
