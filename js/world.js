// js/world_addons.js
// Efficient environment generator: instanced trees, grass patches, building clusters, optimized street lamps.
// Call addEnvironment(scene, options) after scene is created (or inside createScene).

function addEnvironment(scene, opts = {}) {
  const roadWidth = opts.roadWidth || 12;
  const numClusters = opts.numClusters || 40;
  const spread = opts.spread || 1800;
  const leftX = -roadWidth/2 - 18;
  const rightX = roadWidth/2 + 18;

  // ---- base meshes ----
  const baseTreeTrunk = BABYLON.MeshBuilder.CreateCylinder("base_trunk", { height: 2, diameterTop:0.35, diameterBottom:0.35 }, scene);
  const baseLeaves = BABYLON.MeshBuilder.CreateSphere("base_leaves", { diameter: 2.2 }, scene);
  const baseTreeMat = new BABYLON.StandardMaterial("baseTreeMat", scene);
  baseTreeMat.diffuseColor = new BABYLON.Color3(0.36,0.2,0.08);
  baseTreeTrunk.material = baseTreeMat;
  const baseLeavesMat = new BABYLON.StandardMaterial("baseLeavesMat", scene);
  baseLeavesMat.diffuseColor = new BABYLON.Color3(0.06,0.45,0.12);
  baseLeaves.material = baseLeavesMat;
  baseTreeTrunk.isPickable = false; baseLeaves.isPickable = false;

  // ---- tree instances ----
  for (let i=0;i<numClusters;i++){
    const z = (Math.random()*spread) - (spread/2);
    const side = Math.random() > 0.5 ? leftX : rightX;
    const t1 = baseTreeTrunk.createInstance("trunk_inst_"+i+"_1");
    t1.position = new BABYLON.Vector3(side + (Math.random()*8-4), 1 + Math.random()*0.2, z + (Math.random()*24-12));
    const l1 = baseLeaves.createInstance("leaves_inst_"+i+"_1");
    l1.position = t1.position.add(new BABYLON.Vector3(0, 1.6 + Math.random()*0.6, 0));
  }

  // ---- grass patches (flat ground planes) ----
  const baseGrass = BABYLON.MeshBuilder.CreateGround("baseGrass", { width: 6, height: 6 }, scene);
  const gmat = new BABYLON.StandardMaterial("gmat_env", scene);
  gmat.diffuseColor = new BABYLON.Color3(0.12,0.52,0.14);
  baseGrass.material = gmat;
  baseGrass.isPickable = false;
  for (let i=0;i<numClusters*1.2;i++){
    const z = (Math.random()*spread) - (spread/2);
    const side = Math.random() > 0.5 ? leftX + (Math.random()*14) : rightX - (Math.random()*14);
    const inst = baseGrass.createInstance("grass_inst_"+i);
    inst.position = new BABYLON.Vector3(side, 0.01, z);
  }

  // ---- building clusters (cheap boxes with window planes) ----
  const baseBuild = BABYLON.MeshBuilder.CreateBox("baseBuild", { width: 8, height: 8, depth: 6 }, scene);
  const bmat = new BABYLON.StandardMaterial("bmat_env", scene);
  bmat.diffuseColor = new BABYLON.Color3(0.35,0.35,0.45);
  baseBuild.material = bmat;
  baseBuild.isPickable = false;
  for (let i=0;i<30;i++){
    const z = (Math.random()*spread) - (spread/2);
    const side = Math.random() > 0.5 ? leftX - (8 + Math.random()*20) : rightX + (8 + Math.random()*20);
    const inst = baseBuild.createInstance("bld_"+i);
    inst.position = new BABYLON.Vector3(side, 4 + Math.random()*12, z);
    inst.scaling.y = 1 + Math.random()*3.8;
  }

  // ---- optimized street lamps via instancing + spare real lights ----
  // shared bulb material (emissive)
  const bulbMat = new BABYLON.StandardMaterial("bulbMat_env", scene);
  bulbMat.emissiveColor = new BABYLON.Color3(1, 0.86, 0.6);

  // glow layer (for subtle bloom)
  if (!scene._playfulGlow) {
    scene._playfulGlow = new BABYLON.GlowLayer("envGlow", scene, { blurKernelSize: 16 });
    scene._playfulGlow.intensity = 0.5;
  }

  const poleBase = BABYLON.MeshBuilder.CreateCylinder("pole_base_env", { diameter: 0.12, height: 4 }, scene);
  poleBase.position = new BABYLON.Vector3(0,2,0);
  poleBase.isPickable = false;
  const poleMat = new BABYLON.StandardMaterial("poleMat_env", scene); poleMat.diffuseColor = new BABYLON.Color3(0.12,0.12,0.12);
  poleBase.material = poleMat;

  const bulbBase = BABYLON.MeshBuilder.CreateSphere("bulb_base_env", { diameter: 0.28 }, scene);
  bulbBase.position = new BABYLON.Vector3(0,3.7,0);
  bulbBase.material = bulbMat;
  bulbBase.isPickable = false;

  const LIGHT_EVERY = opts.lightEvery || 8;
  const lightRange = opts.lightRange || 6;
  const lightIntensity = opts.lightIntensity || 0.6;

  let idx = 0;
  for (let z = -800; z < 800; z += 80) {
    const leftPole = poleBase.createInstance("poleL_"+idx);
    leftPole.position = new BABYLON.Vector3(-roadWidth/2 - 4.0, 2, z);
    const leftBulb = bulbBase.createInstance("bulbL_"+idx);
    leftBulb.position = leftPole.position.add(new BABYLON.Vector3(0, 1.7, 0));

    const rightPole = poleBase.createInstance("poleR_"+idx);
    rightPole.position = new BABYLON.Vector3(roadWidth/2 + 4.0, 2, z);
    const rightBulb = bulbBase.createInstance("bulbR_"+idx);
    rightBulb.position = rightPole.position.add(new BABYLON.Vector3(0, 1.7, 0));

    // add real lights sparsely
    if (idx % LIGHT_EVERY === 0) {
      const pl = new BABYLON.PointLight("plL_"+idx, leftBulb.position, scene);
      pl.intensity = lightIntensity; pl.range = lightRange; pl.falloffType = BABYLON.Light.FALLOFF_STANDARD; pl.shadowEnabled = false;
      const pr = new BABYLON.PointLight("plR_"+idx, rightBulb.position, scene);
      pr.intensity = lightIntensity; pr.range = lightRange; pr.falloffType = BABYLON.Light.FALLOFF_STANDARD; pr.shadowEnabled = false;
    }

    idx++;
  }

  // hide bases (visual)
  poleBase.isVisible = false;
  bulbBase.isVisible = false;

  // Return info in case main wants to know
  return {
    trees: numClusters,
    buildings: 30,
    grassPatches: Math.floor(numClusters*1.2)
  };
}
