const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

let cameraMode = 0;

const createScene = function () {

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.6, 0.8, 1);

    const light = new BABYLON.HemisphericLight("light",
        new BABYLON.Vector3(0, 1, 0), scene);

    // ===== TERRAIN =====
    const ground = BABYLON.MeshBuilder.CreateGround("ground", {
        width: 500,
        height: 500
    }, scene);

    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.2);
    ground.material = groundMat;

    // ===== ROAD =====
    const road = BABYLON.MeshBuilder.CreateGround("road", {
        width: 10,
        height: 500
    }, scene);

    const roadMat = new BABYLON.StandardMaterial("roadMat", scene);
    roadMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    road.material = roadMat;

    // ===== CAR =====
    const car = BABYLON.MeshBuilder.CreateBox("car", {
        width: 2,
        depth: 4,
        height: 1
    }, scene);

    car.position.y = 0.6;

    const carMat = new BABYLON.StandardMaterial("carMat", scene);
    carMat.diffuseColor = new BABYLON.Color3(1, 0, 0);
    car.material = carMat;

    // ===== CAMERAS =====
    const followCamera = new BABYLON.FollowCamera("followCam",
        new BABYLON.Vector3(0, 5, -10), scene);

    followCamera.lockedTarget = car;
    followCamera.radius = 15;
    followCamera.heightOffset = 5;
    followCamera.rotationOffset = 180;

    const firstCamera = new BABYLON.UniversalCamera("firstCam",
        new BABYLON.Vector3(0, 2, 0), scene);

    firstCamera.parent = car;
    firstCamera.position = new BABYLON.Vector3(0, 1.5, 1);

    scene.activeCamera = followCamera;

    window.switchCamera = function () {
        cameraMode = (cameraMode + 1) % 2;
        scene.activeCamera = cameraMode === 0 ? followCamera : firstCamera;
    }

    // ===== CONTROLS =====
    let speed = 0;
    let steering = 0;
    let drift = false;

    document.getElementById("forward").ontouchstart = () => speed += 0.02;
    document.getElementById("backward").ontouchstart = () => speed -= 0.02;
    document.getElementById("left").ontouchstart = () => steering = 0.03;
    document.getElementById("right").ontouchstart = () => steering = -0.03;
    document.getElementById("drift").ontouchstart = () => drift = true;

    document.ontouchend = () => {
        steering = 0;
        drift = false;
    };

    // ===== GAME LOOP =====
    scene.onBeforeRenderObservable.add(() => {

        car.rotation.y += steering * speed * 2;

        car.position.x += Math.sin(car.rotation.y) * speed;
        car.position.z += Math.cos(car.rotation.y) * speed;

        if (!drift) speed *= 0.98;
        else speed *= 0.995;

        document.getElementById("speed").innerText =
            Math.abs(speed * 500).toFixed(0) + " km/h";

    });

    return scene;
};

const scene = createScene();

engine.runRenderLoop(function () {
    scene.render();
});

window.addEventListener("resize", function () {
    engine.resize();
});
