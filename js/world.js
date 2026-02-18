// js/world.js
// createWorld(scene) -> builds terrain, slope, ramps, finish, returns { roadWidth, finishMesh }

function createWorld(scene) {
  // sky + lighting
  const skybox = BABYLON.MeshBuilder.CreateBox("skybox", { size: 2000 }, scene);
  const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
  skyMat.backFaceCulling = false; skyMat.disableLighting = false;
  skyMat.diffuseColor = new BABYLON.Color3(0.53, 0.78, 0.95);
  skybox.material = skyMat;

  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.8;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.3,-1,-0.3), scene);
  sun.position = new BABYLON.Vector3(60,120,60);
  sun.intensity = 1.05;

  // ground (big grass)
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 1200, height: 2400 }, scene);
  ground.position.y = -1;
  const gmat = new BABYLON.StandardMaterial("gmat", scene); gmat.diffuseColor = new BABYLON.Color3(0.16,0.5,0.18);
  ground.material = gmat;

  // road width (for reference; car can drive offroad)
  const roadWidth = 12;

  // create a series of sloped segments to simulate a mountain path
  const segments = [];
  const segmentCount = 7;
  const baseZ = -200;
  for (let i = 0; i < segmentCount; i++) {
    const depth = 120;
    const width = roadWidth;
    const seg = BABYLON.MeshBuilder.CreateBox("seg_" + i, { width: width, height: 1, depth: depth }, scene);
    const height = 2 + i * 2.6; // progressive height
    seg.position = new BABYLON.Vector3(0, height, baseZ + i * (depth - 14));
    // tilt to make climbing slope
    seg.rotation.x = -BABYLON.Tools.ToRadians(6 + i * 2);
    const mat = new BABYLON.StandardMaterial("segMat_" + i, scene);
    mat.diffuseColor = new BABYLON.Color3(0.42,0.36,0.30);
    seg.material = mat;
    segments.push(seg);
  }

  // ramps: a few placed near the middle
  const ramps = [];
  for (let r = 0; r < 3; r++) {
    const ramp = BABYLON.MeshBuilder.CreateBox("ramp_" + r, { width: 6, height: 1, depth: 12 }, scene);
    ramp.position = new BABYLON.Vector3((Math.random()-0.5)*4, 4 + r*8, baseZ + 180 + r*200);
    ramp.rotation.x = -0.42;
    ramp.material = new BABYLON.StandardMaterial("rmat_" + r, scene);
    ramp.material.diffuseColor = new BABYLON.Color3(0.55,0.38,0.27);
    ramps.push(ramp);
  }

  // finish platform at top
  const finish = BABYLON.MeshBuilder.CreateBox("finish", { width: 22, height: 1, depth: 14 }, scene);
  finish.position = new BABYLON.Vector3(0, 2 + segmentCount * 2.6 + 12, baseZ + segmentCount * 110);
  finish.material = new BABYLON.StandardMaterial("finishMat", scene);
  finish.material.diffuseColor = new BABYLON.Color3(0.16,0.56,0.72);

  // small invisible finish trigger (slightly larger, used for detection)
  const finishTrigger = BABYLON.MeshBuilder.CreateBox("finishTrigger", { width: 18, height: 6, depth: 12 }, scene);
  finishTrigger.position = finish.position.clone();
  finishTrigger.isVisible = false;

  // environment instancing: trees + grass patches
  const baseTrunk = BABYLON.MeshBuilder.CreateCylinder("baseTrunk", { height:2, diameterTop:0.35, diameterBottom:0.35 }, scene);
  const baseLeaves = BABYLON.MeshBuilder.CreateSphere("baseLeaves", { diameter:2.2 }, scene);
  const trunkMat = new BABYLON.StandardMaterial("trunkMat", scene); trunkMat.diffuseColor = new BABYLON.Color3(0.36,0.2,0.08);
  const leafMat = new BABYLON.StandardMaterial("leafMat", scene); leafMat.diffuseColor = new BABYLON.Color3(0.06,0.45,0.12);
  baseTrunk.material = trunkMat; baseLeaves.material = leafMat;
  baseTrunk.isPickable = baseLeaves.isPickable = false;

  const baseGrass = BABYLON.MeshBuilder.CreateGround("baseGrass", { width: 6, height: 6 }, scene);
  const grassMat = new BABYLON.StandardMaterial("grassMat", scene); grassMat.diffuseColor = new BABYLON.Color3(0.12,0.52,0.14);
  baseGrass.material = grassMat; baseGrass.isPickable = false;

  // scatter left and right sides along Z
  for (let i = 0; i < 60; i++) {
    const z = baseZ + i * 40 + (Math.random() * 20 - 10);
    const side = Math.random() > 0.5 ? -1 : 1;
    const x = side * (roadWidth/2 + 10 + Math.random()*18);
    const t = baseTrunk.createInstance("t_trunk_" + i);
    t.position = new BABYLON.Vector3(x, 1 + Math.random()*0.8, z + (Math.random()*12 - 6));
    const l = baseLeaves.createInstance("t_leaf_" + i);
    l.position = t.position.add(new BABYLON.Vector3(0,1.8 + Math.random()*0.6,0));
    const gp = baseGrass.createInstance("g_patch_" + i);
    gp.position = new BABYLON.Vector3(x - 6 + Math.random()*10, 0.01, z + (Math.random()*18 - 9));
  }

  // street-lamp effect (emissive bulbs with sparse lights) for style (no shadows)
  const bulbMat = new BABYLON.StandardMaterial("bulbMat", scene); bulbMat.emissiveColor = new BABYLON.Color3(1,0.92,0.6);
  const baseBulb = BABYLON.MeshBuilder.CreateSphere("baseBulb", { diameter:0.28 }, scene);
  baseBulb.material = bulbMat; baseBulb.isPickable = false; baseBulb.isVisible = false;
  // sparse small lights (every Nth)
  const LIGHT_EVERY = 12;
  let idx = 0;
  for (let z = baseZ - 120; z < baseZ + segmentCount * 120 + 200; z += 80) {
    const leftBulb = baseBulb.createInstance("bulbL_" + idx);
    leftBulb.position = new BABYLON.Vector3(-roadWidth/2 - 6, 3.7, z);
    const rightBulb = baseBulb.createInstance("bulbR_" + idx);
    rightBulb.position = new BABYLON.Vector3(roadWidth/2 + 6, 3.7, z);
    if (idx % LIGHT_EVERY === 0) {
      const pl = new BABYLON.PointLight("pl_"+idx, leftBulb.position, scene);
      pl.intensity = 0.6; pl.range = 6; pl.specular = new BABYLON.Color3(0.2,0.15,0.12); pl.shadowEnabled = false;
      const pr = new BABYLON.PointLight("pr_"+idx, rightBulb.position, scene);
      pr.intensity = 0.6; pr.range = 6; pr.shadowEnabled = false;
    }
    idx++;
  }

  // return references for main.js
  return {
    roadWidth: roadWidth,
    finishTrigger: finishTrigger,
    finishMesh: finish
  };
}
