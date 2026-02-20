// js/ui.js
export class GameUI {
  constructor() {
    this.onFail = null;
    this.onSuccess = null;

    this.accel = false;
    this.brake = false;
    this.left = false;
    this.right = false;

    this.bindButtons();
  }

  bindButtons() {
    const bind = (id, prop) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      btn.addEventListener("touchstart", () => (this[prop] = true));
      btn.addEventListener("touchend", () => (this[prop] = false));
      btn.addEventListener("mousedown", () => (this[prop] = true));
      btn.addEventListener("mouseup", () => (this[prop] = false));
    };

    bind("btnAccel", "accel");
    bind("btnBrake", "brake");
    bind("btnLeft", "left");
    bind("btnRight", "right");
  }
}
