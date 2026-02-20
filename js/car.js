// js/car.js
// Exports createPlayerCar(scene, useGLB) -> returns a car root with update(dt) and _approxSpeed

export async function createPlayerCar(scene, useGLB = true) {
  // Helper: sample ground Y (raycast)
  function sampleGroundY(worldPos) {
    const r = new BABYLON.Ray(worldPos.add(new BABYLON.Vector3(0, 6, 0)), new BABYLON.Vector3(0, -1, 0), 30);
    const pick = scene.pickWithRay(r, (m) => true);
    if (pick && pick.hit) return pick.pickedPoint.y;
    return null;
  }

  // Attempt to load GLB if requested
  if (useGLB) {
    try {
      // Import all meshes from assets/car/car.glb
      const rootUrl = "assets/car/";
      const filename = "car.glb";
      const result = await new Promise((resolve, reject) => {
        BABYLON.SceneLoader.ImportMesh("", rootUrl, filename, scene, (meshes, particleSystems, skeletons, animationGroups) => {
          resolve({ meshes, skeletons, animationGroups });
        }, null, (scene, message) => {
          reject(new Error("Failed to load GLB: " + message));
        });
      });

      // Find the main car root: prefer a node named 'car' or use a new container
      let carRoot = new BABYLON.TransformNode("carRoot", scene);
      // Parent all imported meshes under carRoot (but avoid re-parenting lights/camera)
      result.meshes.forEach(m => {
        if (m && m.parent === null && (m instanceof BABYLON.Mesh)) {
          // If mesh name is something like '__root__' or 'Car', prefer that as root
        }
        // Attach mesh to carRoot
        try { m.setParent(carRoot); } catch (e) {}
      });

      // Optional: try to find wheel meshes by common names
      const wheelNames = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr", "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR", "wheelFL", "wheelFR", "wheelRL", "wheelRR"];
      const wheels = [];
      result.meshes.forEach(m => {
        const lname = (m.name || "").toLowerCase();
        for (const wn of wheelNames) {
          if (lname.indexOf(wn.toLowerCase()) !== -1 || lname.indexOf("wheel") !== -1) {
            wheels.push(m);
            break;
          }
        }
      });

      // Fallback: if no wheel meshes found, pick meshes with 'wheel' substring
      if (wheels.length === 0) {
        result.meshes.forEach(m => {
          if ((m.name || "").toLowerCase().includes("wheel")) wheels.push(m);
        });
      }

      // Position & scale fix (if model is too big/small). Adjust as needed.
      carRoot.scaling = new BABYLON.Vector3(1, 1, 1);
      carRoot.position = new BABYLON.Vector3(0, 2.6, 6); // start location (overrides as needed)

      // Add necessary runtime fields & update()
      carRoot._approxSpeed = 0;
      let velocity = 0;
      let steer = 0;
      const params = { maxSpeed: 26, reverseMax: -8, accel: 16, brake: 36, drag: 0.986, maxSteer: 0.82, steerResponse: 7.5 };

      carRoot.update = function (dt, world) {
        const input = window.inputState || {};
        const forward = !!input.accelerate;
        const backward = !!input.brake;
        const steerVal = (typeof input.steeringValue === "number") ? input.steeringValue : (input.steer || 0);

        if (forward) velocity += params.accel * dt;
        else if (backward) velocity -= params.brake * dt;
        else velocity *= Math.pow(params.drag, dt * 60);

        velocity = Math.max(params.reverseMax, Math.min(params.maxSpeed, velocity));
        carRoot._approxSpeed = velocity;

        steer += (steerVal - steer) * Math.min(1, params.steerResponse * dt);
        const yawDelta = steer * params.maxSteer * (Math.abs(velocity) / params.maxSpeed);
        carRoot.rotation.y += yawDelta * dt * 4.5;

        // move forward in world space based on rotation
        const fwd = new BABYLON.Vector3(Math.sin(carRoot.rotation.y), 0, Math.cos(carRoot.rotation.y));
        carRoot.position.addInPlace(fwd.scale(velocity * dt * 0.12 * 60));

        // sample ground and adjust height/pitch
        const centerY = sampleGroundY(carRoot.position);
        const ahead = carRoot.position.add(fwd.scale(1.8));
        const aheadY = sampleGroundY(ahead);
        if (centerY !== null && aheadY !== null) {
          const rideHeight = 0.95;
          const desiredY = centerY + rideHeight;
          carRoot.position.y += (desiredY - carRoot.position.y) * Math.min(1, 8 * dt);
          const dz = aheadY - centerY;
          const pitch = Math.atan2(dz, 1.8);
          carRoot.rotation.x += (pitch - carRoot.rotation.x) * Math.min(1, 6 * dt);
        } else {
          carRoot.position.y -= 9.8 * dt * 0.04;
        }

        // rotate wheels visually if present
        wheels.forEach((w) => {
          w.rotation.x += velocity * dt * 2.6;
          // optionally adjust front wheel yaw (if you know that w is front wheel)
        });

        // simple fall detection
        if (carRoot.position.y < -20) { if (window.UI && window.UI.showRetry) window.UI.showRetry(); }
      };

      return carRoot;
    } catch (err) {
      console.warn("GLB load failed, falling back to procedural car:", err);
      // fallthrough to procedural
    }
  }

  // Procedural fallback car (jeep-like)
  const root = new BABYLON.TransformNode("fallbackCar", scene);
  const body = BABYLON.MeshBuilder.CreateBox("fbBody", { width: 2, height: 0.6, depth: 3 }, scene);
  body.parent = root; body.position.y = 0.9;
  const mat = new BABYLON.StandardMaterial("fbMat", scene); mat.diffuseColor = new BABYLON.Color3(0.8, 0.1, 0.1);
  body.material = mat;

  const wheels = [];
  [[-0.9, 1.2], [0.9, 1.2], [-0.9, -1.2], [0.9, -1.2]].forEach((p, i) => {
    const w = BABYLON.MeshBuilder.CreateCylinder("wfb" + i, { diameter: 0.6, height: 0.28 }, scene);
    w.rotation.z = Math.PI / 2; w.parent = root; w.position = new BABYLON.Vector3(p[0], 0.45, p[1]);
    wheels.push(w);
  });

  root.position.set(0, 2.6, 6);
  root._approxSpeed = 0;
  let velocity = 0;
  let steer = 0;

  root.update = function (dt) {
    const input = window.inputState || {};
    const forward = !!input.accelerate;
    const backward = !!input.brake;
    const steerVal = (typeof input.steeringValue === "number") ? input.steeringValue : (input.steer || 0);

    if (forward) velocity += 14 * dt;
    else if (backward) velocity -= 36 * dt;
    else velocity *= Math.pow(0.985, dt * 60);
    velocity = Math.max(-6, Math.min(22, velocity));
    root._approxSpeed = velocity;

    steer += (steerVal - steer) * Math.min(1, 7.5 * dt);
    root.rotation.y += steer * 0.82 * (Math.abs(velocity) / 22) * dt * 4.5;

    const fwd = new BABYLON.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
    root.position.addInPlace(fwd.scale(velocity * dt * 0.12 * 60));

    wheels.forEach(w => w.rotation.x += velocity * dt * 2.5);

    // ground sampling
    const centerY = sampleGroundY(root.position);
    if (centerY !== null) {
      const desiredY = centerY + 0.95;
      root.position.y += (desiredY - root.position.y) * Math.min(1, 8 * dt);
    } else root.position.y -= 9.8 * dt * 0.04;

    if (root.position.y < -20) { if (window.UI && window.UI.showRetry) window.UI.showRetry(); }
  };

  return root;
}
