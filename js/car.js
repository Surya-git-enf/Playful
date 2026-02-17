// =====================================
// CAR CONTROLLER SYSTEM
// =====================================

let inputState = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

function setupControls() {

    // BUTTONS
    const btnForward = document.getElementById("btnForward");
    const btnBrake = document.getElementById("btnBrake");
    const btnLeft = document.getElementById("btnLeft");
    const btnRight = document.getElementById("btnRight");

    // TOUCH EVENTS
    btnForward.onpointerdown = () => inputState.forward = true;
    btnForward.onpointerup = () => inputState.forward = false;

    btnBrake.onpointerdown = () => inputState.backward = true;
    btnBrake.onpointerup = () => inputState.backward = false;

    btnLeft.onpointerdown = () => inputState.left = true;
    btnLeft.onpointerup = () => inputState.left = false;

    btnRight.onpointerdown = () => inputState.right = true;
    btnRight.onpointerup = () => inputState.right = false;

    // KEYBOARD (for desktop testing)
    window.addEventListener("keydown", e => {
        if (e.key === "w") inputState.forward = true;
        if (e.key === "s") inputState.backward = true;
        if (e.key === "a") inputState.left = true;
        if (e.key === "d") inputState.right = true;
    });

    window.addEventListener("keyup", e => {
        if (e.key === "w") inputState.forward = false;
        if (e.key === "s") inputState.backward = false;
        if (e.key === "a") inputState.left = false;
        if (e.key === "d") inputState.right = false;
    });
}

// =====================================
// CAR MOVEMENT LOGIC
// =====================================

function enableCarMovement(scene, car, finishPlatform) {

    const engineForce = 1200;
    const steeringSpeed = 2.5;

    scene.onBeforeRenderObservable.add(() => {

        const forwardVector = car.forward.normalize();

        // ACCELERATION
        if (inputState.forward) {
            car.physicsImpostor.applyForce(
                forwardVector.scale(engineForce),
                car.getAbsolutePosition()
            );
        }

        // BRAKE / REVERSE
        if (inputState.backward) {
            car.physicsImpostor.applyForce(
                forwardVector.scale(-engineForce * 0.7),
                car.getAbsolutePosition()
            );
        }

        // STEERING
        if (inputState.left) {
            car.rotation.y -= steeringSpeed * scene.getEngine().getDeltaTime() / 1000;
        }

        if (inputState.right) {
            car.rotation.y += steeringSpeed * scene.getEngine().getDeltaTime() / 1000;
        }

        // FALL DETECTION
        if (car.position.y < -5) {
            showRetryScreen();
        }

        // WIN DETECTION
        if (car.intersectsMesh(finishPlatform, false)) {
            showSuccessScreen();
        }
    });
}

// =====================================
// UI SCREENS
// =====================================

function showRetryScreen() {
    document.getElementById("retryOverlay").classList.remove("hidden");
}

function showSuccessScreen() {
    document.getElementById("successOverlay").classList.remove("hidden");
}
