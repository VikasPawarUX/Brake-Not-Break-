import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const ROAD_SAMPLES = 64;
const ROAD_DEPTH = 66;
const BODY_DEPTH = 17;
const CAMERA_ELEVATION = 0.27;

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
  const material = new THREE.MeshBasicMaterial({ color: 0x242838, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, positions };
}

function bodyShape(profile, halfLength, axles) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfLength, 0);
  for (const [x, y] of profile) shape.lineTo(x, -y);
  shape.lineTo(halfLength, 0);
  for (const x of [...axles].reverse()) {
    shape.lineTo(x + 6.3, 0);
    shape.quadraticCurveTo(x + 5, 6, x, 6);
    shape.quadraticCurveTo(x - 5, 6, x - 6.3, 0);
  }
  shape.closePath();
  return shape;
}

function windowGeometry(profile) {
  const roof = profile.map(([x, y]) => [x, -y]);
  const top = Math.max(...roof.map(([, y]) => y));
  const sill = top - 7;
  const glass = roof[0][1] > sill ? [roof[0]] : [];
  for (let i = 1; i < roof.length; i++) {
    const [x1, y1] = roof[i - 1];
    const [x2, y2] = roof[i];
    if ((y1 > sill) !== (y2 > sill)) glass.push([x1 + (x2 - x1) * (sill - y1) / (y2 - y1), sill]);
    if (y2 > sill) glass.push([x2, y2]);
  }
  const center = (glass[0][0] + glass.at(-1)[0]) / 2;
  const shape = new THREE.Shape();
  glass.forEach(([x, y], i) => {
    const px = center + (x - center) * .82;
    const py = sill - .9 + (y - sill) * .80;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function wheelGeometry(radius) {
  const points = [[0, -2], [.69, -2], [.73, -2.7], [.82, -2.7], [.96, -2.3], [1, -1.5],
    [1, 1.5], [.96, 2.3], [.82, 2.7], [.73, 2.7], [.69, 2], [0, 2]];
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r * radius, y)), 20)
    .rotateX(Math.PI / 2);
}

function contactShadow() {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { strength: { value: .30 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float strength; void main(){ float fade=1.0-smoothstep(0.12,0.5,length(vUv-0.5)); gl_FragColor=vec4(0.025,0.028,0.035,fade*strength); }',
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), material);
}

