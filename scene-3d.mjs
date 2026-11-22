import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const ROAD_SAMPLES = 64;
const ROAD_DEPTH = 27;
const BODY_DEPTH = 14;
const CAMERA_ELEVATION = 0.20;

function makeRoad() {
  const positions = new THREE.BufferAttribute(new Float32Array(ROAD_SAMPLES * 12), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  const indices = [];
  for (let i = 0; i < ROAD_SAMPLES - 1; i++) {
    const a = i * 4;
    for (let face = 0; face < 3; face++) {
      indices.push(a + face, a + face + 4, a + face + 1,
        a + face + 1, a + face + 4, a + face + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions);
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({ color: 0x242838, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, positions };
}

function bodyShape(profile, halfLength) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfLength, 0);
  for (const [x, y] of profile) shape.lineTo(x, -y);
  shape.lineTo(halfLength, 0);
  shape.closePath();
  return shape;
}

function stripeGeometry(shape) {
  const points = shape.getPoints();
  const positions = [];
  for (let offset = -70; offset <= 70; offset += 3) {
    const cuts = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const start = a.y - a.x - offset;
      const end = b.y - b.x - offset;
      if ((start < 0) === (end < 0)) continue;
      const progress = start / (start - end);
      cuts.push(a.x + (b.x - a.x) * progress);
    }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i += 2) {
      positions.push(cuts[i - 1], cuts[i - 1] + offset, BODY_DEPTH / 2 + .04,
        cuts[i], cuts[i] + offset, BODY_DEPTH / 2 + .04);
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
}

function makeBeam() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 55, -12, -16, 55, -12, 12,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, .5, 1, 0, 1, 1], 2));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 beamUv; void main(){ beamUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 beamUv; void main(){ float edge=1.0-smoothstep(0.12,0.5,abs(beamUv.y-0.5)); gl_FragColor=vec4(1.0,0.77,0.40,0.20*edge*(1.0-beamUv.x)); }',
  });
  return new THREE.Mesh(geometry, material);
}

