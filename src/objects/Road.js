// src/objects/Road.js
export class Road {
  constructor(scene) {
    this.scene = scene;
    this.roadWidth = 12;
    this.roadLength = 3000;
    this.createRoad();
  }

  createRoad() {
    const { roadWidth, roadLength, scene } = this;
    const road = BABYLON.MeshBuilder.CreateGround('road', { width: roadWidth, height: roadLength }, scene);
    road.position.y = 0.02;
    road.position.z = roadLength / 2 - 20;
    const mat = new BABYLON.StandardMaterial('roadMat', scene);
    mat.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.06);
    road.material = mat;
    road.receiveShadows = true;

    // lane dividers
    const divSpacing = 14;
    for (let i = 0; i < Math.floor(roadLength / divSpacing); i++) {
      const d = BABYLON.MeshBuilder.CreateBox('div' + i, { width: 0.18, height: 0.02, depth: 6 }, scene);
      d.position = new BABYLON.Vector3(0, 0.03, i * divSpacing + 10);
      const dm = new BABYLON.StandardMaterial('dm' + i, scene);
      dm.diffuseColor = new BABYLON.Color3(1, 1, 1);
      d.material = dm;
    }
  }
}
