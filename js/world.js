// js/world.js
// createWorld(scene)

function createWorld(scene) {

  /* ================= SKY ================= */
  const skybox = BABYLON.MeshBuilder.CreateBox("sky", { size: 1000 }, scene);
  const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
  skyMat.diffuseColor = new BABYLON.Color3(0.5, 0.7, 1);
  skybox.material = skyMat;

  /* ================= SUN ================= */
  const sun = new BABYLON.DirectionalLight(
    "sun",
    new BABYLON.Vector3(-0.5, -1, -0.5),
    scene
  );
  sun.position = new BABYLON.Vector3(100, 200, 100);
  sun.intensity = 1.2;

  /* ================= GROUND ================= */
  const grass = BABYLON.MeshBuilder.CreateGround("grass", {
    width: 400,
    height: 2000
  }, scene);

  const grassMat = new BABYLON.StandardMaterial("grassMat", scene);
  grassMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.2);
  grass.material = grassMat;

  /* ================= ROAD ================= */
  const road = BABYLON.MeshBuilder.CreateGround("road", {
    width: 10,
    height: 2000
  }, scene);
  road.position.y = 0.01;

  const roadMat = new BABYLON.StandardMaterial("roadMat", scene);
  roadMat.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
  road.material = roadMat;

  /* ================= LANE DIVIDERS ================= */
  for (let z = -1000; z < 1000; z += 20) {
    const line = BABYLON.MeshBuilder.CreateBox("line", {
      width: 0.2,
      height: 0.02,
      depth: 5
    }, scene);
    line.position.set(0, 0.02, z);
    const lm = new BABYLON.StandardMaterial("lm", scene);
    lm.diffuseColor = BABYLON.Color3.White();
    line.material = lm;
  }

  /* ================= BUILDINGS ================= */
  for (let i = 0; i < 80; i++) {
    const b = BABYLON.MeshBuilder.CreateBox("b", {
      width: 6 + Math.random() * 6,
      depth: 6 + Math.random() * 6,
      height: 8 + Math.random() * 25
    }, scene);

    b.position.x = Math.random() > 0.5 ? 18 + Math.random() * 40 : -18 - Math.random() * 40;
    b.position.z = Math.random() * 1800 - 900;
    b.position.y = b.scaling.y * 2;

    const bm = new BABYLON.StandardMaterial("bm", scene);
    bm.diffuseColor = new BABYLON.Color3(
      0.4 + Math.random() * 0.4,
      0.4 + Math.random() * 0.4,
      0.4 + Math.random() * 0.4
    );
    b.material = bm;
  }

  /* ================= TREES ================= */
  for (let i = 0; i < 100; i++) {
    const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk", {
      diameter: 0.5,
      height: 3
    }, scene);
    trunk.position.x = Math.random() > 0.5 ? 25 + Math.random() * 60 : -25 - Math.random() * 60;
    trunk.position.z = Math.random() * 1800 - 900;
    trunk.position.y = 1.5;

    const tm = new BABYLON.StandardMaterial("tm", scene);
    tm.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.1);
    trunk.material = tm;

    const leaves = BABYLON.MeshBuilder.CreateSphere("leaf", {
      diameter: 3
    }, scene);
    leaves.position = trunk.position.add(new BABYLON.Vector3(0, 2, 0));
    const lm = new BABYLON.StandardMaterial("lm2", scene);
    lm.diffuseColor = new BABYLON.Color3(0.1, 0.6, 0.2);
    leaves.material = lm;
  }

  /* ================= RAMPS ================= */
  for (let i = 0; i < 6; i++) {
    const ramp = BABYLON.MeshBuilder.CreateBox("ramp", {
      width: 6,
      height: 1,
      depth: 10
    }, scene);
    ramp.position.set(0, 0.5, -300 + i * 300);
    ramp.rotation.x = -0.35;

    const rm = new BABYLON.StandardMaterial("rm", scene);
    rm.diffuseColor = new BABYLON.Color3(0.6, 0.3, 0.2);
    ramp.material = rm;
  }

  /* ================= STREET LIGHTS ================= */
  for (let z = -800; z < 800; z += 80) {
    const pole = BABYLON.MeshBuilder.CreateCylinder("pole", {
      diameter: 0.2,
      height: 6
    }, scene);
    pole.position.set(4.5, 3, z);

    const light = new BABYLON.PointLight("pl", new BABYLON.Vector3(4.5, 6, z), scene);
    light.intensity = 0.6;
  }

}