export function createThreeScene(host, { angle, carScale, halfLength, wheelRadius, wheelOffsets, roadHeight }) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.domElement.className = 'three-scene';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.insertBefore(renderer.domElement, host.querySelector('#road').nextSibling);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1400);
  camera.position.set(0, Math.sin(CAMERA_ELEVATION) * 500, Math.cos(CAMERA_ELEVATION) * 500);
  camera.lookAt(0, 0, 0);
  const roadView = new THREE.Group();
  roadView.rotation.z = -angle;
  scene.add(roadView);
  scene.add(new THREE.HemisphereLight(0xe4eaff, 0x6d5261, 2.1));
  const sunlight = new THREE.DirectionalLight(0xffedd0, 1.25);
  sunlight.position.set(-60, 85, 45);
  scene.add(sunlight);

  const road = makeRoad();
  roadView.add(road.mesh);
  const tire = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 4.2, 16);
  tire.rotateX(Math.PI / 2);
  const rim = new THREE.RingGeometry(wheelRadius * .88, wheelRadius * .97, 16);
  const spoke = new THREE.BoxGeometry(wheelRadius * .72, .55, .5);
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x10121a });
  const lampGeometry = new THREE.BoxGeometry(1.4, 2.2, 2.2);
  const headMaterial = new THREE.MeshBasicMaterial({ color: 0xffdea0 });
  const shadowGeometry = new THREE.CircleGeometry(1, 16);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x020308, transparent: true, opacity: .28, depthWrite: false,
  });
  const beacon = makeBeam();
  const models = new Map();

  function geometryFor(profile) {
    if (!models.has(profile)) {
      const shape = bodyShape(profile, halfLength);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: BODY_DEPTH, bevelEnabled: false, curveSegments: 1,
      });
      geometry.translate(0, 0, -BODY_DEPTH / 2);
      models.set(profile, { geometry, edges: new THREE.EdgesGeometry(geometry, 18), stripes: stripeGeometry(shape) });
    }
    return models.get(profile);
  }

  function makeCar() {
    const group = new THREE.Group();
    const chassis = new THREE.Group();
    chassis.scale.setScalar(carScale);
    const paint = new THREE.MeshLambertMaterial({ color: 0x151821 });
    const edge = new THREE.LineBasicMaterial({ color: 0xfff8e4 });
    const rimMaterial = new THREE.MeshBasicMaterial({ color: 0xfff8e4, side: THREE.DoubleSide });
    const hatch = new THREE.LineBasicMaterial({ color: 0xfff8e4, transparent: true, opacity: .30 });
    const rearMaterial = new THREE.MeshBasicMaterial({ color: 0xb62c27 });
    const body = new THREE.Mesh(undefined, paint);
    const edges = new THREE.LineSegments(undefined, edge);
    const stripes = new THREE.LineSegments(undefined, hatch);
    const head = new THREE.Mesh(lampGeometry, headMaterial);
    const tail = new THREE.Mesh(lampGeometry, rearMaterial);
    const beam = beacon.clone();
    chassis.add(body, edges, stripes, head, tail, beam);
    group.add(chassis);
    const wheels = wheelOffsets.map(() => {
      const axle = new THREE.Group();
      for (const side of [-1, 1]) {
        const wheel = new THREE.Mesh(tire, wheelMaterial);
        wheel.position.z = side * (BODY_DEPTH * carScale / 2 + .8);
        axle.add(wheel);
      }
      const face = new THREE.Mesh(rim, rimMaterial);
      face.position.z = BODY_DEPTH * carScale / 2 + 3;
      const hub = new THREE.Mesh(spoke, rimMaterial);
      hub.position.z = face.position.z + .07;
      axle.add(face, hub);
      group.add(axle);
      return axle;
    });
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.scale.set(halfLength * carScale * .94, 1, BODY_DEPTH * .80);
    group.add(shadow);
    roadView.add(group);
    return { group, chassis, paint, edge, rimMaterial, hatch, rearMaterial, body, edges,
      stripes, head, tail, beam, wheels, shadow, profile: null };
  }

  const cars = Array.from({ length: 5 }, makeCar);
  let lastWidth, lastHeight, lastScale;
  let lost = false;
  renderer.domElement.addEventListener('webglcontextlost', () => {
    lost = true;
    renderer.domElement.hidden = true;
  });

  return {
    draw(view) {
      if (lost) return false;
      if (lastWidth !== view.width || lastHeight !== view.height || lastScale !== view.scale) {
        lastWidth = view.width;
        lastHeight = view.height;
        lastScale = view.scale;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(view.width, view.height, false);
        camera.left = -view.width / view.scale / 2;
        camera.right = -camera.left;
        camera.top = view.height / view.scale / 2;
        camera.bottom = -camera.top;
        camera.updateProjectionMatrix();
      }
      roadView.position.set(view.shakeX / view.scale,
        (view.height / 2 - view.roadY - view.shakeY) / view.scale / Math.cos(CAMERA_ELEVATION), 0);
      const reach = Math.hypot(view.width, view.height) / view.scale + 36;
      for (let i = 0; i < ROAD_SAMPLES; i++) {
        const x = (i / (ROAD_SAMPLES - 1) * 2 - 1) * reach;
        const y = -roadHeight(view.origin + x) - .3;
        road.positions.setXYZ(i * 4, x, y - 4, -ROAD_DEPTH / 2);
        road.positions.setXYZ(i * 4 + 1, x, y, -ROAD_DEPTH / 2);
        road.positions.setXYZ(i * 4 + 2, x, y, ROAD_DEPTH / 2);
        road.positions.setXYZ(i * 4 + 3, x, y - 4, ROAD_DEPTH / 2);
      }
      road.positions.needsUpdate = true;
      road.mesh.material.color.set(view.light ? 0xb9b9bd : 0x242838);

      for (let i = 0; i < cars.length; i++) {
        const model = cars[i];
        const car = view.cars[i];
        const isPlayer = i === 2;
        if (model.profile !== car.profile) {
          const geometry = geometryFor(car.profile);
          model.body.geometry = geometry.geometry;
          model.edges.geometry = geometry.edges;
          model.stripes.geometry = geometry.stripes;
          const front = car.profile.at(-1);
          const rear = car.profile[0];
          model.head.position.set(front[0], -front[1], BODY_DEPTH / 2);
          model.tail.position.set(rear[0], -rear[1], BODY_DEPTH / 2);
          model.beam.position.copy(model.head.position);
          model.profile = car.profile;
        }
        const left = roadHeight(car.position + wheelOffsets[0]);
        const right = roadHeight(car.position + wheelOffsets[1]);
        const axleHeight = (left + right) / 2;
        const bounce = THREE.MathUtils.clamp((car.bodyHeight - axleHeight) * view.suspension, -4, 4);
        const pitch = THREE.MathUtils.clamp(Math.atan2(right - left, wheelOffsets[1] - wheelOffsets[0]), -.2, .2);
        model.group.position.x = car.position - view.origin;
        model.chassis.position.y = -(axleHeight + bounce) + 8 * carScale;
        model.chassis.rotation.z = -pitch - (isPlayer ? view.brakePitch : 0);
        model.shadow.position.y = -roadHeight(car.position) + .1;
        model.wheels[0].position.set(wheelOffsets[0], -left + wheelRadius, 0);
        model.wheels[1].position.set(wheelOffsets[1], -right + wheelRadius, 0);
        for (const wheel of model.wheels) wheel.rotation.z = -car.position / wheelRadius;
        model.edge.color.set(view.colors[i]);
        model.rimMaterial.color.copy(model.edge.color);
        model.hatch.color.copy(model.edge.color);
        model.stripes.visible = isPlayer;
        model.paint.color.set(view.light ? 0xe6e6eb : 0x151821);
        if (view.warnings[i]) model.paint.color.lerp(model.edge.color, view.warnings[i] * .34);
        model.rearMaterial.color.set(isPlayer && view.braking ? 0xff4540 : 0xb62c27);
      }
      renderer.render(scene, camera);
      return true;
    },
    hide() { renderer.domElement.hidden = true; },
  };
}
