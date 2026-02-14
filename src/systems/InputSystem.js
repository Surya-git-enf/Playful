// src/systems/InputSystem.js
export class InputSystem {
  constructor() {
    this.accel = 0;
    this.steer = 0;
    this.brake = 0;
    this.drift = false;
    this._bindKeyboard();
  }

  _bindKeyboard(){
    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'w') this.accel = 1;
      if (e.key === 'ArrowDown' || e.key === 's') this.brake = 1;
      if (e.key === 'ArrowLeft' || e.key === 'a') this.steer = -1;
      if (e.key === 'ArrowRight' || e.key === 'd') this.steer = 1;
      if (e.key === ' ') this.drift = true;
    });
    window.addEventListener('keyup', e => {
      if (e.key === 'ArrowUp' || e.key === 'w') this.accel = 0;
      if (e.key === 'ArrowDown' || e.key === 's') this.brake = 0;
      if (e.key === 'ArrowLeft' || e.key === 'a') this.steer = 0;
      if (e.key === 'ArrowRight' || e.key === 'd') this.steer = 0;
      if (e.key === ' ') this.drift = false;
    });
    // on-screen buttons will set properties directly (we wire them in HTML later if needed)
  }

  update(dt) {
    // future smoothing / virtual joystick mapping here
  }
}
