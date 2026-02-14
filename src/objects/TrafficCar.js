// src/objects/TrafficCar.js
export class TrafficCar {
  constructor(scene, start) {
    this.scene = scene;
    this.mesh = BABYLON.MeshBuilder.CreateBox('traffic', { width:1.8, height:0.6, depth:3.6 }, scene);
    this.mesh.position = new BABYLON.Vector3(start.x || 0, 0.6, start.z || 0);
    this.mesh.material = new BABYLON.StandardMaterial('tm', scene); this.mesh.material.diffuseColor = new BABYLON.Color3(0.2,0.5,0.8);
    this.speed = 6 + Math.random()*6;
  }
  update(dt) {
    this.mesh.position.z += -this.speed * dt * 4;
  }
}