function makeLampGlow(color) {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform vec3 color; uniform float strength; void main(){ float fade=1.0-smoothstep(0.03,0.5,length(vUv-0.5)); gl_FragColor=vec4(color,fade*fade*strength); }',
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(12, 12), material);
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
  const tire = wheelGeometry(wheelRadius);
  const rim = new THREE.RingGeometry(wheelRadius * .52, wheelRadius * .65, 24);
  const hub = new THREE.CircleGeometry(wheelRadius * .19, 16);
  const spoke = new THREE.BoxGeometry(wheelRadius * .45, wheelRadius * .13, .22);
  const lampGeometry = new THREE.BoxGeometry(2.6, 2.35, 1.4);
  const bumperGeometry = new THREE.BoxGeometry(1.5, 1.6, BODY_DEPTH + .25);
  const headMaterial = new THREE.MeshBasicMaterial({ color: 0xffe5b1 });
  const headGlowTemplate = makeLampGlow(0xffdfa1);
  const tailGlowTemplate = makeLampGlow(0xff4841);
  const shadowTemplate = contactShadow();
  const models = new Map();

  const axlePositions = wheelOffsets.map(offset => offset / carScale);

  function geometryFor(profile) {
    if (!models.has(profile)) {
      const shape = bodyShape(profile, halfLength, axlePositions);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: BODY_DEPTH - 1.2, bevelThickness: .6, bevelSize: -.48,
        bevelSegments: 1, curveSegments: 5,
      });
      geometry.translate(0, 0, -(BODY_DEPTH - 1.2) / 2);
      models.set(profile, { geometry, glass: windowGeometry(profile) });
    }
    return models.get(profile);
  }

  function makeCar() {
    const group = new THREE.Group();
    const chassis = new THREE.Group();
    chassis.scale.setScalar(carScale);
    const paint = new THREE.MeshLambertMaterial();
    const glassMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const bumperMaterial = new THREE.MeshLambertMaterial();
    const sidePaint = new THREE.MeshLambertMaterial();
    const wheelMaterial = new THREE.MeshLambertMaterial();
    const warningColor = new THREE.Color();
    const rimMaterial = new THREE.MeshBasicMaterial({ color: 0xfff8e4, side: THREE.DoubleSide });
    const rearMaterial = new THREE.MeshBasicMaterial({ color: 0xb62c27 });
    const body = new THREE.Mesh(undefined, [paint, sidePaint]);
    const glass = new THREE.Mesh(undefined, glassMaterial);
    glass.position.z = BODY_DEPTH / 2 + .06;
    const rearBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
    const frontBumper = rearBumper.clone();
    rearBumper.position.set(-halfLength + .85, 1.9, 0);
    frontBumper.position.set(halfLength - .85, 1.9, 0);
    const head = new THREE.Mesh(lampGeometry, headMaterial);
    const tail = new THREE.Mesh(lampGeometry, rearMaterial);
    const headGlow = headGlowTemplate.clone();
    headGlow.material = headGlowTemplate.material.clone();
    const tailGlow = tailGlowTemplate.clone();
    tailGlow.material = tailGlowTemplate.material.clone();
    chassis.add(body, glass, rearBumper, frontBumper, head, tail, headGlow, tailGlow);
    group.add(chassis);
    const wheels = wheelOffsets.map(() => {
      const axle = new THREE.Group();
      for (const side of [-1, 1]) {
        const wheel = new THREE.Mesh(tire, wheelMaterial);
        wheel.position.z = side * (BODY_DEPTH * carScale / 2 - .5);
        axle.add(wheel);
      }
      const face = new THREE.Mesh(rim, rimMaterial);
      face.position.z = BODY_DEPTH * carScale / 2 + 2.04;
      const center = new THREE.Mesh(hub, rimMaterial);
      center.position.z = face.position.z + .2;
      axle.add(face, center);
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI * 2 / 3;
        const arm = new THREE.Mesh(spoke, rimMaterial);
        arm.rotation.z = angle;
        arm.position.set(Math.cos(angle) * wheelRadius * .34, Math.sin(angle) * wheelRadius * .34, face.position.z - .06);
        axle.add(arm);
      }
      group.add(axle);
      return axle;
    });
    const shadow = shadowTemplate.clone();
    shadow.material = shadowTemplate.material.clone();
    shadow.scale.set(halfLength * carScale * .94, 1, BODY_DEPTH * .80);
    group.add(shadow);
    roadView.add(group);
    return { group, chassis, paint, sidePaint, wheelMaterial, warningColor, rimMaterial, rearMaterial, body,
      glass, glassMaterial, bumperMaterial, head, tail, headGlow, tailGlow, wheels, shadow,
      profile: null, speed: null, braking: 0 };
  }

  const brakeRed = new THREE.Color(0xff5048);
  const cars = Array.from({ length: 5 }, makeCar);
  let lastWidth, lastHeight, lastScale;
  let lost = false;
  let lastDraw;
  let playerBrakeGlow = 0;
  let playerWarning = 0;
  let roadReach = 0;
  renderer.domElement.addEventListener('webglcontextlost', () => {
    lost = true;
    renderer.domElement.hidden = true;
  });

  const stems = [];
  const stemGeometry = new THREE.PlaneGeometry(1, 1);
  const sine = Math.sin(CAMERA_ELEVATION);
  const cosine = Math.cos(CAMERA_ELEVATION);
  let usedStems = 0;

  return {
    roadCenter(offset) {
      const sample = THREE.MathUtils.clamp((offset / roadReach + 1) * (ROAD_SAMPLES - 1) / 2, 0, ROAD_SAMPLES - 1);
      const left = Math.min(Math.floor(sample), ROAD_SAMPLES - 2);
      const y = THREE.MathUtils.lerp(road.positions.getY(left * 4 + 1),
        road.positions.getY((left + 1) * 4 + 1), sample - left);
      return {
        x: offset * Math.cos(angle) + y * Math.sin(angle),
        y: (offset * Math.sin(angle) - y * Math.cos(angle)) * Math.cos(CAMERA_ELEVATION),
      };
    },
    addMilestoneStem(anchor, height, width, color, opacity) {
      if (opacity <= 0) return;
      if (usedStems === stems.length) {
        const stem = new THREE.Mesh(stemGeometry, new THREE.MeshBasicMaterial({
          transparent: true, depthWrite: false, toneMapped: false,
        }));
        stem.quaternion.copy(camera.quaternion);
        scene.add(stem);
        stems.push(stem);
      }
      const stem = stems[usedStems++];
      const vertical = roadView.position.y * cosine - anchor.y + height / 2;
      // Project onto the same screen point from behind the traffic's depth.
      stem.position.set(roadView.position.x + anchor.x, vertical * cosine - 48 * sine,
        -vertical * sine - 48 * cosine);
      stem.scale.set(width, height, 1);
      stem.material.color.set(color);
      stem.material.opacity = opacity;
      stem.visible = true;
    },
    draw(view, drawForeground) {
      if (lost) return false;
      const now = performance.now();
      const seconds = lastDraw === undefined ? 0 : (now - lastDraw) / 1000;
      lastDraw = now;
      playerWarning = view.impact ? 1 : THREE.MathUtils.damp(playerWarning, view.warnings[2], 12, seconds);
      playerBrakeGlow = THREE.MathUtils.damp(playerBrakeGlow, Number(view.braking), view.braking ? 18 : 7, seconds);
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
      roadReach = Math.hypot(view.width, view.height) / view.scale + 36;
      for (let i = 0; i < ROAD_SAMPLES; i++) {
        const x = (i / (ROAD_SAMPLES - 1) * 2 - 1) * roadReach;
        const y = -roadHeight(view.origin + x) + wheelRadius;
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
          model.glass.geometry = geometry.glass;
          const front = car.profile.at(-1);
          const rear = car.profile[0];
          model.head.position.set(front[0] - 1.5, -front[1] - 1, BODY_DEPTH / 2);
          model.tail.position.set(rear[0] + 1.35, -rear[1] - 1.6, BODY_DEPTH / 2);
          model.headGlow.position.copy(model.head.position);
          model.tailGlow.position.copy(model.tail.position);
          model.headGlow.position.z += .8;
          model.tailGlow.position.z += .8;
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
        model.shadow.position.y = -roadHeight(car.position) + .15;
        model.shadow.rotation.z = -pitch;
        model.shadow.material.uniforms.strength.value = (view.light ? .40 : .44) + bounce * .018;
        model.wheels[0].position.set(wheelOffsets[0], -left + wheelRadius, 0);
        model.wheels[1].position.set(wheelOffsets[1], -right + wheelRadius, 0);
        for (const wheel of model.wheels) wheel.rotation.z = -car.position / wheelRadius;
        model.rimMaterial.color.set(view.light ? 0x81858c : 0x8b94a1);
        model.paint.color.set(isPlayer ? (view.light ? 0x9cc4a3 : 0x4c735e) : (view.light ? 0xedefef : 0x272e3a));
        model.sidePaint.color.copy(model.paint.color);
        if (isPlayer) model.sidePaint.color.multiplyScalar(view.light ? .86 : 1.16);
        else model.sidePaint.color.set(view.light ? 0xc2c8d0 : 0x394354);
        model.glassMaterial.color.set(view.light ? 0x8294a4 : 0x182635);
        model.wheelMaterial.color.set(view.light ? 0x41464c : 0x151b25);
        model.bumperMaterial.color.set(view.light ? 0x818994 : 0x242c38);
        const warning = isPlayer ? playerWarning : view.warnings[i];
        if (warning > .001) {
          if (view.light) {
            // The pale base otherwise washes out small linear-space blends.
            const tint = warning * (isPlayer ? .90 : .86);
            model.paint.color.lerp(model.warningColor.set(0xc92135), tint);
            model.sidePaint.color.lerp(model.warningColor.set(0xe04350), tint);
          } else {
            model.warningColor.set(view.colors[i]);
            const tint = warning * (isPlayer ? .48 : .24);
            model.paint.color.lerp(model.warningColor, tint);
            model.sidePaint.color.lerp(model.warningColor, tint);
          }
        }
        const slowing = model.speed !== null && car.speed < model.speed - .04;
        model.braking = slowing ? 1 : model.braking * .84;
        model.speed = car.speed;
        const brake = isPlayer ? playerBrakeGlow : model.braking;
        model.rearMaterial.color.set(view.light ? 0xad3b40 : 0xd44942).lerp(brakeRed, brake);
        model.headGlow.material.uniforms.strength.value = view.light ? .11 : .27;
        model.tailGlow.material.uniforms.strength.value = (view.light ? .08 : .16) + brake * .32;
      }
      usedStems = 0;
      drawForeground(view.origin, view.roadY, view.shakeX, view.shakeY);
      for (let i = usedStems; i < stems.length; i++) stems[i].visible = false;
      renderer.render(scene, camera);
      return true;
    },
    hide() {
      const geometries = new Set();
      const materials = new Set([shadowTemplate.material, headGlowTemplate.material, tailGlowTemplate.material]);
      scene.traverse(object => {
        if (!object.geometry) return;
        geometries.add(object.geometry);
        for (const material of [object.material].flat()) materials.add(material);
      });
      for (const model of models.values()) {
        geometries.add(model.geometry).add(model.glass);
      }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      models.clear();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
