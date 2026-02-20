// world.js
export function createWorld(scene) {

    // LIGHT
    const light = new BABYLON.HemisphericLight(
        "light",
        new BABYLON.Vector3(0, 1, 0),
        scene
    );
    light.intensity = 0.9;

    // GROUND
    const ground = BABYLON.MeshBuilder.CreateGround(
        "ground",
        { width: 200, height: 200 },
        scene
    );

    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.2);
    ground.material = groundMat;

    ground.physicsImpostor = new BABYLON.PhysicsImpostor(
        ground,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 1 },
        scene
    );

    // MOUNTAIN ROAD (SLOPE)
    const slope = BABYLON.MeshBuilder.CreateBox(
        "slope",
        { width: 16, height: 1, depth: 80 },
        scene
    );

    slope.position = new BABYLON.Vector3(0, 4, 40);
    slope.rotation.x = BABYLON.Tools.ToRadians(-18);

    const roadMat = new BABYLON.StandardMaterial("roadMat", scene);
    roadMat.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
    slope.material = roadMat;

    slope.physicsImpostor = new BABYLON.PhysicsImpostor(
        slope,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 2 },
        scene
    );

    return { ground, slope };
}
