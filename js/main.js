// js/main.js
// bootstraps scene, binds controls, camera, HUD and main loop

window.addEventListener("DOMContentLoaded", ()=>{

  const canvas = document.getElementById("renderCanvas");
  canvas.style.touchAction = "none";

  // prevent arrow/space default scroll
  window.addEventListener("keydown", (e)=> {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
  });

  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true });

  const createScene = ()=>{
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.6,0.8,1);

    // world
    const world = createWorld(scene);
    const roadWidth = world.roadWidth || 12;

    // player car
    const player = createPlayerCar(scene);
    player.root.position = new BABYLON.Vector3(0,0,6);

    // traffic system
    const traffic = createTrafficSystem(scene, player);

    // camera: follow + first person
    const followCam = new BABYLON.FollowCamera("followCam", new BABYLON.Vector3(0,6,-15), scene);
    followCam.radius = 18; followCam.heightOffset = 6; followCam.rotationOffset = 180;
    followCam.lockedTarget = player.root;
    followCam.cameraAcceleration = 0.05;
    followCam.maxCameraSpeed = 20;
    followCam.attachControl(canvas, true);

    const firstCam = new BABYLON.UniversalCamera("firstCam", new BABYLON.Vector3(0,1.6,0), scene);
    firstCam.parent = player.root; firstCam.position = new BABYLON.Vector3(0,1.6,0.6); firstCam.rotation = new BABYLON.Vector3(0,Math.PI,0);

    scene.activeCamera = followCam;

    // input state
    const input = { left:false, right:false, accel:false, brake:false, drift:false };

    // pointer button binding helper
    function bindHold(id, prop){
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener("pointerdown", (e)=>{ input[prop] = true; e.preventDefault(); }, { passive:false });
      el.addEventListener("pointerup",   (e)=>{ input[prop] = false; e.preventDefault(); }, { passive:false });
      el.addEventListener("pointerout",  (e)=>{ input[prop] = false; e.preventDefault(); }, { passive:false });
      el.addEventListener("pointercancel",(e)=>{ input[prop] = false; e.preventDefault(); }, { passive:false });
    }
    bindHold("leftBtn","left"); bindHold("rightBtn","right"); bindHold("accBtn","accel"); bindHold("brakeBtn","brake"); bindHold("driftBtn","drift");

    // keyboard fallback
    window.addEventListener("keydown",(e)=>{
      if (e.key === "ArrowLeft" || e.key === "a") input.left = true;
      if (e.key === "ArrowRight" || e.key === "d") input.right = true;
      if (e.key === "ArrowUp" || e.key === "w") input.accel = true;
      if (e.key === "ArrowDown" || e.key === "s") input.brake = true;
      if (e.key === " ") input.drift = true;
      // cam toggle on 'c'
      if (e.key === "c" || e.key === "C") {
        scene.activeCamera = scene.activeCamera === followCam ? firstCam : followCam;
        try { scene.activeCamera.attachControl(canvas, true); } catch(e) {}
      }
    });
    window.addEventListener("keyup",(e)=>{
      if (e.key === "ArrowLeft" || e.key === "a") input.left = false;
      if (e.key === "ArrowRight" || e.key === "d") input.right = false;
      if (e.key === "ArrowUp" || e.key === "w") input.accel = false;
      if (e.key === "ArrowDown" || e.key === "s") input.brake = false;
      if (e.key === " ") input.drift = false;
    });

    // cam button (UI)
    const camBtn = document.getElementById("camBtn");
    if (camBtn) {
      camBtn.addEventListener("click", ()=>{
        scene.activeCamera = scene.activeCamera === followCam ? firstCam : followCam;
        try { scene.activeCamera.attachControl(canvas, true); } catch(e) {}
      });
    }

    // HUD refs
    const speedEl = document.getElementById("speed");
    const healthEl = document.getElementById("health");

    // main loop
    let last = performance.now();
    scene.onBeforeRenderObservable.add(()=>{
      const now = performance.now();
      const dt = Math.min(0.04, (now - last) / 1000); last = now;

      // update player physics
      player.update(dt, input);

      // constrain player within road width (small offroad allowed)
      const maxX = (roadWidth/2) - 1.0;
      if (player.root.position.x > maxX) player.root.position.x = maxX;
      if (player.root.position.x < -maxX) player.root.position.x = -maxX;

      // update traffic
      traffic.update(dt);

      // refresh HUD
      const kmh = Math.round(Math.abs(player._approxSpeed || 0) * 3.6);
      speedEl.innerText = kmh + " km/h";
      healthEl.innerText = "❤️ " + player.getHealth();

    });

    return scene;
  };

  const scene = createScene();
  engine.runRenderLoop(()=> scene.render());
  window.addEventListener("resize", ()=> engine.resize());
});
