// src/main.js — simple non-module Babylon scene + car (no imports)
(function(){
  const debugEl = document.getElementById('debug');
  function dbg(s){ 
    try{
      debugEl.innerText = (debugEl.innerText ? debugEl.innerText + "\n" : "") + s;
      debugEl.scrollTop = debugEl.scrollHeight;
      console.log("[GAME]", s);
    }catch(e){ console.log("[DBGERR]", e); }
  }

  dbg("main.js loaded");

  // tiny safety: wait for Babylon to be available
  function safeWaitBabylon(tries = 0){
    if (window.BABYLON){
      dbg("Babylon detected — creating scene");
      startScene();
      return;
    }
    if (tries > 50) {
      dbg("Babylon not available after waiting — abort.");
      return;
    }
    setTimeout(() => safeWaitBabylon(tries+1), 80);
  }
  safeWaitBabylon();

  function startScene(){
    try {
      const canvas = document.getElementById("renderCanvas");
      // make sure canvas fills viewport (in case CSS didn't load)
      canvas.style.position = "fixed";
      canvas.style.inset = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.zIndex = "1";

      const engine = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer:true, stencil:true});
      dbg("Engine created");

      const scene = new BABYLON.Scene(engine);
      scene.clearColor = new BABYLON.Color3(0.5,0.7,0.95);

      // Simple camera
      const camera = new BABYLON.FollowCamera("cam", new BABYLON.Vector3(0,5,-12), scene);
      camera.radius = 15;
      camera.heightOffset = 5;
      camera.rotationOffset = 180;
      camera.cameraAcceleration = 0.05;
      camera.maxCameraSpeed = 50;

      // lights
      const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
      hemi.intensity = 0.95;
      const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.3,-1,-0.4), scene);
      dir.position = new BABYLON.Vector3(40,80,40);

      // ground
      const ground = BABYLON.MeshBuilder.CreateGround("ground", {width:300, height:300}, scene);
      const gmat = new BABYLON.StandardMaterial("gmat", scene);
      gmat.diffuseColor = new BABYLON.Color3(0.12,0.45,0.12);
      ground.material = gmat;
      ground.receiveShadows = true;

      // car box (red)
      const car = BABYLON.MeshBuilder.CreateBox("car", {width:2, height:1, depth:4}, scene);
      const cMat = new BABYLON.StandardMaterial("cmat", scene);
      cMat.diffuseColor = new BABYLON.Color3(0.9,0.12,0.15);
      car.material = cMat;
      car.position.y = 0.6;
      car.position.z = -12;

      camera.lockedTarget = car;

      // very simple visual wheels
      const makeWheel = (x,z) => {
        const w = BABYLON.MeshBuilder.CreateCylinder("w", {diameter:0.7, height:0.4, tessellation:16}, scene);
        w.rotation.z = Math.PI/2;
        w.position = new BABYLON.Vector3(x,0.3,z);
        w.material = new BABYLON.StandardMaterial("wm", scene);
        w.material.diffuseColor = new BABYLON.Color3(0.08,0.08,0.08);
        return w;
      };
      const wfl = makeWheel(-0.85,1.2);
      const wfr = makeWheel(0.85,1.2);
      const wbl = makeWheel(-0.85,-1.2);
      const wbr = makeWheel(0.85,-1.2);

      dbg("Meshes created");

      // Simple movement (no physics) — deterministic and stable on every device
      const input = {left:false,right:false,forward:false,back:false};
      window.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft" || e.key === "a") input.left = true;
        if (e.key === "ArrowRight" || e.key === "d") input.right = true;
        if (e.key === "ArrowUp" || e.key === "w") input.forward = true;
        if (e.key === "ArrowDown" || e.key === "s") input.back = true;
      });
      window.addEventListener("keyup", (e) => {
        if (e.key === "ArrowLeft" || e.key === "a") input.left = false;
        if (e.key === "ArrowRight" || e.key === "d") input.right = false;
        if (e.key === "ArrowUp" || e.key === "w") input.forward = false;
        if (e.key === "ArrowDown" || e.key === "s") input.back = false;
      });

      // touch buttons (UI)
      function addTouch(elId, prop){
        const el = document.getElementById(elId);
        if (!el) return;
        el.addEventListener("touchstart", (ev)=>{ input[prop] = true; ev.preventDefault(); }, {passive:false});
        el.addEventListener("touchend", ()=>{ input[prop] = false; });
      }
      addTouch("leftBtn","left");
      addTouch("rightBtn","right");
      addTouch("accBtn","forward");
      addTouch("brakeBtn","back");

      // HUD elements (if exist)
      const speedEl = document.getElementById("speed");
      const distEl = document.getElementById("distance");
      const timerEl = document.getElementById("timer");
      let startTime = performance.now();
      let totalDistance = 0;
      let lastZ = car.position.z;

      // update loop (no physics — simple arcade)
      let velocity = 0;
      engine.runRenderLoop(function(){
        // apply controls
        if (input.forward) velocity += 0.02;
        if (input.back) velocity -= 0.04;
        if (!input.forward && !input.back) velocity *= 0.985;
        velocity = Math.max(-0.6, Math.min(1.8, velocity));

        // steering rotates the car mesh
        if (input.left) car.rotation.y -= 0.04;
        if (input.right) car.rotation.y += 0.04;

        // move car along forward vector
        const forward = new BABYLON.Vector3(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y));
        car.position.addInPlace(forward.scale(velocity));
        // keep wheels visually following chassis
        wfl.position = car.position.add(new BABYLON.Vector3(-0.85, -0.3, 1.2));
        wfr.position = car.position.add(new BABYLON.Vector3(0.85, -0.3, 1.2));
        wbl.position = car.position.add(new BABYLON.Vector3(-0.85, -0.3, -1.2));
        wbr.position = car.position.add(new BABYLON.Vector3(0.85, -0.3, -1.2));

        // HUD
        if (speedEl) speedEl.innerText = Math.round(Math.abs(velocity)*120) + " km/h";
        totalDistance += Math.max(0, (car.position.z - lastZ));
        lastZ = car.position.z;
        if (distEl) distEl.innerText = Math.round(Math.abs(totalDistance)) + " m";
        if (timerEl) {
          const s = Math.floor((performance.now() - startTime)/1000);
          const mm = String(Math.floor(s/60)).padStart(2,"0");
          const ss = String(s%60).padStart(2,"0");
          timerEl.innerText = mm + ":" + ss;
        }

        scene.render();
      });

      window.addEventListener("resize", function(){ engine.resize(); });

      dbg("Render loop started — drive with arrow keys or on-screen buttons.");
    } catch (err) {
      dbg("SCENE ERROR: " + (err && err.message ? err.message : String(err)));
      console.error(err);
    }
  } // startScene
})();
