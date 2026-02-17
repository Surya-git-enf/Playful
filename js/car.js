// js/car.js (improved movement & collision integration)
// createPlayerCar(scene) -> returns api { root, update(dt,input), onCollision(force), getHealth(), _approxSpeed }

function createPlayerCar(scene) {
  // root node and collider
  const root = new BABYLON.TransformNode("player_root", scene);

  // physical capsule collider (we simulate by a simple invisible box for intersectsMesh)
  const collider = BABYLON.MeshBuilder.CreateBox("playerCollider", { width: 1.6, height: 1.2, depth: 3.2 }, scene);
  collider.position.y = 0.6;
  collider.isVisible = false;
  collider.parent = root;
  collider.checkCollisions = true;

  // visible car model (body + cabin + wheels)
  const body = BABYLON.MeshBuilder.CreateBox("car_body", { width: 2.0, height: 0.45, depth: 3.6 }, scene);
  body.parent = root; body.position.y = 1.0;
  const bodyMat = new BABYLON.StandardMaterial("bodyMat", scene); bodyMat.diffuseColor = new BABYLON.Color3(0.92, 0.14, 0.14);
  body.material = bodyMat;

  const cabin = BABYLON.MeshBuilder.CreateBox("car_cabin", { width: 1.4, height: 0.45, depth: 1.6 }, scene);
  cabin.parent = root; cabin.position.y = 1.35; cabin.position.z = -0.18;
  cabin.material = new BABYLON.StandardMaterial("cabMat", scene); cabin.material.diffuseColor = new BABYLON.Color3(0.12,0.12,0.12);

  // wheels
  function makeWheel(name,x,z){
    const t = BABYLON.MeshBuilder.CreateCylinder(name+"_t", { diameter: 0.68, height: 0.36, tessellation: 24 }, scene);
    t.parent = root; t.rotation.z = Math.PI/2; t.position = new BABYLON.Vector3(x, 0.46, z);
    t.material = new BABYLON.StandardMaterial(name+"_m", scene); t.material.diffuseColor = new BABYLON.Color3(0.06,0.06,0.06);
    return t;
  }
  const wFL = makeWheel("wFL",-0.95,1.45), wFR = makeWheel("wFR",0.95,1.45), wBL = makeWheel("wBL",-0.95,-1.45), wBR = makeWheel("wBR",0.95,-1.45);

  // tuneable parameters (reduce aggressive numbers — more natural)
  let velocity = 0;
  let steer = 0;
  let lateral = 0;
  let wheelSpin = 0;
  const P = {
    maxSpeed: 28, accel: 9.0, brake: 22.0, drag: 0.986,
    steerSpeed: 6.8, maxSteer: 0.45, tiltFactor: 0.05, pitchFactor: 0.03
  };

  let health = 100, damaged=false, damageTimer=0;

  const api = {
    root, collider,
    _approxSpeed: 0,
    getHealth(){ return Math.max(0, Math.round(health)); },

    onCollision(force) {
      const impact = Math.min(100, Math.round(Math.abs(force)*6));
      const dmg = Math.round(impact * 0.8);
      health = Math.max(0, health - dmg);
      damaged = true; damageTimer = 0.6;
      velocity *= 0.25;
      // small knockback along negative forward
      root.position.addInPlace(new BABYLON.Vector3(Math.sin(root.rotation.y+Math.PI), 0, Math.cos(root.rotation.y+Math.PI)).scale(0.6));
    },

    update(dt, input) {
      // longitudinal
      if (input.accel) velocity += P.accel * dt;
      else if (input.brake) velocity -= P.brake * dt;
      else velocity *= Math.pow(P.drag, dt*60);
      velocity = Math.max(-6, Math.min(P.maxSpeed, velocity));

      // smoother steering and clamp
      const targetSteer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      const targetAngle = targetSteer * P.maxSteer;
      steer += (targetAngle - steer) * Math.min(1, P.steerSpeed * dt);

      // turning scaled by speed but clamped to avoid flip
      const yawDelta = steer * (Math.max(0.06, Math.abs(velocity) / P.maxSpeed)) * dt * 2.2;
      root.rotation.y += yawDelta;

      // move along forward vector
      const forward = new BABYLON.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
      const step = forward.scale(velocity * 0.13 * dt * 60);
      root.position.addInPlace(step);

      // lateral "slide" visual
      lateral += -steer * (Math.abs(velocity) / P.maxSpeed) * (input.drift ? 2.0 : 1.0) * dt * 4;
      lateral *= 0.94;
      const right = new BABYLON.Vector3(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y));
      root.position.addInPlace(right.scale(lateral * 0.02));

      // wheel visuals
      wheelSpin += velocity * 0.12 * dt * 60;
      wFL.rotation.x += wheelSpin; wFR.rotation.x += wheelSpin; wBL.rotation.x += wheelSpin; wBR.rotation.x += wheelSpin;
      wFL.rotation.y = -steer * 0.9; wFR.rotation.y = -steer * 0.9;

      api._approxSpeed = velocity;

      // damage flash
      if (damaged) {
        damageTimer -= dt;
        body.material.emissiveColor = new BABYLON.Color3(0.45,0.08,0.08).scale(damageTimer>0?1:0);
        if (damageTimer <= 0) { damaged = false; body.material.emissiveColor = BABYLON.Color3.Black(); }
      }
    }
  };

  // ensure collider and root use collisions for scene queries
  try { collider.checkCollisions = true; root.checkCollisions = true; } catch(e){}

  return api;
}
