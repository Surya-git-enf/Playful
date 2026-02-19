// js/car.js
// Procedural "Thar"-style offroad car for Babylon.js
// Usage:
//   const car = await createPlayerCar(scene);
//   camera.lockedTarget = car;     // car is a TransformNode
//   in render loop: car.update(dt);
// Exposes: car._approxSpeed (number), car.getHealth()

async function createPlayerCar(scene) {
  // root transform node for the whole vehicle
  const carRoot = new BABYLON.TransformNode("carRoot", scene);

  // --- Visual Materials ---
  const bodyMat = new BABYLON.StandardMaterial("bodyMat", scene);
  bodyMat.diffuseColor = new BABYLON.Color3(0.08, 0.3, 0.12); // deep green (Thar-ish)
  bodyMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);

  const metalMat = new BABYLON.StandardMaterial("metalMat", scene);
  metalMat.diffuseColor = new BABYLON.Color3(0.18, 0.18, 0.18);

  const glassMat = new BABYLON.StandardMaterial("glassMat", scene);
  glassMat.diffuseColor = new BABYLON.Color3(0.06, 0.12, 0.18);
  glassMat.alpha = 0.45;

  const tireMat = new BABYLON.StandardMaterial("tireMat", scene);
  tireMat.diffuseColor = new BABYLON.Color3(0.03, 0.03, 0.03);

  // --- Body parts (assembled from boxes & rounded parts) ---
  // main chassis
  const chassis = BABYLON.MeshBuilder.CreateBox("chassis", { width: 2.1, height: 0.5, depth: 4.0 }, scene);
  chassis.parent = carRoot;
  chassis.position.y = 1.0;
  chassis.material = bodyMat;

  // cabin (slightly raised)
  const cabin = BABYLON.MeshBuilder.CreateBox("cabin", { width: 1.6, height: 0.6, depth: 1.9 }, scene);
  cabin.parent = carRoot;
  cabin.position = new BABYLON.Vector3(0, 1.45, -0.25);
  cabin.material = bodyMat;

  // hood / bonnet
  const hood = BABYLON.MeshBuilder.CreateBox("hood", { width: 2.0, height: 0.28, depth: 1.05 }, scene);
  hood.parent = carRoot;
  hood.position = new BABYLON.Vector3(0, 1.12, 1.25);
  hood.material = bodyMat;

  // bumpers
  const bumperF = BABYLON.MeshBuilder.CreateBox("bumperF", { width: 2.2, height: 0.2, depth: 0.35 }, scene);
  bumperF.parent = carRoot; bumperF.position = new BABYLON.Vector3(0, 0.9, 2.05); bumperF.material = metalMat;
  const bumperR = bumperF.clone("bumperR"); bumperR.position = new BABYLON.Vector3(0, 0.9, -2.05);

  // roof cage / rollbar (simple)
  const rb1 = BABYLON.MeshBuilder.CreateBox("rb1", { width: 0.12, height: 1.1, depth: 0.12 }, scene);
  rb1.parent = carRoot; rb1.position = new BABYLON.Vector3(-0.9, 2.05, -0.25); rb1.material = metalMat;
  const rb2 = rb1.clone("rb2"); rb2.position.x = 0.9;
  const rbTop = BABYLON.MeshBuilder.CreateBox("rbTop", { width: 2.0, height: 0.12, depth: 0.12 }, scene);
  rbTop.parent = carRoot; rbTop.position = new BABYLON.Vector3(0, 2.6, -0.25); rbTop.material = metalMat;

  // windshield (glass)
  const wind = BABYLON.MeshBuilder.CreatePlane("wind", { width: 1.6, height: 0.6 }, scene);
  wind.parent = carRoot; wind.position = new BABYLON.Vector3(0, 1.50, 0.25); wind.rotation.x = -0.28; wind.material = glassMat;

  // headlights
  const lightL = BABYLON.MeshBuilder.CreateSphere("hlL", { diameter: 0.18 }, scene);
  lightL.parent = carRoot; lightL.position = new BABYLON.Vector3(-0.55, 1.05, 1.95);
  const lightR = lightL.clone("hlR"); lightR.position.x = 0.55;
  const headMat = new BABYLON.StandardMaterial("headMat", scene);
  headMat.emissiveColor = new BABYLON.Color3(1.0, 0.95, 0.7);
  lightL.material = lightR.material = headMat;

  // license / grill
  const grill = BABYLON.MeshBuilder.CreateBox("grill", { width: 1.4, height: 0.18, depth: 0.06 }, scene);
  grill.parent = carRoot; grill.position = new BABYLON.Vector3(0, 0.98, 1.78); grill.material = metalMat;

  // --- Wheels: cylinders (will spin) ---
  const wheelRadius = 0.42;
  const wheelWidth = 0.28;
  const wheelOffsetX = 0.95;
  const wheelOffsetZ = 1.45;

  function makeWheel(name, x, z) {
    const w = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: wheelRadius * 2, height: wheelWidth, tessellation: 24 }, scene);
    w.rotation.z = Math.PI / 2;
    w.parent = carRoot;
    w.position = new BABYLON.Vector3(x, 0.45, z);
    w.material = tireMat;
    // add a small hub
    const hub = BABYLON.MeshBuilder.CreateCylinder(name + "_hub", { diameter: 0.16, height: wheelWidth + 0.02 }, scene);
    hub.rotation.z = Math.PI / 2;
    hub.parent = w;
    hub.position = new BABYLON.Vector3(0, 0, 0);
    hub.material = metalMat;
    return w;
  }

  const wFL = makeWheel("wFL", -wheelOffsetX, wheelOffsetZ);
  const wFR = makeWheel("wFR", wheelOffsetX, wheelOffsetZ);
  const wBL = makeWheel("wBL", -wheelOffsetX, -wheelOffsetZ);
  const wBR = makeWheel("wBR", wheelOffsetX, -wheelOffsetZ);
  const wheelMeshes = [wFL, wFR, wBL, wBR];

  // small mudflaps (visual)
  const mudL = BABYLON.MeshBuilder.CreatePlane("mudL", { width: 0.4, height: 0.6 }, scene);
  mudL.parent = carRoot; mudL.position = new BABYLON.Vector3(-1.02, 0.6, -0.6); mudL.rotation.y = 0.08; mudL.material = metalMat;
  const mudR = mudL.clone("mudR"); mudR.position.x = 1.02; mudR.rotation.y = -0.08;

  // --- internal state & tuning ---
  let velocity = 0; // units/frame-scale
  let steer = 0;    // -1..1 target
  const params = {
    maxSpeed: 24,        // game units ~ (tune to feel)
    accel: 18.0,
    brake: 36.0,
    reverseMax: -8,
    drag: 0.985,
    maxSteerAngle: 0.6,  // radians
    steerResponsiveness: 6.0,
    suspensionTravel: 0.28,
    suspensionStiffness: 18.0,
    suspensionDamping: 10.0
  };

  let health = 100;

  // store local wheel base positions for suspension adjustments (relative to carRoot)
  const wheelLocalPos = wheelMeshes.map(w => w.position.clone());

  // helper: raycast down from world position
  function raycastDown(worldPos, max = 3.0) {
    const ray = new BABYLON.Ray(worldPos, BABYLON.Vector3.Down(), max);
    const pick = scene.pickWithRay(ray, (m) => {
      // ignore car's own children
      let p = m;
      while (p) { if (p === carRoot) return false; p = p.parent; }
      return true;
    });
    return pick && pick.hit ? pick : null;
  }

  // --- Attach API methods to carRoot so main.js can use them ---
  carRoot._approxSpeed = 0;
  carRoot.getHealth = () => Math.max(0, Math.round(health));

  // Optional: engine sound (if asset exists). Fail silently if missing.
  let engineSfx = null;
  try {
    engineSfx = new BABYLON.Sound("engine", "/assets/sounds/engine_loop.mp3", scene, null, { loop: true, volume: 0.6 });
  } catch (e) { engineSfx = null; /* ignore */ }

  // update function (call from main loop) - dt in seconds
  carRoot.update = function (dt) {
    // read inputState (expected from ui.js)
    const input = window.inputState || { forward: false, backward: false, left: false, right: false, steeringValue: 0, drift: false };
    // longitudinal input: prefer steeringValue left/right for turning, forward/back for throttle
    const forward = !!input.forward;
    const backward = !!input.backward;

    // accelerate / brake
    if (forward) velocity += params.accel * dt;
    else if (backward) velocity -= params.brake * dt;
    else velocity *= Math.pow(params.drag, dt * 60);

    // clamp speeds
    velocity = Math.max(params.reverseMax, Math.min(params.maxSpeed, velocity));
    carRoot._approxSpeed = velocity;

    // steering smoothing (target from steeringValue or discrete left/right)
    let targetSteer = 0;
    if (typeof input.steeringValue === "number") targetSteer = input.steeringValue;
    else targetSteer = (input.right ? 1 : (input.left ? -1 : 0));
    // lerp steer
    steer += (targetSteer - steer) * Math.min(1, params.steerResponsiveness * dt);

    // convert steer to yaw delta: scaled by speed (so low speed less yaw)
    const steerEffect = steer * params.maxSteerAngle * (Math.abs(velocity) / params.maxSpeed);
    carRoot.rotation.y += steerEffect * dt * 3.8; // multiplier tuned for feel

    // move forward in local forward direction
    const forwardVec = new BABYLON.Vector3(Math.sin(carRoot.rotation.y), 0, Math.cos(carRoot.rotation.y));
    const move = forwardVec.scale(velocity * dt * 0.12 * 60); // preserve earlier scale feel
    carRoot.position.addInPlace(move);

    // simple gravity / ground follow: raycast from body to sample ground and snap Y slightly above
    // sample several points (center + 4 wheels average) for smoother interpolation
    const samplePoints = [
      carRoot.position.add(new BABYLON.Vector3(0, 1.6, 0)),
      carRoot.position.add(new BABYLON.Vector3(-1.0, 1.6, 1.0)),
      carRoot.position.add(new BABYLON.Vector3(1.0, 1.6, 1.0)),
      carRoot.position.add(new BABYLON.Vector3(-1.0, 1.6, -1.0)),
      carRoot.position.add(new BABYLON.Vector3(1.0, 1.6, -1.0))
    ];
    let hitYs = [];
    samplePoints.forEach(p => {
      const pick = scene.pickWithRay(new BABYLON.Ray(p, BABYLON.Vector3.Down(), 8), (m) => {
        // ignore car itself
        let q = m;
        while (q) { if (q === carRoot) return false; q = q.parent; }
        return true;
      });
      if (pick && pick.hit) hitYs.push(pick.pickedPoint.y);
    });
    if (hitYs.length > 0) {
      const avgY = hitYs.reduce((a, b) => a + b, 0) / hitYs.length;
      // desired body height above terrain
      const desiredY = avgY + 0.95;
      // smooth step to desired height
      carRoot.position.y += (desiredY - carRoot.position.y) * Math.min(1, 6 * dt);
    } else {
      // if no ground sampled, apply soft gravity
      carRoot.position.y -= 9.8 * dt * 0.15;
    }

    // wheel suspension: raycast per wheel and adjust wheel local Y (visual only)
    for (let i = 0; i < wheelMeshes.length; i++) {
      const w = wheelMeshes[i];
      const local = wheelLocalPos[i];
      const worldPos = BABYLON.Vector3.TransformCoordinates(local, carRoot.getWorldMatrix());
      const pick = raycastDown(worldPos, 3.0);
      if (pick && pick.pickedPoint) {
        const groundY = pick.pickedPoint.y;
        const desiredWheelWorldY = groundY + params.wheelRadius;
        // compute new local Y for wheel (relative to carRoot world->local)
        const worldOffsetY = desiredWheelWorldY - carRoot.position.y;
        // convert to local offset approximation
        const newLocalY = (worldOffsetY) - (carRoot.position.y - local.y);
        // smooth set (visual only)
        w.position.y += (newLocalY - w.position.y) * Math.min(1, 10 * dt);
      } else {
        // fully extended
        w.position.y += ((local.y) - w.position.y) * Math.min(1, 8 * dt);
      }
      // wheel spin visual based on velocity
      const spin = velocity * dt * 2.6;
      w.rotation.x += spin;
      // small front wheel steer visual (rotate around Y a bit)
      if (i === 0 || i === 1) { // front wheels indexes 0 & 1 in our array
        w.rotation.y = -steer * 0.6;
      }
    }

    // body roll based on steering and speed (visual)
    const rollTarget = -steer * Math.min(1, Math.abs(velocity) / (params.maxSpeed * 0.6)) * 0.06;
    carRoot.rotation.z += (rollTarget - carRoot.rotation.z) * Math.min(1, 6 * dt);

    // engine SFX control (if loaded)
    try {
      if (engineSfx) {
        if (Math.abs(velocity) > 1.5) {
          if (!engineSfx.isPlaying) engineSfx.play();
          const rate = 0.6 + (Math.abs(velocity) / params.maxSpeed) * 1.6;
          engineSfx.setPlaybackRate(Math.max(0.5, Math.min(2.5, rate)));
        } else if (engineSfx.isPlaying) {
          engineSfx.pause();
        }
      }
    } catch (e) {}

    // clamp X so car stays near road (optional safety)
    carRoot.position.x = BABYLON.Scalar.Clamp(carRoot.position.x, -16, 16);

    // basic health decay if falling below very low Y (out-of-world)
    if (carRoot.position.y < -30) {
      health = Math.max(0, health - 10 * dt);
    }

    // expose approx speed to HUD (converted to km/h-like readout)
    carRoot._approxSpeed = velocity;
  };

  // initial spawn position (near start)
  carRoot.position = new BABYLON.Vector3(0, 3.2, 80);
  carRoot.rotation = new BABYLON.Vector3(0, 0, 0);

  // small shadow caster (optional) - performance friendly
  try {
    const shadowSphere = BABYLON.MeshBuilder.CreateSphere("shadowHelper", { diameter: 0.1 }, scene);
    shadowSphere.parent = carRoot;
    shadowSphere.position = new BABYLON.Vector3(0, 0.05, 0);
    shadowSphere.isVisible = false;
  } catch (e) {}

  return carRoot;
}
