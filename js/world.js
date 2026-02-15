// world.js
function buildWorld(scene) {
  // lights
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.92;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.4,-1,-0.3), scene);
  sun.position = new BABYLON.Vector3(40,80,40);
  sun.intensity = 0.9;

  // ground (big grass)
  const ground = BABYLON.MeshBuilder.CreateGround("ground", {width: 3000, height: 3000}, scene);
  const gmat = new BABYLON.StandardMaterial("gmat", scene);
  gmat.diffuseColor = new BABYLON.Color3(0.12,0.45,0.12);
  ground.material = gmat;
  ground.receiveShadows = true;

  // road (centered Z direction)
  const roadWidth = 14;
  const roadLen = 3000;
  const road = BABYLON.MeshBuilder.CreateGround("road", {width: roadWidth, height: roadLen}, scene);
  road.position.z = roadLen/2 - 40;
  const rmat = new BABYLON.StandardMaterial("rmat", scene);
  rmat.diffuseColor = new BABYLON.Color3(0.07,0.07,0.07);
  road.material = rmat;

  // center dashed line (two-way)
  const dashLen = 12, gap=10;
  for (let i=0;i<Math.floor(roadLen/(dashLen+gap)); i++){
    const z = i*(dashLen+gap)+8;
    const dash = BABYLON.MeshBuilder.CreateBox("dash"+i, {width:0.2, height:0.02, depth: dashLen}, scene);
    dash.position = new BABYLON.Vector3(0,0.03,z);
    const dm = new BABYLON.StandardMaterial("dm"+i, scene); dm.diffuseColor = new BABYLON.Color3(1,1,1);
    dash.material = dm;
  }

  // lane separators (optional near edges)
  // roadside curbs
  const curbLeft = BABYLON.MeshBuilder.CreateBox("cl", {width:0.6, height:0.08, depth:roadLen}, scene);
  curbLeft.position = new BABYLON.Vector3(-roadWidth/2 - 0.5, 0.04, road.position.z);
  curbLeft.material = new BABYLON.StandardMaterial("cml", scene); curbLeft.material.diffuseColor = new BABYLON.Color3(0.18,0.18,0.18);
  const curbRight = curbLeft.clone("cr"); curbRight.position.x = -curbLeft.position.x;

  // lane arrows (visual) - optional: simple boxes for lane edges
  // Scatter buildings and trees along both sides
  function addBuilding(x,z,w,h,d,color){
    const b = BABYLON.MeshBuilder.CreateBox("b"+x+z, {width:w, height:h, depth:d}, scene);
    b.position = new BABYLON.Vector3(x, h/2, z);
    const mat = new BABYLON.StandardMaterial("bm"+x+z, scene); mat.diffuseColor = color || new BABYLON.Color3(0.3,0.3,0.5);
    b.material = mat;
    b.receiveShadows = true;
  }
  function addTree(x,z){
    const trunk = BABYLON.MeshBuilder.CreateCylinder("tr"+x+z, {height:2, diameterTop:0.4, diameterBottom:0.4}, scene);
    trunk.position = new BABYLON.Vector3(x,1,z);
    trunk.material = new BABYLON.StandardMaterial("trm"+x+z, scene); trunk.material.diffuseColor = new BABYLON.Color3(0.36,0.2,0.08);
    const leaves = BABYLON.MeshBuilder.CreateSphere("le"+x+z, {diameter:2.0}, scene);
    leaves.position = new BABYLON.Vector3(x,2.6,z);
    leaves.material = new BABYLON.StandardMaterial("lem"+x+z, scene); leaves.material.diffuseColor = new BABYLON.Color3(0.05,0.45,0.12);
    leaves.receiveShadows = true; trunk.receiveShadows = true;
  }

  for (let i=0;i<60;i++){
    const z = 30 + i*45 + (Math.random()*20 - 10);
    // left side
    addBuilding(-roadWidth/2 - (8 + Math.random()*22), z, 8 + Math.random()*12, 8 + Math.random()*30, 6, new BABYLON.Color3(0.15+Math.random()*0.4,0.15,0.15+Math.random()*0.4));
    addTree(-roadWidth/2 - 36, z + (Math.random()*18 - 9));
    // right side
    addBuilding(roadWidth/2 + (8 + Math.random()*22), z, 8 + Math.random()*12, 8 + Math.random()*30, 6, new BABYLON.Color3(0.15,0.15+Math.random()*0.4,0.15+Math.random()*0.4));
    addTree(roadWidth/2 + 36, z + (Math.random()*18 - 9));
  }

  // small roadside props (lamps)
  for (let i=0;i<80;i++){
    const z = 10 + i*35;
    const pole = BABYLON.MeshBuilder.CreateCylinder("pole"+i, {height:4, diameter:0.12}, scene);
    pole.position = new BABYLON.Vector3(-roadWidth/2 - 6, 2, z);
    const pole2 = pole.clone("pole2"+i); pole2.position.x = -pole.position.x;
    pole.material = new BABYLON.StandardMaterial("pm"+i, scene); pole.material.diffuseColor = new BABYLON.Color3(0.12,0.12,0.12);
  }

  return { roadWidth, roadLen };
}
