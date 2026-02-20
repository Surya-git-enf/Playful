// main.js
// Entry point of Mount Climb game

import { createWorld } from "./world.js";
import { createCar } from "./car.js";

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

const createScene = async () => {
    const scene = new BABYLON.Scene(engine);

    // Enable physics
    const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
    const physicsPlugin = new BABYLON.CannonJSPlugin();
    scene.enablePhysics(gravityVector, physicsPlugin);

    // Create world (ground, slope, light)
    const world = createWorld(scene);

    // Create car
    const car = createCar(scene);

    // CAMERA (third person follow camera)
    const camera = new BABYLON.FollowCamera(
        "followCam",
        new BABYLON.Vector3(0, 5, -10),
        scene
    );

    camera.lockedTarget = car.body;
    camera.radius = 15;
    camera.heightOffset = 5;
    camera.rotationOffset = 180;
    camera.cameraAcceleration = 0.05;
    camera.maxCameraSpeed = 20;

    camera.attachControl(canvas, true);

    return scene;
};

const scenePromise = createScene();

engine.runRenderLoop(async () => {
    const scene = await scenePromise;
    scene.render();
});

window.addEventListener("resize", () => {
    engine.resize();
});
