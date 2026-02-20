import { InputManager } from './InputManager.js';
import { CarController } from './CarController.js';

class Game {
    constructor() {
        this.canvas = document.getElementById("renderCanvas");
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = this.createScene();
        this.input = new InputManager();
        this.car = new CarController(this.scene, this.input);
        
        this.setupCamera();
        this.createEnvironment();
        
        this.engine.runRenderLoop(() => {
            this.car.update();
            this.updateCamera();
            this.scene.render();
        });

        window.addEventListener("resize", () => this.engine.resize());
    }

    createScene() {
        const scene = new BABYLON.Scene(this.engine);
        scene.clearColor = new BABYLON.Color4(0.5, 0.8, 1, 1); // Sky blue
        new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
        return scene;
    }

    createEnvironment() {
        // Create the Mountain using a Heightmap
        // PRO TIP: Swap the URL below with your own mountain texture later
        const ground = BABYLON.MeshBuilder.CreateGroundFromHeightMap("mountain", 
            "https://assets.babylonjs.com/environments/villageheightmap.png", {
            width: 400, height: 400, subdivisions: 100, 
            minHeight: 0, maxHeight: 60, onReady: (mesh) => {
                mesh.optimize(100);
                this.car.setTerrain(mesh);
            }
        }, this.scene);

        const groundMat = new BABYLON.StandardMaterial("groundMat", this.scene);
        groundMat.diffuseColor = new BABYLON.Color3(0.2, 0.5, 0.2);
        ground.material = groundMat;
    }

    setupCamera() {
        this.camera = new BABYLON.FreeCamera("chaseCam", BABYLON.Vector3.Zero(), this.scene);
    }

    updateCamera() {
        // Smooth Follow Camera Logic
        const car = this.car.mesh;
        const offset = new BABYLON.Vector3(0, 5, -12); // Position behind and above
        const matrix = car.getWorldMatrix();
        const targetPos = BABYLON.Vector3.TransformCoordinates(offset, matrix);
        
        // Lerp (Smooth interpolation) for professional "lazy" follow feel
        this.camera.position = BABYLON.Vector3.Lerp(this.camera.position, targetPos, 0.1);
        this.camera.setTarget(car.position.add(new BABYLON.Vector3(0, 2, 0)));
    }
}

new Game();

