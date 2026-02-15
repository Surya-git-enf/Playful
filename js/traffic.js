// traffic.js
function createTrafficCar(scene, startX, startZ, dir = -1) {
  const mesh = BABYLON.MeshBuilder.CreateBox("tcar_" + Math.random().toString(36).slice(2,7), {width:1.6, height:0.55, depth:3.2}, scene);
  mesh.position = new BABYLON.Vector3(startX, 0.6, startZ);
  const mat = new BABYLON.StandardMaterial("tm", scene); mat.diffuseColor = new BABYLON.Color3(Math.random()*0.6+0.2, Math.random()*0.6+0.2, Math.random()*0.6+0.2);
  mesh.material = mat;
  const speed = 8 + Math.random()*8;
  return {
    mesh,
    speed,
    dir, // -1 means moving negative z (towards player), +1 opposite
    update(dt){
      this.mesh.position.z += this.dir * this.speed * dt * 6;
      // simple respawn logic: if gone too far, teleport
      if (this.dir < 0 && this.mesh.position.z < -200) {
        this.mesh.position.z = 140 + Math.random()*200;
      } else if (this.dir > 0 && this.mesh.position.z > 140) {
        this.mesh.position.z = -200 - Math.random()*120;
      }
    }
  };
}
