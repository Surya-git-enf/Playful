// js/world.js
// createWorld(scene) -> creates ground, road, buildings, trees, ramps and returns { roadWidth, roadLen }

function createWorld(scene) {
  // skybox (simple colored box)
  const skybox = BABYLON.MeshBuilder.CreateBox("skybox", { size: 2000 }, scene);
  const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
  skyMat.diffuseColor = new BABYLON.Color3(0.53, 0.78, 0.95);
  skybox.material = skyMat;

  // directional sun + hemispheric fill
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.8;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5, -1, -0.5), scene);
  sun.position = new BABYLON.Vector3(100, 200, 100);
  sun.intensity = 1.0;

  // big ground (grass)
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 800, height: 2600 }, scene);
  const gmat = new BABYLON.StandardMaterial("gmat", scene);
  gmat.diffuseColor = new BABYLON.Color3(0.16, 0.5, 0.18);
  ground.material = gmat;

  // road (centered)
  const roadWidth = 12;
  const roadLen = 2400;
  const road = BABYLON.MeshBuilder.CreateGround("road", { width: roadWidth, height: roadLen }, scene);
  road.position.z = roadLen/2 - 20;
  const rmat = new BABYLON.StandardMaterial("rmat", scene);
  rmat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.08);
  road.material = rmat;

  // dashed center line
  const dashLen = 12, gap = 10;
  const dashCount = Math.floor(roadLen / (dashLen + gap));
  for (let i=0;i<dashCount;i++){
    const z = i*(dashLen+gap)+8;
    const dash = BABYLON.MeshBuilder.CreateBox("dash_"+i, { width: 0.22, height: 0.02, depth: dashLen }, scene);
    dash.position = new BABYLON.Vector3(0, 0.03, z);
    const dm = new BABYLON.StandardMaterial("dm_"+i, scene);
    dm.diffuseColor = new BABYLON.Color3(1,1,1);
    dash.material = dm;
  }

  // curbs left/right
  const curbLeft = BABYLON.MeshBuilder.CreateBox("curbLeft", { width: 0.6, height: 0.08, depth: roadLen }, scene);
  curbLeft.position = new BABYLON.Vector3(-roadWidth/2 - 0.5, 0.04, road.position.z);
  const curbMat = new BABYLON.StandardMaterial("curbMat", scene);
  curbMat.diffuseColor = new BABYLON.Color3(0.18,0.18,0.18);
  curbLeft.material = curbMat;
  const curbRight = curbLeft.clone("curbRight");
  curbRight.position.x = -curbLeft.position.x;

  // helper: buildings with simple windows (cheap)
  function addBuilding(x,z,w,h,d,color){
    const b = BABYLON.MeshBuilder.CreateBox("building_"+x+"_"+z, { width:w, height:h, depth:d }, scene);
    b.position = new BABYLON.Vector3(x, h/2, z);
    const bm = new BABYLON.StandardMaterial("bmat_"+x+"_"+z, scene);
    bm.diffuseColor = color || new BABYLON.Color3(0.28,0.28,0.36);
    b.material = bm;

    // simple windows (front face)
    const rows = Math.max(2, Math.floor(h/4));
    const cols = Math.max(2, Math.floor(w/3));
    for (let r=0;r<rows;r++){
      for (let c=0;c<cols;c++){
        const wx = x - w/2 + (c+0.5)*(w/cols);
        const wy = (r+0.8)*(h/(rows+1));
        const wz = z + d/2 + 0.02;
        const win = BABYLON.MeshBuilder.CreatePlane("win_"+x+"_"+z+"_"+r+"_"+c, { size: Math.min(0.6, w/cols*0.7) }, scene);
        win.position = new BABYLON.Vector3(wx, wy, wz);
        win.rotation = new BABYLON.Vector3(0, Math.PI, 0);
        const wmat = new BABYLON.StandardMaterial("wmat_"+x+"_"+z+"_"+r+"_"+c, scene);
        wmat.emissiveColor = Math.random() > 0.75 ? new BABYLON.Color3(0.95,0.85,0.6) : new BABYLON.Color3(0.04,0.05,0.06);
        win.material = wmat;
      }
    }
    return b;
  }

  // helper: trees and grass
  function addTree(x,z,scale=1){
    const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk_"+x+"_"+z, { height: 2*scale, diameterTop:0.35*scale, diameterBottom:0.35*scale }, scene);
    trunk.position = new BABYLON.Vector3(x, 1*scale, z);
    const tm = new BABYLON.StandardMaterial("tm_"+x+"_"+z, scene); tm.diffuseColor = new BABYLON.Color3(0.36,0.2,0.08);
    trunk.material = tm;

    const leaves = BABYLON.MeshBuilder.CreateSphere("leaf_"+x+"_"+z, { diameter: 2.4*scale }, scene);
    leaves.position = trunk.position.add(new BABYLON.Vector3(0, 2.2*scale, 0));
    const lm = new BABYLON.StandardMaterial("lm_"+x+"_"+z, scene); lm.diffuseColor = new BABYLON.Color3(0.06,0.45,0.12);
    leaves.material = lm;
  }

  function addGrassPatch(x,z,size=1){
    const patch = BABYLON.MeshBuilder.CreateGround("gpatch_"+x+"_"+z, { width: 6*size, height: 6*size }, scene);
    patch.position = new BABYLON.Vector3(x, 0.01, z);
    const pm = new BABYLON.StandardMaterial("pm_"+x+"_"+z, scene); pm.diffuseColor = new BABYLON.Color3(0.12,0.52,0.14);
    patch.material = pm;
  }

  // scatter buildings/trees/grass along both sides
  for (let i=0;i<70;i++){
    const z = 30 + i*36 + (Math.random()*18 - 9);
    addBuilding(-roadWidth/2 - (8 + Math.random()*18), z, 8 + Math.random()*12, 8 + Math.random()*30, 6, new BABYLON.Color3(0.18+Math.random()*0.4,0.18,0.18+Math.random()*0.4));
    addTree(-roadWidth/2 - 34, z + (Math.random()*12 - 6), 1 + Math.random()*0.6);
    addGrassPatch(-roadWidth/2 - 18, z + (Math.random()*15 - 7), 0.8 + Math.random()*1.2);

    addBuilding(roadWidth/2 + (8 + Math.random()*18), z, 8 + Math.random()*12, 8 + Math.random()*30, 6, new BABYLON.Color3(0.18, 0.18+Math.random()*0.4, 0.18+Math.random()*0.4));
    addTree(roadWidth/2 + 34, z + (Math.random()*12 - 6), 1 + Math.random()*0.6);
    addGrassPatch(roadWidth/2 + 18, z + (Math.random()*15 - 7), 0.8 + Math.random()*1.2);
  }

  // ramps
  for (let i=0;i<6;i++){
    const ramp = BABYLON.MeshBuilder.CreateBox("ramp_"+i, { width: 6, height: 1, depth: 10 }, scene);
    ramp.position.set(0, 0.5, -200 - i*280);
    ramp.rotation.x = -0.36;
    const rm = new BABYLON.StandardMaterial("rm_"+i, scene); rm.diffuseColor = new BABYLON.Color3(0.6,0.3,0.2);
    ramp.material = rm;
  }

  // street lamps (visual)
  for (let z = -800; z < 800; z += 80){
    const pole = BABYLON.MeshBuilder.CreateCylinder("pole_"+z, { diameter: 0.12, height: 4 }, scene);
    pole.position = new BABYLON.Vector3(roadWidth/2 + 4.5, 2, z);
    const pole2 = pole.clone("pole2_"+z); pole2.position.x = -pole.position.x;
    const pm = new BABYLON.StandardMaterial("pm_"+z, scene); pm.diffuseColor = new BABYLON.Color3(0.12,0.12,0.12);
    pole.material = pm; pole2.material = pm;
  }

  return { roadWidth, roadLen };
                             }
