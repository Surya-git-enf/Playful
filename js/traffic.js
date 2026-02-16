// js/traffic.js
// createTrafficSystem(scene, playerCar)
// - spawns AI cars
// - keeps them in lanes
// - realistic speed
// - collision damage with player

function createTrafficSystem(scene, playerCar) {
  const cars = [];
  const trafficRoot = new BABYLON.TransformNode("traffic_root", scene);

  const LANES = [-2.2, 2.2];   // two-way road
  const ROAD_LENGTH = 800;

  function createTrafficCar(zPos, lane, direction = 1) {
    const root = new BABYLON.TransformNode("traffic_car", scene);
    root.parent = trafficRoot;

    // body
    const body = BABYLON.MeshBuilder.CreateBox("t_body", {
      width: 1.8, height: 0.45, depth: 3.4
    }, scene);
    body.parent = root;
    body.position.y = 1;

    const mat = new BABYLON.StandardMaterial("t_mat", scene);
    mat.diffuseColor = BABYLON.Color3.Random();
    body.material = mat;

    // wheels
    function wheel(x, z) {
      const w = BABYLON.MeshBuilder.CreateCylinder("w", {
        diameter: 0.6, height: 0.3
      }, scene);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.45, z);
      w.parent = root;
    }

    wheel(-0.9, 1.3);
    wheel(0.9, 1.3);
    wheel(-0.9, -1.3);
    wheel(0.9, -1.3);

    root.position.set(lane, 0, zPos);
    root.rotation.y = direction === 1 ? 0 : Math.PI;

    return {
      root,
      speed: 8 + Math.random() * 6,
      direction
    };
  }

  // spawn initial traffic
  for (let i = 0; i < 10; i++) {
    cars.push(createTrafficCar(
      Math.random() * ROAD_LENGTH - ROAD_LENGTH / 2,
      LANES[i % 2],
      i % 2 === 0 ? 1 : -1
    ));
  }

  function update(dt) {
    const playerPos = playerCar.root.position;

    cars.forEach(car => {
      const forward = new BABYLON.Vector3(
        Math.sin(car.root.rotation.y),
        0,
        Math.cos(car.root.rotation.y)
      );

      car.root.position.addInPlace(
        forward.scale(car.speed * dt)
      );

      // loop road
      if (car.root.position.z - playerPos.z > ROAD_LENGTH / 2)
        car.root.position.z -= ROAD_LENGTH;
      if (car.root.position.z - playerPos.z < -ROAD_LENGTH / 2)
        car.root.position.z += ROAD_LENGTH;

      // collision check (simple AABB)
      const dx = car.root.position.x - playerPos.x;
      const dz = car.root.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 2.2) {
        playerCar.onCollision(car.speed);
        car.speed *= 0.6; // slow traffic after hit
      }
    });
  }

  return { update };
}
