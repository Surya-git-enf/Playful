export function createWorld(engine, canvas) {

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.6, 0.8, 1);

    // PHYSICS
    const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
    const physicsPlugin = new BABYLON.CannonJSPlugin();
    scene.enablePhysics(gravityVector, physicsPlugin);

    // CAMERA
    const camera = new BABYLON.FollowCamera("followCam",
        new BABYLON.Vector3(0, 5, -15), scene);

    camera.radius = 20;
    camera.heightOffset = 6;
    camera.rotationOffset = 180;
    camera.cameraAcceleration = 0.05;
    camera.maxCameraSpeed = 10;
    camera.attachControl(canvas, true);

    // LIGHT
    const light = new BABYLON.HemisphericLight("light",
        new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 1.2;

    // GROUND (Mountain base)
    const ground = BABYLON.MeshBuilder.CreateGround("ground", {
        width: 200,
        height: 200,
        subdivisions: 50
    }, scene);

    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.3, 0.25, 0.2);
    ground.material = groundMat;

    ground.physicsImpostor = new BABYLON.PhysicsImpostor(
        ground,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 1, restitution: 0.1 },
        scene
    );

    // CREATE MOUNTAIN SLOPE
    const slope = BABYLON.MeshBuilder.CreateBox("slope", {
        width: 30,
        height: 2,
        depth: 80
    }, scene);

    slope.position = new BABYLON.Vector3(0, 5, 40);
    slope.rotation.x = Math.PI / 8;

    const slopeMat = new BABYLON.StandardMaterial("slopeMat", scene);
    slopeMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    slope.material = slopeMat;

    slope.physicsImpostor = new BABYLON.PhysicsImpostor(
        slope,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 2 },
        scene
    );

    // CAR BODY
    const car = BABYLON.MeshBuilder.CreateBox("car", {
        width: 2,
        height: 1.5,
        depth: 4
    }, scene);

    car.position = new BABYLON.Vector3(0, 5, 0);

    const carMat = new BABYLON.StandardMaterial("carMat", scene);
    carMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    car.material = carMat;

    car.physicsImpostor = new BABYLON.PhysicsImpostor(
        car,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 800, friction: 2, restitution: 0 },
        scene
    );

    camera.lockedTarget = car;

    // CONTROLS
    let speed = 0;
    let steering = 0;

    const gasBtn = document.getElementById("gas");
    const brakeBtn = document.getElementById("brake");

    if (gasBtn) {
        gasBtn.addEventListener("touchstart", () => speed = 0.05);
        gasBtn.addEventListener("touchend", () => speed = 0);
    }

    if (brakeBtn) {
        brakeBtn.addEventListener("touchstart", () => speed = -0.03);
        brakeBtn.addEventListener("touchend", () => speed = 0);
    }

    window.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp") speed = 0.05;
        if (e.key === "ArrowDown") speed = -0.03;
        if (e.key === "ArrowLeft") steering = -0.02;
        if (e.key === "ArrowRight") steering = 0.02;
    });

    window.addEventListener("keyup", () => {
        speed = 0;
        steering = 0;
    });

    // GAME LOOP UPDATE
    scene.onBeforeRenderObservable.add(() => {

        const forward = new BABYLON.Vector3(
            Math.sin(car.rotation.y),
            0,
            Math.cos(car.rotation.y)
        );

        car.physicsImpostor.applyImpulse(
            forward.scale(speed * 100),
            car.getAbsolutePosition()
        );

        car.rotation.y += steering;
    });

    return scene;
}
