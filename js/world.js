// ===============================
// BABYLON ENGINE SETUP
// ===============================
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

// ===============================
// CREATE SCENE
// ===============================
const createScene = () => {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.6, 0.8, 1); // Sky blue

    // ===============================
    // PHYSICS
    // ===============================
    const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
    const physicsPlugin = new BABYLON.CannonJSPlugin();
    scene.enablePhysics(gravityVector, physicsPlugin);

    // ===============================
    // CAMERA (DR Driving Style)
    // ===============================
    const camera = new BABYLON.FollowCamera(
        "followCam",
        new BABYLON.Vector3(0, 5, -10),
        scene
    );
    camera.radius = 12;
    camera.heightOffset = 4;
    camera.rotationOffset = 180;
    camera.cameraAcceleration = 0.05;
    camera.maxCameraSpeed = 10;

    // ===============================
    // LIGHTS (NO FLICKER)
    // ===============================
    const hemiLight = new BABYLON.HemisphericLight(
        "hemi",
        new BABYLON.Vector3(0, 1, 0),
        scene
    );
    hemiLight.intensity = 0.9;

    const sunLight = new BABYLON.DirectionalLight(
        "sun",
        new BABYLON.Vector3(-0.3, -1, -0.3),
        scene
    );
    sunLight.position = new BABYLON.Vector3(20, 40, 20);
    sunLight.intensity = 1.2;

    // ===============================
    // GROUND (BASE)
    // ===============================
    const ground = BABYLON.MeshBuilder.CreateGround(
        "ground",
        { width: 200, height: 200 },
        scene
    );
    ground.position.y = -1;

    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.3, 0.6, 0.3);
    ground.material = groundMat;

    ground.physicsImpostor = new BABYLON.PhysicsImpostor(
        ground,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 1.5, restitution: 0 },
        scene
    );

    // ===============================
    // MOUNTAIN SLOPE
    // ===============================
    const slope = BABYLON.MeshBuilder.CreateBox(
        "slope",
        { width: 12, height: 1, depth: 60 },
        scene
    );
    slope.position.set(0, 4, 20);
    slope.rotation.x = BABYLON.Tools.ToRadians(20);

    const slopeMat = new BABYLON.StandardMaterial("slopeMat", scene);
    slopeMat.diffuseColor = new BABYLON.Color3(0.4, 0.35, 0.3);
    slope.material = slopeMat;

    slope.physicsImpostor = new BABYLON.PhysicsImpostor(
        slope,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 2, restitution: 0 },
        scene
    );

    // ===============================
    // FINISH PLATFORM (TOP)
    // ===============================
    const finish = BABYLON.MeshBuilder.CreateBox(
        "finish",
        { width: 14, height: 1, depth: 10 },
        scene
    );
    finish.position.set(0, 11, 55);

    const finishMat = new BABYLON.StandardMaterial("finishMat", scene);
    finishMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.8);
    finish.material = finishMat;

    finish.physicsImpostor = new BABYLON.PhysicsImpostor(
        finish,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 1.5 },
        scene
    );

    // ===============================
    // PLAYER CAR (TEMP BLOCK)
    // ===============================
    const car = BABYLON.MeshBuilder.CreateBox(
        "car",
        { width: 2, height: 1, depth: 4 },
        scene
    );
    car.position.set(0, 2, -10);

    const carMat = new BABYLON.StandardMaterial("carMat", scene);
    carMat.diffuseColor = new BABYLON.Color3(1, 0, 0);
    car.material = carMat;

    car.physicsImpostor = new BABYLON.PhysicsImpostor(
        car,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 150, friction: 1.2, restitution: 0 },
        scene
    );

    camera.lockedTarget = car;
    setupControls();
enableCarMovement(scene, car, finish);

    // ===============================
    // UPDATE LOOP (TEMP)
    // ===============================
    scene.onBeforeRenderObservable.add(() => {
        if (car.position.y < -5) {
            console.log("Car Fell!");
        }
    });

    return scene;
};

// ===============================
const scene = createScene();
engine.runRenderLoop(() => scene.render());

window.addEventListener("resize", () => engine.resize());
