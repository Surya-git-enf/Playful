// src/systems/CameraSystem.js
export class CameraSystem {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.follow = new BABYLON.FollowCamera('followCam', new BABYLON.Vector3(0,6,-12), scene);
    this.follow.lockedTarget = this.player.root;
    this.follow.radius = 16; this.follow.heightOffset = 4.8; this.follow.rotationOffset = 180; this.follow.cameraAcceleration = 0.05;
    this.first = new BABYLON.UniversalCamera('firstCam', new BABYLON.Vector3(0,1.6,0), scene);
    this.first.parent = this.player.root; this.first.position = new BABYLON.Vector3(0,1.6,0.6);
    this.first.rotation = new BABYLON.Vector3(0, Math.PI, 0);
    this.scene.activeCamera = this.follow;
  }

  attach() {
    this.scene.activeCamera.attachControl(this.scene.getEngine().getRenderingCanvas(), true);
  }

  update(dt) {
    // nothing heavy here - FollowCamera handles smoothing
  }

  toggle() {
    try { this.scene.activeCamera.detachControl(this.scene.getEngine().getRenderingCanvas()); } catch {}
    this.scene.activeCamera = this.scene.activeCamera === this.follow ? this.first : this.follow;
    this.scene.activeCamera.attachControl(this.scene.getEngine().getRenderingCanvas(), true);
  }
}
