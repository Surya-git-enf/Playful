// js/car.js
// Real car controller for Babylon.js (GitHub Pages safe)

export class CarController {
  constructor(scene, camera, ui) {
    this.scene = scene;
    this.camera = camera;
    this.ui = ui;

    // car state
    this.carRoot = null;
    this.wheels = [];
    this.speed = 0;
    this.maxSpeed = 1.2;
    this.acceleration = 0.02;
    this.brakePower = 0.04;
    this.turnSpeed = 0.03;
    this.gravity = -0.05;
    this.verticalVelocity = 0;

    this.isLoaded = false;
    this.isFinished = false;

    this.loadCar();
  }

  loadCar() {
    BABYLON.SceneLoader.ImportMesh(
      "",
      "assets/car/",
      "car.glb",
      this.scene,
      (meshes) => {
        // root
        this.carRoot = new BABYLON.TransformNode("carRoot", this.scene);

        meshes.forEach((m) => {
          m.parent = this.carRoot;

          // detect wheels by name
          if (m.name.toLowerCase().includes("wheel")) {
            this.wheels.push(m);
          }
        });

        // scale & orientation (IMPORTANT)
        this.carRoot.scaling = new BABYLON.Vector3(0.6, 0.6, 0.6);
        this.carRoot.rotation = new BABYLON.Vector3(0, Math.PI, 0);
        this.carRoot.position = new BABYLON.Vector3(0, 3, 8);

        // camera follow
        this.camera.lockedTarget = this.carRoot;
        this.camera.radius = 10;
        this.camera.heightOffset = 3;
        this.camera.rotationOffset = 180;

        this.isLoaded = true;
        console.log("🚗 Car loaded successfully");
      }
    );
  }

  update() {
    if (!this.isLoaded || this.isFinished) return;

    // ----- INPUT -----
    const gas = this.ui.gas;
    const brake = this.ui.brake;
    const steer = this.ui.steer; // -1 left, +1 right

    // ----- SPEED -----
    if (gas) {
      this.speed += this.acceleration;
    } else if (brake) {
      this.speed -= this.brakePower;
    } else {
      this.speed *= 0.98; // friction
    }

    this.speed = BABYLON.Scalar.Clamp(
      this.speed,
      -this.maxSpeed * 0.4,
      this.maxSpeed
    );

    // ----- STEERING -----
    if (Math.abs(this.speed) > 0.01) {
      this.carRoot.rotation.y += steer * this.turnSpeed * (this.speed / this.maxSpeed);
    }

    // ----- MOVE FORWARD -----
    const forward = new BABYLON.Vector3(
      Math.sin(this.carRoot.rotation.y),
      0,
      Math.cos(this.carRoot.rotation.y)
    );

    this.carRoot.position.addInPlace(forward.scale(this.speed));

    // ----- GRAVITY -----
    this.verticalVelocity += this.gravity;
    this.carRoot.position.y += this.verticalVelocity;

    // ground clamp (road / mountain)
    if (this.carRoot.position.y < 1.5) {
      this.carRoot.position.y = 1.5;
      this.verticalVelocity = 0;
    }

    // ----- WHEEL ROTATION -----
    this.wheels.forEach((w) => {
      w.rotation.x += this.speed * 2;
    });

    // ----- FALL DETECTION -----
    if (this.carRoot.position.y < -10) {
      this.fail();
    }

    // ----- FINISH CHECK (top of mountain) -----
    if (this.carRoot.position.z < -120) {
      this.success();
    }
  }

  fail() {
    this.isFinished = true;
    this.speed = 0;
    if (this.ui.onFail) this.ui.onFail();
    console.log("❌ Car failed (fell down)");
  }

  success() {
    this.isFinished = true;
    this.speed = 0;
    if (this.ui.onSuccess) this.ui.onSuccess();
    console.log("🎉 Level complete");
  }
}
