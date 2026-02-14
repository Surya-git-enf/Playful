// src/objects/Car.js
export class Car {
  constructor(scene, start = { x:0, z:0 }) {
    this.scene = scene;
    this.root = new BABYLON.TransformNode('playerCar', scene);

    this.chassis = BABYLON.MeshBuilder.CreateBox('chassis',{width:2.2, height:0.6, depth:4.0}, scene);
    this.chassis.parent = this.root;
    this.chassis.position.y = 1.1;
    this.root.position = new BABYLON.Vector3(start.x, 0, start.z);

    this.chassis.material = new BABYLON.StandardMaterial('carMat', scene);
    this.chassis.material.diffuseColor = BABYLON.Color3.FromHexString('#d94242');

    this.wheels = [];
    const wheelOffsets = [
      {x:-0.95, z:1.75}, {x:0.95, z:1.75},
      {x:-0.95, z:-1.75}, {x:0.95, z:-1.75}
    ];
    for (let i=0;i<4;i++){
      const w = BABYLON.MeshBuilder.CreateCylinder('wheel'+i, {diameter:0.68, height:0.36, tessellation:24}, scene);
      w.parent = this.root; w.rotation.z = Math.PI/2;
      w.position = new BABYLON.Vector3(wheelOffsets[i].x, 0.46, wheelOffsets[i].z);
      this.wheels.push(w);
    }

    if (scene.isPhysicsEnabled()) {
      this.chassis.physicsImpostor = new BABYLON.PhysicsImpostor(this.chassis, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 350, friction: 0.6, restitution: 0.1 }, scene);
    }

    this.steerAngle = 0;
    this.speed = 0;
    this.maxEngineForce = 9000;
  }

  applyControls(input, dt) {
    if (this.chassis.physicsImpostor && this.chassis.physicsImpostor.getLinearVelocity) {
      const forward = new BABYLON.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
      const force = forward.scale(input.accel * this.maxEngineForce);
      this.chassis.physicsImpostor.applyForce(force, this.chassis.getAbsolutePosition());
      if (input.brake) {
        const brakeF = forward.scale(-input.brake * this.maxEngineForce * 1.8);
        this.chassis.physicsImpostor.applyForce(brakeF, this.chassis.getAbsolutePosition());
      }
      // steering - simple angular velocity
      const turn = input.steer * 0.5;
      const angVel = new BABYLON.Vector3(0, turn * (input.accel ? 1.0 : 0.5), 0);
      try { this.chassis.physicsImpostor.setAngularVelocity(angVel); } catch(e){}
    } else {
      // fallback kinematic
      const accel = input.accel ? 10 : 0;
      this.speed += (accel - (this.speed * 0.4)) * dt;
      this.root.rotation.y += input.steer * this.speed * dt * 0.08;
      this.root.position.x += Math.sin(this.root.rotation.y) * this.speed * dt;
      this.root.position.z += Math.cos(this.root.rotation.y) * this.speed * dt;
    }
  }

  update(dt, input) {
    this.applyControls(input, dt);
    let lv = new BABYLON.Vector3.Zero();
    if (this.chassis.physicsImpostor && this.chassis.physicsImpostor.getLinearVelocity) {
      lv = this.chassis.physicsImpostor.getLinearVelocity() || lv;
    }
    const forwardSpeed = lv.length();
    const spin = forwardSpeed * dt * 6;
    for (const w of this.wheels) { w.rotation.x += spin; }
  }
}
