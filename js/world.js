// world.js
// Creates ground, slope road, sky, and lighting

export function createWorld(scene) {

    /* 🌤️ LIGHT */
    const light = new BABYLON.HemisphericLight(
        "sunLight",
        new BABYLON.Vector3(0, 1, 0),
        scene
    );
    light.intensity = 0.9;

    /* 🌌 SKY COLOR */
    scene.clearColor = new BABYLON.Color3(0.6, 0.85, 1);

    /* 🟩 START GROUND (FLAT) */
    const ground = BABYLON.MeshBuilder.CreateGround(
        "ground",
        { width: 50, height: 50 },
        scene
    );

    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.2);
    ground.material = groundMat;

    ground.physicsImpostor = new BABYLON.PhysicsImpostor(
        ground,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 1.5, restitution: 0 },
        scene
    );

    /* 🛣️ MOUNTAIN SLOPE ROAD */
    const slope = BABYLON.MeshBuilder.CreateBox(
        "slope",
        { width: 10, height: 1, depth: 60 },
        scene
    );

    slope.position = new BABYLON.Vector3(0, 5, 40);
    slope.rotation.x = BABYLON.Tools.ToRadians(-25); // slope angle

    const roadMat = new BABYLON.StandardMaterial("roadMat", scene);
    roadMat.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.4);
    slope.material = roadMat;

    slope.physicsImpostor = new BABYLON.PhysicsImpostor(
        slope,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 2.5, restitution: 0 },
        scene
    );

    /* 🏔️ END PLATFORM (TOP) */
    const top = BABYLON.MeshBuilder.CreateGround(
        "top",
        { width: 20, height: 20 },
        scene
    );

    top.position = new BABYLON.Vector3(0, 15, 75);

    top.material = roadMat;

    top.physicsImpostor = new BABYLON.PhysicsImpostor(
        top,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 2, restitution: 0 },
        scene
    );

    return { ground, slope, top };
}
