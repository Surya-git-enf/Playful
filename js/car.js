// car.js
// Physics-based jeep style car

export function createCar(scene) {

    /* 🚗 CAR BODY */
    const body = BABYLON.MeshBuilder.CreateBox(
        "carBody",
        { width: 2.2, height: 0.8, depth: 4 },
        scene
    );
    body.position = new BABYLON.Vector3(0, 2, -10);

    const bodyMat = new BABYLON.StandardMaterial("bodyMat", scene);
    bodyMat.diffuseColor = new BABYLON.Color3(0.8, 0.1, 0.1);
    body.material = bodyMat;

    body.physicsImpostor = new BABYLON.PhysicsImpostor(
        body,
        BABYLON.PhysicsImpostor.BoxImpostor,
        {
            mass: 1200,
            friction: 1.8,
            restitution: 0
        },
        scene
    );

    /* 🛞 WHEELS (VISUAL) */
    const wheelMat = new BABYLON.StandardMaterial("wheelMat", scene);
    wheelMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);

    const wheels = [];
    const wheelPositions = [
        [-1, -0.4,  1.4],
        [ 1, -0.4,  1.4],
        [-1, -0.4, -1.4],
        [ 1, -0.4, -1.4]
    ];

    wheelPositions.forEach((pos, i) => {
        const wheel = BABYLON.MeshBuilder.CreateCylinder(
            "wheel" + i,
            { diameter: 0.9, height: 0.4 },
            scene
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position = new BABYLON.Vector3(
            body.position.x + pos[0],
            body.position.y + pos[1],
            body.position.z + pos[2]
        );
        wheel.material = wheelMat;
        wheels.push(wheel);
    });

    /* 🔁 WHEEL FOLLOW BODY */
    scene.onBeforeRenderObservable.add(() => {
        wheels.forEach((wheel, i) => {
            wheel.position.x = body.position.x + wheelPositions[i][0];
            wheel.position.y = body.position.y + wheelPositions[i][1];
            wheel.position.z = body.position.z + wheelPositions[i][2];
            wheel.rotation.y = body.rotation.y;
        });
    });

    /* 🎮 CONTROLS (TEMP KEYBOARD) */
    const input = { forward: 0, steer: 0 };

    window.addEventListener("keydown", e => {
        if (e.key === "w") input.forward = 1;
        if (e.key === "s") input.forward = -1;
        if (e.key === "a") input.steer = 1;
        if (e.key === "d") input.steer = -1;
    });

    window.addEventListener("keyup", e => {
        if (["w", "s"].includes(e.key)) input.forward = 0;
        if (["a", "d"].includes(e.key)) input.steer = 0;
    });

    /* 🚀 MOVEMENT LOGIC */
    scene.onBeforeRenderObservable.add(() => {
        const force = new BABYLON.Vector3(
            Math.sin(body.rotation.y) * input.forward * 120,
            0,
            Math.cos(body.rotation.y) * input.forward * 120
        );

        body.physicsImpostor.applyForce(
            force,
            body.getAbsolutePosition()
        );

        body.rotation.y += input.steer * 0.03;
    });

    return body;
}
