// js/traffic.js
// createTrafficSystem(scene, playerCar) -> returns { update(dt) }

function createTrafficSystem(scene, playerCar) {
  const cars = [];
  const LANES = [-2.6, 2.6]; // two lanes (x positions)
  const ROAD_LENGTH = 1200;

  function spawnTraffic(zPos, laneIndex, dir=1) {
    const root = new BABYLON.TransformNode("troot", scene);
    const body = BABYLON.MeshBuilder.CreateBox("tbody", { width: 1.6, height: 0.45, depth: 3.2 }, scene);
    body.parent = root; body.position.y = 1;
    const mat = new BABYLON.StandardMaterial("tmat"+Math.random().toString(36).slice(2), scene);
    mat.diffuseColor = BABYLON.Color3.Random(); body.material = mat;
    const laneX = LANES[laneIndex % LANES.length];
    root.position = new BABYLON.Vector3(laneX, 0, zPos);
    root.rotation.y = dir === 1 ? 0 : Math.PI;
    const spd = 4 + Math.random()*4;
    return { root, laneX, speed: spd, dir };
  }

  // initial spawn
  for (let i=0;i<14;i++){
    const laneIndex = i % 2;
    const dir = laneIndex === 0 ? 1 : -1;
    cars.push(spawnTraffic(-300 + i*40 + Math.random()*30, laneIndex, dir));
  }

  function update(dt) {
    const ppos = playerCar.root.position;
    for (const c of cars) {
      const forward = new BABYLON.Vector3(Math.sin(c.root.rotation.y), 0, Math.cos(c.root.rotation.y));
      c.root.position.addInPlace(forward.scale(c.speed * dt * 6));

      // loop around relative to player
      if (c.root.position.z - ppos.z > ROAD_LENGTH/2) c.root.position.z -= ROAD_LENGTH;
      if (c.root.position.z - ppos.z < -ROAD_LENGTH/2) c.root.position.z += ROAD_LENGTH;

      // simple avoidance: if player very close in same lane, slow
      const dx = c.root.position.x - ppos.x;
      const dz = c.root.position.z - ppos.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (Math.abs(dx) < 2.2 && Math.abs(dz) < 12) {
        c.speed = Math.max(1.2, c.speed - 8*dt);
      } else {
        // relax back to base speed (no stored base -> gentle random)
        c.speed += ( (4+2) - c.speed ) * Math.min(1, dt * 0.6);
      }

      // collision vs player: simple distance check
      if (dist < 2.0) {
        // call player collision with relative speed
        playerCar.onCollision(c.speed);
        c.speed *= 0.4;
        // nudge car away
        const push = c.root.position.subtract(ppos).normalize().scale(0.8);
        c.root.position.addInPlace(push);
      }
    }
  }

  return { update };
}
