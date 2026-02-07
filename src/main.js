import * as BABYLON from "https://cdn.babylonjs.com/babylon.js";

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

const createScene = () => {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.6, 0.8, 1);

    // CAMERA
    const camera = new BABYLON.FollowCamera(
        "camera",
        new BABYLON.Vector3(0, 5, -10),
        scene
    );
    camera.radius = 15;
    camera.heightOffset = 5;
    camera.rotationOffset = 180;
    camera.attachControl(canvas, true);

    // LIGHT
    const light = new BABYLON.HemisphericLight(
        "light",
        new BABYLON.Vector3(0, 1, 0),
        scene
    );

    // GROUND
    const ground = BABYLON.MeshBuilder.CreateGround(
        "ground",
        { width: 200, height: 20 },
        scene
    );
    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.3, 0.6, 0.3);
    ground.material = groundMat;

    // CAR BODY
    const car = BABYLON.MeshBuilder.CreateBox(
        "car",
        { width: 2, height: 1, depth: 4 },
        scene
    );
    car.position.y = 0.6;

    const carMat = new BABYLON.StandardMaterial("carMat", scene);
    carMat.diffuseColor = new BABYLON.Color3(1, 0, 0);
    car.material = carMat;

    camera.lockedTarget = car;

    // CONTROLS
    let speed = 0;
    scene.onBeforeRenderObservable.add(() => {
        if (keys["ArrowUp"]) speed += 0.02;
        if (keys["ArrowDown"]) speed -= 0.02;
        if (keys["ArrowLeft"]) car.rotation.y -= 0.03;
        if (keys["ArrowRight"]) car.rotation.y += 0.03;

        speed *= 0.98;

        car.position.x += Math.sin(car.rotation.y) * speed;
        car.position.z += Math.cos(car.rotation.y) * speed;
    });

    return scene;
};

const keys = {};
window.addEventListener("keydown", e => keys[e.key] = true);
window.addEventListener("keyup", e => keys[e.key] = false);

const scene = createScene();
engine.runRenderLoop(() => scene.render());

window.addEventListener("resize", () => engine.resize());
