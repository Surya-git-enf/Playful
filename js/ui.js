/* ===============================
   UI INPUT SYSTEM (DR-STYLE)
=============================== */

export const Input = {
  steer: 0,      // -1 (left) to +1 (right)
  throttle: 0,   // 0 to 1
  brake: 0       // 0 to 1
};

/* ===============================
   STEERING WHEEL
=============================== */
const wheel = document.getElementById("steeringWheel");

let wheelActive = false;
let wheelStartAngle = 0;
let wheelRotation = 0;
const MAX_WHEEL_ANGLE = 120; // degrees

function getAngle(x, y, cx, cy) {
  return Math.atan2(y - cy, x - cx) * 180 / Math.PI;
}

wheel.addEventListener("touchstart", e => {
  e.preventDefault();
  wheelActive = true;

  const rect = wheel.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const t = e.touches[0];
  wheelStartAngle = getAngle(t.clientX, t.clientY, cx, cy);
});

wheel.addEventListener("touchmove", e => {
  if (!wheelActive) return;
  e.preventDefault();

  const rect = wheel.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const t = e.touches[0];
  const angle = getAngle(t.clientX, t.clientY, cx, cy);
  let delta = angle - wheelStartAngle;

  delta = Math.max(-MAX_WHEEL_ANGLE, Math.min(MAX_WHEEL_ANGLE, delta));
  wheelRotation = delta;

  wheel.style.transform = `rotate(${wheelRotation}deg)`;
  Input.steer = wheelRotation / MAX_WHEEL_ANGLE;
});

wheel.addEventListener("touchend", () => {
  wheelActive = false;
  wheelRotation = 0;
  Input.steer = 0;
  wheel.style.transform = "rotate(0deg)";
});

/* ===============================
   ACCELERATOR
=============================== */
const accel = document.getElementById("accelPedal");

accel.addEventListener("touchstart", e => {
  e.preventDefault();
  Input.throttle = 1;
});

accel.addEventListener("touchend", () => {
  Input.throttle = 0;
});

/* ===============================
   BRAKE
=============================== */
const brake = document.getElementById("brakePedal");

brake.addEventListener("touchstart", e => {
  e.preventDefault();
  Input.brake = 1;
});

brake.addEventListener("touchend", () => {
  Input.brake = 0;
});

/* ===============================
   DESKTOP FALLBACK (KEYBOARD)
=============================== */
window.addEventListener("keydown", e => {
  if (e.code === "ArrowLeft") Input.steer = -1;
  if (e.code === "ArrowRight") Input.steer = 1;
  if (e.code === "ArrowUp") Input.throttle = 1;
  if (e.code === "ArrowDown") Input.brake = 1;
});

window.addEventListener("keyup", e => {
  if (e.code === "ArrowLeft" || e.code === "ArrowRight") Input.steer = 0;
  if (e.code === "ArrowUp") Input.throttle = 0;
  if (e.code === "ArrowDown") Input.brake = 0;
});
