// js/main.js (improved main loop, binds UI + cameras + safe input)

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("renderCanvas");
  canvas.style.touchAction = "none";

  // disable arrow default behavior
  window.addEventListener("keydown", e => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
  });

  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true });
  const createScene = () => {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.6, 0.78, 0.95);

    // world, return road sizes
    const winfo = createWorld(scene);
    const roadWidth = winfo.roadWidth || 12;

    // create player
    const player = createPlayerCar(scene);
    player.root.position = new BABYLON.Vector3(0, 0, 6);

    // set collider reference for traffic collision checks
    player.collider = player.collider || player.root.getChildren().find(c=>c.name.includes("playerCollider")) || null;

    // traffic system
    const traffic = createTrafficSystem(scene, player);

    // camera: follow + first person toggle
    const followCam = new BABYLON.FollowCamera("follow", new BABYLON.Vector3(0,6,-15), scene);
    followCam.radius = 18; followCam.heightOffset = 6; followCam.rotationOffset = 180;
    followCam.lockedTarget = player.root;
    followCam.attachControl(canvas, true);

    const firstCam = new BABYLON.UniversalCamera("first", new BABYLON.Vector3(0,1.6,0), scene);
    firstCam.parent = player.root; firstCam.position = new BABYLON.Vector3(0,1.6,0.6); firstCam.rotation = new BABYLON.Vector3(0,Math.PI,0);

    scene.activeCamera = followCam;

    // on-screen & keyboard input
    const input = { left:false, right:false, accel:false, brake:false, drift:false };

    function bindHold(id, prop) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("pointerdown", e=>{ input[prop] = true; e.preventDefault(); }, { passive:false });
      el.addEventListener("pointerup",   e=>{ input[prop] = false; e.preventDefault(); }, { passive:false });
      el.addEventListener("pointerout",  e=>{ input[prop] = false; e.preventDefault(); }, { passive:false });
      el.addEventListener("pointercancel", e=>{ input[prop] = false; e.preventDefault(); }, { passive:false });
    }
    bindHold("leftBtn","left"); bindHold("rightBtn","right"); bindHold("accBtn","accel"); bindHold("brakeBtn","brake"); bindHold("driftBtn","drift");

    window.addEventListener("keydown",(e)=>{
      if (e.key === "ArrowLeft" || e.key === "a") input.left = true;
      if (e.key === "ArrowRight" || e.key === "d") input.right = true;
      if (e.key === "ArrowUp" || e.key === "w") input.accel = true;
      if (e.key === "ArrowDown" || e.key === "s") input.brake = true;
      if (e.key === " ") input.drift = true;
      if (e.key.toLowerCase() === "c") {
        scene.activeCamera = scene.activeCamera === followCam ? firstCam : followCam;
        try { scene.activeCamera.attachControl(canvas, true); } catch(e){}
      }
    });
    window.addEventListener("keyup",(e)=>{
      if (e.key === "ArrowLeft" || e.key === "a") input.left = false;
      if (e.key === "ArrowRight" || e.key === "d") input.right = false;
      if (e.key === "ArrowUp" || e.key === "w") input.accel = false;
      if (e.key === "ArrowDown" || e.key === "s") input.brake = false;
      if (e.key === " ") input.drift = false;
    });

    // camera UI button
    const camBtn = document.getElementById("camBtn");
    if (camBtn) camBtn.addEventListener("click", ()=>{
      scene.activeCamera = scene.activeCamera === followCam ? firstCam : followCam;
      try { scene.activeCamera.attachControl(canvas, true); } catch(e){}
    });

    // HUD elements
    const speedEl = document.getElementById("speed");
    const healthEl = document.getElementById("health");

    // main loop
    let last = performance.now();
    scene.onBeforeRenderObservable.add(()=>{
      const now = performance.now();
      const dt = Math.min(0.04, (now - last)/1000);
      last = now;

      // call player update with dt and input
      player.update(dt, input);

      // clamp X to road bounds but allow limited offroad
      const maxX = (roadWidth / 2) - 0.9;
      if (player.root.position.x > maxX) player.root.position.x = maxX;
      if (player.root.position.x < -maxX) player.root.position.x = -maxX;

      // update traffic with dt
      traffic.update(dt);

      // HUD refresh
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
