function createWorld(scene) {

  // Light
  const light = new BABYLON.HemisphericLight(
    "light",
    new BABYLON.Vector3(0, 1, 0),
    scene
  );
  light.intensity = 0.9;

  // Sky
  const sky = BABYLON.MeshBuilder.CreateBox(
    "sky",
    { size: 1000 },
    scene
  );
  const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
  skyMat.backFaceCulling = false;
  skyMat.diffuseColor = new BABYLON.Color3(0.5, 0.7, 1);
  sky.material = skyMat;

  // Road
  const road = BABYLON.MeshBuilder.CreateGround(
    "road",
    { width: 20, height: 500 },
    scene
  );
  const roadMat = new BABYLON.StandardMaterial("roadMat", scene);
  roadMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
  road.material = roadMat;

  // Grass
  const grass = BABYLON.MeshBuilder.CreateGround(
    "grass",
    { width: 200, height: 500 },
    scene
  );
  grass.position.y = -0.05;
  const grassMat = new BABYLON.StandardMaterial("grassMat", scene);
  grassMat.diffuseColor = new BABYLON.Color3(0.1, 0.6, 0.1);
  grass.material = grassMat;
}
