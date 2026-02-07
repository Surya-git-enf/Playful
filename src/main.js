// src/main.js
// Minimal 3D car demo using Babylon.js + Cannon.js physics
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

  const createScene = () => {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.12, 0.16, 0.2);

    // Physics
    const gravity = new BABYLON.Vector3(0, -9.81, 0);
    const physicsPlugin = new BABYLON.CannonJSPlugin(true, 10, CANNON);
    scene.enablePhysics(gravity, physicsPlugin);

    // Camera
    const camera = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0, 5, -12), scene);
    camera.attachControl(canvas, true);
    camera.speed = 0.5;
    camera.minZ = 0.1;

    // Light
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0.3, 1, 0.3), scene);
    light.intensity = 0.95;
    const dirLight = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.5, -1.0, -0.5), scene);
    dirLight.position = new BABYLON.Vector3(30, 40, 30);

    // Ground (long)
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 400, height: 60 }, scene);
    ground.position.y = -1;
    ground.receiveShadows = true;
    ground.material = new BABYLON.StandardMaterial("groundMat", scene);
    ground.material.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.2);

    ground.physicsImpostor = new BABYLON.PhysicsImpostor(
      ground,
      BABYLON.PhysicsImpostor.BoxImpostor,
      { mass: 0, friction: 1.0, restitution: 0.0 },
      scene
    );

    // Simple procedural ramps / obstacles
    const createRamp = (x, z, rotX = -0.4, w = 6, h = 1, d = 10) => {
      const ramp = BABYLON.MeshBuilder.CreateBox("ramp", { width: w, height: h, depth: d }, scene);
      ramp.position = new BABYLON.Vector3(x, 0, z);
      ramp.rotation.x = rotX;
      ramp.material = new BABYLON.StandardMaterial("rampMat", scene);
      ramp.material.diffuseColor = new BABYLON.Color3(0.45, 0.25, 0.1);
      ramp.physicsImpostor = new BABYLON.PhysicsImpostor(
        ramp,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 1.0, restitution: 0 },
        scene
      );
      return ramp;
    };

    // place several ramps down the z axis
    for (let i = 0; i < 12; i++) {
      const z = i * 18 + 10;
      const x = (i % 2 === 0) ? -6 : 6;
      const rot = (i % 3 === 0) ? -0.6 : -0.35;
      createRamp(x, z, rot, 8, 1, 10);
    }

    // Some obstacles (boxes)
    for (let i = 0; i < 12; i++) {
      const box = BABYLON.MeshBuilder.CreateBox("obs" + i, { size: 2 }, scene);
      box.position = new BABYLON.Vector3((i % 2 === 0) ? -2 : 2, 1, i * 16 + 20);
      box.material = new BABYLON.StandardMaterial("obsMat", scene);
      box.material.diffuseColor = new BABYLON.Color3(0.6, 0.1, 0.1);
      box.physicsImpostor = new BABYLON.PhysicsImpostor(
        box,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 1, restitution: 0 },
        scene
      );
    }

    // Car (simple chassis box)
    const chassis = BABYLON.MeshBuilder.CreateBox("car", { width: 2.2, height: 0.8, depth: 4 }, scene);
    chassis.position = new BABYLON.Vector3(0, 2, -2);
    chassis.rotationQuaternion = null;
    chassis.material = new BABYLON.StandardMaterial("carMat", scene);
    chassis.material.diffuseColor = new BABYLON.Color3(0.1, 0.6, 0.9);
    chassis.receiveShadows = true;

    chassis.physicsImpostor = new BABYLON.PhysicsImpostor(
      chassis,
      BABYLON.PhysicsImpostor.BoxImpostor,
      { mass: 150, friction: 0.5, restitution: 0.0 },
      scene
    );

    // simple visual wheels (no separate physics, attached to chassis visually)
    const makeWheel = (name, x, z) => {
      const wheel = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: 0.9, height: 0.5, tessellation: 16 }, scene);
      wheel.rotation.z = Math.PI / 2;
      wheel.material = new BABYLON.StandardMaterial("wheelMat", scene);
      wheel.material.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.09);
      wheel.position = new BABYLON.Vector3(x, 1.05, z);
      return wheel;
    };

    const wheelFL = makeWheel("wfl", -0.9, 1.4);
    const wheelFR = makeWheel("wfr", 0.9, 1.4);
    const wheelBL = makeWheel("wbl", -0.9, -1.4);
    const wheelBR = makeWheel("wbr", 0.9, -1.4);

    // Shadow generator
    const shadowGen = new BABYLON.ShadowGenerator(1024, dirLight);
    shadowGen.addShadowCaster(chassis);
    [wheelFL, wheelFR, wheelBL, wheelBR].forEach(w => shadowGen.addShadowCaster(w));
    shadowGen.useBlurExponentialShadowMap = true;

    // Controls
    const input = {
      left: false,
      right: false,
      forward: false,
      brake: false
    };

    // Keyboard events
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
      if (e.key === 'ArrowUp' || e.key === 'w') input.forward = true;
      if (e.key === 'ArrowDown' || e.key === 's') input.brake = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
      if (e.key === 'ArrowUp' || e.key === 'w') input.forward = false;
      if (e.key === 'ArrowDown' || e.key === 's') input.brake = false;
    });

    // Touch UI
    document.getElementById('leftBtn').addEventListener('touchstart', (e) => { input.left = true; e.preventDefault(); });
    document.getElementById('leftBtn').addEventListener('touchend', () => { input.left = false; });

    document.getElementById('rightBtn').addEventListener('touchstart', (e) => { input.right = true; e.preventDefault(); });
    document.getElementById('rightBtn').addEventListener('touchend', () => { input.right = false; });

    document.getElementById('accBtn').addEventListener('touchstart', (e) => { input.forward = true; e.preventDefault(); });
    document.getElementById('accBtn').addEventListener('touchend', () => { input.forward = false; });

    document.getElementById('brakeBtn').addEventListener('touchstart', (e) => { input.brake = true; e.preventDefault(); });
    document.getElementById('brakeBtn').addEventListener('touchend', () => { input.brake = false; });

    // Game params
    let speed = 0;
    const maxSpeed = 25;
    const accel = 0.6;
    const brakePower = 2.0;
    const steerSpeed = 0.03;

    // Simple helper to get forward vector of chassis
    function getForwardVector(mesh) {
      // Babylon uses rotation.y for yaw
      const y = mesh.rotation.y || 0;
      return new BABYLON.Vector3(Math.sin(y), 0, Math.cos(y)).normalize();
    }

    // Keep sync visual wheels with chassis
    scene.onBeforeRenderObservable.add(() => {
      // Smoothly position wheels relative to chassis
      const basePos = chassis.position;
      wheelFL.position = basePos.add(new BABYLON.Vector3(-0.9, -0.7, 1.4).rotateByQuaternionToRef(chassis.rotationQuaternion || BABYLON.Quaternion.Identity(), new BABYLON.Vector3()));
      wheelFR.position = basePos.add(new BABYLON.Vector3(0.9, -0.7, 1.4).rotateByQuaternionToRef(chassis.rotationQuaternion || BABYLON.Quaternion.Identity(), new BABYLON.Vector3()));
      wheelBL.position = basePos.add(new BABYLON.Vector3(-0.9, -0.7, -1.4).rotateByQuaternionToRef(chassis.rotationQuaternion || BABYLON.Quaternion.Identity(), new BABYLON.Vector3()));
      wheelBR.position = basePos.add(new BABYLON.Vector3(0.9, -0.7, -1.4).rotateByQuaternionToRef(chassis.rotationQuaternion || BABYLON.Quaternion.Identity(), new BABYLON.Vector3()));
    });

    // Main update loop: apply simple vehicle behavior by controlling linear velocity and orientation
    scene.onBeforeRenderObservable.add(() => {
      // Get current linear velocity
      const lv = chassis.physicsImpostor.getLinearVelocity() || new BABYLON.Vector3(0,0,0);

      // Steering: rotate chassis (approx)
      if (input.left) {
        chassis.rotation.y -= steerSpeed;
      }
      if (input.right) {
        chassis.rotation.y += steerSpeed;
      }

      // Forward/backward
      const forward = getForwardVector(chassis);
      const currentForwardSpeed = BABYLON.Vector3.Dot(lv, forward);

      if (input.forward) {
        // accelerate
        let target = Math.min(maxSpeed, currentForwardSpeed + accel);
        // set linear velocity along forward direction but keep Y velocity
        const newVel = forward.scale(target);
        newVel.y = lv.y; // preserve vertical velocity (gravity)
        chassis.physicsImpostor.setLinearVelocity(newVel);
      } else if (input.brake) {
        // braking -> reduce speed
        const target = currentForwardSpeed * 0.9;
        const newVel = forward.scale(target);
        newVel.y = lv.y;
        chassis.physicsImpostor.setLinearVelocity(newVel);
      } else {
        // natural drag
        const target = currentForwardSpeed * 0.995;
        const newVel = forward.scale(target);
        newVel.y = lv.y;
        chassis.physicsImpostor.setLinearVelocity(newVel);
      }

      // camera follow: behind and above the car
      const camTarget = chassis.position.add(new BABYLON.Vector3(0, 1.2, 0));
      const backward = getForwardVector(chassis).scale(-8);
      const desiredCamPos = camTarget.add(backward).add(new BABYLON.Vector3(0, 3.2, 0));
      // smooth camera interpolation
      camera.position = BABYLON.Vector3.Lerp(camera.position, desiredCamPos, 0.12);
      camera.setTarget(BABYLON.Vector3.Lerp(camera.getTarget(), camTarget, 0.16));
    });

    // Simple helper: reset car if fallen under world
    scene.registerBeforeRender(() => {
      if (chassis.position.y < -30) {
        chassis.physicsImpostor.setAngularVelocity(BABYLON.Vector3.Zero());
        chassis.physicsImpostor.setLinearVelocity(new BABYLON.Vector3(0,0,0));
        chassis.position = new BABYLON.Vector3(0, 4, 0);
        chassis.rotation = new BABYLON.Vector3(0,0,0);
      }
    });

    return scene;
  };

  const scene = createScene();
  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener('resize', function () {
    engine.resize();
  });
});
