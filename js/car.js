// js/car.js
// createPlayerCar(scene) -> low-poly car, wheels and dust emitter. Exposes .root, .update(dt), ._approxSpeed, .getHealth()

function createPlayerCar(scene) {
  const root = new BABYLON.TransformNode("player_root", scene);

  // Low-poly car body + cabin + bumper details
  const body = BABYLON.MeshBuilder.CreateBox("car_body", { width: 2.2, height: 0.6, depth: 4.0 }, scene);
  body.parent = root; body.position.y = 1.0;
  const bodyMat = new BABYLON.StandardMaterial("car_body_mat", scene); bodyMat.diffuseColor = new BABYLON.Color3(0.9, 0.15, 0.12);
  body.material = bodyMat;

  const cabin = BABYLON.MeshBuilder.CreateBox("car_cabin", { width: 1.4, height: 0.6, depth: 1.6 }, scene);
  cabin.parent = root; cabin.position = new BABYLON.Vector3(0, 1.35, -0.3);
  cabin.material = new BABYLON.StandardMaterial("car_cab_mat", scene); cabin.material.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.08);

  // bumper detail
  const hood = BABYLON.MeshBuilder.CreateBox("car_hood", { width: 2.0, height: 0.12, depth: 1.1 }, scene);
  hood.parent = root; hood.position = new BABYLON.Vector3(0, 1.08, 1.0);
  hood.material = bodyMat;

  // Wheels (visual)
  function makeWheel(name, x, z) {
    const w = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: 0.56, height: 0.30, tessellation: 24 }, scene);
    w.rotation.z = Math.PI / 2;
    w.parent = root; w.position = new BABYLON.Vector3(x, 0.44, z);
    w.material = new BABYLON.StandardMaterial(name + "_mat", scene); w.material.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.06);
    return w;
  }
  const wFL = makeWheel("wFL", -0.92, 1.5);
  const wFR = makeWheel("wFR", 0.92, 1.5);
  const wBL = makeWheel("wBL", -0.92, -1.7);
  const wBR = makeWheel("wBR", 0.92, -1.7);

  // dust particle system for offroad effect
  const dust = new BABYLON.ParticleSystem("dust", 2000, scene);
  dust.particleTexture = new BABYLON.Texture("https://playground.babylonjs.com/textures/flare.png", scene);
  dust.emitter = new BABYLON.Vector3(0, 0.4, -2.2); // local -> we'll set world emitter every frame
  dust.minEmitBox = new BABYLON.Vector3(-0.6, 0, -0.5);
  dust.maxEmitBox = new BABYLON.Vector3(0.6, 0.2, 0.5);
  dust.color1 = new BABYLON.Color4(0.7, 0.6, 0.4, 1.0);
  dust.color2 = new BABYLON.Color4(0.5, 0.45, 0.35, 1.0);
  dust.minSize = 0.08; dust.maxSize = 0.4;
  dust.minLifeTime = 0.35; dust.maxLifeTime = 1.0;
  dust.emitRate = 0;
  dust.direction1 = new BABYLON.Vector3(-1, 0.3, 0); // thrown sideways/back
  dust.direction2 = new BABYLON.Vector3(1, 0.2, 0);
  dust.gravity = new BABYLON.Vector3(0, -1.2, 0);
  dust.minAngularSpeed = 0; dust.maxAngularSpeed = Math.PI;
  dust.minEmitPower = 0.6; dust.maxEmitPower = 1.6;
  dust.start();

  // state & params
  let velocity = 0;
  let health = 100;
  const P = {
    maxSpeed: 30, accel: 14, brake: 24, drag: 0.985,
    maxSteer: 0.65, steerResponsiveness: 6.6, tiltFactor: 0.06
  };

  const api = {
    root,
    _approxSpeed: 0,
    getHealth() { return Math.max(0, Math.round(health)); },

    update(dt) {
      const input = window.inputState || { forward:false, backward:false, left:false, right:false, steeringValue:0, drift:false };

      // acceleration/brake
      if (input.forward) velocity += P.accel * dt;
      else if (input.backward) velocity -= P.brake * dt;
      else velocity *= Math.pow(P.drag, dt*60);

      velocity = Math.max(-8, Math.min(P.maxSpeed, velocity));

      // continuous steering value preferred
      const steerVal = (typeof input.steeringValue === 'number') ? input.steeringValue : (input.right ? 1 : (input.left ? -1 : 0));
      // small smoothing: apply yaw proportional to speed and steering
      const yawDelta = steerVal * P.maxSteer * (Math.abs(velocity)/P.maxSpeed) * dt * P.steerResponsiveness;
      root.rotation.y += yawDelta;

      // move forward along heading
      const forwardVec = new BABYLON.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
      const move = forwardVec.scale(velocity * 0.12 * dt * 60);
      root.position.addInPlace(move);

      // visual lateral offset (drift feel)
      const rightVec = new BABYLON.Vector3(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y));
      root.position.addInPlace(rightVec.scale(steerVal * Math.min(0.8, Math.abs(velocity)/P.maxSpeed) * 0.02));

      // wheel spin visuals
      const spin = velocity * 0.12 * dt * 60;
      [wFL,wFR,wBL,wBR].forEach(w => w.rotation.x += spin);
      wFL.rotation.y = -steerVal * 0.9; wFR.rotation.y = -steerVal * 0.9;

      // car roll tilt
      const targetRoll = -steerVal * Math.min(1, Math.abs(velocity)/(P.maxSpeed * 0.6)) * P.tiltFactor;
      root.rotation.z += (targetRoll - root.rotation.z) * Math.min(1, 6 * dt);

      // update speed for HUD
      api._approxSpeed = velocity;

      // dust emitter world position & emission control
      const worldBack = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0, 0.4, -2.2), root.getWorldMatrix());
      dust.emitter = worldBack;
      // emit when accelerating and speed > threshold
      dust.emitRate = (input.forward && Math.abs(velocity) > 6) ? Math.min(600, 80 + Math.abs(velocity) * 18) : 0;
    }
  };

  return api;
}
