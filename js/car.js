// js/car.js
// createPlayerCar(scene) -> returns an object with:
//  .root (TransformNode), .update(dt,input), .onCollision(force), .getHealth(), and internal _approxSpeed used by HUD.

function createPlayerCar(scene) {
  // root node
  const root = new BABYLON.TransformNode("player_root", scene);

  // body parts
  const body = BABYLON.MeshBuilder.CreateBox("car_body", { width: 2.0, height: 0.45, depth: 3.6 }, scene);
  body.parent = root; body.position.y = 1.0;
  const bodyMat = new BABYLON.StandardMaterial("bodyMat", scene); bodyMat.diffuseColor = new BABYLON.Color3(0.92, 0.14, 0.14);
  body.material = bodyMat;

  const cabin = BABYLON.MeshBuilder.CreateBox("car_cabin", { width: 1.4, height: 0.45, depth: 1.6 }, scene);
  cabin.parent = root; cabin.position.y = 1.35; cabin.position.z = -0.18;
  const cabMat = new BABYLON.StandardMaterial("cabMat", scene); cabMat.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.12);
  cabin.material = cabMat;

  // hood detail
  const hood = BABYLON.MeshBuilder.CreateBox("hood", { width: 1.9, height: 0.12, depth: 1.1 }, scene);
  hood.parent = root; hood.position.y = 1.08; hood.position.z = 0.92;
  hood.material = bodyMat;

  // wheels (visual only)
  function makeWheel(name, x, z) {
    const t = BABYLON.MeshBuilder.CreateCylinder(name + "_t", { diameter: 0.68, height: 0.36, tessellation: 24 }, scene);
    t.rotation.z = Math.PI / 2;
    t.parent = root;
    t.position = new BABYLON.Vector3(x, 0.46, z);
    const wm = new BABYLON.StandardMaterial(name + "_m", scene); wm.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.06);
    t.material = wm;
    return t;
  }
  const wFL = makeWheel("wFL", -0.95, 1.45);
  const wFR = makeWheel("wFR", 0.95, 1.45);
  const wBL = makeWheel("wBL", -0.95, -1.45);
  const wBR = makeWheel("wBR", 0.95, -1.45);

  // optionally turn off shadows on mobile for perf
  try { body.receiveShadows = false; cabin.receiveShadows = false; } catch(e){}

  // Movement state + tuning parameters
  let velocity = 0;
  let steer = 0;
  let lateral = 0;
  let wheelSpin = 0;

  const P = {
    maxSpeed: 34,       // top speed units (tweak)
    accel: 10.0,        // acceleration
    brake: 18.0,        // brake force
    drag: 0.985,        // natural drag
    steerSpeed: 4.2,    // steering smoothness
    maxSteer: 0.55,     // max steering angle
    driftGrip: 0.62,    // grip when drifting (not full sim)
    tiltFactor: 0.055,  // body roll
    pitchFactor: 0.03   // body pitch (accel/brake)
  };

  // health/damage
  let health = 100;
  let damaged = false;
  let damageTimer = 0;

  // API object returned
  const api = {
    root: root,
    _approxSpeed: 0, // m/s approx for HUD (will be multiplied by 3.6)
    getHealth() { return Math.max(0, Math.round(health)); },

    // apply collision damage from external checks (main.js will call)
    onCollision(force) {
      // `force` should be relative speed magnitude or similar (small number)
      const impact = Math.min(100, Math.round(Math.abs(force) * 6));
      const dmg = Math.round(impact * 0.6);
      health = Math.max(0, health - dmg);
      damaged = true; damageTimer = 0.6;

      // small push back
      const repel = new BABYLON.Vector3(Math.sin(root.rotation.y + Math.PI), 0, Math.cos(root.rotation.y + Math.PI)).scale(0.6);
      root.position.addInPlace(repel);

      // reduce forward velocity
      velocity *= 0.35;
      // tiny camera shake via rotation x
      root.rotation.x += 0.02;
    },

    // main per-frame update
    update(dt, input) {
      // longitudinal control
      if (input.accel) velocity += P.accel * dt;
      else if (input.brake) velocity -= P.brake * dt;
      else velocity *= Math.pow(P.drag, dt * 60);

      // clamp speed
      velocity = Math.max(-8, Math.min(P.maxSpeed, velocity));

      // steering smoothing
      const targetSteer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      const targetAngle = targetSteer * P.maxSteer;
      steer += (targetAngle - steer) * Math.min(1, P.steerSpeed * dt);

      // yaw rotation based on speed
      const turnFactor = 1.0 + Math.min(3.0, Math.abs(velocity) / 8.0);
      const yawDelta = steer * (velocity / P.maxSpeed) * dt * 2.4 * turnFactor;
      root.rotation.y += yawDelta;

      // lateral visual offset for drifting feel
      lateral += -steer * (Math.abs(velocity) / P.maxSpeed) * (input.drift ? 2.0 : 1.0) * dt * 4;
      lateral *= 0.94;

      // move forward along heading
      const forward = new BABYLON.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
      const moveScale = 0.128;
      const step = forward.scale(velocity * moveScale * dt * 60);
      root.position.addInPlace(step);

      // apply small lateral offset (visual only)
      const right = new BABYLON.Vector3(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y));
      root.position.addInPlace(right.scale(lateral * 0.02));

      // body tilt/pitch smoothing
      const roll = -steer * Math.min(1, Math.abs(velocity) / (P.maxSpeed * 0.6)) * P.tiltFactor;
      const pitch = (input.accel ? -0.5 : (input.brake ? 0.6 : 0)) * Math.min(0.45, Math.abs(velocity) / P.maxSpeed) * P.pitchFactor;
      root.rotation.z += (roll - root.rotation.z) * Math.min(1, 6 * dt);
      root.rotation.x += (pitch - root.rotation.x) * Math.min(1, 6 * dt);

      // wheel visuals: spin and front wheel steer
      wheelSpin += velocity * 0.12 * dt * 60;
      wFL.rotation.x += wheelSpin; wFR.rotation.x += wheelSpin; wBL.rotation.x += wheelSpin; wBR.rotation.x += wheelSpin;
      wFL.rotation.y = -steer * 0.9; wFR.rotation.y = -steer * 0.9;

      // give approximate linear speed for HUD (simple approximation)
      api._approxSpeed = velocity;

      // damage flash handling
      if (damaged) {
        damageTimer -= dt;
        bodyMat.emissiveColor = new BABYLON.Color3(0.45, 0.08, 0.08).scale(damageTimer > 0 ? 1 : 0);
        if (damageTimer <= 0) { damaged = false; bodyMat.emissiveColor = BABYLON.Color3.Black(); }
      }
    }
  };

  return api;
}
