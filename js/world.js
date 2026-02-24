// js/world.js
// Responsible ONLY for environment: sky, ground, mountain, road, lights

export async function createWorld(scene) {

  /* ---------------- LIGHT ---------------- */
  const hemiLight = new BABYLON.HemisphericLight(
    "hemiLight",
    new BABYLON.Vector3(0, 1, 0),
    scene
  );
  hemiLight.intensity = 0.9;

  const sun = new BABYLON.DirectionalLight(
    "sunLight",
    new BABYLON.Vector3(-0.4, -1, -0.4),
    scene
  );
  sun.position = new BABYLON.Vector3(50, 100, 50);
  sun.intensity = 1.0;

  /* ---------------- SKY ---------------- */
  const skybox = BABYLON.MeshBuilder.CreateBox(
    "skyBox",
    { size: 1000 },
    scene
  );
  const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
  skyMat.diffuseColor = new BABYLON.Color3(0.5, 0.7, 1.0);
  skyMat.specularColor = BABYLON.Color3.Black();
  skybox.material = skyMat;

  /* ---------------- GROUND ---------------- */
  const ground = BABYLON.MeshBuilder.CreateGround(
    "ground",
    { width: 300, height: 300 },
    scene
  );
  const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.25, 0.6, 0.25);
  ground.material = groundMat;

  /* ---------------- MOUNTAIN (SLOPE) ---------------- */
  const mountain = BABYLON.MeshBuilder.CreateBox(
    "mountain",
    {
      width: 20,
      height: 5,
      depth: 200
    },
    scene
  );

  mountain.position.y = 2.5;
  mountain.position.z = 80;
  mountain.rotation.x = BABYLON.Tools.ToRadians(-18);

  const mountainMat = new BABYLON.StandardMaterial("mountainMat", scene);
  mountainMat.diffuseColor = new BABYLON.Color3(0.35, 0.35, 0.35);
  mountain.material = mountainMat;

  /* ---------------- ROAD ---------------- */
  const road = BABYLON.MeshBuilder.CreateBox(
    "road",
    {
      width: 6,
      height: 0.2,
      depth: 200
    },
    scene
  );

  road.position.y = 3;
  road.position.z = 80;
  road.rotation.x = BABYLON.Tools.ToRadians(-18);

  const roadMat = new BABYLON.StandardMaterial("roadMat", scene);
  roadMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
  road.material = roadMat;

  /* ---------------- FINISH LINE ---------------- */
  const finish = BABYLON.MeshBuilder.CreateBox(
    "finish",
    { width: 8, height: 2, depth: 1 },
    scene
  );
  finish.position.set(0, 6, 180);
  const finishMat = new BABYLON.StandardMaterial("finishMat", scene);
  finishMat.diffuseColor = new BABYLON.Color3(0, 1, 0);
  finish.material = finishMat;

  /* ---------------- RETURN WORLD DATA ---------------- */
  return {
    ground,
    road,
    mountain,
    finish
  };
}
