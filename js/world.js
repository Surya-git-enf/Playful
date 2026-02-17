// js/world.js (improved)
// createWorld(scene) -> returns { roadWidth, roadLen }

function createWorld(scene) {
  // SKY & LIGHT
  const skybox = BABYLON.MeshBuilder.CreateBox("skybox", { size: 2000 }, scene);
  const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = false;
  skyMat.diffuseColor = new BABYLON.Color3(0.53, 0.78, 0.95);
  skybox.material = skyMat;

  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.75;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.4, -1, -0.3), scene);
  sun.position = new BABYLON.Vector3(100, 200, 100);
  sun.intensity = 1.0;

  // GROUND (grass) + material contrast for road edges
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 1600, height: 3200 }, scene);
  const gmat = new BABYLON.StandardMaterial("gmat", scene);
  gmat.diffuseColor = new BABYLON.Color3(0.14, 0.46, 0.16);
  ground.material = gmat;
  ground.checkCollisions = true;

  // ROAD (center)
  const roadWidth = 12;
  const roadLen = 2400;
  const road = BABYLON.MeshBuilder.CreateGround("road", { width: roadWidth, height: roadLen }, scene);
  road.position.z = roadLen/2 - 20;
  const rmat = new BABYLON.StandardMaterial("rmat", scene);
  rmat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.08);
  road.material = rmat;
  road.checkCollisions = true;

  // CURBS (collidable)
  const curbLeft = BABYLON.MeshBuilder.CreateBox("curbLeft", { width: 0.6, height: 0.12, depth: roadLen }, scene);
  curbLeft.position = new BABYLON.Vector3(-roadWidth/2 - 0.6, 0.06, road.position.z);
  curbLeft.material = new BABYLON.StandardMaterial("curbM", scene);
  curbLeft.material.diffuseColor = new BABYLON.Color3(0.22,0.22,0.22);
  curbLeft.checkCollisions = true;
  const curbRight = curbLeft.clone("curbRight"); curbRight.position.x = -curbLeft.position.x; curbRight.checkCollisions = true;

  // DASHED LINE (visual only)
  const dashLen = 12, gap = 10;
  const dashCount = Math.floor(roadLen / (dashLen + gap));
  for (let i = 0; i < dashCount; i++) {
    const z = i * (dashLen + gap) + 8;
    const dash = BABYLON.MeshBuilder.CreateBox("dash_" + i, { width: 0.22, height: 0.02, depth: dashLen }, scene);
    dash.position = new BABYLON.Vector3(0, 0.03, z);
    const dm = new BABYLON.StandardMaterial("dm_" + i, scene); dm.diffuseColor = new BABYLON.Color3(1,1,1);
    dash.material = dm;
    dash.isPickable = false;
  }

  // BUILDINGS (with simple windows, collidable)
  function addBuilding(x, z, w, h, d, color) {
    const b = BABYLON.MeshBuilder.CreateBox("b_"+x+"_"+z, { width: w, height: h, depth: d }, scene);
    b.position = new BABYLON.Vector3(x, h/2, z);
    b.material = new BABYLON.StandardMaterial("bm_"+x+"_"+z, scene);
    b.material.diffuseColor = color || new BABYLON.Color3(0.28,0.28,0.36);
    b.checkCollisions = true;

    // cheap windows: planes with emissive color to look lit
    const rows = Math.max(2, Math.floor(h/4));
    const cols = Math.max(2, Math.floor(w/3));
    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
        const wx = x - w/2 + (c+0.5)*(w/cols);
        const wy = (r+0.8)*(h/(rows+1));
        const wz = z + d/2 + 0.01;
        const win = BABYLON.MeshBuilder.CreatePlane("win_"+x+"_"+z+"_"+r+"_"+c, { size: Math.min(0.6, w/cols*0.7) }, scene);
        win.position = new BABYLON.Vector3(wx, wy, wz);
        win.rotation.y = Math.PI;
        const wmat = new BABYLON.StandardMaterial("wmat_"+x+"_"+z+"_"+r+"_"+c, scene);
        wmat.emissiveColor = Math.random() > 0.8 ? new BABYLON.Color3(0.95,0.9,0.6) : new BABYLON.Color3(0.03,0.04,0.05);
        win.material = wmat;
        win.isPickable = false;
      }
    }
    return b;
  }

  // Trees / grass patches
  function addTree(x,z,scale=1) {
    const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk_"+x+"_"+z, { height: 2*scale, diameterTop: 0.35*scale, diameterBottom: 0.35*scale }, scene);
    trunk.position = new BABYLON.Vector3(x, 1*scale, z);
    trunk.material = new BABYLON.StandardMaterial("trmat_"+x+"_"+z, scene);
    trunk.material.diffuseColor = new BABYLON.Color3(0.36,0.2,0.08);
    const leaves = BABYLON.MeshBuilder.CreateSphere("leaf_"+x+"_"+z, { diameter: 2.2*scale }, scene);
    leaves.position = trunk.position.add(new BABYLON.Vector3(0, 2.2*scale, 0));
    leaves.material = new BABYLON.StandardMaterial("lmat_"+x+"_"+z, scene);
    leaves.material.diffuseColor = new BABYLON.Color3(0.06,0.45,0.12);
    trunk.isPickable = leaves.isPickable = false;
  }

  function addGrassPatch(x,z,size=1) {
    const p = BABYLON.MeshBuilder.CreateGround("gpatch_"+x+"_"+z, { width: 6*size, height: 6*size }, scene);
    p.position = new BABYLON.Vector3(x, 0.01, z);
    p.material = new BABYLON.StandardMaterial("gpm_"+x+"_"+z, scene);
    p.material.diffuseColor = new BABYLON.Color3(0.12,0.52,0.14);
    p.isPickable = false;
  }

  // Scatter a moderate number of buildings/trees/grass
  for (let i=0;i<70;i++){
    const z = 30 + i*36 + (Math.random()*18 - 9);
    addBuilding(-roadWidth/2 - (8 + Math.random()*18), z, 8 + Math.random()*12, 8 + Math.random()*30, 6, new BABYLON.Color3(0.18+Math.random()*0.4,0.18,0.18+Math.random()*0.4));
    addTree(-roadWidth/2 - 34, z + (Math.random()*12 - 6), 1 + Math.random()*0.6);
    addGrassPatch(-roadWidth/2 - 18, z + (Math.random()*15 - 7), 0.8 + Math.random()*1.2);

    addBuilding(roadWidth/2 + (8 + Math.random()*18), z, 8 + Math.random()*12, 8 + Math.random()*30, 6, new BABYLON.Color3(0.18, 0.18+Math.random()*0.4, 0.18+Math.random()*0.4));
    addTree(roadWidth/2 + 34, z + (Math.random()*12 - 6), 1 + Math.random()*0.6);
    addGrassPatch(roadWidth/2 + 18, z + (Math.random()*15 - 7), 0.8 + Math.random()*1.2);
  }

  // Ramps (collidable)
  for (let i=0;i<6;i++){
    const ramp = BABYLON.MeshBuilder.CreateBox("ramp_"+i, { width: 6, height: 1, depth: 10 }, scene);
    ramp.position.set((Math.random()>0.5?2:-2), 0.5, -220 - i*360);
    ramp.rotation.x = -0.36;
    ramp.material = new BABYLON.StandardMaterial("rm_"+i, scene); ramp.material.diffuseColor = new BABYLON.Color3(0.6,0.3,0.2);
    ramp.checkCollisions = true;
  }

  // street lamps (visual)
  for (let z = -800; z < 800; z += 80) {
    const pole = BABYLON.MeshBuilder.CreateCylinder("pole_"+z, { diameter: 0.12, height: 4 }, scene);
    pole.position = new BABYLON.Vector3(roadWidth/2 + 4.0, 2, z);
    pole.material = new BABYLON.StandardMaterial("pm_"+z, scene); pole.material.diffuseColor=new BABYLON.Color3(0.12,0.12,0.12);
    const pole2 = pole.clone("pole2_"+z); pole2.position.x = -pole.position.x;
  }

  return { roadWidth, roadLen };
}
