export class CarController {
    constructor(scene, input) {
        this.scene = scene;
        this.input = input;
        this.mesh = this.createCarBody();
        this.terrain = null;
        
        // Physics constants
        this.velocity = 0;
        this.rotation = 0;
        this.config = {
            accel: 0.008,
            brake: 0.02,
            friction: 0.97,
            maxSpeed: 0.8,
            turnSpeed: 0.04
        };
    }

    createCarBody() {
        const root = new BABYLON.TransformNode("carRoot");
        const body = BABYLON.MeshBuilder.CreateBox("body", {width: 2, height: 0.8, depth: 4}, this.scene);
        body.parent = root;
        body.position.y = 0.5;
        
        // Front "Nose" to see direction
        const nose = BABYLON.MeshBuilder.CreateBox("nose", {size: 0.5}, this.scene);
        nose.parent = body;
        nose.position.z = 2;
        
        return root;
    }

    setTerrain(mesh) { this.terrain = mesh; }

    update() {
        if (!this.terrain) return;

        // 1. Calculate Throttle
        if (this.input.gas > 0) this.velocity += this.config.accel;
        if (this.input.brake > 0) this.velocity -= this.config.brake;

        // 2. Slope & Friction
        this.velocity *= this.config.friction;

        // 3. Apply Movement
        this.rotation += this.input.steering * this.config.turnSpeed * (this.velocity * 2);
        this.mesh.rotation.y = this.rotation;

        const moveX = Math.sin(this.rotation) * this.velocity;
        const moveZ = Math.cos(this.rotation) * this.velocity;
        this.mesh.position.x += moveX;
        this.mesh.position.z += moveZ;

        // 4. Raycast for Ground Height & Tilting
        const ray = new BABYLON.Ray(
            new BABYLON.Vector3(this.mesh.position.x, 100, this.mesh.position.z),
            new BABYLON.Vector3(0, -1, 0), 200
        );
        const hit = this.scene.pickWithRay(ray, (m) => m === this.terrain);

        if (hit.hit) {
            // Snap to ground + car height
            this.mesh.position.y = hit.pickedPoint.y;
            
            // Professional Touch: Tilt car to match ground normal
            const normal = hit.getNormal(true);
            this.mesh.up = BABYLON.Vector3.Lerp(this.mesh.up, normal, 0.1);
        }

        // 5. Update UI
        const speed = Math.round(this.velocity * 300);
        document.getElementById('speedometer').innerText = `${Math.abs(speed)} km/h`;
        document.getElementById('altitude').innerText = `ALT: ${Math.round(this.mesh.position.y)}m`;
    }
}
