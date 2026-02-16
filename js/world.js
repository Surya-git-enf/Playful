// js/world.js
// buildWorld(scene) -> creates ground, road, buildings, trees and returns { roadWidth, roadLen }

function buildWorld(scene) {
  // lighting (scene expected to already have no lights)
  const hemi = new BABYLON.HemisphericLight("hemi_light", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.95;

  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.4, -1, -0.3), scene);
  sun.position = new BABYLON.Vector3(40, 80, 40);
  sun.intensity = 0.9;

  // LARGE GROUND (grass)
  const groundSize = 3000;
  const ground = BABYLON.MeshBuilder.CreateGround("ground_grass", { width: groundSize, height: groundSize }, scene);
  ground.position.y = -0.01;
  const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.13, 0.5, 0.16); // grass green
  ground.material = groundMat;
  ground.receiveShadows = false;

  // ROAD (centered on Z axis)
  const roadWidth = 14;
  const roadLen = 2400;
  const road = BABYLON.MeshBuilder.CreateGround("main_road", { width: roadWidth, height: roadLen }, scene);
  road.position.z = roadLen / 2 - 20;
  const roadMat = new BABYLON.StandardMaterial("roadMat", scene);
  roadMat.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.06);
  road.material = roadMat;
  road.receiveShadows = false;

  // DASHED CENTER LINE (two-way)
  const dashLen = 12;
  const gap = 10;
  const dashCount = Math.floor(roadLen / (dashLen + gap));
  for (let i = 0; i < dashCount; i++) {
    const z = i * (dashLen + gap) + 8;
    const dash = BABYLON.MeshBuilder.CreateBox("dash_" + i, { width: 0.22, height: 0.02, depth: dashLen }, scene);
    dash.position = new BABYLON.Vector3(0, 0.03, z);
    const dm = new BABYLON.StandardMaterial("dashMat_" + i, scene);
    dm.diffuseColor = new BABYLON.Color3(1, 1, 1);
    dash.material = dm;
  }

  // CURBS (left & right)
  const curbMat = new BABYLON.StandardMaterial("curbMat", scene);
  curbMat.diffuseColor = new BABYLON.Color3(0.18, 0.18, 0.18);
  const curbLeft = BABYLON.MeshBuilder.CreateBox("curbLeft", { width: 0.6, height: 0.08, depth: roadLen }, scene);
  curbLeft.position = new BABYLON.Vector3(-roadWidth / 2 - 0.5, 0.04, road.position.z);
  curbLeft.material = curbMat;
  const curbRight = curbLeft.clone("curbRight");
  curbRight.position.x = -curbLeft.position.x;

  // helper: add building with simple window planes (cheap, looks like windows)
  function addBuilding(x, z, w, h, d, color) {
    const b = BABYLON.MeshBuilder.CreateBox("building_" + x + "_" + z, { width: w, height: h, depth: d }, scene);
    b.position = new BABYLON.Vector3(x, h / 2, z);
    const bm = new BABYLON.StandardMaterial("bmat_" + x + "_" + z, scene);
    bm.diffuseColor = color || new BABYLON.Color3(0.28, 0.28, 0.36);
    b.material = bm;

    // add simple windows on front face (few quads) — cheap and effective
    const rows = Math.max(2, Math.floor(h / 4));
    const cols = Math.max(2, Math.floor(w / 3));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = x - w / 2 + (c + 0.5) * (w / cols);
        const wy = (r + 0.8) * (h / (rows + 1));
        const wz = z + d / 2 + 0.01;
        const win = BABYLON.MeshBuilder.CreatePlane("win_" + x + "_" + z + "_" + r + "_" + c, { size: Math.min(0.6, w / cols * 0.7) }, scene);
        win.position = new BABYLON.Vector3(wx, wy, wz);
        win.rotation = new BABYLON.Vector3(0, Math.PI, 0);
        const wmat = new BABYLON.StandardMaterial("wmat_" + x + "_" + z + "_" + r + "_" + c, scene);
        wmat.emissiveColor = Math.random() > 0.7 ? new BABYLON.Color3(0.95, 0.85, 0.6) : new BABYLON.Color3(0.04, 0.05, 0.06);
        win.material = wmat;
      }
    }
    return b;
  }

  // helper: add a small tree (trunk + leaves)
  function addTree(x, z, scale = 1) {
    const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk_" + x + "_" + z, { height: 2.0 * scale, diameterTop: 0.35 * scale, diameterBottom: 0.35 * scale }, scene);
    trunk.position = new BABYLON.Vector3(x, 1.0 * scale, z);
    const tmat = new BABYLON.StandardMaterial("trmat_" + x + "_" + z, scene);
    tmat.diffuseColor = new BABYLON.Color3(0.34, 0.2, 0.08);
    trunk.material = tmat;

    const leaves = BABYLON.MeshBuilder.CreateSphere("leaves_" + x + "_" + z, { diameter: 2.2 * scale }, scene);
    leaves.position = new BABYLON.Vector3(x, 2.6 * scale, z);
    const lmat = new BABYLON.StandardMaterial("lmat_" + x + "_" + z, scene);
    lmat.diffuseColor = new BABYLON.Color3(0.06, 0.45, 0.12);
    leaves.material = lmat;
  }

  // helper: add grass patch
  function addGrassPatch(x, z, size = 1) {
    const patch = BABYLON.MeshBuilder.CreateGround("grassPatch_" + x + "_" + z, { width: 6 * size, height: 6 * size }, scene);
    patch.position = new BABYLON.Vector3(x, 0.01, z);
    const pm = new BABYLON.StandardMaterial("pm_" + x + "_" + z, scene);
    pm.diffuseColor = new BABYLON.Color3(0.12, 0.52, 0.14);
    patch.material = pm;
  }

  // scatter buildings and trees along both sides of the road
  for (let i = 0; i < 60; i++) {
    const z = 30 + i * 36 + (Math.random() * 18 - 9);

    // left side
    addBuilding(-roadWidth / 2 - (8 + Math.random() * 18), z, 8 + Math.random() * 12, 8 + Math.random() * 30, 6, new BABYLON.Color3(0.18 + Math.random() * 0.4, 0.18, 0.18 + Math.random() * 0.4));
    addTree(-roadWidth / 2 - 34, z + (Math.random() * 12 - 6), 1 + Math.random() * 0.6);
    addGrassPatch(-roadWidth / 2 - 18, z + (Math.random() * 15 - 7), 0.8 + Math.random() * 1.2);

    // right side
    addBuilding(roadWidth / 2 + (8 + Math.random() * 18), z, 8 + Math.random() * 12, 8 + Math.random() * 30, 6, new BABYLON.Color3(0.18, 0.18 + Math.random() * 0.4, 0.18 + Math.random() * 0.4));
    addTree(roadWidth / 2 + 34, z + (Math.random() * 12 - 6), 1 + Math.random() * 0.6);
    addGrassPatch(roadWidth / 2 + 18, z + (Math.random() * 15 - 7), 0.8 + Math.random() * 1.2);
  }

  // street lamp poles (visual only)
  for (let i = 0; i < 80; i++) {
    const z = 12 + i * 30;
    const pole = BABYLON.MeshBuilder.CreateCylinder("poleLeft_" + i, { height: 3.8, diameterTop: 0.12, diameterBottom: 0.12 }, scene);
    pole.position = new BABYLON.Vector3(-roadWidth / 2 - 6, 1.9, z);
    const pmat = new BABYLON.StandardMaterial("pmatL_" + i, scene);
    pmat.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.12);
    pole.material = pmat;
    const pole2 = pole.clone("poleRight_" + i);
    pole2.position.x = -pole.position.x;
  }

  return { roadWidth, roadLen };
}
