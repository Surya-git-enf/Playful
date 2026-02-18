// js/car.js
// createPlayerCar(scene) -> returns api { root, update(dt), onFall(), getHealth(), _approxSpeed }

function createPlayerCar(scene) {
  const root = new BABYLON.TransformNode("player_root", scene);

  // visible body
  const body = BABYLON.MeshBuilder.CreateBox("car_body", { width: 2.0, height: 0.6, depth: 3.8 }, scene);
  body.parent = root; body.position.y = 1.0;
  const mat = new BABYLON.StandardMaterial("carMat", scene);
  mat.diffuseColor = new BABYLON.Color3(0.92,0.14,0.14); body.material = mat;

  // wheels: visual only
  function makeWheel(name,x,z) {
    const w = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: 0.56, height: 0.28, tessellation: 24 }, scene);
    w.rotation.z = Math.PI/2; w.parent = root; w.position = new BABYLON.Vector3(x, 0.42, z);
    w.material = new BABYLON.StandardMaterial(name + "_m", scene); w.material.diffuseColor = new BABYLON.Color3(0.06,0.06,0.06);
    return w;
  }
  const wFL = makeWheel("wFL",-0.86,1.4), wFR = makeWheel("wFR",0.86,1.4), wBL = makeWheel("wBL",-0.86,-1.5), wBR = makeWheel("wBR",0.86,-1.5);

  // state & tuning
  let velocity = 0; // units per second (game units)
  const P = {
    maxSpeed: 34, accel: 14.0, brake: 26.0,
    drag: 0.98, maxSteer: 0.6, steerSpeed: 6.0, tiltFactor: 0.06
  };

  let health = 100;

  // external hooks (UI will set window.inputState)
  const api = {
    root,
    _approxSpeed: 0,
    getHealth() { return Math.max(0, Math.round(health)); },
    onFall() { /* placeholder, main will handle overlay */ },

    update: function(dt) {
      const input = window.inputState || { forward:false, backward:false, left:false, right:false, steeringValue:0, drift:false };

      // longitudinal
      if (input.forward) velocity += P.accel * dt;
      else if (input.backward) velocity -= P.brake * dt;
      else velocity *= Math.pow(P.drag, dt*60);

      velocity = Math.max(-8, Math.min(P.maxSpeed, velocity));

      // steering: prefer continuous steeringValue if present
      const steerInput = (typeof input.steeringValue === "number" ? input.steeringValue : (input.right?1:(input.left?-1:0)));
      // apply smoothing to yaw
      const targetYaw = steerInput * P.maxSteer;
      // yaw change scaled by speed for realism
      const yawDelta = targetYaw * (Math.abs(velocity)/P.maxSpeed) * dt * P.steerSpeed;
      root.rotation.y += yawDelta;

      // move along heading
      const forward = new BABYLON.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
      // scale factor tuned for visual feel (units->movement)
      const move = forward.scale(velocity * 0.12 * dt * 60);
      root.position.addInPlace(move);

      // lateral sway for visuals (drift feel)
      const lateral = steerInput * Math.min(0.8, Math.abs(velocity)/P.maxSpeed);
      const right = new BABYLON.Vector3(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y));
      root.position.addInPlace(right.scale(lateral * 0.02));

      // wheel spin visuals
      const spin = velocity * 0.12 * dt * 60;
      [wFL,wFR,wBL,wBR].forEach(w => w.rotation.x += spin);

      // body tilt based on steering & speed, smooth blend
      const targetRoll = -steerInput * Math.min(1, Math.abs(velocity)/(P.maxSpeed*0.6)) * P.tiltFactor;
      root.rotation.z += (targetRoll - root.rotation.z) * Math.min(1, 6 * dt);

      api._approxSpeed = velocity;
    }
  };

  return api;
}
