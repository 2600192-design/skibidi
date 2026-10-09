import * as THREE from "/vendor/three/three.module.js";

// All effects are local visuals. The server remains the authority for damage.
const PALETTES = {
  water: [0x45c9ff, 0xb8f7ff],
  flame: [0xff682e, 0xffe1a1],
  thunder: [0xffd346, 0xfff8d4],
  wind: [0x72dfa4, 0xdeffe8],
  mist: [0xa6bddc, 0xe9f1ff],
  sun: [0xffa932, 0xfff4b5],
  moon: [0xb486f6, 0xf4d7ff],
  blood: [0xe82c68, 0xffa1bd],
};
const MAX_PARTICLES = 500;
const MAX_EFFECTS = 45;
const TAU = Math.PI * 2;
const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const random = (min, max) => min + Math.random() * (max - min);
const colors = new Map();
function color(hex) {
  if (!colors.has(hex)) colors.set(hex, new THREE.Color(hex));
  return colors.get(hex);
}

function radialTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.17, "rgba(255,255,255,.9)");
  gradient.addColorStop(0.42, "rgba(255,255,255,.3)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// A tapered strip following an arbitrary three-dimensional curve.
function ribbonGeometry(path, width = 0.22, count = 64) {
  const positions = [],
    indices = [],
    uvs = [];
  const prev = new THREE.Vector3(),
    next = new THREE.Vector3();
  const tangent = new THREE.Vector3(),
    side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = path(t);
    prev.copy(path(Math.max(0, t - 0.002)));
    next.copy(path(Math.min(1, t + 0.002)));
    tangent.subVectors(next, prev).normalize();
    side.crossVectors(tangent, up);
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    side
      .normalize()
      .multiplyScalar(width * (0.08 + 0.92 * Math.sin(t * Math.PI)) * 0.5);
    positions.push(p.x + side.x, p.y + side.y, p.z + side.z);
    positions.push(p.x - side.x, p.y - side.y, p.z - side.z);
    uvs.push(t, 0, t, 1);
    if (i < count) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function arcGeometry(radius, width, start = -0.9, end = 0.9, rise = 0) {
  return ribbonGeometry(
    (t) => {
      const angle = start + (end - start) * t;
      return new THREE.Vector3(
        Math.sin(angle) * radius,
        Math.sin(t * Math.PI) * rise,
        Math.cos(angle) * radius,
      );
    },
    width,
    Math.max(32, Math.ceil((end - start) * 18)),
  );
}

function spiralGeometry(radius, height, turns, width, phase = 0) {
  return ribbonGeometry(
    (t) => {
      const angle = t * TAU * turns + phase;
      const r = radius * (0.45 + 0.55 * Math.sin(t * Math.PI));
      return new THREE.Vector3(
        Math.cos(angle) * r,
        t * height,
        Math.sin(angle) * r,
      );
    },
    width,
    90,
  );
}

function thornGeometry(height, radius, lean) {
  const positions = [],
    indices = [];
  const sides = 5,
    levels = 7;
  for (let row = 0; row <= levels; row++) {
    const t = row / levels;
    const r = radius * Math.pow(1 - t, 0.8) * (1 + Math.sin(t * 14) * 0.16);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * TAU + t * 1.1;
      positions.push(
        Math.cos(a) * r + lean * t * t,
        height * t,
        Math.sin(a) * r,
      );
      if (row < levels) {
        const k = row * sides + j,
          n = row * sides + ((j + 1) % sides);
        indices.push(k, n, k + sides, n, n + sides, k + sides);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createEffects(scene) {
  const effects = [],
    labels = [],
    particles = [];
  const texture = radialTexture();
  let disposed = false;
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const tint = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const alphas = new Float32Array(MAX_PARTICLES);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  particleGeometry.setAttribute(
    "aColor",
    new THREE.BufferAttribute(tint, 3).setUsage(THREE.DynamicDrawUsage),
  );
  particleGeometry.setAttribute(
    "aSize",
    new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage),
  );
  particleGeometry.setAttribute(
    "aAlpha",
    new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage),
  );
  particleGeometry.setDrawRange(0, 0);
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, pointScale: { value: 600 } },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      uniform float pointScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor; vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * pointScale / max(1.0, -mv.z), 1.0, 110.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float alpha = texture2D(map, gl_PointCoord).a * vAlpha;
        if (alpha < .006) discard;
        gl_FragColor = vec4(vColor, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(particleGeometry, particleMaterial);
  points.frustumCulled = false;
  points.renderOrder = 3;
  scene.add(points);

  function spark(
    x,
    y,
    z,
    hex,
    size = 0.25,
    life = 0.7,
    vx = 0,
    vy = 1,
    vz = 0,
    gravity = -0.8,
  ) {
    if (particles.length >= MAX_PARTICLES || disposed) return;
    particles.push({
      x,
      y,
      z,
      vx,
      vy,
      vz,
      size,
      life,
      age: 0,
      gravity,
      color: color(hex),
    });
  }

  function spray(x, y, z, hex, count, radius = 1, strength = 3, life = 0.6) {
    for (let i = 0; i < count; i++) {
      const angle = random(0, TAU),
        r = random(0, radius);
      spark(
        x + Math.sin(angle) * r,
        y + random(-0.2, 0.5),
        z + Math.cos(angle) * r,
        hex,
        random(0.1, 0.35),
        random(life * 0.65, life * 1.35),
        Math.sin(angle) * random(0.5, strength),
        random(0.8, strength),
        Math.cos(angle) * random(0.5, strength),
        -3,
      );
    }
  }

  function mesh(geometry, hex, opacity = 0.8) {
    const material = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    material.userData.baseOpacity = opacity;
    const object = new THREE.Mesh(geometry, material);
    object.renderOrder = 2;
    return object;
  }

  function removeEffect(effect) {
    scene.remove(effect.group);
    effect.group.traverse((object) => {
      object.geometry?.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
  }

  function effect(x, z, yaw, duration, animate) {
    if (effects.length >= MAX_EFFECTS) removeEffect(effects.shift());
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
    const item = { group, duration, age: 0, animate };
    effects.push(item);
    return group;
  }

  function slash(
    group,
    palette,
    radius = 2.6,
    tilt = 0.25,
    offset = 0,
    span = 2.55,
  ) {
    const holder = new THREE.Group();
    holder.position.y = 1.12 + offset;
    holder.rotation.z = tilt;
    const wide = mesh(
      arcGeometry(radius, 0.5, -span / 2, span / 2, 0.25),
      palette[0],
      0.55,
    );
    const core = mesh(
      arcGeometry(radius, 0.065, -span / 2, span / 2, 0.25),
      palette[1],
      0.95,
    );
    holder.add(wide, core);
    group.add(holder);
    return holder;
  }

  function ring(group, radius, hex, height = 0.08, width = 0.14) {
    const object = mesh(arcGeometry(radius, width, 0, TAU), hex, 0.7);
    object.position.y = height;
    group.add(object);
    return object;
  }

  function worldPoint(group, x, y, z) {
    return group.localToWorld(new THREE.Vector3(x, y, z));
  }

  function attack(event, palette) {
    const combo = Math.max(0, finite(event.combo)) % 3;
    const group = effect(event.x, event.z, event.yaw, 0.34, (g, p) => {
      g.scale.setScalar(0.75 + p * 0.42);
      g.rotation.y = event.yaw + (p - 0.5) * (combo === 1 ? -0.6 : 0.6);
    });
    slash(
      group,
      palette,
      combo === 2 ? 3 : 2.45,
      combo === 1 ? -0.5 : 0.38,
      combo === 2 ? 0.15 : 0,
      combo === 2 ? 3.5 : 2.8,
    );
    const origin = worldPoint(group, 0, 1.3, 1.9);
    spray(origin.x, origin.y, origin.z, palette[0], 14, 0.55, 2, 0.33);
  }

  function water(event, palette) {
    const index = event.index;
    const group = effect(
      event.x,
      event.z,
      event.yaw,
      index === 2 ? 1.15 : 0.8,
      (g, p, dt) => {
        if (index === 1) {
          g.position.x = event.x + Math.sin(event.yaw) * p * 8;
          g.position.z = event.z + Math.cos(event.yaw) * p * 8;
        }
        g.scale.setScalar(0.5 + p * (index === 2 ? 3 : 1.3));
        g.children.forEach((child, i) => {
          child.rotation.y += dt * 2.1 * (i % 2 ? -1 : 1);
        });
        if (p < 0.8 && Math.random() < 0.7) {
          const a = random(0, TAU),
            r = 2.5 * g.scale.x;
          spark(
            g.position.x + Math.sin(a) * r,
            random(0.2, 2.5),
            g.position.z + Math.cos(a) * r,
            palette[1],
            0.22,
            0.55,
            Math.sin(a),
            1,
            Math.cos(a),
            -1,
          );
        }
      },
    );
    if (index === 0) {
      const wheel = new THREE.Group();
      wheel.position.set(0, 1.75, 1.1);
      wheel.rotation.x = Math.PI / 2;
      group.add(wheel);
      ring(wheel, 2.2, palette[0], 0, 0.48);
      ring(wheel, 2.36, palette[1], 0, 0.045);
      ring(wheel, 1.92, palette[0], 0, 0.13);
    } else if (index === 1) {
      for (let i = 0; i < 3; i++)
        slash(group, palette, 2.1 + i * 0.32, (i - 1) * 0.4, i * 0.28, 3.7);
    } else {
      for (let i = 0; i < 4; i++)
        ring(
          group,
          1.2 + i * 0.55,
          i % 2 ? palette[1] : palette[0],
          0.1 + i * 0.22,
          i % 2 ? 0.06 : 0.24,
        );
      const veil = mesh(spiralGeometry(2.3, 2.8, 2, 0.35), palette[0], 0.4);
      group.add(veil);
    }
    spray(event.x, 1, event.z, palette[1], 35, 2, 3, 0.85);
  }

  function flame(event, palette) {
    const index = event.index;
    const group = effect(event.x, event.z, event.yaw, 1, (g, p, dt) => {
      g.scale.setScalar(0.5 + p * 1.65);
      if (index === 1) {
        g.position.x = event.x + Math.sin(event.yaw) * p * 9;
        g.position.z = event.z + Math.cos(event.yaw) * p * 9;
      }
      g.children.forEach((child, i) => {
        child.rotation.y += dt * (2.1 + i * 0.18);
      });
      if (p < 0.8) {
        const r = random(0.3, index === 2 ? 3.4 : 1.8),
          a = random(0, TAU);
        spark(
          g.position.x + Math.sin(a) * r,
          random(0.2, 2.4),
          g.position.z + Math.cos(a) * r,
          Math.random() < 0.5 ? palette[0] : palette[1],
          random(0.3, 0.7),
          0.55,
          Math.sin(a) * 0.6,
          random(2, 5),
          Math.cos(a) * 0.6,
          -0.5,
        );
      }
    });
    if (index === 0) {
      const arc = slash(group, palette, 2.9, 0.3, 0.3, 3.6);
      arc.rotation.x = -0.9;
      group.add(mesh(spiralGeometry(1.4, 4, 1.6, 0.45), palette[0], 0.65));
    } else {
      const amount = index === 2 ? 4 : 3;
      for (let i = 0; i < amount; i++) {
        const spiral = mesh(
          spiralGeometry(
            index === 2 ? 3.1 : 1.65,
            index === 2 ? 5 : 3,
            2.2,
            0.36 + i * 0.09,
            (i / amount) * TAU,
          ),
          i % 2 ? palette[1] : palette[0],
          0.55,
        );
        if (index === 1) {
          spiral.rotation.x = Math.PI / 2;
          spiral.position.set(0, 1.8, 1.4);
        }
        group.add(spiral);
      }
      if (index === 2) ring(group, 3.2, palette[0], 0.12, 0.3);
    }
    spray(event.x, 0.7, event.z, palette[0], 40, 1.5, 4, 1);
  }

  function bolt(group, start, end, hex, width = 0.055) {
    const points = [start.clone()];
    for (let i = 1; i < 10; i++) {
      const p = start.clone().lerp(end, i / 10);
      p.x += random(-0.5, 0.5);
      p.y += random(-0.45, 0.45);
      p.z += random(-0.35, 0.35);
      points.push(p);
    }
    points.push(end.clone());
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0);
    const core = mesh(
      new THREE.TubeGeometry(curve, 30, width, 3, false),
      hex,
      0.95,
    );
    group.add(core);
    const glow = mesh(
      new THREE.TubeGeometry(curve, 30, width * 3.5, 3, false),
      hex,
      0.22,
    );
    group.add(glow);
  }

  function thunder(event, palette) {
    const index = event.index;
    const group = effect(event.x, event.z, event.yaw, 0.65, (g, p) => {
      // Lightning pulses twice rather than fading as a solid tube.
      const pulse = (0.6 + 0.4 * Math.sin(p * 55)) * (1 - p);
      g.traverse((object) => {
        if (object.material)
          object.material.opacity =
            object.material.userData.baseOpacity * pulse;
      });
    });
    const count = index === 0 ? 2 : index === 1 ? 6 : 9;
    const length = 8 + index * 3;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * (index === 2 ? 0.75 : 0.35);
      const start = new THREE.Vector3(0, 1.1 + random(-0.3, 0.5), 0.6);
      const end = new THREE.Vector3(
        offset,
        random(0.4, 2.4),
        length - Math.abs(offset),
      );
      bolt(
        group,
        start,
        end,
        i % 2 ? palette[0] : palette[1],
        index === 2 ? 0.065 : 0.045,
      );
      if (i % 2 === 0)
        bolt(
          group,
          end.clone().multiplyScalar(0.6),
          new THREE.Vector3(offset + random(-2, 2), 0.15, length * 0.65),
          palette[0],
          0.025,
        );
    }
    ring(group, 2.2, palette[0], 0.09, 0.17);
    for (let i = 0; i < 35; i++) {
      const p = worldPoint(
        group,
        random(-1, 1),
        random(0.3, 1.8),
        random(0, length),
      );
      spark(
        p.x,
        p.y,
        p.z,
        palette[1],
        0.2,
        0.5,
        random(-2, 2),
        random(-0.5, 2),
        random(-2, 2),
        0,
      );
    }
  }

  function wind(event, palette) {
    const index = event.index;
    const group = effect(event.x, event.z, event.yaw, 1, (g, p) => {
      g.scale.setScalar(0.5 + p * (index === 2 ? 2 : 1.2));
      g.rotation.y = event.yaw + p * 4;
      if (index === 1) {
        g.position.x = event.x + Math.sin(event.yaw) * p * 11;
        g.position.z = event.z + Math.cos(event.yaw) * p * 11;
      }
      if (p < 0.85) {
        const a = p * 17,
          r = 2.6 * g.scale.x;
        spark(
          g.position.x + Math.sin(a) * r,
          random(0.4, 3.5),
          g.position.z + Math.cos(a) * r,
          palette[1],
          0.17,
          0.7,
          Math.cos(a) * 3,
          1,
          -Math.sin(a) * 3,
          0,
        );
      }
    });
    for (let i = 0; i < (index === 2 ? 5 : 3); i++) {
      group.add(
        mesh(
          spiralGeometry(
            2.4,
            index === 2 ? 5.4 : 3,
            1.5,
            i % 2 ? 0.075 : 0.3,
            (i * TAU) / 3,
          ),
          i % 2 ? palette[1] : palette[0],
          0.6,
        ),
      );
    }
    slash(group, palette, 3.1, 0.1, -0.4, 4.8);
    spray(event.x, 0.5, event.z, palette[0], 30, 2, 2, 0.9);
  }

  function mist(event, palette) {
    const index = event.index;
    const group = effect(event.x, event.z, event.yaw, 1.5, (g, p) => {
      g.scale.setScalar(0.7 + p * 1.8);
      g.rotation.y = event.yaw + p * 1.7;
      if (index === 1) {
        g.position.x = event.x + Math.sin(event.yaw) * p * 9;
        g.position.z = event.z + Math.cos(event.yaw) * p * 9;
      }
      if (p < 0.65) {
        for (let i = 0; i < 2; i++) {
          const a = random(0, TAU),
            r = random(0.2, index === 2 ? 5.5 : 3);
          spark(
            g.position.x + Math.sin(a) * r,
            random(0.2, 2.8),
            g.position.z + Math.cos(a) * r,
            palette[0],
            random(1.3, 2.7),
            random(0.8, 1.5),
            random(-0.4, 0.4),
            0.3,
            random(-0.4, 0.4),
            0,
          );
        }
      }
    });
    for (let i = 0; i < 3; i++) {
      const strand = mesh(
        spiralGeometry(2.7 + i * 0.2, 2.4, 1.2, 0.08, i * 2),
        palette[1],
        0.3,
      );
      group.add(strand);
    }
    slash(group, palette, 2.8, 0.12, 0.2, 4.5);
    for (let i = 0; i < 30; i++) {
      const a = random(0, TAU),
        r = random(0.2, 4);
      spark(
        event.x + Math.sin(a) * r,
        random(0.1, 2.3),
        event.z + Math.cos(a) * r,
        palette[0],
        random(1, 2.3),
        random(0.8, 1.6),
        Math.sin(a) * 0.6,
        0.3,
        Math.cos(a) * 0.6,
        0,
      );
    }
  }

  function sun(event, palette) {
    const index = event.index;
    const group = effect(event.x, event.z, event.yaw, 1.15, (g, p) => {
      g.scale.setScalar(0.6 + p * (index === 2 ? 2.2 : 1.5));
      g.rotation.y = event.yaw + p * 0.65;
      if (index === 1) {
        g.position.x = event.x + Math.sin(event.yaw) * p * 8;
        g.position.z = event.z + Math.cos(event.yaw) * p * 8;
      }
      if (p < 0.7) {
        const a = random(0, TAU),
          r = random(0.8, 3.1);
        spark(
          g.position.x + Math.sin(a) * r,
          random(0.5, 3),
          g.position.z + Math.cos(a) * r,
          palette[1],
          0.32,
          0.85,
          Math.sin(a) * 2.2,
          random(0.5, 3),
          Math.cos(a) * 2.2,
          0,
        );
      }
    });
    slash(group, palette, 3, 0.32, 0.1, 4.3);
    ring(group, 2.8, palette[0], 1.2, 0.3);
    ring(group, 2.95, palette[1], 1.2, 0.045);
    if (index === 2) {
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * TAU;
        const ray = mesh(
          ribbonGeometry(
            (t) =>
              new THREE.Vector3(
                Math.sin(angle) * (2 + t * 3.8),
                0.1 + t * 0.5,
                Math.cos(angle) * (2 + t * 3.8),
              ),
            0.17,
            16,
          ),
          i % 2 ? palette[0] : palette[1],
          0.7,
        );
        group.add(ray);
      }
      const halo = new THREE.Group();
      halo.position.y = 3;
      halo.rotation.x = Math.PI / 2;
      ring(halo, 1.5, palette[1], 0, 0.2);
      group.add(halo);
    } else {
      group.add(mesh(spiralGeometry(2.3, 3.4, 1.5, 0.36), palette[0], 0.6));
    }
    spray(event.x, 1.4, event.z, palette[1], 35, 1.7, 3.5, 0.8);
  }

  function moon(event, palette) {
    const index = event.index;
    const group = effect(event.x, event.z, event.yaw, 1.1, (g, p, dt) => {
      g.scale.setScalar(0.6 + p * 1.3);
      if (index === 1) {
        g.position.x = event.x + Math.sin(event.yaw) * p * 9;
        g.position.z = event.z + Math.cos(event.yaw) * p * 9;
      }
      g.children.forEach((child, i) => {
        child.rotation.y += dt * 1.5 * (i % 2 ? -1 : 1);
      });
    });
    const count = index === 0 ? 4 : index === 1 ? 8 : 14;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const crescent = new THREE.Group();
      crescent.position.set(
        Math.sin(a) * (index === 2 ? 2.8 : 1.3),
        0.5 + (i % 4) * 0.6,
        Math.cos(a) * (index === 2 ? 2.8 : 1.3),
      );
      crescent.rotation.set(random(-0.8, 0.8), a, random(-0.5, 0.5));
      crescent.add(
        mesh(
          arcGeometry(1.1 + (i % 3) * 0.3, 0.34, -0.95, 1.6),
          palette[0],
          0.65,
        ),
      );
      crescent.add(
        mesh(
          arcGeometry(1.1 + (i % 3) * 0.3, 0.045, -0.95, 1.6),
          palette[1],
          0.95,
        ),
      );
      group.add(crescent);
    }
    if (index === 2) {
      ring(group, 3.3, palette[0], 0.1, 0.23);
      ring(group, 3.6, palette[1], 0.1, 0.035);
    }
    spray(event.x, 1.2, event.z, palette[1], 35, 2.6, 1.8, 1.2);
  }

  function blood(event, palette) {
    const index = event.index;
    const group = effect(event.x, event.z, event.yaw, 1.25, (g, p) => {
      for (const child of g.children) {
        if (child.userData.thorn) {
          child.scale.y = Math.min(1, p * 7) * Math.min(1, (1 - p) * 4);
          child.position.y = -0.25;
        } else child.scale.setScalar(0.7 + p * 0.65);
      }
    });
    if (index === 0) {
      for (let i = 0; i < 3; i++)
        slash(group, palette, 2.3 + i * 0.25, 0.45, (i - 1) * 0.26, 2.6);
    } else {
      const count = index === 2 ? 12 : 8;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        const thorn = mesh(
          thornGeometry(random(2.3, 4), random(0.22, 0.45), random(-0.7, 0.7)),
          palette[0],
          0.82,
        );
        thorn.position.set(
          index === 2 ? Math.sin(a) * 3.3 : Math.sin(i * 4) * 1.3,
          -0.25,
          index === 2 ? Math.cos(a) * 3.3 : 1 + i * 1.15,
        );
        thorn.userData.thorn = true;
        group.add(thorn);
      }
      ring(group, index === 2 ? 3.6 : 2.6, palette[0], 0.07, 0.32);
    }
    spray(event.x, 0.5, event.z, palette[1], 35, 2, 3.5, 0.8);
  }

  function floatingText(position, text, textColor = "#fff1c5") {
    if (disposed || !position || text == null) return;
    if (labels.length >= 30) removeLabel(labels.shift());
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 52px system-ui, sans-serif";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(10,8,24,.9)";
    ctx.shadowBlur = 12;
    ctx.shadowColor = typeof textColor === "string" ? textColor : "#ffffff";
    const label = String(text).slice(0, 12);
    ctx.strokeText(label, 128, 48);
    ctx.fillStyle =
      typeof textColor === "number"
        ? `#${textColor.toString(16).padStart(6, "0")}`
        : textColor;
    ctx.fillText(label, 128, 48);
    const map = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(
      finite(position.x) + random(-0.2, 0.2),
      finite(position.y, 2.5),
      finite(position.z),
    );
    sprite.scale.set(1.9, 0.72, 1);
    sprite.renderOrder = 20;
    scene.add(sprite);
    labels.push({
      sprite,
      map,
      age: 0,
      baseY: sprite.position.y,
      drift: random(-0.35, 0.35),
    });
  }

  function removeLabel(label) {
    scene.remove(label.sprite);
    label.sprite.material.dispose();
    label.map.dispose();
  }

  function action(input) {
    if (disposed || !input || typeof input !== "object") return;
    const event = {
      ...input,
      x: finite(input.x),
      z: finite(input.z),
      yaw: finite(input.yaw),
      style: PALETTES[input.style] ? input.style : "water",
      index: Math.max(0, Math.min(2, Math.floor(finite(input.index)))),
    };
    const palette = PALETTES[event.style];
    switch (event.kind) {
      case "attack":
        attack(event, palette);
        break;
      case "ability":
        ({ water, flame, thunder, wind, mist, sun, moon, blood })[event.style](
          event,
          palette,
        );
        break;
      case "hit":
        floatingText(
          {
            x: event.x,
            y: finite(event.y, event.boss ? 3.9 : 2.3),
            z: event.z,
          },
          event.damage == null ? "HIT" : Math.round(finite(event.damage)),
          event.boss ? "#ffb2bc" : "#fff1c5",
        );
        spray(
          event.x,
          1.2,
          event.z,
          event.boss ? 0xff6f8f : palette[1],
          12,
          0.35,
          2.7,
          0.35,
        );
        break;
      case "dash": {
        const group = effect(event.x, event.z, event.yaw, 0.5, (g, p) => {
          g.scale.z = 1 + p * 1.5;
          g.scale.x = 1 - p * 0.45;
        });
        for (let i = 0; i < 5; i++) {
          const offset = (i - 2) * 0.18;
          const line = mesh(
            ribbonGeometry(
              (t) =>
                new THREE.Vector3(
                  offset + Math.sin(t * Math.PI) * 0.15,
                  0.45 + i * 0.2,
                  -t * 3.2,
                ),
              0.065,
              24,
            ),
            palette[i % 2],
            0.45,
          );
          group.add(line);
        }
        spray(event.x, 0.3, event.z, palette[0], 13, 0.65, 1.5, 0.5);
        break;
      }
      case "parry": {
        const group = effect(event.x, event.z, event.yaw, 0.5, (g, p) => {
          g.scale.setScalar(0.4 + p * 2.3);
        });
        const halo = new THREE.Group();
        halo.rotation.x = Math.PI / 2;
        halo.position.set(0, 1.5, 1);
        ring(halo, 1.2, 0xffdb86, 0, 0.14);
        group.add(halo);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          const ray = mesh(
            ribbonGeometry(
              (t) =>
                new THREE.Vector3(
                  Math.cos(a) * t * 1.7,
                  1.5 + Math.sin(a) * t * 1.7,
                  1,
                ),
              0.085,
              12,
            ),
            0xfff7cf,
            0.9,
          );
          group.add(ray);
        }
        spray(event.x, 1.5, event.z, 0xffdd85, 45, 0.3, 5, 0.6);
        floatingText({ x: event.x, y: 2.8, z: event.z }, "PARRY", "#ffe5a0");
        break;
      }
      case "windup": {
        const radius = Math.max(
          0.2,
          finite(event.radius, event.boss ? 7 : 3.5),
        );
        const count = event.boss ? 12 : 6;
        const duration = Math.max(
          0.1,
          finite(event.duration, event.boss ? 1.15 : 0.65),
        );
        const group = effect(event.x, event.z, event.yaw, duration, (g, p) => {
          // The danger boundary stays at the server's exact damage radius.
          g.rotation.y = event.yaw + p * 0.65;
          const pulse = 0.65 + Math.sin(p * (12 + p * 18)) * 0.2 + p * 0.15;
          g.traverse((object) => {
            if (object.material)
              object.material.opacity =
                object.material.userData.baseOpacity * pulse;
          });
        });
        ring(group, radius, 0xff3359, 0.045, 0.16);
        ring(group, radius * 0.96, 0xff7585, 0.05, 0.025);
        const danger = mesh(
          new THREE.CircleGeometry(radius, 64),
          0xff183f,
          0.065,
        );
        danger.rotation.x = -Math.PI / 2;
        danger.position.y = 0.025;
        group.add(danger);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU;
          const mark = mesh(
            ribbonGeometry(
              (t) =>
                new THREE.Vector3(
                  Math.sin(a) * radius * (0.7 + t * 0.26),
                  0.055,
                  Math.cos(a) * radius * (0.7 + t * 0.26),
                ),
              0.1,
              12,
            ),
            0xff3359,
            0.8,
          );
          group.add(mark);
        }
        break;
      }
      case "enemyAttack": {
        const radius = Math.max(
          0.2,
          finite(event.radius, event.boss ? 7 : 3.5),
        );
        const group = effect(
          event.x,
          event.z,
          event.yaw,
          event.boss ? 0.5 : 0.35,
          (g, p) => {
            for (const child of g.children) {
              if (child.userData.ripple) child.scale.setScalar(0.18 + p * 0.82);
            }
          },
        );
        ring(group, radius, 0xff426b, 0.07, 0.26);
        const ripple = ring(group, radius, 0xffb0b6, 0.1, 0.16);
        ripple.userData.ripple = true;
        for (let i = 0; i < (event.boss ? 12 : 7); i++) {
          const a = (i / (event.boss ? 12 : 7)) * TAU;
          const scar = mesh(
            ribbonGeometry(
              (t) =>
                new THREE.Vector3(
                  Math.sin(a) * radius * t,
                  Math.sin(t * Math.PI) * 0.65 + 0.1,
                  Math.cos(a) * radius * t,
                ),
              0.14,
              16,
            ),
            0xff385b,
            0.65,
          );
          group.add(scar);
        }
        spray(
          event.x,
          0.3,
          event.z,
          0xff426b,
          event.boss ? 45 : 24,
          radius * 0.8,
          event.boss ? 4 : 2.6,
          0.6,
        );
        break;
      }
      case "reward": {
        const group = effect(event.x, event.z, 0, 1.4, (g, p) => {
          g.scale.setScalar(0.3 + p * 2.3);
          g.position.y = p * 0.5;
          g.rotation.y = p * 2;
        });
        ring(group, 1.6, 0xffd582, 0.15, 0.19);
        ring(group, 1.9, 0xffedb8, 0.2, 0.04);
        spray(event.x, 1.5, event.z, 0xffdd8a, 40, 0.7, 3, 1.3);
        break;
      }
    }
  }

  function update(delta) {
    if (disposed) return;
    const dt = Math.min(0.1, Math.max(0, finite(delta)));
    particleMaterial.uniforms.pointScale.value =
      (typeof window === "undefined" ? 800 : window.innerHeight) * 0.75;
    for (let i = effects.length - 1; i >= 0; i--) {
      const item = effects[i];
      item.age += dt;
      if (item.age >= item.duration) {
        removeEffect(item);
        effects.splice(i, 1);
        continue;
      }
      const progress = item.age / item.duration;
      const fade = Math.min(1, progress * 12) * Math.pow(1 - progress, 0.65);
      item.group.traverse((object) => {
        if (object.material)
          object.material.opacity = object.material.userData.baseOpacity * fade;
      });
      item.animate?.(item.group, progress, dt);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i],
        k = i * 3,
        life = p.age / p.life;
      positions[k] = p.x;
      positions[k + 1] = p.y;
      positions[k + 2] = p.z;
      tint[k] = p.color.r;
      tint[k + 1] = p.color.g;
      tint[k + 2] = p.color.b;
      sizes[i] = p.size * (1 + life * 0.45);
      alphas[i] = Math.min(1, (1 - life) * 2) * (p.size > 1 ? 0.18 : 0.85);
    }
    for (const attribute of Object.values(particleGeometry.attributes))
      attribute.needsUpdate = true;
    particleGeometry.setDrawRange(0, particles.length);
    for (let i = labels.length - 1; i >= 0; i--) {
      const label = labels[i];
      label.age += dt;
      if (label.age > 1.15) {
        removeLabel(label);
        labels.splice(i, 1);
        continue;
      }
      label.sprite.position.y = label.baseY + label.age * 0.95;
      label.sprite.position.x += label.drift * dt;
      label.sprite.material.opacity = Math.min(1, (1.15 - label.age) * 3);
      const pop = 1 + Math.max(0, 0.15 - label.age) * 2;
      label.sprite.scale.set(1.9 * pop, 0.72 * pop, 1);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const item of effects) removeEffect(item);
    for (const label of labels) removeLabel(label);
    effects.length = labels.length = particles.length = 0;
    scene.remove(points);
    particleGeometry.dispose();
    particleMaterial.dispose();
    texture.dispose();
  }

  return { action, update, floatingText, dispose };
}
