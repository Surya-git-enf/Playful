// js/main.js  (robust loader + startup diagnostics)
// Replace your existing main.js with this exact file.

const loadingEl = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");
const loadingBar = document.getElementById("loadingBar");
const hud = document.getElementById("hud");
const speedEl = document.getElementById("hud-speed");
const debugBanner = document.getElementById("debugBanner");
const overlayRetry = document.getElementById("overlay-retry");
const overlaySuccess = document.getElementById("overlay-success");
const retryBtn = document.getElementById("retryBtn");
const playAgainBtn = document.getElementById("playAgainBtn");

function setLoadingProgress(pct, text) {
  try {
    if (loadingBar) loadingBar.style.width = Math.max(0, Math.min(100, pct * 100)) + "%";
    if (loadingText && text) loadingText.innerText = text;
    if (debugBanner) debugBanner.innerText = text || "Loading...";
    console.log("LOADER:", text || "", pct);
  } catch (e) { console.warn("setLoadingProgress failed", e); }
}

function showFatalError(userMessage, err) {
  console.error("Startup error:", err);
  if (loadingEl) {
    loadingEl.style.display = "flex";
  }
  if (loadingText) loadingText.innerText = "error — " + userMessage;
  if (debugBanner) {
    debugBanner.innerText = "Startup error: " + userMessage;
    debugBanner.style.background = "rgba(160,40,40,0.95)";
  }
  // Make sure overlays are shown so user sees it on mobile
  if (overlayRetry) overlayRetry.classList.remove("hidden");
  // Log stack for debugging
  if (err && err.stack) console.error(err.stack);
}

// catch global errors
window.addEventListener("error", (ev) => {
  try {
    const msg = ev && ev.message ? ev.message : String(ev);
    const stack = ev.error && ev.error.stack ? ev.error.stack : "";
    console.error("Global error:", msg, stack);
    showFatalError(msg, ev.error || ev);
  } catch (e) { console.error("Error handler failed", e); }
});

// small safety retry handlers
if (retryBtn) retryBtn.addEventListener("click", () => location.reload());
if (playAgainBtn) playAgainBtn.addEventListener("click", () => location.reload());

// Helper: tolerant dynamic import and pick factory
async function importModule(path) {
  try {
    const mod = await import(path);
    return mod;
  } catch (e) {
    console.error("Failed to import", path, e);
    throw e;
  }
}

// find a createWorld function in module
function findCreateWorld(mod) {
  if (!mod) return null;
  return mod.createWorld || mod.default?.createWorld || mod.default || null;
}

// find a createCar-like function
function findCreateCar(mod) {
  if (!mod) return null;
  return (
    mod.createCar ||
    mod.createPlayerCar ||
    mod.createPlayer ||
    mod.createVehicle ||
    mod.default ||
    null
  );
}

