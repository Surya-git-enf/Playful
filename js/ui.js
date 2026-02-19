// js/ui.js
// Mobile driving controls (steering + pedals)

window.initUI = function () {

  /* ---------------- INPUT STATE ---------------- */
  window.inputState = {
    accelerate: false,
    brake: false,
    steer: 0
  };

  /* ---------------- STEERING WHEEL ---------------- */
  const wheel = document.getElementById("steering-wheel");

  let steeringActive = false;
  let wheelCenterX = 0;

  wheel.addEventListener("touchstart", (e) => {
    steeringActive = true;
    wheelCenterX = e.touches[0].clientX;
    e.preventDefault();
  }, { passive: false });

  wheel.addEventListener("touchmove", (e) => {
    if (!steeringActive) return;

    const dx = e.touches[0].clientX - wheelCenterX;
    const steerValue = dx / 80; // sensitivity

    window.inputState.steer = Math.max(
      -1,
      Math.min(1, steerValue)
    );

    e.preventDefault();
  }, { passive: false });

  wheel.addEventListener("touchend", () => {
    steeringActive = false;
    window.inputState.steer = 0;
  });

  /* ---------------- ACCELERATOR ---------------- */
  const accel = document.getElementById("accelerator");

  accel.addEventListener("touchstart", (e) => {
    window.inputState.accelerate = true;
    e.preventDefault();
  }, { passive: false });

  accel.addEventListener("touchend", () => {
    window.inputState.accelerate = false;
  });

  /* ---------------- BRAKE ---------------- */
  const brake = document.getElementById("brake");

  brake.addEventListener("touchstart", (e) => {
    window.inputState.brake = true;
    e.preventDefault();
  }, { passive: false });

  brake.addEventListener("touchend", () => {
    window.inputState.brake = false;
  });

};
