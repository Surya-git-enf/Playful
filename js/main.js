// main.js
import { createWorld } from "./world.js";

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

const createScene = () => {
    const scene = new BABYLON.Scene(engine);
    scene.enablePhysics(
        new BABYLON.Vector3(0, -9.81, 0),
        new BABYLON.CannonJSPlugin()
    );

    createWorld(scene);

    // CAR BODY
    const car = BABYLON.MeshBuilder.CreateBox(
        "car",
        { width: 2, height: 1, depth: 4 },
        scene
    );
    car.position = new BABYLON.Vector3(0, 2, -10);

    const carMat = new BABYLON.StandardMaterial("carMat", scene);
    carMat.diffuseColor = new BABYLON.Color3(0.8, 0.1, 0.1);
    car.material = carMat;

    car.physicsImpostor = new BABYLON.PhysicsImpostor(
        car,
        BABYLON.PhysicsImpostor.BoxImpostor,
        {
            mass: 120,
            friction: 1.5,
            restitution: 0
        },
        scene
    );

    // FOLLOW CAMERA
    const camera = new BABYLON.FollowCamera(
        "followCam",
        new BABYLON.Vector3(0, 6, -15),
        scene
    );
    camera.radius = 12;
    camera.heightOffset = 4;
    camera.rotationOffset = 180;
    camera.cameraAcceleration = 0.05;
    camera.maxCameraSpeed = 20;
    camera.lockedTarget = car;

    // CONTROLS
    const input = { forward: false, left: false, right: false };

    window.addEventListener("keydown", (e) => {
        if (e.key === "w") input.forward = true;
        if (e.key === "a") input.left = true;
        if (e.key === "d") input.right = true;
    });

    window.addEventListener("keyup", (e) => {
        if (e.key === "w") input.forward = false;
        if (e.key === "a") input.left = false;
        if (e.key === "d") input.right = false;
    });

    scene.onBeforeRenderObservable.add(() => {
        const force = car.getDirection(BABYLON.Axis.Z).scale(40);
        const turn = 0.03;

        if (input.forward) {
            car.physicsImpostor.applyForce(
                force,
                car.getAbsolutePosition()
            );
        }
        if (input.left) {
            car.rotation.y -= turn;
        }
        if (input.right) {
            car.rotation.y += turn;
        }
    });

    return scene;
};

const scene = createScene();

engine.runRenderLoop(() => {
    scene.render();
});

window.addEventListener("resize", () => {
    engine.resize();
});
