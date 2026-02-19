// js/world.js
// Creates terrain, road, environment & finish zone

window.createWorld = function (scene) {

  /* ---------------- LIGHTING ---------------- */
  const light = new BABYLON.HemisphericLight(
    "sun",
    new BABYLON.Vector3(0, 1, 0),
    scene
  );
  light.intensity = 0.9;

  const dirLight = new BABYLON.DirectionalLight(
    "dir",
    new BABYLON.Vector3(-0.5, -1, -0.5),
    scene
  );
  dirLight.position = new BABYLON.Vector3(50, 100, 50);
  dirLight.intensity = 0.7;

  /* ---------------- SKY ---------------- */
  const sky = BABYLON.MeshBuilder.CreateBox("sky", { size: 1000 }, scene);
  const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
  skyMat.diffuseColor = new BABYLON.Color3(0.45, 0.7, 1);
  sky.material = skyMat;

  /* ---------------- TERRAIN (MOUNTAIN) ---------------- */
  const ground = BABYLON.MeshBuilder.CreateGroundFromHeightMap(
    "mountain",
    "https://assets.babylonjs.com/environments/villageheightmap.png",
    {
      width: 300,
      height: 300,
      subdivisions: 100,
      minHeight: 0,
      maxHeight: 45,
    },
    scene
  );

  const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.15, 0.5, 0.15); // grass green
  ground.material = groundMat;
  ground.receiveShadows = true;

  /* ---------------- ROAD ---------------- */
  const road = BABYLON.MeshBuilder.CreateGround(
    "road",
    { width: 12, height: 260 },
    scene
  );
  road.position.y = 1;
  road.position.z = 10;

  const roadMat = new BABYLON.StandardMaterial("roadMat", scene);
  roadMat.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
  road.material = roadMat;

  /* ---------------- ROAD LANE MARKINGS ---------------- */
  for (let i = -120; i < 120; i += 8) {
    const lane = BABYLON.MeshBuilder.CreateBox(
      "lane",
      { width: 0.3, height: 0.1, depth: 3 },
      scene
    );
    lane.position.y = 1.05;
    lane.position.z = i;
    lane.material = new BABYLON.StandardMaterial("laneMat", scene);
    lane.material.diffuseColor = BABYLON.Color3.White();
  }

  /* ---------------- TREES ---------------- */
  function createTree(x, z) {
    const trunk = BABYLON.MeshBuilder.CreateCylinder(
      "trunk",
      { height: 3, diameter: 0.5 },
      scene
    );
    trunk.position.set(x, 1.5, z);
    trunk.material = new BABYLON.StandardMaterial("trunkMat", scene);
    trunk.material.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.1);

    const leaves = BABYLON.MeshBuilder.CreateSphere(
      "leaves",
      { diameter: 3 },
      scene
    );
    leaves.position.set(x, 4, z);
    leaves.material = new BABYLON.StandardMaterial("leafMat", scene);
    leaves.material.diffuseColor = new BABYLON.Color3(0.1, 0.6, 0.1);
  }

  for (let i = 0; i < 40; i++) {
    createTree(
      BABYLON.Scalar.RandomRange(-40, -15),
      BABYLON.Scalar.RandomRange(-120, 120)
    );
    createTree(
      BABYLON.Scalar.RandomRange(15, 40),
      BABYLON.Scalar.RandomRange(-120, 120)
    );
  }

  /* ---------------- FINISH ZONE ---------------- */
  const finish = BABYLON.MeshBuilder.CreateBox(
    "finish",
    { width: 12, height: 1, depth: 6 },
    scene
  );
  finish.position.set(0, 2, -120);

  const finishMat = new BABYLON.StandardMaterial("finishMat", scene);
  finishMat.diffuseColor = new BABYLON.Color3(1, 0.85, 0.2);
  finish.material = finishMat;

  finish.metadata = { isFinish: true };

  /* ---------------- WORLD RETURN ---------------- */
  return {
    ground,
    road,
    finish
  };
};
