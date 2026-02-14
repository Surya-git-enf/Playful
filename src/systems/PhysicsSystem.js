// src/systems/PhysicsSystem.js
export class PhysicsSystem {
  constructor() {
    this.plugin = null;
    this.enabled = false;
  }

  async init(scene) {
    try {
      // dynamic import of Havok factory
      const HavokModule = await import('@babylonjs/havok');
      // instantiate runtime (factory returns promise)
      const havok = await HavokModule();
      this.plugin = new BABYLON.HavokPlugin(undefined, havok);
      scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), this.plugin);
      this.enabled = true;
      console.log('Havok physics enabled');
      return true;
    } catch (e) {
      console.warn('Havok init failed, falling back:', e);
      try {
        // minimal fallback to no plugin (scene still works but physics calls won't be real)
        scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.NoPlugin());
      } catch (err) { console.warn('Fallback physics init failed:', err); }
      this.enabled = false;
      return false;
    }
  }
}
