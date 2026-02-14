// src/scene.js
import { PhysicsSystem } from './systems/PhysicsSystem.js';
import { InputSystem } from './systems/InputSystem.js';
import { CameraSystem } from './systems/CameraSystem.js';
import { Car } from './objects/Car.js';
import { Road } from './objects/Road.js';
import { TrafficCar } from './objects/TrafficCar.js';

export async function createGameScene(engine, canvas) {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.52, 0.77, 0.95);

  // lights
  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.9;
  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.45,-1,-0.25), scene);
  sun.position = new BABYLON.Vector3(40,80,40);
  sun.intensity = 0.95;

  // physics
  const physics = new PhysicsSystem();
  const physicsReady = await physics.init(scene);
  if (!physicsReady) {
    console.warn('Havok failed — using fallback impostors');
  }

  // environment
  const road = new Road(scene);

  // player
  const player = new Car(scene, { x:0, z: 6 });

  // traffic
  const traffic = [];
  for (let i=0;i<6;i++){
    traffic.push(new TrafficCar(scene, { x: (i%2? -2:2), z: 80 + i*40 }));
  }

  // input & camera
  const input = new InputSystem();
  const cameraSys = new CameraSystem(scene, player);
  cameraSys.attach();

  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    input.update(dt);
    player.update(dt, input);
    traffic.forEach(t => t.update(dt));
    cameraSys.update(dt);
  });

  return scene;
}
