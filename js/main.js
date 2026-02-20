// js/main.js
// Entry point for Mount Climb. Exported startGame() is called by index.html loader.
// - Loads world & player (GLB or fallback)
// - Uses UI input (tries to import ./ui.js or uses window.inputState)
// - Smooth camera follow, HUD update, finish/fall detection

import { createWorld } from "./world.js";
import { createPlayerCar } from "./car.js";

export async function startGame({ canvasId = "renderCanvas", carGLBExists = false } = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) throw new Error("Canvas not found: " + canvasId);

  // Debug banner helper (index.html provides #debugBanner)
  const dbgEl = document.getElementById("debugBanner");
  function dbg(msg, isErr = false) {
    if (dbgEl) { dbgEl.innerText = msg; dbgEl.style.background = isErr ? "rgba(160,40,40,0.95)" : "rgba(0,0,0,0.6)"; }
    console.log(msg);
  }

  dbg("Initializing engine...");

  // create engine & scene
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.58, 0.85, 1.0);

  // optional physics enabling (only if cannon is loaded)
  try {
    if (window.CANNON) {
      dbg("Cannon detected — enabling physics");
      const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
      const physicsPlugin = new BABYLON.CannonJSPlugin();
      scene.enablePhysics(gravityVector, physicsPlugin);
    } else dbg("Cannon.js not found — running without physics plugin");
  } catch (e) {
    console.warn("Physics enable failed:", e);
    dbg("Physics unavailable — continuing without it");
  }

  // Lighting (simple & safe)
  try {
    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.9;
    const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.4, -1, -0.2), scene);
    sun.position = new BABYLON.Vector3(60, 120, 60);
    sun.intensity = 0.95;
  } catch (e) { console.warn("light error", e); }

  // Create world (terrain, road, finish)
  let world = null;
  try {
    world = createWorld(scene);
    dbg("World created");
  } catch (e) {
    dbg("createWorld failed — check world.js", true);
    console.error(e);
    throw e;
  }

  // Try to import UI module (if it exports Input), else fallback to window.inputState
  let Input = null;
  try {
    const uiModule = await import("./ui.js");
    Input = uiModule.Input || uiModule.default || window.inputState || null;
    if (!Input) {
      // ui.js may not export; fallback to window.inputState if present
      Input = window.inputState || { steer: 0, accelerate: false, brake: false, steeringValue: 0 };
    }
    // Keep a reference both ways for older code
    window.inputState = window.inputState || Input;
    dbg("UI input ready");
  } catch (e) {
    // If import fails (ui.js not an ES module), use window.inputState
    Input = window.inputState || { steer: 0, accelerate: false, brake: false, steeringValue: 0 };
    window.inputState = Input;
    dbg("UI import failed — using window.inputState fallback");
  }

  // Create player car (try GLB first if requested)
  let player = null;
  try {
    player = await createPlayerCar(scene, !!carGLBExists);
    window.player = player; // debug handle
    dbg("Player car created (" + (carGLBExists ? "GLB attempted" : "procedural") + ")");
  } catch (e) {
    console.warn("createPlayerCar error:", e);
    dbg("createPlayerCar failed — trying fallback procedural", true);
    try {
      player = await createPlayerCar(scene, false);
      window.player = player;
      dbg("Procedural fallback car created");
    } catch (err) {
      dbg("Both GLB and fallback car failed — check car.js", true);
      throw err;
    }
  }

  // Camera: smooth 3rd-person follow
  const cam = new BABYLON.UniversalCamera("uCam", new BABYLON.Vector3(0, 6, -12), scene);
  cam.fov = 0.95;
  cam.attachControl(canvas, true);
  let camOffset = new BABYLON.Vector3(0, 5.2, -12.0);

  function updateCamera(dt) {
    if (!player) return;
    const ang = player.rotation ? player.rotation.y : 0;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const off = camOffset;
    const transformed = new BABYLON.Vector3(off.x * ca - off.z * sa, off.y, off.x * sa + off.z * ca);
    const desired = player.position.add(transformed);
    cam.position = BABYLON.Vector3.Lerp(cam.position, desired, 0.12);
    const lookLocal = new BABYLON.Vector3(0, 1.2, 2.6);
    const lookWorld = new BABYLON.Vector3(lookLocal.x * ca - lookLocal.z * sa, lookLocal.y, lookLocal.x * sa + lookLocal.z * ca);
    const target = player.position.add(lookWorld);
    cam.setTarget(BABYLON.Vector3.Lerp(cam.getTarget ? cam.getTarget() : cam.position, target, 0.18));
  }

  // HUD helper
  function updateHUD() {
    const sp = document.getElementById("speed");
    if (sp && player) sp.innerText = Math.round(Math.abs(player._approxSpeed || 0) * 3.6) + " km/h";
  }

  // main loop
  let last = performance.now();
  dbg("Starting main loop");
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.06, (now - last) / 1000);
    last = now;

    try {
      if (player && typeof player.update === "function") player.update(dt, world);
      updateCamera(dt);
      updateHUD();

      // finish detection
      if (world && world.finish && player) {
        const dist = BABYLON.Vector3.Distance(player.position, world.finish.position);
        if (dist < 6) {
          const el = document.getElementById("overlay-success");
          if (el) el.classList.remove("hidden"), el.style.display = "flex";
        }
      }

      // fall detection
      if (player && player.position && player.position.y < -20) {
        const el = document.getElementById("overlay-retry");
        if (el) el.classList.remove("hidden"), el.style.display = "flex";
      }
    } catch (e) {
      console.error("Frame error:", e);
      dbg("Frame error: " + (e && e.message ? e.message : e), true);
    }

    scene.render();
  });

  window.addEventListener("resize", () => engine.resize());

  // overlay buttons (if present)
  try {
    const retry = document.getElementById("retryBtn");
    if (retry) retry.addEventListener("click", () => location.reload());
    const playAgain = document.getElementById("playAgainBtn");
    if (playAgain) playAgain.addEventListener("click", () => location.reload());
  } catch (e) { /* ignore */ }

  dbg("Game started successfully");
  return { engine, scene, player, world };
        }
