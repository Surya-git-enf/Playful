// js/car.js
// createPlayerCar(scene) -> returns api with .root, .update(dt,input), .onCollision(force), .getHealth(), and ._approxSpeed

function createPlayerCar(scene) {
  const root = new BABYLON.TransformNode("player_root", scene);

  // body/cabin/hood
  const body = BABYLON.MeshBuilder.CreateBox("car_body", { width: 2.0, height: 0.45, depth: 3.6 }, scene);
  body.parent = root; body.position.y = 1.0;
  const bodyMat = new BABYLON.StandardMaterial("bodyMat", scene); bodyMat.diffuseColor = new BABYLON.Color3(0.92,0.14,0.14);
  body.material = bodyMat;

  const cabin = BABYLON.MeshBuilder.CreateBox("car_cabin", { width: 1.4, height: 0.45, depth: 1.6 }, scene);
  cabin.parent = root; cabin.position.y = 1.35; cabin.position.z = -0.18;
  const cabMat = new BABYLON.StandardMaterial("cabMat", scene); cabMat.diffuseColor = new BABYLON.Color3(0.12,0.12,0.12);
  cabin.material = cabMat;

  const hood = BABYLON.MeshBuilder.CreateBox("hood", { width: 1.9, height: 0.12, depth: 1.1 }, scene);
  hood.parent = root; hood.position.y = 1.08; hood.position.z = 0.92; hood.material = bodyMat;

  // wheels (visual)
  function makeWheel(name,x,z){
    const t = BABYLON.MeshBuilder.CreateCylinder(name+"_t", { diameter: 0.68, height: 0.36, tessellation: 24 }, scene);
    t.rotation.z = Math.PI/2;
    t.parent = root; t.position = new BABYLON.Vector3(x, 0.46, z);
    const wm = new BABYLON.StandardMaterial(name+"_m", scene); wm.diffuseColor = new BABYLON.Color3(0.06,0.06,0.06);
    t.material = wm;
    return t;
  }
  const wFL = makeWheel("wFL",-0.95,1.45);
  const wFR = makeWheel("wFR",0.95,1.45);
  const wBL = makeWheel("wBL",-0.95,-1.45);
  const wBR = makeWheel("wBR",0.95,-1.45);

  // movement state and params
  let velocity = 0, steer = 0, lateral = 0, wheelSpin = 0;
  const P = { maxSpeed:34, accel:10.0, brake:18.0, drag:0.985, steerSpeed:4.2, maxSteer:0.55, tiltFactor:0.055, pitchFactor:0.03 };

  // health
  let health = 100, damaged=false, damageTimer=0;

  const api = {
    root: root,
    _approxSpeed: 0,
    getHealth(){ return Math.max(0, Math.round(health)); },

    onCollision(force){
      const impact = Math.min(100, Math.round(Math.abs(force)*6));
      const dmg = Math.round(impact*0.6);
      health = Math.max(0, health - dmg);
      damaged = true; damageTimer = 0.6;
      // push back a bit
      const repel = new BABYLON.Vector3(Math.sin(root.rotation.y+Math.PI),0,Math.cos(root.rotation.y+Math.PI)).scale(0.6);
      root.position.addInPlace(repel);
      velocity *= 0.35;
      root.rotation.x += 0.02;
    },

    update(dt, input){
      // longitudinal
      if (input.accel) velocity += P.accel * dt;
      else if (input.brake) velocity -= P.brake * dt;
      else velocity *= Math.pow(P.drag, dt*60);
      velocity = Math.max(-8, Math.min(P.maxSpeed, velocity));

      // steering smooth
      const targetSteer = (input.left ? -1:0) + (input.right ? 1:0);
      const targetAngle = targetSteer * P.maxSteer;
      steer += (targetAngle - steer) * Math.min(1, P.steerSpeed * dt);

      // rotation based on speed
      const turnFactor = 1.0 + Math.min(3.0, Math.abs(velocity)/8.0);
      const yawDelta = steer * (velocity / P.maxSpeed) * dt * 2.4 * turnFactor;
      root.rotation.y += yawDelta;

      // lateral visual offset (drift feel)
      lateral += -steer * (Math.abs(velocity)/P.maxSpeed) * (input.drift ? 2.0 : 1.0) * dt * 4;
      lateral *= 0.94;

      // move forward in heading
      const forward = new BABYLON.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
      const moveScale = 0.128;
      const step = forward.scale(velocity * moveScale * dt * 60);
      root.position.addInPlace(step);
      const right = new BABYLON.Vector3(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y));
      root.position.addInPlace(right.scale(lateral * 0.02));

      // body tilt/pitch smoothing
      const roll = -steer * Math.min(1, Math.abs(velocity)/(P.maxSpeed*0.6)) * P.tiltFactor;
      const pitch = (input.accel ? -0.5 : (input.brake ? 0.6 : 0)) * Math.min(0.45, Math.abs(velocity)/P.maxSpeed) * P.pitchFactor;
      root.rotation.z += (roll - root.rotation.z) * Math.min(1, 6 * dt);
      root.rotation.x += (pitch - root.rotation.x) * Math.min(1, 6 * dt);

      // wheel visuals
      wheelSpin += velocity * 0.12 * dt * 60;
      wFL.rotation.x += wheelSpin; wFR.rotation.x += wheelSpin; wBL.rotation.x += wheelSpin; wBR.rotation.x += wheelSpin;
      wFL.rotation.y = -steer * 0.9; wFR.rotation.y = -steer * 0.9;

      // approx speed for HUD
      api._approxSpeed = velocity;

      // damage flash
      if (damaged) {
        damageTimer -= dt;
        body.material.emissiveColor = new BABYLON.Color3(0.45,0.08,0.08).scale(damageTimer > 0 ? 1 : 0);
        if (damageTimer <= 0) { damaged = false; body.material.emissiveColor = BABYLON.Color3.Black(); }
      }
    }
  };

  return api;
}
