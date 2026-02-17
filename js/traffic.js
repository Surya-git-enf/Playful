// js/traffic.js (improved)
// createTrafficSystem(scene, player) -> returns { update(dt) }

function createTrafficSystem(scene, player) {
  const cars = [];
  const LANES = [-2.6, 2.6]; // lane x positions
  const ROAD_LENGTH = 1200;

  function spawn(z, laneIndex, dir = 1) {
    const root = new BABYLON.TransformNode("troot", scene);
    const body = BABYLON.MeshBuilder.CreateBox("tbody", { width:1.6, height:0.45, depth:3.2 }, scene);
    body.parent = root; body.position.y = 1;
    const mat = new BABYLON.StandardMaterial("tmat_"+Math.random().toString(36).slice(2), scene);
    mat.diffuseColor = BABYLON.Color3.FromHexString("#"+Math.floor(Math.random()*16777215).toString(16));
    body.material = mat;

    const laneX = LANES[laneIndex % LANES.length];
    root.position = new BABYLON.Vector3(laneX, 0, z);
    root.rotation.y = dir === 1 ? 0 : Math.PI;
    root.checkCollisions = true;

    // store base speed and state
    return { root, baseSpeed: 2 + Math.random()*3, speed: 2 + Math.random()*3, dir, laneX };
  }

  // spawn initial traffic, spread along z
  for (let i=0;i<12;i++){
    const laneIndex = i % 2;
    const dir = laneIndex === 0 ? 1 : -1;
    cars.push(spawn(-300 + i*50 + Math.random()*30, laneIndex, dir));
  }

  function update(dt) {
    const ppos = player.root.position;

    for (let i=0;i<cars.length;i++){
      const c = cars[i];
      // basic movement
      const fwd = new BABYLON.Vector3(Math.sin(c.root.rotation.y), 0, Math.cos(c.root.rotation.y));
      c.root.position.addInPlace(fwd.scale(c.speed * dt * 6));

      // loop around
      if (c.root.position.z - ppos.z > ROAD_LENGTH/2) c.root.position.z -= ROAD_LENGTH;
      if (c.root.position.z - ppos.z < -ROAD_LENGTH/2) c.root.position.z += ROAD_LENGTH;

      // avoid player if close and same lane X
      const dx = c.root.position.x - ppos.x;
      const dz = c.root.position.z - ppos.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (Math.abs(dx) < 2.6 && Math.abs(dz) < 12) {
        c.speed = Math.max(1.0, c.speed - 6 * dt); // brake
      } else {
        // relax towards baseSpeed
        c.speed += (c.baseSpeed - c.speed) * Math.min(1, dt * 0.8);
      }

      // collision with player
      if (dist < 1.9) {
        // only trigger if player meshes genuinely intersect
        try {
          if (player.collider && player.collider.intersectsMesh) {
            if (player.collider.intersectsMesh(c.root.getChildren()[0] || c.root, false)) {
              player.onCollision(c.speed);
              c.speed *= 0.3;
              // push traffic a bit
              const push = c.root.position.subtract(ppos).normalize().scale(0.8);
              c.root.position.addInPlace(push);
            }
          } else {
            // fallback distance-trigger
            player.onCollision(c.speed);
            c.speed *= 0.3;
          }
        } catch(e) {
          // safe fallback
          if (dist < 1.7) { player.onCollision(c.speed); c.speed *= 0.3; }
        }
      }
    }
  }

  return { update };
}
