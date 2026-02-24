// js/car.js
// Exports: createPlayerCar(scene, useGLB = true) and CarController class
// createPlayerCar returns an object (TransformNode) with .update(dt, world) and ._approxSpeed

export class CarController {
  constructor(scene, root, wheels = []) {
    this.scene = scene;
    this.root = root;         // TransformNode or Mesh acting as car root
    this.wheels = wheels;     // array of wheel meshes (may be empty)
    this._approxSpeed = 0;
    this._velocity = 0;
    this._steer = 0;
    this.params = {
      maxSpeed: 26,
      reverseMax: -8,
      accel: 16,
      brake: 36,
      drag: 0.986,
      maxSteer: 0.82,
      steerResponse: 7.5
    };

    // expose convenience aliases
    this.position = this.root.position;
    this.rotation = this.root.rotation;
  }

  // simple raycast sample under a position
  sampleGroundY(worldPos) {
    try {
      const r = new BABYLON.Ray(worldPos.add(new BABYLON.Vector3(0, 6, 0)), new BABYLON.Vector3(0, -1, 0), 30);
      const pick = this.scene.pickWithRay(r, (m) => true);
      if (pick && pick.hit && pick.pickedPoint) return pick.pickedPoint.y;
    } catch (e) {
      console.warn("sampleGroundY failed:", e);
    }
    return null;
  }

  // main per-frame update — signature expected by main.js
  update(dt = 1 / 60, world = null) {
    // Input: the project uses window.inputState (ui.js should set this)
    const input = window.inputState || { steer: 0, accelerate: false, brake: false };
    const forward = !!input.accelerate;
    const backward = !!input.brake;
    const steerVal = (typeof input.steeringValue === "number") ? input.steeringValue : (input.steer || 0);

    // Longitudinal physics
    if (forward) this._velocity += this.params.accel * dt;
    else if (backward) this._velocity -= this.params.brake * dt;
    else this._velocity *= Math.pow(this.params.drag, dt * 60);

    this._velocity = Math.max(this.params.reverseMax, Math.min(this.params.maxSpeed, this._velocity));
    this._approxSpeed = this._velocity;

    // steering smoothing
    this._steer += (steerVal - this._steer) * Math.min(1, this.params.steerResponse * dt);
    const yawDelta = this._steer * this.params.maxSteer * (Math.abs(this._velocity) / this.params.maxSpeed || 0);
    // rotate car
    this.root.rotation.y += yawDelta * dt * 4.5;

    // forward move
    const forwardDir = new BABYLON.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
    this.root.position.addInPlace(forwardDir.scale(this._velocity * dt * 0.12 * 60));

    // sample ground for ride height and pitch
    const centerY = this.sampleGroundY(this.root.position);
    const ahead = this.root.position.add(forwardDir.scale(1.8));
    const aheadY = this.sampleGroundY(ahead);
    if (centerY !== null && aheadY !== null) {
      const rideHeight = 0.95;
      const desiredY = centerY + rideHeight;
      this.root.position.y += (desiredY - this.root.position.y) * Math.min(1, 8 * dt);
      const dz = aheadY - centerY;
      const pitch = Math.atan2(dz, 1.8);
      this.root.rotation.x += (pitch - this.root.rotation.x) * Math.min(1, 6 * dt);
    } else {
      // falling case
      this.root.position.y -= 9.8 * dt * 0.04;
    }

    // visual wheel spin and optional front wheel yaw if identifiable
    this.wheels.forEach((w, i) => {
      try {
        w.rotation.x += this._velocity * dt * 2.6;
      } catch (e) { /* ignore wheel animation errors */ }
    });

    // simple fall detection: if below -20, trigger retry callback if present
    if (this.root.position.y < -20) {
      if (window.UI && typeof window.UI.showRetry === "function") window.UI.showRetry();
      // also dispatch a DOM overlay if exists
      const retryEl = document.getElementById("overlay-retry") || document.getElementById("overlay-retry") ;
      if (retryEl) retryEl.classList.remove("hidden"), retryEl.style.display = "flex";
    }

    // finish detection if world.finish exists (main.js also checks)
    if (world && world.finish) {
      try {
        const dist = BABYLON.Vector3.Distance(this.root.position, world.finish.position);
        if (dist < 6) {
          const succ = document.getElementById("overlay-success");
          if (succ) succ.classList.remove("hidden"), succ.style.display = "flex";
        }
      } catch (e) { /* ignore finish check errors */ }
    }
  }
}

