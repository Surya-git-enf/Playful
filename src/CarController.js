export class CarController {
    constructor(scene, input) {
        this.scene = scene;
        this.input = input;
        this.velocity = 0;
        this.maxSpeed = 0.5;
        this.acceleration = 0.005;
        this.friction = 0.98;
        this.gravity = 0.002;

        this.mesh = this.createPlaceholderCar();
    }

    createPlaceholderCar() {
        const body = BABYLON.MeshBuilder.CreateBox("car", {width: 2, height: 1, depth: 4}, this.scene);
        body.position.y = 1;
        const mat = new BABYLON.StandardMaterial("carMat", this.scene);
        mat.diffuseColor = new BABYLON.Color3(1, 0, 0);
        body.material = mat;
        
        // Front indicator so we know where forward is
        const nose = BABYLON.MeshBuilder.CreateBox("nose", {width: 0.5, height: 0.5, depth: 0.5}, this.scene);
        nose.parent = body;
        nose.position.z = 2;

        return body;
    }

    update() {
        // 1. Calculate Acceleration & Braking
        if (this.input.gas > 0) this.velocity += this.acceleration;
        if (this.input.brake > 0) this.velocity -= this.acceleration * 2;

        // 2. Apply Friction & Gravity (Simulating Slope)
        this.velocity *= this.friction;

        // 3. Movement & Steering
        const rotationY = this.mesh.rotation.y;
        this.mesh.rotation.y += this.input.steering * 0.05 * (this.velocity * 5);
        
        this.mesh.position.x += Math.sin(rotationY) * this.velocity;
        this.mesh.position.z += Math.cos(rotationY) * this.velocity;

        // Update Speedometer UI
        const speedKmh = Math.floor(Math.abs(this.velocity) * 200);
        document.getElementById('speedometer').innerText = `${speedKmh} km/h`;
    }
}

