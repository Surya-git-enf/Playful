// js/car.js
function createPlayerCar(scene) {
  const root = new BABYLON.TransformNode("player_root", scene);

  // fallback visuals
  let fallbackBody = null;
  const fallbackWheels = [];

  // model containers
  let modelRoot = null;
  let modelMeshes = [];
  let wheelMeshes = [];
  let wheelLocalOffsets = [];

  // params
  const params = {
    maxSpeed: 32, accel: 14, brake: 26, drag: 0.986,
    wheelRadius: 0.28, suspensionTravel: 0.35, suspensionStiffness: 12.0, suspensionDamping: 8.0
  };

  // create fallback car
  function createFallbackCar() {
    fallbackBody = BABYLON.MeshBuilder.CreateBox("car_fb_body", { width: 2.2, height: 0.6, depth: 4.0 }, scene);
    fallbackBody.parent = root; fallbackBody.position.y = 1.0;
    const m = new BABYLON.StandardMaterial("fb_mat", scene); m.diffuseColor = new BABYLON.Color3(0.9,0.18,0.18);
    fallbackBody.material = m;
    function mkWheel(name,x,z) {
      const w = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: params.wheelRadius*2, height: 0.30, tessellation: 24 }, scene);
      w.rotation.z = Math.PI/2; w.parent = root; w.position = new BABYLON.Vector3(x, 0.44, z);
      w.material = new BABYLON.StandardMaterial(name + "_m", scene); w.material.diffuseColor = new BABYLON.Color3(0.06,0.06,0.06);
      fallbackWheels.push(w);
    }
    mkWheel("wFL_fb",-0.92,1.5); mkWheel("wFR_fb",0.92,1.5);
    mkWheel("wBL_fb",-0.92,-1.7); mkWheel("wBR_fb",0.92,-1.7);
  }
  createFallbackCar();

  // optional audio (only loads if present)
  let engineSound = null;
  let skidSound = null;
  try { engineSound = new BABYLON.Sound("engine_loop", "/assets/sounds/engine_loop.mp3", scene, null, { loop: true, volume: 0.7, autoplay:false }); } catch(e){}
  try { skidSound = new BABYLON.Sound("skid", "/assets/sounds/skid.mp3", scene, null, { loop: false, volume: 0.75, autoplay:false }); } catch(e){}

  // raycast helper
  function raycastDownFrom(worldPos, maxDistance = 3) {
    const dir = new BABYLON.Vector3(0, -1, 0);
    const ray = new BABYLON.Ray(worldPos, dir, maxDistance);
    const pick = scene.pickWithRay(ray, (mesh) => {
      if (!mesh) return true;
      let p = mesh;
      while (p) { if (p === root) return false; p = p.parent; }
      return true;
    });
    return pick && pick.hit ? pick : null;
  }

  // try load local car.glb first, else fallback to remote sample, else keep fallback visuals
  (function loadCarModel() {
    const localRoot = "/assets/car/";
    const localFile = "car.glb";
    const remoteRoot = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/glTF/";
    const remoteFile = "CesiumMilkTruck.gltf";

    function finalizeMeshes(meshes) {
      modelRoot = new BABYLON.TransformNode("modelRoot", scene);
      modelMeshes = meshes;
      meshes.forEach(m => { m.parent = modelRoot; });
      // try detect wheels by name
      const wheelNames = ["wheel","tyre","tire","rim"];
      meshes.forEach(m=>{
        const n = (m.name||"").toLowerCase();
        if (wheelNames.some(w=>n.indexOf(w)!==-1)) wheelMeshes.push(m);
      });
      // second heuristic if none found
      if (wheelMeshes.length === 0) {
        meshes.forEach(m=>{
          if (!m.getBoundingInfo) return;
          const ext = m.getBoundingInfo().boundingBox.extendSize;
          if (ext && ext.y < 0.6 && Math.abs(ext.x - ext.z) < 0.7 && ext.x < 1.2) wheelMeshes.push(m);
        });
      }
      // record local offsets for wheels
      wheelLocalOffsets = wheelMeshes.map(w=>w.position.clone());
      // scale model to approximate car width
      try {
        const clones = meshes.map(m => m.clone());
        const merged = BABYLON.Mesh.MergeMeshes(clones, true, true, undefined, false, true);
        if (merged) {
          const size = merged.getBoundingInfo().boundingBox.extendSize;
          const maxDim = Math.max(size.x, size.y, size.z);
          const target = 2.4; // approximate car width target
          const scale = target / (maxDim || 1);
          modelRoot.scaling = new BABYLON.Vector3(scale, scale, scale);
          merged.dispose();
        } else { modelRoot.scaling = new BABYLON.Vector3(0.08,0.08,0.08); }
      } catch(e) { modelRoot.scaling = new BABYLON.Vector3(0.08,0.08,0.08); }
      // dispose fallback visuals
      if (fallbackBody) { fallbackBody.dispose(); fallbackBody = null; }
      fallbackWheels.forEach(w=>w.dispose()); fallbackWheels.length = 0;
      console.log("Car model ready. Wheels:", wheelMeshes.length);
    }

    // try local
    BABYLON.SceneLoader.ImportMesh("", localRoot, localFile, scene, function(meshes){
      if (meshes && meshes.length) finalizeMeshes(meshes);
      else {
        // try remote
        BABYLON.SceneLoader.ImportMesh("", remoteRoot, remoteFile, scene, function(meshes2){
          if (meshes2 && meshes2.length) finalizeMeshes(meshes2);
        }, null, function(s,m,e){ console.warn("remote model load failed",m); });
      }
    }, null, function(s,m,e){
      // local failed, attempt remote
      BABYLON.SceneLoader.ImportMesh("", remoteRoot, remoteFile, scene, function(meshes2){
        if (meshes2 && meshes2.length) finalizeMeshes(meshes2);
      }, null, function(s2,m2,e2){ console.warn("both local and remote load failed",m2); });
    });
  })();

  // dynamic wheel states for suspension
  const wheelStates = [];

  function ensureWheelStates() {
    const count = wheelMeshes.length ? wheelMeshes.length : fallbackWheels.length;
    while (wheelStates.length < count) wheelStates.push({ compression:0, velocity:0 });
    if (wheelStates.length > count) wheelStates.length = count;
  }

  // API
  const api = {
    root,
    _approxSpeed: 0,
    getHealth(){ return 100; },

    update(dt) {
      const input = window.inputState || { forward:false, backward:false, steeringValue:0, drift:false };

      // longitudinal
      let v = api._approxSpeed || 0;
      if (input.forward) v += params.accel * dt;
      else if (input.backward) v -= params.brake * dt;
      else v *= Math.pow(params.drag, dt*60);
      v = Math.max(-12, Math.min(params.maxSpeed, v));
      api._approxSpeed = v;

      // steering
      const steerVal = (typeof input.steeringValue === "number") ? input.steeringValue : (input.right?1:(input.left?-1:0));
      const yawDelta = steerVal * 0.62 * (Math.abs(v) / params.maxSpeed) * dt * 6.0;
      root.rotation.y += yawDelta;

      // move
      const forward = new BABYLON.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
      const move = forward.scale(v * 0.12 * dt * 60);
      root.position.addInPlace(move);

      // wheel spin visuals
      const spin = v * 0.12 * dt * 60;
      if (wheelMeshes.length) wheelMeshes.forEach(w => w.rotation.x += spin);
      else fallbackWheels.forEach(w => w.rotation.x += spin);

      // body roll tilt
      const targetRoll = -steerVal * Math.min(1, Math.abs(v)/(params.maxSpeed*0.6)) * 0.06;
      root.rotation.z += (targetRoll - root.rotation.z) * Math.min(1, 6 * dt);

      // suspension
      ensureWheelStates();
      const sources = wheelMeshes.length ? wheelMeshes : fallbackWheels;
      for (let i=0;i<sources.length;i++) {
        const wm = sources[i];
        const worldPos = wm.getAbsolutePosition();
        const pick = raycastDownFrom(worldPos, 3.5);
        const st = wheelStates[i];
        let targetCompression = 0.5;
        if (pick && pick.pickedPoint) {
          const groundY = pick.pickedPoint.y;
          const desiredWheelY = groundY + params.wheelRadius;
          const diff = Math.max(-params.suspensionTravel, Math.min(params.suspensionTravel, desiredWheelY - worldPos.y));
          targetCompression = (diff + params.suspensionTravel) / (params.suspensionTravel*2);
          targetCompression = Math.max(0, Math.min(1, targetCompression));
        }
        const k = params.suspensionStiffness, d = params.suspensionDamping;
        const f = k * (targetCompression - st.compression);
        st.velocity += f * dt;
        st.velocity *= Math.exp(-d * dt);
        st.compression += st.velocity * dt;
        st.compression = Math.max(0, Math.min(1, st.compression));
        const compressAmount = (st.compression - 0.5) * params.suspensionTravel * 2;
        if (wm.parent && wm.parent === modelRoot) {
          const idxLocal = wheelMeshes.indexOf(wm);
          if (idxLocal >= 0 && wheelLocalOffsets[idxLocal]) wm.position.y = wheelLocalOffsets[idxLocal].y + compressAmount;
          else wm.position.y += compressAmount * dt * 8;
        } else {
          wm.position.y = 0.44 + compressAmount;
        }
      }

      // body bob
      const avg = wheelStates.length ? (wheelStates.reduce((s,x)=>s+x.compression,0)/wheelStates.length) : 0.5;
      const desiredBodyY = 1.0 + (0.5 - avg) * 0.12;
      root.position.y += (desiredBodyY - root.position.y) * Math.min(1, 6 * dt);

      // engine sound
      try {
        if (engineSound) {
          if (Math.abs(v) > 1.8) {
            if (!engineSound.isPlaying) engineSound.play();
            const rate = 0.65 + (Math.abs(v) / params.maxSpeed) * 1.5;
            engineSound.setPlaybackRate(Math.max(0.6, Math.min(2.0, rate)));
          } else { if (engineSound.isPlaying) engineSound.pause(); }
        }
      } catch(e){}

      // skid sound
      try {
        const skidTrigger = (input.drift && Math.abs(v) > 6) || (input.backward && Math.abs(v) > 8);
        if (skidTrigger) { if (skidSound && !skidSound.isPlaying) skidSound.play(); }
        else { if (skidSound && skidSound.isPlaying) skidSound.stop(); }
      } catch(e){}
    }
  };

  return api;
}