// small helper to sleep
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- start up ---------- */
(async function startup() {
  try {
    setLoadingProgress(0.05, "Preparing engine…");

    // Canvas + engine
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) {
      showFatalError("renderCanvas element missing");
      return;
    }
    const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    setLoadingProgress(0.12, "Engine created…");

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.58, 0.85, 1.0);

    // show progress while importing modules
    setLoadingProgress(0.18, "Loading modules…");

    // Dynamic imports
    let worldModule = null;
    let carModule = null;

    try {
      worldModule = await importModule("./world.js");
      setLoadingProgress(0.30, "World module loaded");
    } catch (e) {
      showFatalError("Failed to load world.js", e);
      return;
    }

    try {
      carModule = await importModule("./car.js");
      setLoadingProgress(0.45, "Car module loaded");
    } catch (e) {
      // don't immediately fail — we'll fallback to procedural if implemented in car.js
      console.warn("car.js import failed", e);
      showFatalError("Failed to load car module", e);
      return;
    }

    // resolve createWorld and createCar factories
    const createWorld = (worldModule && (worldModule.createWorld || worldModule.default?.createWorld)) ? (worldModule.createWorld || worldModule.default.createWorld) : (typeof worldModule.default === "function" ? worldModule.default : null);
    const createCarCandidate = findCreateCar(carModule) || (typeof carModule.default === "function" ? carModule.default : null);

    if (!createWorld) {
      console.warn("createWorld not found; trying common exports", Object.keys(worldModule || {}));
      showFatalError("createWorld export not found in world.js");
      return;
    }
    if (!createCarCandidate) {
      console.warn("createCar not found; exports:", Object.keys(carModule || {}));
      showFatalError("createCar/createPlayerCar export not found in car.js");
      return;
    }

    setLoadingProgress(0.55, "Creating world…");

    // create world safely
    let world = null;
    try {
      world = await createWorld(scene);
      setLoadingProgress(0.72, "World created");
    } catch (e) {
      console.error("createWorld() threw:", e);
      showFatalError("createWorld() error", e);
      return;
    }

    // create lights if world didn't create them (safety)
    try {
      // if no directional or hemispheric light exist, create fallback lights
      const hasLight = scene.lights && scene.lights.length > 0;
      if (!hasLight) {
        new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene).intensity = 0.9;
        const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.4,-1,-0.2), scene);
        sun.position = new BABYLON.Vector3(60,120,60);
        sun.intensity = 0.95;
      }
    } catch (e) {
      console.warn("light fallback failed", e);
    }

    setLoadingProgress(0.78, "Loading car…");

    // Attempt to create the player car
    let player = null;
    try {
      // prefer passing a flag telling car.js to use GLB if available
      // our carModule factories might accept (scene, useGLB) or (scene) — attempt both gracefully
      let created = null;
      if (typeof createCarCandidate === "function") {
        // try common signatures
        try {
          created = await createCarCandidate(scene, true); // preferred
        } catch (e1) {
          try {
            created = await createCarCandidate(scene); // fallback
          } catch (e2) {
            console.warn("createCarCandidate threw on both signatures", e1, e2);
            throw e2 || e1;
          }
        }
      }
      player = created;
      if (!player) throw new Error("createCar returned falsy");
      setLoadingProgress(0.9, "Car created");
    } catch (e) {
      console.error("createCar/createPlayerCar failed:", e);
      showFatalError("createCar failed: " + (e.message || e));
      return;
    }

    // If player is a TransformNode with .update on attached controller, handle both shapes
    // Ensure there is a reference we can use for camera locking and update calls
    let playerTarget = null;
    if (player.position !== undefined && player.rotation !== undefined) {
      // player looks like a TransformNode / Mesh
      playerTarget = player;
    } else if (player.mesh) {
      playerTarget = player.mesh;
    } else if (player.getAbsolutePosition) {
      playerTarget = player;
    } else {
      // try common property names
      playerTarget = player.root || player.carRoot || player.mesh || null;
    }
    if (!playerTarget) {
      console.warn("Could not resolve player target; falling back to root at 0,2.6,6");
      // create a simple placeholder root for camera to follow
      const root = new BABYLON.TransformNode("playerFallback", scene);
      root.position = new BABYLON.Vector3(0, 2.6, 6);
      playerTarget = root;
    }

    // Create camera (FollowCamera) or reuse existing if world provided one
    const cam = new BABYLON.FollowCamera("followCam", new BABYLON.Vector3(0,6,-12), scene);
    cam.lockedTarget = playerTarget;
    cam.radius = 12;
    cam.heightOffset = 4;
    cam.rotationOffset = 180;
    cam.attachControl(canvas, true);

    setLoadingProgress(0.95, "Finalizing…");

    // show HUD, hide loading
    await wait(120);
    if (loadingEl) loadingEl.style.display = "none";
    if (hud) hud.classList.remove("hidden");
    if (debugBanner) debugBanner.innerText = "Game started";

    // run loop
    let last = performance.now();
    engine.runRenderLoop(() => {
      const now = performance.now();
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;

      try {
        // If the returned player exposes an update function on itself or a controller, call it.
        if (player) {
          if (typeof player.update === "function") {
            player.update(dt, world);
          } else if (player._controller && typeof player._controller.update === "function") {
            player._controller.update(dt, world);
            // keep proxying _approxSpeed to the root if desired
            if (player._controller._approxSpeed !== undefined) player._approxSpeed = player._controller._approxSpeed;
          }
        }
        // HUD speed update (safe)
        if (speedEl) {
          const approx = (player && (player._approxSpeed !== undefined ? player._approxSpeed : (player._controller && player._controller._approxSpeed !== undefined ? player._controller._approxSpeed : 0)));
          speedEl.innerText = Math.abs(approx * 3.6).toFixed(0);
        }
      } catch (frameErr) {
        console.error("Frame update error:", frameErr);
        // show fatal but keep rendering to inspect via console
        if (debugBanner) debugBanner.innerText = "Frame error: " + (frameErr && frameErr.message ? frameErr.message : frameErr);
      }

      try {
        scene.render();
      } catch (renderErr) {
        console.error("Render error:", renderErr);
      }
    });

    // final progress -> 100%
    setLoadingProgress(1.0, "Ready");
    console.log("Startup completed successfully.");
  } catch (startupErr) {
    console.error("Unexpected startup error:", startupErr);
    showFatalError("Unexpected startup failure", startupErr);
  }
})();
