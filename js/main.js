// js/main.js
// Defensive startGame() — robust error logging & guards
import { createWorld } from "./world.js";
import { createPlayerCar } from "./car.js";
import { GameUI } from "./ui.js";

export async function startGame({ canvasId = "renderCanvas", carGLBExists = false } = {}) {
  const dbgEl = document.getElementById("debugBanner");
  const setDebug = (txt, isErr = false) => {
    if (dbgEl) {
      dbgEl.innerText = txt;
      dbgEl.style.background = isErr ? "rgba(160,40,40,0.95)" : "rgba(0,0,0,0.6)";
    }
    console.log(txt);
  };

  try {
    setDebug("Initializing engine...");

    const canvas = document.getElementById(canvasId);
    if (!canvas) throw new Error("Canvas not found: " + canvasId);

    const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.58, 0.85, 1.0);

    // Global error handler so we capture stack traces to debugBanner
    window.addEventListener("error", (ev) => {
      try {
        const msg = "Uncaught error: " + (ev.message || ev.error || ev);
        setDebug(msg, true);
        console.error(ev.error || ev.message, ev.error ? ev.error.stack : "");
      } catch (e) { console.error("error handler failed", e); }
    });

    // Lights (safe)
    try {
      new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 0.9;
      const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.4, -1, -0.2), scene);
      sun.position = new BABYLON.Vector3(60, 120, 60);
      sun.intensity = 0.95;
    } catch (e) {
      console.warn("light init failed", e);
    }

    // Create world (guarded)
    let world = null;
    try {
      setDebug("Creating world...");
      world = createWorld(scene);
      if (!world) {
        throw new Error("createWorld returned falsy value");
      }
      // show some info about returned world
      console.log("createWorld returned keys:", Object.keys(world));
      if (!("finish" in world)) console.warn("Warning: world.finish not present");
      if (!("pathPoints" in world) && !("roadPieces" in world)) console.warn("Warning: world has no pathPoints or roadPieces");
      setDebug("World created");
    } catch (e) {
      const msg = "createWorld() failed: " + (e && e.message ? e.message : e);
      setDebug(msg, true);
      console.error(e);
      throw e;
    }

    // Instantiate UI (GameUI is exported from ui.js)
    let ui = null;
    try {
      ui = new GameUI();
      // wire up UI callbacks if they exist on DOM (optional)
      ui.onFail = () => {
        const el = document.getElementById("overlay-retry") || document.getElementById("failScreen");
        if (el) el.classList.remove("hidden"), el.style.display = "flex";
      };
      ui.onSuccess = () => {
        const el = document.getElementById("overlay-success") || document.getElementById("successScreen");
        if (el) el.classList.remove("hidden"), el.style.display = "flex";
      };
      setDebug("UI ready");
    } catch (e) {
      console.warn("UI init failed, falling back to window.inputState", e);
      window.inputState = window.inputState || { steer:0, accelerate:false, brake:false, steeringValue:0 };
      ui = { steer:0, gas:false, brake:false };
      setDebug("UI fallback in use");
    }

    // Create player car (guarded)
    let player = null;
    try {
      setDebug("Loading car...");
      player = await createPlayerCar(scene, !!carGLBExists);
      if (!player) throw new Error("createPlayerCar returned falsy");
      // debug handle
      window.player = player;
      setDebug("Car loaded");
      console.log("player keys:", Object.keys(player));
    } catch (e) {
      console.warn("createPlayerCar failed:", e);
      setDebug("createPlayerCar failed; attempting procedural fallback", true);
      try {
        player = await createPlayerCar(scene, false);
        window.player = player;
        setDebug("Procedural car loaded");
      } catch (err) {
        setDebug("Both GLB and fallback car failed", true);
        console.error(err);
        throw err;
      }
    }

    // Setup camera
    const cam = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0,6,-12), scene);
    cam.fov = 0.95;
    cam.attachControl(canvas, true);
    let camOffset = new BABYLON.Vector3(0, 5.2, -12.0);

    function updateCamera(dt) {
      if (!player) return;
      try {
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
      } catch (e) { console.warn("camera update failed", e); }
    }

    // Main loop with defensive guards
    let last = performance.now();
    engine.runRenderLoop(() => {
      const now = performance.now();
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;

      try {
        // call player.update only if it exists and is a function
        if (player && typeof player.update === "function") {
          player.update(dt, world);
        } else if (player && typeof player.update !== "function") {
          // If player exists but update missing, log it once
          if (!window.__playerUpdateWarn) {
            console.warn("player exists but has no update(dt) function");
            window.__playerUpdateWarn = true;
          }
        }

        // Only update camera if player has position
        if (player && player.position) updateCamera(dt);

        // HUD: safe update speed if element exists and player has _approxSpeed
        const sp = document.getElementById("speed");
        if (sp && player && ("_approxSpeed" in player)) {
          sp.innerText = Math.round(Math.abs(player._approxSpeed || 0) * 3.6) + " km/h";
        }

        // Safe finish detection
        if (world && world.finish && player && player.position) {
          try {
            const dist = BABYLON.Vector3.Distance(player.position, world.finish.position);
            if (dist < 6) {
              const el = document.getElementById("overlay-success");
              if (el) { el.classList.remove("hidden"); el.style.display = "flex"; }
            }
          } catch (e) { console.warn("finish check failed", e); }
        }

        // Safe fall detection
        if (player && player.position && typeof player.position.y === "number") {
          if (player.position.y < -20) {
            const el = document.getElementById("overlay-retry");
            if (el) { el.classList.remove("hidden"); el.style.display = "flex"; }
          }
        }
      } catch (e) {
        console.error("Frame loop error:", e);
        setDebug("Frame error: " + (e && e.message ? e.message : e), true);
      }

      try { scene.render(); } catch (e) { console.error("Scene render failed:", e); setDebug("Render failed: " + (e && e.message ? e.message : e), true); }
    });

    window.addEventListener("resize", () => engine.resize());
    setDebug("Game started");
    return { engine, scene, player, world };
  } catch (err) {
    // Top-level catch: log stack and show user
    try {
      console.error("startGame fatal error:", err);
      const message = (err && err.message) ? err.message : String(err);
      if (dbgEl) { dbgEl.innerText = "Startup error: " + message; dbgEl.style.background = "rgba(160,40,40,0.95)"; }
    } catch (e) { console.error("Error while handling startup error", e); }
    throw err;
  }
              }

// 1) Are modules loaded?
console.log("window.player:", window.player);
console.log("window.inputState (UI):", window.inputState);

// 2) What did createWorld return?
// (only if `window.player` exists or on startup after loader)
fetch('/js/world.js').then(r=>r.text()).then(txt => console.log('world.js size', txt.length)).catch(()=>console.log('cannot read world.js'));
console.log("scene meshes:", (window.scene && window.scene.meshes) ? window.scene.meshes.map(m=>m.name).slice(0,80) : "no scene global");

// 3) If a stack trace appears in console, paste it here exactly.
