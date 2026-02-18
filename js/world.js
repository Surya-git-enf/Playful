// js/world.js
// Procedural mountain terrain, curvy road segments, instanced trees/grass, finish trigger.
// createWorld(scene) -> returns { roadWidth, finishTrigger }

function createWorld(scene) {
  // SKY & LIGHT
  scene.clearColor = new BABYLON.Color3(0.54, 0.78, 0.98);

  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.85;

  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.4, -1, -0.35), scene);
  sun.position = new BABYLON.Vector3(60, 140, 60);
  sun.intensity = 1.05;

  // PARAMETERS
  const terrainSizeX = 600;   // left-right world size
  const terrainSizeZ = 2000;  // forward world size
  const subdivisions = 120;   // ~120x120 grid (balanced mobile perf)
  const roadWidth = 10;
  const baseY = -6;

  // CREATE BASE GROUND (grid we will deform)
  const ground = BABYLON.MeshBuilder.CreateGround("terrain", {
    width: terrainSizeX,
    height: terrainSizeZ,
    subdivisions: subdivisions
  }, scene);
  ground.position.y = baseY;

  // Basic colors/material for ground
  const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.18, 0.48, 0.18);
  ground.material = groundMat;
  ground.receiveShadows = false;

  // Modify vertices to create mountainous shape (fast procedural noise-like)
  const positions = ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);
  // positions array layout: x,y,z, x,y,z, ...
  const vertsPerRow = subdivisions + 1;
  for (let row = 0; row <= subdivisions; row++) {
    for (let col = 0; col <= subdivisions; col++) {
      const idx = 3 * (row * vertsPerRow + col);
      const x = (col / subdivisions - 0.5) * terrainSizeX;        // -size/2 .. size/2
      const z = (row / subdivisions - 0.0) * terrainSizeZ - (terrainSizeZ * 0.35); // start negative to place start earlier

      // Procedural height (blend of sines for organic hills)
      const h1 = Math.sin(x * 0.02) * Math.cos(z * 0.008) * 24;
      const h2 = Math.sin(z * 0.01 + x * 0.008) * 12;
      const ridge = Math.exp(-Math.pow((x * 0.006), 2)) * 46 * Math.cos(z * 0.004);
      // taper uphill (makes it climb toward positive z)
      const taper = Math.max(0, (z + terrainSizeZ * 0.25) / (terrainSizeZ * 0.8));
      let y = (h1 * 0.5 + h2 * 0.6 + ridge * 0.7) * taper;
      y = Math.max(y, -1.0); // base floor

      positions[idx + 1] = baseY + y;
    }
  }
  ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
  ground.refreshBoundingInfo();

  // Build a curvy path (centerline) along Z; we'll place road pieces along it
  const pathPoints = [];
  const pathSegments = 60;
  const startZ = -terrainSizeZ * 0.35;
  const endZ = terrainSizeZ * 0.55;
  for (let i = 0; i <= pathSegments; i++) {
    const t = i / pathSegments;
    const z = startZ + t * (endZ - startZ);
    // meandering X offset, increases variability uphill
    const x = Math.sin(t * Math.PI * 1.6) * (6 + t * 10) + Math.cos(t * 3.2) * (2 + t * 6);
    pathPoints.push(new BABYLON.Vector3(x, 0, z));
  }

  // Helper to get terrain Y at (x,z) by sampling nearest vertex (fast but coarse)
  function sampleTerrainY(xq, zq) {
    // map xq,zq back to row/col indices
    const colF = ((xq / terrainSizeX) + 0.5) * subdivisions;
    const rowF = (( (zq + terrainSizeZ * 0.35) / terrainSizeZ )) * subdivisions;
    const col = Math.max(0, Math.min(subdivisions, Math.round(colF)));
    const row = Math.max(0, Math.min(subdivisions, Math.round(rowF)));
    const id = 3 * (row * vertsPerRow + col);
    return positions[id + 1];
  }

  // Create road: many thin boxes oriented along path segments (cheap, controllable)
  const roadMat = new BABYLON.StandardMaterial("roadMat", scene);
  roadMat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.08);
  roadMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);

  const roadPieces = [];
  const segLen = (endZ - startZ) / pathSegments;
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p0 = pathPoints[i];
    const p1 = pathPoints[i + 1];
    const mid = p0.add(p1).scale(0.5);

    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const yaw = Math.atan2(dx, dz); // rotate around Y to align piece

    // sample height from terrain and flatten road slightly above terrain
    const sampleY = sampleTerrainY(mid.x, mid.z);
    const roadY = sampleY + 0.4; // small offset so it sits above ground

    const piece = BABYLON.MeshBuilder.CreateBox("roadPiece_" + i, {
      width: roadWidth,
      height: 0.5,
      depth: Math.max(8, segLen * 1.05)
    }, scene);
    piece.position = new BABYLON.Vector3(mid.x, roadY, mid.z);
    piece.rotation = new BABYLON.Vector3(0, yaw, 0);
    piece.material = roadMat;
    piece.receiveShadows = false;
    // mark as road for visual blending later if needed
    roadPieces.push(piece);
  }

  // create finish platform (visual)
  const finishPos = pathPoints[pathPoints.length - 1];
  const finish = BABYLON.MeshBuilder.CreateBox("finishPlatform", { width: roadWidth + 8, height: 0.9, depth: 18 }, scene);
  finish.position = new BABYLON.Vector3(finishPos.x, sampleTerrainY(finishPos.x, finishPos.z) + 1.2, finishPos.z + 6);
  finish.material = new BABYLON.StandardMaterial("finishMat", scene);
  finish.material.diffuseColor = new BABYLON.Color3(0.14, 0.56, 0.72);

  const finishTrigger = BABYLON.MeshBuilder.CreateBox("finishTrigger", { width: roadWidth + 10, height: 6, depth: 22 }, scene);
  finishTrigger.position = finish.position.clone();
  finishTrigger.isVisible = false;

  // ENVIRONMENT INSTANCING: trees, rocks, grass patches (left & right)
  const baseTrunk = BABYLON.MeshBuilder.CreateCylinder("baseTrunk", { height: 2, diameterTop: 0.35, diameterBottom: 0.35 }, scene);
  const baseLeaves = BABYLON.MeshBuilder.CreateSphere("baseLeaves", { diameter: 2.2 }, scene);
  baseTrunk.isPickable = baseLeaves.isPickable = false;
  baseTrunk.material = new BABYLON.StandardMaterial("trunkMat", scene); baseTrunk.material.diffuseColor = new BABYLON.Color3(0.36, 0.2, 0.08);
  baseLeaves.material = new BABYLON.StandardMaterial("leafMat", scene); baseLeaves.material.diffuseColor = new BABYLON.Color3(0.06, 0.45, 0.12);

  const baseRock = BABYLON.MeshBuilder.CreateSphere("baseRock", { diameter: 2.2 }, scene);
  baseRock.material = new BABYLON.StandardMaterial("rockMat", scene); baseRock.material.diffuseColor = new BABYLON.Color3(0.35,0.34,0.32);
  baseRock.isPickable = false;

  // scatter along path sides
  for (let i = 0; i < 120; i++) {
    const t = Math.random();
    const z = startZ + t * (endZ - startZ) + (Math.random() * 30 - 15);
    const side = Math.random() > 0.5 ? 1 : -1;
    const offsetX = side * (roadWidth/2 + 8 + Math.random()*28);
    const x = offsetX + Math.sin(z * 0.006) * 3;
    const y = sampleTerrainY(x, z);
    const trunk = baseTrunk.createInstance("trunk_inst_" + i);
    trunk.position = new BABYLON.Vector3(x, y + 1.0, z);
    const leaves = baseLeaves.createInstance("leaf_inst_" + i);
    leaves.position = trunk.position.add(new BABYLON.Vector3(0, 1.5 + Math.random()*0.8, 0));
    // occasional rock
    if (Math.random() < 0.35) {
      const r = baseRock.createInstance("rock_inst_" + i);
      r.position = new BABYLON.Vector3(x + (Math.random()*3-1.5), y + 0.6, z + (Math.random()*6-3));
      r.scaling = new BABYLON.Vector3(0.7 + Math.random()*1.6, 0.6 + Math.random()*1.4, 0.7 + Math.random()*1.6);
    }
  }

  // subtle ambient fog for depth
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
  scene.fogDensity = 0.0012;
  scene.fogColor = scene.clearColor;

  return {
    roadWidth: roadWidth,
    finishTrigger: finishTrigger,
    pathPoints: pathPoints,
    finishMesh: finish
  };
}
