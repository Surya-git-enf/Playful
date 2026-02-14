// src/main.js
import { createGameScene } from './scene.js';

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

async function start() {
  const scene = await createGameScene(engine, canvas);
  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());
}

start().catch(err => {
  console.error('Failed to start scene', err);
  document.body.innerHTML = '<pre style="color:white;background:#800;padding:12px">Fatal: ' + err.message + '</pre>';
});
