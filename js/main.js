// js/main.js
// Robust game bootstrap: safe calls, fallbacks, debug banner, camera follow, loop.

window.addEventListener("DOMContentLoaded", async () => {
  // small helper: create debug banner on-screen
  function dbg(text, isError=false) {
    let d = document.getElementById("debugBanner");
    if (!d) {
      d = document.createElement("div");
      d.id = "debugBanner";
      d.style.position = "fixed";
      d.style.left = "10px";
      d.style.bottom = "10px";
      d.style.zIndex = 99999;
      d.style.background = "rgba(0,0,0,0.6)";
      d.style.color = "#fff";
      d.style.padding = "8px 12px";
      d.style.borderRadius = "8px";
      d.style.fontSize = "13px";
      d.style.maxWidth = "calc(100% - 40px)";
      d.style.pointerEvents = "none";
      document.body.appendChild(d);
    }
    d.innerText = text;
    if (isError) d.style.background = "rgba(180,40,40,0.9)";
  }

  dbg("Starting engine...");

  // canvas
  const canvas = document.getElementById("renderCanvas");
  if (!canvas) {
    dbg("ERROR: <canvas id='renderCanvas'> not found in index.html", true);
    return;
  }

  // create engine + scene
  let engine, scene;
  try {
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.6, 0.85, 1.0);
  } catch (e) {
    console.error("Failed to create engine/scene:", e);
    dbg("FAILED to initialize WebGL / Babylon. See console.", true);
    return;
  }

  dbg("Engine created — loading world...");

  // attempt to call createWorld(scene), else create a small fallback world
  let world = null;
  try {
    if (typeof createWorld === "function") {
      world = createWorld(scene) || {};
      dbg("World loaded.");
    } else {
      throw new Error("createWorld() not found");
    }
  } catch (e) {
    console.warn("createWorld failed, creating fallback ground:", e);
    dbg("Warning: world.js missing or errored — using fallback.");
    // fallback simple ground + light
    const light = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    light.intensity = 0.95;
    const ground = BABYLON.MeshBuilder.CreateGround("debugGround", {width:200, height:200}, scene);
    const gmat = new BABYLON.StandardMaterial("gmat", scene); gmat.diffuseColor = new BABYLON.Color3(0.14,0.6,0.14);
    ground.material = gmat;
    world = { ground };
  }

  // init UI (safe)
  try {
    if (typeof initUI === "function") {
      initUI();
    } else {
      console.warn("initUI() not found.");
      dbg("Warning: ui.js not loaded. Controls may not work.");
    }
  } catch (e) {
    console.warn("initUI error:", e);
    dbg("Warning: ui.js threw error. Controls may not work.");
  }

  dbg("Creating player car...");

  // create car (async safe)
  let player = null;
  try {
    if (typeof createPlayerCar === "function") {
      // if createPlayerCar returns a promise, await it
      const maybe = createPlayerCar(scene);
      player = (maybe && typeof maybe.then === "function") ? await maybe : maybe;
      dbg("Player car ready.");
    } else {
      throw new Error("createPlayerCar not found");
    }
  } catch (e) {
    console.warn("createPlayerCar failed, making fallback box-car:", e);
    // fallback simple box car (so we at least see something)
    const root = new BABYLON.TransformNode("fallbackCar", scene);
    const body = BABYLON.MeshBuilder.CreateBox("fbBody", {width:2, height:0.6, depth:3}, scene);
    body.parent = root; body.position.y = 0.9;
    const mat = new BABYLON.StandardMaterial("fbMat", scene); mat.diffuseColor = new BABYLON.Color3(0.8,0.1,0.1);
    body.material = mat;
    // add 4 cylinder wheels
    const wheels = [];
    [[-0.9,1.2],[0.9,1.2],[-0.9,-1.2],[0.9,-1.2]].forEach((p,i)=>{
      const w = BABYLON.MeshBuilder.CreateCylinder("wfb"+i, {diameter:0.6, height:0.28}, scene);
      w.rotation.z = Math.PI/2; w.parent = root; w.position = new BABYLON.Vector3(p[0], 0.45, p[1]);
      wheels.push(w);
    });
    // minimal update function to move with inputState
    root._approxSpeed = 0;
    root.getHealth = ()=>100;
    root.update = function(dt){
      window.inputState = window.inputState || { forward:false, backward:false, steer:0, steeringValue:0 };
      if (window.inputState.forward) root._approxSpeed += 0.02;
      else if (window.inputState.backward) root._approxSpeed -= 0.04;
      else root._approxSpeed *= 0.98;
      root.position.addInPlace(new BABYLON.Vector3(Math.sin(root.rotation.y),0,Math.cos(root.rotation.y)).scale(root._approxSpeed));
      wheels.forEach(w=> w.rotation.x += root._approxSpeed * dt * 30);
    };
    root.position.set(0,1.5,40);
    player = root;
    dbg("Fallback car created.");
  }

  // CAMERA: smooth chase camera implemented manually (works with TransformNode)
  const camOffset = new BABYLON.Vector3(0, 5.0, -12.0);
  const cam = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0,5,-12), scene);
  cam.fov = 0.95; cam.minZ = 0.1;
  cam.attachControl(canvas, true);

  // helper: update camera smoothly each frame
  function updateCamera(dt) {
    if (!player) return;
    const ang = player.rotation ? player.rotation.y : (player.rotationQuaternion ? player.rotationQuaternion.toEulerAngles().y : 0);
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const off = camOffset;
    const transformed = new BABYLON.Vector3(
      off.x * cosA - off.z * sinA,
      off.y,
      off.x * sinA + off.z * cosA
    );
    const desired = player.position.add(transformed);
    cam.position = BABYLON.Vector3.Lerp(cam.position, desired, 0.14);
    const lookLocal = new BABYLON.Vector3(0, 1.2, 2.8);
    const lookWorld = new BABYLON.Vector3(
      lookLocal.x * cosA - lookLocal.z * sinA,
      lookLocal.y,
      lookLocal.x * sinA + lookLocal.z * cosA
    );
    const target = player.position.add(lookWorld);
    cam.setTarget(BABYLON.Vector3.Lerp(cam.getTarget ? cam.getTarget() : cam.position, target, 0.18));
  }

  // HUD speed updater
  function updateHUD() {
    const sp = document.getElementById("speed");
    if (!sp) return;
    try {
      const s = Math.round(Math.abs(player._approxSpeed || 0) * 3.6);
      sp.innerText = `${s} km/h`;
    } catch(e) {}
  }

  // main render loop with timing and safety
  let last = performance.now();
  engine.runRenderLoop(() => {
    try {
      const now = performance.now();
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;

      // call player update if provided
      try {
        if (player && typeof player.update === "function") {
          player.update(dt);
        } else if (player && player._approxSpeed !== undefined) {
          // maybe fallback: do nothing special
        }
      } catch (e) {
        console.warn("player.update error:", e);
      }

      updateCamera(dt);
      updateHUD();

      scene.render();
    } catch (e) {
      console.error("Render loop error:", e);
      dbg("Render loop error — check console.", true);
    }
  });

  // resize
  window.addEventListener("resize", ()=> engine.resize());

  dbg("Running — scene should render. If black, open console.");
});