// createPlayerCar(scene, useGLB = true)
// returns a TransformNode (car root) that has update(dt, world), position, rotation, _approxSpeed
export async function createPlayerCar(scene, useGLB = true) {
  // Helper: build fallback procedural car and return controller
  function buildProceduralCar() {
    const root = new BABYLON.TransformNode("fallbackCar", scene);
    // body
    const body = BABYLON.MeshBuilder.CreateBox("fbBody", { width: 2, height: 0.6, depth: 3 }, scene);
    body.parent = root; body.position.y = 0.9;
    const mat = new BABYLON.StandardMaterial("fbMat", scene); mat.diffuseColor = new BABYLON.Color3(0.8, 0.1, 0.1);
    body.material = mat;
    // wheels
    const wheels = [];
    [[-0.9, 1.2], [0.9, 1.2], [-0.9, -1.2], [0.9, -1.2]].forEach((p, i) => {
      const w = BABYLON.MeshBuilder.CreateCylinder("wfb" + i, { diameter: 0.6, height: 0.28 }, scene);
      w.rotation.z = Math.PI / 2; w.parent = root; w.position = new BABYLON.Vector3(p[0], 0.45, p[1]);
      const wmat = new BABYLON.StandardMaterial("wMat" + i, scene); wmat.diffuseColor = new BABYLON.Color3(0.02, 0.02, 0.02);
      w.material = wmat;
      wheels.push(w);
    });
    root.position.set(0, 2.6, 6);
    const controller = new CarController(scene, root, wheels);
    // expose convenience fields for HUD/main.js
    controller.position = controller.root.position;
    controller.rotation = controller.root.rotation;
    controller._approxSpeed = controller._approxSpeed || 0;
    // return object shaped as older code expects (a TransformNode-like object with update)
    // we attach update on the root so main.js can call player.update
    root.update = (dt, world) => controller.update(dt, world);
    root._approxSpeed = controller._approxSpeed;
    // attach refs for later
    root._controller = controller;
    return root;
  }

  if (!useGLB) {
    return buildProceduralCar();
  }

  // Try loading GLB; if fails, fallback to procedural
  try {
    const result = await new Promise((resolve, reject) => {
      BABYLON.SceneLoader.ImportMesh("", "assets/car/", "car.glb", scene, (meshes, particleSystems, skeletons, animationGroups) => {
        resolve({ meshes, skeletons, animationGroups });
      }, null, (scene, message) => {
        reject(new Error("GLB load failed: " + message));
      });
    });

    // Create a container root and parent imported meshes to it
    const carRoot = new BABYLON.TransformNode("carRoot", scene);
    const wheels = [];
    result.meshes.forEach((m) => {
      // ignore cameras/lights if any
      try { m.setParent(carRoot); } catch (e) {}
      const lname = (m.name || "").toLowerCase();
      if (lname.includes("wheel") || lname.includes("tyre") || lname.includes("tire")) {
        wheels.push(m);
      }
    });

    // tuning: scale/rotate/position — tweak if your model orientation differs
    carRoot.scaling = new BABYLON.Vector3(1, 1, 1); // change if too big/small
    // If your car faces backward in scene, rotate 180 degrees:
    // carRoot.rotation = new BABYLON.Vector3(0, Math.PI, 0);
    carRoot.position = new BABYLON.Vector3(0, 2.6, 6);

    const controller = new CarController(scene, carRoot, wheels);

    // attach update and proxy properties on carRoot so existing code can call player.update(...)
    carRoot.update = (dt, world) => controller.update(dt, world);
    Object.defineProperty(carRoot, "_approxSpeed", {
      get() { return controller._approxSpeed; }
    });

    // Add references for debugging in console
    carRoot._controller = controller;
    carRoot._importedMeshes = result.meshes;

    console.log("car.glb loaded, wheel count:", wheels.length);
    return carRoot;
  } catch (err) {
    console.warn("Failed to load car.glb - falling back to procedural car:", err);
    return buildProceduralCar();
  }
}
