// car.js — improved player car: nicer shape, smooth accel/brake/steer, damage handling
function createPlayerCar(scene) {
  const carRoot = new BABYLON.TransformNode("player", scene);

  // detailed chassis: lower body + top cabin + hood
  const body = BABYLON.MeshBuilder.CreateBox("body", {width:2.0, height:0.45, depth:3.6}, scene);
  body.parent = carRoot; body.position.y = 1.0;
  const bodyMat = new BABYLON.StandardMaterial("bodyMat", scene); bodyMat.diffuseColor = new BABYLON.Color3(0.92,0.14,0.14);
  body.material = bodyMat;

  const cabin = BABYLON.MeshBuilder.CreateBox("cabin", {width:1.4, height:0.45, depth:1.6}, scene);
  cabin.parent = carRoot; cabin.position.y = 1.35; cabin.position.z = -0.2;
  const cabMat = new BABYLON.StandardMaterial("cabMat", scene); cabMat.diffuseColor = new BABYLON.Color3(0.13,0.13,0.13);
  cabin.material = cabMat;

  // wheels (visual)
  function makeWheel(name,x,z){
    const tire = BABYLON.MeshBuilder.CreateCylinder(name+"_t", {diameter:0.68, height:0.36, tessellation:24}, scene);
    tire.rotation.z = Math.PI/2;
    tire.parent = carRoot; tire.position = new BABYLON.Vector3(x, 0.46, z);
    const mat = new BABYLON.StandardMaterial(name+"_mat", scene); mat.diffuseColor = new BABYLON.Color3(0.06,0.06,0.06);
    tire.material = mat; return tire;
  }
  const wFL = makeWheel("wFL",-0.92,1.45);
  const wFR = makeWheel("wFR",0.92,1.45);
  const wBL = makeWheel("wBL",-0.92,-1.45);
  const wBR = makeWheel("wBR",0.92,-1.45);

  // shadow caster turned off for perf on mobile
  // state
  let velocity = 0; let steer = 0; let wheelSpin = 0; let lateral = 0;
  const P = { maxSpeed: 34, accel: 10.5, brake: 20.0, drag: 0.985, steerSpeed: 4.2, maxSteer: 0.55, driftGrip: 0.62, tiltFactor: 0.055, pitchFactor:0.03 };

  // damage & health
  let health = 100;
  let damaged = false;
  let damageTimer = 0;

  const api = {
    root: carRoot,
    getHealth(){ return health; },
    update: function(dt, input) {
      // acceleration
      if (input.accel) velocity += P.accel * dt;
      else if (input.brake) velocity -= P.brake * dt;
      else velocity *= Math.pow(P.drag, dt*60);
      velocity = Math.max(-8, Math.min(P.maxSpeed, velocity));

      // steering smoothing
      const targetSteer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      const targetAngle = targetSteer * P.maxSteer;
      steer += (targetAngle - steer) * Math.min(1, P.steerSpeed * dt);

      // rotation
      const turnFactor = 1.0 + Math.min(3.0, Math.abs(velocity) / 8.0);
      const yawDelta = steer * (velocity / P.maxSpeed) * dt * 2.4 * turnFactor;
      carRoot.rotation.y += yawDelta;

      // lateral visual offset for drifting
      lateral += -steer * (Math.abs(velocity)/P.maxSpeed) * (input.drift ? 2.0 : 1.0) * dt * 4;
      lateral *= 0.94;

      // move forward
      const forward = new BABYLON.Vector3(Math.sin(carRoot.rotation.y), 0, Math.cos(carRoot.rotation.y));
      const moveScale = 0.128;
      const step = forward.scale(velocity * moveScale * dt * 60);
      carRoot.position.addInPlace(step);
      const right = new BABYLON.Vector3(Math.cos(carRoot.rotation.y), 0, -Math.sin(carRoot.rotation.y));
      carRoot.position.addInPlace(right.scale(lateral * 0.02));

      // body tilt/pitch
      const roll = -steer * Math.min(1, Math.abs(velocity)/(P.maxSpeed*0.6)) * P.tiltFactor;
      const pitch = (input.accel ? -0.5 : (input.brake ? 0.6 : 0)) * Math.min(0.45, Math.abs(velocity)/P.maxSpeed) * P.pitchFactor;
      carRoot.rotation.z += (roll - carRoot.rotation.z) * Math.min(1, 6 * dt);
      carRoot.rotation.x += (pitch - carRoot.rotation.x) * Math.min(1, 6 * dt);

      // wheel visuals
      wheelSpin += velocity * 0.12 * dt * 60;
      wFL.rotation.x += wheelSpin; wFR.rotation.x += wheelSpin; wBL.rotation.x += wheelSpin; wBR.rotation.x += wheelSpin;
      wFL.rotation.y = -steer * 0.9; wFR.rotation.y = -steer * 0.9;

      // approximate speed for HUD
      api._approxSpeed = velocity;

      // damage cooldown visual (flash)
      if (damaged) {
        damageTimer -= dt;
        const t = Math.max(0, damageTimer);
        body.material.emissiveColor = new BABYLON.Color3(0.5, 0.05, 0.05).scale(t>0?1:0);
        if (damageTimer <= 0) { damaged = false; body.material.emissiveColor = BABYLON.Color3.Black(); }
      }
    },
    onCollision: function(force) {
      // called externally when collision happens; force ~ relative speed magnitude
      const impact = Math.min(100, Math.round(force*6));
      health -= impact * 0.6;
      health = Math.max(0, health);
      damaged = true; damageTimer = 0.6;
      // bump player back a bit
      const repel = new BABYLON.Vector3(Math.sin(carRoot.rotation.y + Math.PI), 0, Math.cos(carRoot.rotation.y + Math.PI)).scale(0.6);
      carRoot.position.addInPlace(repel);
      // reduce speed
      velocity *= 0.4;
      // small camera shake: rotate slightly (visual)
      carRoot.rotation.x += 0.02;
    }
  };

  return api;
    }
