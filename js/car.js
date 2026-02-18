// js/car.js
// Loads a glTF car model (fallback to low-poly box) and provides update(dt).
// Looks for wheel meshes by name and rotates them visually.
// Works with window.inputState (from ui.js).

function createPlayerCar(scene) {
  const root = new BABYLON.TransformNode("player_root", scene);

  // fallback visuals (used only until model loaded or as final fallback)
  let fallbackBody = null;
  let fallbackWheels = [];

  // runtime model containers
  let modelRoot = null;
  let modelMeshes = [];
  let wheelMeshes = [];

  // dust particle (kept from earlier)
  const dust = new BABYLON.ParticleSystem("dust", 1500, scene);
  dust.particleTexture = new BABYLON.Texture("https://playground.babylonjs.com/textures/flare.png", scene);
  dust.minSize = 0.06; dust.maxSize = 0.35;
  dust.minLifeTime = 0.35; dust.maxLifeTime = 1.0;
  dust.minEmitPower = 0.6; dust.maxEmitPower = 1.6;
  dust.direction1 = new BABYLON.Vector3(-1, 0.3, 0);
  dust.direction2 = new BABYLON.Vector3(1, 0.15, 0);
  dust.gravity = new BABYLON.Vector3(0, -1.2, 0);
  dust.emitRate = 0;
  dust.start();

  // The public api to return
  const api = {
    root,
    _approxSpeed: 0,
    getHealth() { return 100; },
    modelReady: false,
    update(dt) {
      const input = window.inputState || { forward: false, backward: false, steeringValue: 0 };

      // physics-like kinematic movement (we keep the tuned DR-feel)
      api._approxSpeed = api._approxSpeed || 0;
      let velocity = api._approxSpeed;

      // acceleration / brake
      const accel = 14, brake = 24, maxSpeed = 30, drag = 0.986;
      if (input.forward) velocity += accel * dt;
      else if (input.backward) velocity -= brake * dt;
      else velocity *= Math.pow(drag, dt * 60);
      velocity = Math.max(-10, Math.min(maxSpeed, velocity));
      api._approxSpeed = velocity;

      // steering: prefer continuous steeringValue
      const steerVal = (typeof input.steeringValue === "number") ? input.steeringValue : (input.right ? 1 : (input.left ? -1 : 0));
      const yawDelta = steerVal * 0.6 * (Math.abs(velocity) / maxSpeed) * dt * 6.0;
      root.rotation.y += yawDelta;

      // forward movement in facing direction
      const forward = new BABYLON.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
      const move = forward.scale(velocity * 0.12 * dt * 60);
      root.position.addInPlace(move);

      // small lateral sway for visuals
      const right = new BABYLON.Vector3(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y));
      root.position.addInPlace(right.scale(steerVal * Math.min(0.9, Math.abs(velocity) / maxSpeed) * 0.02));

      // wheel visuals rotate if we have wheel meshes
      const spin = velocity * 0.12 * dt * 60;
      if (wheelMeshes.length) {
        wheelMeshes.forEach(w => { w.rotation.x += spin; });
      } else if (fallbackWheels.length) {
        fallbackWheels.forEach(w => { w.rotation.x += spin; });
      }

      // body roll tilt
      const targetRoll = -steerVal * Math.min(1, Math.abs(velocity) / (maxSpeed * 0.6)) * 0.06;
      root.rotation.z += (targetRoll - root.rotation.z) * Math.min(1, 6 * dt);

      // dust emitter positioning (emitter in world space behind car)
      const localBack = new BABYLON.Vector3(0, 0.45, -2.2);
      const worldBack = BABYLON.Vector3.TransformCoordinates(localBack, root.getWorldMatrix());
      dust.emitter = worldBack;
      dust.emitRate = (input.forward && Math.abs(velocity) > 6) ? Math.min(700, 80 + Math.abs(velocity) * 20) : 0;
    }
  };

  // --- fallback low-poly quick car in case glTF fails or while loading ---
  function createFallbackCar() {
    fallbackBody = BABYLON.MeshBuilder.CreateBox("car_fallback_body", { width: 2.2, height: 0.6, depth: 4.0 }, scene);
    fallbackBody.parent = root; fallbackBody.position.y = 1.0;
    fallbackBody.material = new BABYLON.StandardMaterial("car_fb_mat", scene);
    fallbackBody.material.diffuseColor = new BABYLON.Color3(0.92, 0.14, 0.14);

    function makeWheel(name, x, z) {
      const w = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: 0.56, height: 0.30, tessellation: 24 }, scene);
      w.rotation.z = Math.PI / 2; w.parent = root; w.position = new BABYLON.Vector3(x, 0.44, z);
      w.material = new BABYLON.StandardMaterial(name + "_m", scene); w.material.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.06);
      fallbackWheels.push(w);
      return w;
    }
    makeWheel("wFL_f", -0.92, 1.5); makeWheel("wFR_f", 0.92, 1.5);
    makeWheel("wBL_f", -0.92, -1.7); makeWheel("wBR_f", 0.92, -1.7);
  }

  createFallbackCar();

  // --- Try to load a real glTF model (public example, you can replace with your own): ---
  // NOTE: you can instead host a nicer glTF at /assets/car/CAR.gltf and change rootUrl & fileName below.
  (function tryLoadRemoteModel() {
    // Public example model (truck) from Khronos glTF sample models - works for testing
    const rootUrl = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/glTF/";
    const fileName = "CesiumMilkTruck.gltf";

    BABYLON.SceneLoader.ImportMesh("", rootUrl, fileName, scene,
      function (meshes, particleSystems, skeletons, animationGroups) {
        if (!meshes || meshes.length === 0) {
          console.warn("Car model loaded but no meshes found.");
          return;
        }
        // unify meshes under a new parent transform (modelRoot)
        modelRoot = new BABYLON.TransformNode("car_model_root", scene);
        meshes.forEach(m => {
          m.parent = modelRoot;
          modelMeshes.push(m);
        });

        // scale & reposition model to match our prototype size
        // tune scale by inspecting bounding box size
        const bbox = BABYLON.Mesh.MergeMeshes(meshes.map(m=>m.clone()), false, true, undefined, false, true);
        // We used a quick method: if large model, scale down. Use bbox size heuristics if bbox exists.
        if (bbox) {
          const size = bbox.getBoundingInfo().boundingBox.extendSize;
          // rough scale target: car body ~ 2.5 width
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = (2.5 / (maxDim || 1.0));
          modelRoot.scaling = new BABYLON.Vector3(scale, scale, scale);
          bbox.dispose();
        } else {
          modelRoot.scaling = new BABYLON.Vector3(0.08, 0.08, 0.08);
        }

        // place model at root origin (we'll parent modelRoot to our root)
        modelRoot.position = BABYLON.Vector3.Zero();
        modelRoot.parent = root;
        // try to find wheel submeshes by name (common naming patterns)
        const wheelNames = ["wheel", "tyre", "tire", "wheel_front", "wheel_back"];
        meshes.forEach(m => {
          const n = (m.name || "").toLowerCase();
          if (!n) return;
          if (wheelNames.some(w => n.indexOf(w) !== -1)) {
            wheelMeshes.push(m);
          }
        });

        // If wheelMeshes empty, try a second pass: any mesh with roughly circular bounding in XZ (heuristic)
        if (wheelMeshes.length === 0) {
          meshes.forEach(m => {
            if (!m || !m.getBoundingInfo) return;
            const ext = m.getBoundingInfo().boundingBox.extendSize;
            // small and roughly rotated cylinder-like on Y axis often wheel => ext.y < ext.x ~ ext.z small height
            if (ext && ext.y < 0.6 && (Math.abs(ext.x - ext.z) < 0.6) && (ext.x < 1.3)) {
              wheelMeshes.push(m);
            }
          });
        }

        // hide fallback visuals
        if (fallbackBody) { fallbackBody.dispose(); fallbackBody = null; }
        fallbackWheels.forEach(w => w.dispose());
        fallbackWheels = [];

        api.modelReady = true;
        console.log("Car glTF loaded. Wheels found:", wheelMeshes.length);
      },
      null,
      function (scene, message, exception) {
        console.warn("Car model failed to load:", message, exception);
        // keep fallback car — nothing else to do
      }
    );
  })();

  return api;
}
