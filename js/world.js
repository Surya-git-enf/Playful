// world.js — richer city: buildings with window blocks, grass clusters, varied trees, lamps
function buildWorld(scene) {
  // lighting
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.95;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.4,-1,-0.3), scene);
  sun.intensity = 0.9;

  // ground (big grass)
  const ground = BABYLON.MeshBuilder.CreateGround("ground", {width:3000, height:3000}, scene);
  const gmat = new BABYLON.StandardMaterial("gmat", scene);
  gmat.diffuseColor = new BABYLON.Color3(0.14,0.5,0.16);
  ground.material = gmat;
  ground.receiveShadows = false;

  // road
  const roadWidth = 14;
  const roadLen = 3000;
  const road = BABYLON.MeshBuilder.CreateGround("road", {width: roadWidth, height: roadLen}, scene);
  road.position.z = roadLen/2 - 40;
  const rmat = new BABYLON.StandardMaterial("rmat", scene);
  rmat.diffuseColor = new BABYLON.Color3(0.07,0.07,0.07);
  rmat.specularColor = new BABYLON.Color3(0.1,0.1,0.1);
  road.material = rmat;

  // dashed center line (two-way)
  const dashLen = 12, gap = 10;
  for (let i=0;i<Math.floor(roadLen/(dashLen+gap)); i++){
    const z = i*(dashLen+gap)+8;
    const dash = BABYLON.MeshBuilder.CreateBox("dash"+i, {width:0.22, height:0.02, depth: dashLen}, scene);
    dash.position = new BABYLON.Vector3(0,0.03,z);
    const dm = new BABYLON.StandardMaterial("dm"+i, scene);
    dm.diffuseColor = new BABYLON.Color3(1,1,1);
    dash.material = dm;
  }

  // curbs
  const curbMat = new BABYLON.StandardMaterial("curbMat", scene); curbMat.diffuseColor = new BABYLON.Color3(0.18,0.18,0.18);
  const curbLeft = BABYLON.MeshBuilder.CreateBox("curbL", {width:0.6, height:0.08, depth:roadLen}, scene);
  curbLeft.position = new BABYLON.Vector3(-roadWidth/2 - 0.5, 0.04, road.position.z);
  curbLeft.material = curbMat;
  const curbRight = curbLeft.clone("curbR"); curbRight.position.x = -curbLeft.position.x;

  // buildings (blocks) with small windows
  function addBuilding(x,z,w,h,d, color){
    const b = BABYLON.MeshBuilder.CreateBox("b_"+x+"_"+z, {width:w,height:h,depth:d}, scene);
    b.position = new BABYLON.Vector3(x, h/2, z);
    const mat = new BABYLON.StandardMaterial("bm_"+x+"_"+z, scene);
    mat.diffuseColor = color || new BABYLON.Color3(0.25,0.25,0.35);
    b.material = mat;
    // add windows as small inset boxes (visual)
    const rows = Math.max(2, Math.floor(h / 4));
    const cols = Math.max(2, Math.floor(w / 3));
    for (let r=0;r<rows;r++){
      for (let c=0;c<cols;c++){
        const wx = x - w/2 + (c+0.5) * (w/cols);
        const wz = z + d/2 + 0.01; // front face
        const wy = (r+0.6);
        const win = BABYLON.MeshBuilder.CreatePlane("w_"+x+"_"+z+"_"+r+"_"+c, {size: Math.min(0.6,w/cols*0.75)}, scene);
        win.position = new BABYLON.Vector3(wx, wy, wz);
        win.rotation = new BABYLON.Vector3(0, Math.PI, 0);
        const wmat = new BABYLON.StandardMaterial("wm_"+x+"_"+z+"_"+r+"_"+c, scene);
        // some windows lit, some not
        wmat.emissiveColor = Math.random() > 0.7 ? new BABYLON.Color3(0.9,0.8,0.6) : new BABYLON.Color3(0.04,0.05,0.06);
        win.material = wmat;
      }
    }
    return b;
  }

  // grass clusters and trees
  function addGrassPatch(x,z,scale=1){
    const g = BABYLON.MeshBuilder.CreateGround("grassPatch_"+x+"_"+z, {width:6*scale, height:6*scale}, scene);
    g.position = new BABYLON.Vector3(x, 0.01, z);
    const gm = new BABYLON.StandardMaterial("gpm_"+x+"_"+z, scene); gm.diffuseColor = new BABYLON.Color3(0.13,0.56,0.16);
    g.material = gm;
  }
  function addTree(x,z){
    const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk_"+x+"_"+z, {height:2, diameterTop:0.4, diameterBottom:0.4}, scene);
    trunk.position = new BABYLON.Vector3(x, 1, z);
    trunk.material = new BABYLON.StandardMaterial("trm_"+x+"_"+z, scene); trunk.material.diffuseColor = new BABYLON.Color3(0.36,0.2,0.08);
    const leaves = BABYLON.MeshBuilder.CreateSphere("leaf_"+x+"_"+z, {diameter:2.4}, scene);
    leaves.position = new BABYLON.Vector3(x,2.5,z);
    leaves.material = new BABYLON.StandardMaterial("lm_"+x+"_"+z, scene); leaves.material.diffuseColor = new BABYLON.Color3(0.06,0.46,0.12);
  }

  // scatter along both sides
  for (let i=0;i<70;i++){
    const z = 30 + i*40 + (Math.random()*20 - 10);
    // left side buildings/trees
    addBuilding(-roadWidth/2 - (8 + Math.random()*20), z, 8 + Math.random()*14, 8 + Math.random()*30, 6, new BABYLON.Color3(0.2+Math.random()*0.4,0.2,0.2+Math.random()*0.4));
    addTree(-roadWidth/2 - 34, z + (Math.random()*14 - 7));
    addGrassPatch(-roadWidth/2 - 18, z + (Math.random()*18 - 9), 1 + Math.random()*1.2);
    // right side
    addBuilding(roadWidth/2 + (8 + Math.random()*20), z, 8 + Math.random()*14, 8 + Math.random()*30, 6, new BABYLON.Color3(0.2,0.2+Math.random()*0.4,0.2+Math.random()*0.4));
    addTree(roadWidth/2 + 34, z + (Math.random()*14 - 7));
    addGrassPatch(roadWidth/2 + 18, z + (Math.random()*18 - 9), 1 + Math.random()*1.2);
  }

  // simple street lamps (no light component to avoid perf overhead)
  for (let i=0;i<80;i++){
    const z = 12 + i*36;
    const pole = BABYLON.MeshBuilder.CreateCylinder("pole_"+i, {height:4, diameterTop:0.1, diameterBottom:0.12}, scene);
    pole.position = new BABYLON.Vector3(-roadWidth/2 - 6, 2, z);
    pole.material = new BABYLON.StandardMaterial("polem_"+i, scene); pole.material.diffuseColor = new BABYLON.Color3(0.12,0.12,0.12);
    const pole2 = pole.clone("pole2_"+i); pole2.position.x = -pole.position.x;
  }

  return { roadWidth, roadLen };
}
