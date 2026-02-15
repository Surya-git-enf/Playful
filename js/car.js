// car.js
function createPlayerCar(scene) {
  const carRoot = new BABYLON.TransformNode("player", scene);

  // chassis
  const chassis = BABYLON.MeshBuilder.CreateBox("chassis", {width:2.0, height:0.6, depth:4.0}, scene);
  chassis.parent = carRoot;
  chassis.position.y = 1.05;
  const mat = new BABYLON.StandardMaterial("carMat", scene);
  mat.diffuseColor = new BABYLON.Color3(0.87, 0.14, 0.14);
  chassis.material = mat;
  chassis.receiveShadows = true;

  // cabin
  const cabin = BABYLON.MeshBuilder.CreateBox("cabin", {width:1.4, height:0.5, depth:1.8}, scene);
  cabin.parent = carRoot;
  cabin.position.y = 1.45;
  cabin.position.z = -0.12;
  const cm = new BABYLON.StandardMaterial("cabMat", scene); cm.diffuseColor = new BABYLON.Color3(0.12,0.12,0.12);
  cabin.material = cm;

  // wheels
  function makeWheel(name,x,z){
    const tire = BABYLON.MeshBuilder.CreateCylinder(name+"_t", {diameter:0.68, height:0.36, tessellation:24}, scene);
    tire.rotation.z = Math.PI/2;
    tire.parent = carRoot;
    tire.position = new BABYLON.Vector3(x, 0.46, z);
    const wmat = new BABYLON.StandardMaterial(name+"_m", scene); wmat.diffuseColor = new BABYLON.Color3(0.06,0.06,0.06);
    tire.material = wmat;
    return tire;
  }
  const wFL = makeWheel("FL",-0.9,1.55);
  const wFR = makeWheel("FR",0.9,1.55);
  const wBL = makeWheel("BL",-0.9,-1.55);
  const wBR = makeWheel("BR",0.9,-1.55);

  // state
  let velocity = 0, steer = 0, wheelSpin = 0, lateral = 0;
  const P = { maxSpeed:36, accel:12, brake:22, drag:0.985, steerSpeed:4.5, maxSteer:0.55, driftGrip:0.62, grip:6.0, tiltFactor:0.055, pitchFactor:0.03 };

  // control interface
  const api = {
    root: carRoot,
    update: function(dt, input){
      // longitudinal
      if(input.accel) velocity += P.accel * dt;
      else if(input.brake) velocity -= P.brake * dt;
      else velocity *= Math.pow(P.drag, dt*60);
      velocity = Math.max(-6, Math.min(P.maxSpeed, velocity));

      // steering smoothing
      const targetSteer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      const targetAngle = targetSteer * P.maxSteer;
      steer += (targetAngle - steer) * Math.min(1, P.steerSpeed * dt);

      // rotation
      const turnFactor = 1.0 + Math.min(3.0, Math.abs(velocity)/8.0);
      const yawDelta = steer * (velocity / P.maxSpeed) * dt * 2.6 * turnFactor;
      carRoot.rotation.y += yawDelta;

      // lateral visual offset
      lateral += -steer * (Math.abs(velocity)/P.maxSpeed) * (input.drift ? 2.6 : 1.2) * dt * 6;
      lateral *= 0.94;

      // movement
      const forward = new BABYLON.Vector3(Math.sin(carRoot.rotation.y), 0, Math.cos(carRoot.rotation.y));
      const moveScale = 0.13;
      const step = forward.scale(velocity * moveScale * dt * 60);
      carRoot.position.addInPlace(step);
      const right = new BABYLON.Vector3(Math.cos(carRoot.rotation.y), 0, -Math.sin(carRoot.rotation.y));
      carRoot.position.addInPlace(right.scale(lateral * 0.02));

      // clamp to lane width in main loop optionally

      // body tilt/pitch
      const roll = -steer * Math.min(1, Math.abs(velocity)/(P.maxSpeed*0.6)) * P.tiltFactor;
      const pitch = (input.accel ? -0.5 : (input.brake ? 0.6 : 0)) * Math.min(0.45, Math.abs(velocity)/P.maxSpeed) * P.pitchFactor;
      carRoot.rotation.z += (roll - carRoot.rotation.z) * Math.min(1, 6 * dt);
      carRoot.rotation.x += (pitch - carRoot.rotation.x) * Math.min(1, 6 * dt);

      // wheel visuals
      wheelSpin += velocity * 0.12 * dt * 60;
      wFL.rotation.x += wheelSpin; wFR.rotation.x += wheelSpin; wBL.rotation.x += wheelSpin; wBR.rotation.x += wheelSpin;
      wFL.rotation.y = -steer * 0.9; wFR.rotation.y = -steer * 0.9;
    }
  };
  return api;
}
