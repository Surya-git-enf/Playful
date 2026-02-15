function createCar(scene) {

  const car = BABYLON.MeshBuilder.CreateBox(
    "car",
    { width: 1.5, height: 0.5, depth: 3 },
    scene
  );

  const mat = new BABYLON.StandardMaterial("carMat", scene);
  mat.diffuseColor = BABYLON.Color3.Red();
  car.material = mat;

  car.position.y = 0.25;

  return car;
}
