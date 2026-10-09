import * as THREE from "/vendor/three/three.module.js";

// A fully articulated, original anime character. The root faces +Z, and its
// origin is at its feet. Attack/ability are elapsed progress (0 = idle, 1 = end).
export function createCharacter({
  color = "#5abfc5",
  faction = "slayer",
  enemy = false,
  boss = false,
  style = "water",
} = {}) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  const group = new THREE.Group();
  group.name = boss ? "Night Sovereign" : enemy ? "Forest demon" : "Slayer";
  const rig = new THREE.Group();
  group.add(rig);
  if (boss) group.scale.setScalar(1.78);
  const gradient = new THREE.DataTexture(
    new Uint8Array([
      65, 65, 65, 255, 145, 145, 145, 255, 208, 208, 208, 255, 255, 255, 255,
      255,
    ]),
    4,
    1,
    THREE.RGBAFormat,
  );
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  textures.add(gradient);
  const toon = (shade, props = {}) => {
    const material = new THREE.MeshToonMaterial({
      color: shade,
      gradientMap: gradient,
      ...props,
    });
    materials.add(material);
    return material;
  };
  const standard = (shade, props = {}) => {
    const material = new THREE.MeshStandardMaterial({ color: shade, ...props });
    materials.add(material);
    return material;
  };
  const skin = toon(enemy || faction === "demon" ? "#c8aec8" : "#f1c6ac");
  const uniform = toon(enemy || faction === "demon" ? "#241632" : "#182632");
  const trousers = toon("#14222b");
  const hair = toon(enemy || faction === "demon" ? "#34213f" : "#14272c");
  const hairLight = toon(enemy || faction === "demon" ? "#79516e" : "#23494a");
  const cream = toon("#ece6d0");
  const leather = toon("#27313c");
  const gold = standard("#cbb581", { metalness: 0.72, roughness: 0.28 });
  const steel = standard("#d5edf3", {
    metalness: 0.9,
    roughness: 0.18,
    emissive: "#8abac5",
    emissiveIntensity: 0.1,
  });
  const darkSteel = standard("#244149", { metalness: 0.84, roughness: 0.25 });
  const ruby = toon("#c25967", { emissive: "#381322", emissiveIntensity: 0.3 });
  const hornMaterial = toon("#443049");
  const allMeshes = [];
  const mesh = (geometry, material, parent = rig, x = 0, y = 0, z = 0) => {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    allMeshes.push(object);
    return object;
  };
  // Tailored profiles: each ring is [height, half width, half depth, z offset].
  // Rounded rectangular sections give clothes a flatter front and strong silhouette.
  const profile = (rings, sides = 8) => {
    const vertices = [],
      indices = [];
    const stride = sides + 1;
    for (const [y, width, depth, z = 0] of rings) {
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const sx = Math.sin(a),
          sz = Math.cos(a);
        vertices.push(
          Math.sign(sx) * Math.pow(Math.abs(sx), 0.65) * width,
          y,
          Math.sign(sz) * Math.pow(Math.abs(sz), 0.65) * depth + z,
        );
      }
    }
    for (let j = 0; j < rings.length - 1; j++)
      for (let i = 0; i < sides; i++) {
        const a = j * stride + i,
          b = a + 1;
        indices.push(a, b, a + stride, b, b + stride, a + stride);
      }
    // Close the end caps with matching winding.
    for (let i = 1; i < sides - 1; i++) indices.push(0, i + 1, i);
    const end = (rings.length - 1) * stride;
    for (let i = 1; i < sides - 1; i++) indices.push(end, end + i, end + i + 1);
    if (rings.at(-1)[0] < rings[0][0]) {
      for (let i = 0; i < indices.length; i += 3)
        [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    const uv = [];
    for (let j = 0; j < rings.length; j++) {
      const circumference = Math.PI * (rings[j][1] + rings[j][2]);
      for (let i = 0; i <= sides; i++)
        uv.push(
          (i / sides) * circumference * 1.5,
          (rings[j][0] - rings[0][0]) * 1.5,
        );
    }
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  };
  const ribbonPanel = (side, rear = false) => {
    const pos = [],
      uv = [],
      index = [];
    const rows = [
      { y: 0.61, inner: 0.018, outer: 0.232, z: -0.055 },
      { y: 0.76, inner: 0.027, outer: 0.245, z: -0.012 },
      { y: 1.02, inner: 0.045, outer: 0.215, z: 0.118 },
      { y: 1.25, inner: 0.071, outer: 0.256, z: 0.13 },
      { y: 1.44, inner: 0.105, outer: 0.276, z: 0.071 },
    ];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let j = 0; j <= 3; j++) {
        const t = j / 3,
          x = (row.inner + (row.outer - row.inner) * t) * side;
        const z = rear
          ? -0.136 - Math.sin(t * Math.PI) * 0.022
          : row.z - Math.sin(t * Math.PI) * 0.023;
        pos.push(x, row.y, z);
        uv.push(t * (row.outer - row.inner) * 1.5, (row.y - rows[0].y) * 1.5);
      }
    }
    for (let r = 0; r < rows.length - 1; r++)
      for (let j = 0; j < 3; j++) {
        const a = r * 4 + j;
        index.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return geo;
  };
  const clothTexture = (hex, demon) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = demon ? "#3e213f" : hex;
    ctx.fillRect(0, 0, 256, 256);
    if (demon) {
      ctx.strokeStyle = "#9c506d";
      ctx.lineWidth = 2;
      for (let i = -8; i < 12; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 32, 0);
        ctx.bezierCurveTo(i * 32 + 120, 90, i * 32 - 85, 160, i * 32 + 10, 256);
        ctx.stroke();
      }
      ctx.fillStyle = "#bea37d";
      for (let y = 24; y < 256; y += 64)
        for (let x = 24; x < 256; x += 64) {
          ctx.beginPath();
          ctx.moveTo(x, y - 7);
          ctx.lineTo(x + 7, y);
          ctx.lineTo(x, y + 7);
          ctx.lineTo(x - 7, y);
          ctx.fill();
        }
    } else {
      ctx.fillStyle = "#193439";
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++)
          if ((x + y) % 2) ctx.fillRect(x * 32, y * 32, 32, 32);
      ctx.strokeStyle = "rgba(255,255,220,.1)";
      ctx.lineWidth = 1;
      for (let n = 0; n <= 256; n += 32) {
        ctx.beginPath();
        ctx.moveTo(n, 0);
        ctx.lineTo(n, 256);
        ctx.moveTo(0, n);
        ctx.lineTo(256, n);
        ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 2;
    textures.add(texture);
    return texture;
  };
  const jacket = toon("#ffffff", {
    map: clothTexture(color, enemy || faction === "demon"),
    side: THREE.DoubleSide,
  });
  const tails = [
    mesh(ribbonPanel(-1), jacket),
    mesh(ribbonPanel(1), jacket),
    mesh(ribbonPanel(-1, true), jacket),
    mesh(ribbonPanel(1, true), jacket),
  ];
  const torso = mesh(
    profile(
      [
        [0, 0.172, 0.098],
        [0.18, 0.19, 0.105],
        [0.39, 0.238, 0.11],
        [0.52, 0.225, 0.084],
      ],
      10,
    ),
    uniform,
    rig,
    0,
    0.88,
  );
  const collar = mesh(
    profile(
      [
        [0, 0.098, 0.075],
        [0.09, 0.073, 0.061],
      ],
      10,
    ),
    uniform,
    rig,
    0,
    1.38,
  );
  mesh(
    profile(
      [
        [0, 0.182, 0.113],
        [0.063, 0.19, 0.113],
      ],
      12,
    ),
    cream,
    rig,
    0,
    0.885,
  );
  mesh(
    profile(
      [
        [0, 0.046, 0.022],
        [0.05, 0.047, 0.022],
      ],
      6,
    ),
    gold,
    rig,
    0.025,
    0.893,
    0.117,
  );
  for (let i = 0; i < 4; i++)
    mesh(
      new THREE.SphereGeometry(0.016, 6, 4),
      gold,
      rig,
      0,
      1.01 + i * 0.086,
      0.119,
    );
  // Cream lapels are sewn over the patterned open-front haori.
  const lapel = new THREE.Shape();
  lapel.moveTo(0, 0);
  lapel.lineTo(0.035, -0.013);
  lapel.lineTo(0.072, 0.27);
  lapel.lineTo(0.04, 0.43);
  lapel.lineTo(0.017, 0.42);
  for (const side of [-1, 1]) {
    const piece = mesh(
      new THREE.ShapeGeometry(lapel),
      cream,
      rig,
      side * 0.044,
      1.0,
      0.134,
    );
    piece.scale.x = side;
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.105, 0.855, 0);
    rig.add(leg);
    mesh(
      profile(
        [
          [0, 0.088, 0.084],
          [-0.15, 0.092, 0.091],
          [-0.35, 0.079, 0.073],
        ],
        8,
      ),
      trousers,
      leg,
    );
    const knee = new THREE.Group();
    knee.position.y = -0.345;
    leg.add(knee);
    mesh(
      profile(
        [
          [0, 0.078, 0.075],
          [-0.16, 0.073, 0.078],
          [-0.37, 0.052, 0.063],
        ],
        8,
      ),
      trousers,
      knee,
    );
    mesh(
      profile(
        [
          [0, 0.08, 0.078],
          [-0.13, 0.069, 0.078],
          [-0.25, 0.056, 0.068],
        ],
        8,
      ),
      cream,
      knee,
      0,
      -0.105,
    );
    for (let i = 0; i < 4; i++) {
      const band = mesh(
        profile(
          [
            [0, 0.075 - i * 0.004, 0.079 - i * 0.004],
            [0.012, 0.075 - i * 0.004, 0.079 - i * 0.004],
          ],
          8,
        ),
        leather,
        knee,
        0,
        -0.16 - i * 0.043,
      );
      band.rotation.z = side * 0.085;
    }
    mesh(
      profile(
        [
          [0, 0.062, 0.08],
          [-0.079, 0.077, 0.112, 0.024],
        ],
        8,
      ),
      leather,
      knee,
      0,
      -0.36,
    );
    mesh(
      profile(
        [
          [0, 0.081, 0.122, 0.027],
          [0.035, 0.081, 0.12, 0.027],
          [0.064, 0.068, 0.1, 0.025],
        ],
        10,
      ),
      leather,
      knee,
      0,
      -0.5,
    );
    mesh(
      profile(
        [
          [0, 0.083, 0.125, 0.025],
          [0.015, 0.083, 0.125, 0.025],
        ],
        10,
      ),
      cream,
      knee,
      0,
      -0.505,
    );
    legs.push({ leg, knee });
  }
  const arms = [];
  const clawGroup = new THREE.Group();
  rig.add(clawGroup);
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.275, 1.385, 0);
    rig.add(shoulder);
    mesh(
      profile(
        [
          [0.035, 0.1, 0.102],
          [-0.12, 0.118, 0.11],
          [-0.28, 0.095, 0.095],
        ],
        8,
      ),
      jacket,
      shoulder,
    );
    mesh(
      profile(
        [
          [0, 0.098, 0.098],
          [0.024, 0.097, 0.098],
        ],
        8,
      ),
      cream,
      shoulder,
      0,
      -0.27,
    );
    const elbow = new THREE.Group();
    elbow.position.y = -0.265;
    shoulder.add(elbow);
    mesh(
      profile(
        [
          [0, 0.071, 0.071],
          [-0.11, 0.063, 0.064],
          [-0.22, 0.048, 0.054],
        ],
        8,
      ),
      uniform,
      elbow,
    );
    mesh(
      profile(
        [
          [0, 0.055, 0.06],
          [-0.073, 0.054, 0.058],
        ],
        8,
      ),
      cream,
      elbow,
      0,
      -0.17,
    );
    for (let n = 0; n < 3; n++)
      mesh(
        profile(
          [
            [0, 0.055, 0.061],
            [0.008, 0.055, 0.061],
          ],
          8,
        ),
        leather,
        elbow,
        0,
        -0.185 - n * 0.018,
      );
    const hand = new THREE.Group();
    hand.position.y = -0.27;
    elbow.add(hand);
    mesh(
      profile(
        [
          [0.042, 0.041, 0.041],
          [0, 0.045, 0.049],
          [-0.069, 0.034, 0.043],
        ],
        8,
      ),
      skin,
      hand,
    );
    // Thin articulated claws remain hidden for human characters.
    const claws = new THREE.Group();
    hand.add(claws);
    for (let n = 0; n < 3; n++) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3((n - 1) * 0.025, -0.038, 0.018),
        new THREE.Vector3((n - 1) * 0.031, -0.12, 0.043),
        new THREE.Vector3((n - 1) * 0.028, -0.2, 0.077),
      ]);
      mesh(new THREE.TubeGeometry(curve, 6, 0.009, 4, false), ruby, claws);
    }
    arms.push({ shoulder, elbow, hand, claws });
  }
  const neck = mesh(
    profile(
      [
        [0, 0.064, 0.059],
        [0.085, 0.063, 0.06],
      ],
      10,
    ),
    skin,
    rig,
    0,
    1.41,
  );
  const headPivot = new THREE.Group();
  headPivot.position.y = 1.55;
  rig.add(headPivot);
  const face = mesh(
    profile(
      [
        [-0.061, 0.07, 0.069, 0.012],
        [-0.025, 0.111, 0.092, 0.012],
        [0.063, 0.139, 0.115],
        [0.167, 0.127, 0.108],
        [0.216, 0.078, 0.076],
      ],
      14,
    ),
    skin,
    headPivot,
  );
  // Soft flat face in front of the sculpted head, drawn with anime eyelids.
  const faceTexture = (demon) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 192;
    const ctx = canvas.getContext("2d");
    const eye = (x, y, mirrored = false, small = false) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(mirrored ? -1 : 1, 1);
      if (small) ctx.scale(0.55, 0.55);
      ctx.fillStyle = "#182026";
      ctx.beginPath();
      ctx.moveTo(-39, -12);
      ctx.quadraticCurveTo(-8, -26, 32, -10);
      ctx.lineTo(37, -17);
      ctx.lineTo(30, 15);
      ctx.quadraticCurveTo(0, 25, -37, 8);
      ctx.fill();
      ctx.fillStyle = demon ? "#ffb5e8" : "#f8f3e9";
      ctx.beginPath();
      ctx.moveTo(-30, -8);
      ctx.quadraticCurveTo(0, -16, 26, -7);
      ctx.lineTo(23, 13);
      ctx.quadraticCurveTo(-2, 19, -30, 6);
      ctx.fill();
      const iris = ctx.createRadialGradient(1, 3, 2, 1, 3, 14);
      iris.addColorStop(0, demon ? "#ff356f" : "#70c4b6");
      iris.addColorStop(1, demon ? "#812c65" : "#235b58");
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.ellipse(1, 2, 13, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#141b24";
      ctx.beginPath();
      ctx.ellipse(1, 2, demon ? 3 : 5, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(-3, -6, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#283134";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-33, -32);
      ctx.lineTo(25, -26);
      ctx.stroke();
      ctx.restore();
    };
    eye(70, 86);
    eye(186, 86, true);
    if (boss) {
      eye(78, 31, false, true);
      eye(178, 31, true, true);
      eye(70, 137, false, true);
      eye(186, 137, true, true);
    }
    ctx.strokeStyle = demon ? "#936378" : "#b17c69";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(127, 101);
    ctx.lineTo(122, 119);
    ctx.lineTo(129, 120);
    ctx.stroke();
    ctx.strokeStyle = "#7e515d";
    ctx.beginPath();
    ctx.moveTo(113, 150);
    ctx.quadraticCurveTo(127, 154, 142, 149);
    ctx.stroke();
    if (!demon) {
      ctx.strokeStyle = "#934f4d";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(53, 26);
      ctx.lineTo(59, 52);
      ctx.lineTo(47, 48);
      ctx.lineTo(43, 22);
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    return texture;
  };
  const faceMaterial = new THREE.MeshBasicMaterial({
    map: faceTexture(enemy || faction === "demon"),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  materials.add(faceMaterial);
  mesh(
    new THREE.PlaneGeometry(0.252, 0.19),
    faceMaterial,
    headPivot,
    0,
    0.066,
    0.119,
  );
  for (const side of [-1, 1]) {
    const ear = mesh(
      new THREE.SphereGeometry(0.032, 8, 6),
      skin,
      headPivot,
      side * 0.139,
      0.06,
      0,
    );
    ear.scale.set(0.6, 1.3, 0.6);
    const earring = mesh(
      profile(
        [
          [0, 0.018, 0.009],
          [-0.08, 0.022, 0.009],
        ],
        4,
      ),
      cream,
      headPivot,
      side * 0.142,
      0.025,
      0.023,
    );
    mesh(
      new THREE.SphereGeometry(0.01, 8, 6),
      gold,
      headPivot,
      side * 0.142,
      0.02,
      0.038,
    );
    mesh(
      new THREE.CircleGeometry(0.009, 8),
      ruby,
      headPivot,
      side * 0.142,
      -0.031,
      0.034,
    );
  }
  const hairCap = mesh(
    profile(
      [
        [0.051, 0.144, 0.118, -0.012],
        [0.14, 0.148, 0.122, -0.012],
        [0.222, 0.12, 0.096, -0.02],
        [0.255, 0.026, 0.028, -0.02],
      ],
      14,
    ),
    hair,
    headPivot,
  );
  // Swept, faceted locks instead of cones: each lock has an asymmetric kink.
  const lock = (base, tip, width, depth, bend = 0.05) => {
    const b = new THREE.Vector3(...base),
      t = new THREE.Vector3(...tip),
      axis = t.clone().sub(b);
    const tangent = new THREE.Vector3(axis.y, -axis.x, 0.08).normalize();
    const binormal = new THREE.Vector3()
      .crossVectors(axis, tangent)
      .normalize();
    const mid = b.clone().lerp(t, 0.53).addScaledVector(binormal, bend);
    const vertices = [],
      centers = [b, mid, t];
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2,
          factor = r === 0 ? 1 : r === 1 ? 0.65 : 0.015;
        const p = centers[r]
          .clone()
          .addScaledVector(tangent, Math.cos(a) * width * factor)
          .addScaledVector(binormal, Math.sin(a) * depth * factor);
        vertices.push(p.x, p.y, p.z);
      }
    const indices = [0, 2, 1, 0, 3, 2];
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 4; i++) {
        const a = r * 4 + i,
          b = r * 4 + ((i + 1) % 4);
        indices.push(a, b, a + 4, b, b + 4, a + 4);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };
  const hairLocks = [];
  for (let n = 0; n < 13; n++) {
    const a = (n / 13) * Math.PI * 2,
      y = 0.19 + (n % 3) * 0.015;
    const base = [Math.sin(a) * 0.107, y, Math.cos(a) * 0.086 - 0.015];
    const tip = [
      Math.sin(a + 0.17) * (0.178 + (n % 2) * 0.034),
      0.26 + (n % 3) * 0.035,
      Math.cos(a + 0.17) * 0.139 - 0.027,
    ];
    hairLocks.push(
      mesh(
        lock(base, tip, 0.047, 0.025),
        n % 4 === 0 ? hairLight : hair,
        headPivot,
      ),
    );
  }
  const bangs = [
    [[-0.109, 0.193, 0.092], [-0.139, -0.014, 0.122], 0.037],
    [[-0.061, 0.211, 0.112], [-0.064, 0.054, 0.143], 0.04],
    [[-0.018, 0.225, 0.111], [-0.027, 0.103, 0.143], 0.035],
    [[0.041, 0.207, 0.11], [0.087, 0.074, 0.142], 0.04],
    [[0.102, 0.179, 0.085], [0.147, -0.031, 0.083], 0.036],
  ];
  for (let n = 0; n < bangs.length; n++)
    hairLocks.push(
      mesh(
        lock(bangs[n][0], bangs[n][1], bangs[n][2], 0.023, -0.012),
        n === 1 ? hairLight : hair,
        headPivot,
      ),
    );
  for (const side of [-1, 1])
    for (let n = 0; n < 3; n++)
      hairLocks.push(
        mesh(
          lock(
            [side * 0.115, 0.115 - n * 0.035, -0.025],
            [side * (0.183 - n * 0.01), -0.049 - n * 0.042, -0.035 - n * 0.03],
            0.029,
            0.02,
          ),
          hair,
          headPivot,
        ),
      );
  const horns = new THREE.Group();
  headPivot.add(horns);
  for (const side of [-1, 1]) {
    mesh(
      lock(
        [side * 0.105, 0.19, 0.015],
        [side * 0.139, 0.372, 0.036],
        0.037,
        0.029,
        -0.045,
      ),
      hornMaterial,
      horns,
    );
    if (boss) {
      mesh(
        lock(
          [side * 0.139, 0.114, -0.027],
          [side * 0.245, 0.323, -0.08],
          0.042,
          0.032,
          -0.08,
        ),
        hornMaterial,
        horns,
      );
      mesh(
        lock(
          [side * 0.078, 0.212, -0.071],
          [side * 0.101, 0.426, -0.169],
          0.03,
          0.024,
          -0.046,
        ),
        hornMaterial,
        horns,
      );
    }
  }
  // A curved katana with a luminous edge, braided hilt and circular guard.
  const sword = new THREE.Group();
  arms[1].hand.add(sword);
  sword.rotation.set(1.72, 0, -0.22);
  sword.position.set(0.015, -0.018, 0.025);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.018, 0);
  bladeShape.quadraticCurveTo(-0.009, 0.44, 0.047, 0.79);
  bladeShape.lineTo(0.064, 0.863);
  bladeShape.lineTo(0.038, 0.84);
  bladeShape.quadraticCurveTo(-0.039, 0.44, -0.032, 0);
  bladeShape.closePath();
  mesh(
    new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.009,
      bevelEnabled: false,
      curveSegments: 12,
    }),
    steel,
    sword,
    0,
    0.021,
    -0.0045,
  );
  const spine = new THREE.Shape();
  spine.moveTo(-0.032, 0);
  spine.quadraticCurveTo(-0.039, 0.44, 0.038, 0.84);
  spine.lineTo(0.047, 0.79);
  spine.quadraticCurveTo(-0.009, 0.44, -0.019, 0);
  spine.closePath();
  mesh(new THREE.ShapeGeometry(spine, 12), darkSteel, sword, 0, 0.021, -0.005);
  mesh(
    profile(
      [
        [0, 0.021, 0.022],
        [-0.155, 0.023, 0.023],
      ],
      8,
    ),
    leather,
    sword,
    0,
    -0.018,
  );
  for (let n = 0; n < 5; n++) {
    const wrap = mesh(
      profile(
        [
          [0, 0.024, 0.024],
          [0.013, 0.024, 0.024],
        ],
        8,
      ),
      cream,
      sword,
      0,
      -0.149 + n * 0.028,
    );
    wrap.rotation.z = 0.27;
  }
  const guard = mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.012, 10),
    gold,
    sword,
    0,
    0,
  );
  guard.scale.z = 0.8;
  mesh(new THREE.SphereGeometry(0.025, 8, 6), gold, sword, 0, -0.177).scale.y =
    0.3;
  const glintMat = new THREE.MeshBasicMaterial({
    color: "#efffff",
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  materials.add(glintMat);
  const glint = mesh(
    new THREE.PlaneGeometry(0.009, 0.32),
    glintMat,
    sword,
    0.007,
    0.45,
    0.007,
  );
  glint.rotation.z = -0.085;
  const sheath = new THREE.Group();
  sheath.position.set(-0.222, 0.93, -0.06);
  sheath.rotation.set(-1.11, 0, 0.18);
  rig.add(sheath);
  mesh(
    profile(
      [
        [0.1, 0.028, 0.027],
        [0, 0.026, 0.025],
        [-0.79, 0.023, 0.024],
        [-0.84, 0.014, 0.017],
      ],
      8,
    ),
    darkSteel,
    sheath,
  );
  for (const y of [0.09, -0.02, -0.81])
    mesh(
      profile(
        [
          [0, 0.03, 0.029],
          [0.022, 0.03, 0.029],
        ],
        8,
      ),
      gold,
      sheath,
      0,
      y,
    );
  // Small badge and the hem insignia remain readable at third-person distance.
  mesh(new THREE.CircleGeometry(0.042, 8), gold, rig, -0.146, 1.295, 0.131);
  mesh(new THREE.CircleGeometry(0.03, 8), uniform, rig, -0.146, 1.295, 0.133);
  const demonMark = new THREE.Group();
  rig.add(demonMark);
  for (const side of [-1, 1]) {
    const streak = mesh(
      profile(
        [
          [0, 0.015, 0.007],
          [0.16, 0.024, 0.007],
        ],
        4,
      ),
      ruby,
      demonMark,
      side * 0.111,
      1.08,
      0.116,
    );
    streak.rotation.z = side * 0.2;
  }
  // Contact shadow complements the real shadow and keeps feet grounded.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 64;
  const shadowCtx = shadowCanvas.getContext("2d"),
    radial = shadowCtx.createRadialGradient(32, 32, 5, 32, 32, 30);
  radial.addColorStop(0, "rgba(3,6,15,.5)");
  radial.addColorStop(1, "rgba(3,6,15,0)");
  shadowCtx.fillStyle = radial;
  shadowCtx.fillRect(0, 0, 64, 64);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  textures.add(shadowTexture);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.62,
  });
  materials.add(shadowMaterial);
  const shadow = mesh(
    new THREE.PlaneGeometry(0.8, 0.8),
    shadowMaterial,
    group,
    0,
    0.014,
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.castShadow = false;
  // Merge sewn details on each rigid part. Animation pivots stay articulated,
  // but the many wraps, fasteners and hair locks do not cost individual draws.
  const batch = (objects) => {
    const byMaterial = new Map(),
      output = [];
    objects.forEach((object) => {
      const bucket = byMaterial.get(object.material) || [];
      bucket.push(object);
      byMaterial.set(object.material, bucket);
    });
    for (const [material, bucket] of byMaterial) {
      if (bucket.length < 2) {
        output.push(...bucket);
        continue;
      }
      const count = bucket.reduce(
        (total, object) =>
          total + object.geometry.getAttribute("position").count,
        0,
      );
      const positions = new Float32Array(count * 3),
        normals = new Float32Array(count * 3),
        uvs = new Float32Array(count * 2),
        indices = [];
      const point = new THREE.Vector3(),
        normal = new THREE.Vector3(),
        normalMatrix = new THREE.Matrix3();
      let offset = 0;
      for (const object of bucket) {
        object.updateMatrix();
        normalMatrix.getNormalMatrix(object.matrix);
        const geometry = object.geometry,
          position = geometry.getAttribute("position"),
          vertexNormal = geometry.getAttribute("normal"),
          uv = geometry.getAttribute("uv");
        for (let i = 0; i < position.count; i++) {
          point
            .fromBufferAttribute(position, i)
            .applyMatrix4(object.matrix)
            .toArray(positions, (offset + i) * 3);
          if (vertexNormal)
            normal
              .fromBufferAttribute(vertexNormal, i)
              .applyNormalMatrix(normalMatrix)
              .toArray(normals, (offset + i) * 3);
          if (uv) {
            uvs[(offset + i) * 2] = uv.getX(i);
            uvs[(offset + i) * 2 + 1] = uv.getY(i);
          }
        }
        const reflected = object.matrix.determinant() < 0;
        const size = geometry.index?.count || position.count;
        for (let i = 0; i < size; i += 3) {
          const a = geometry.index ? geometry.index.getX(i) : i;
          const b = geometry.index ? geometry.index.getX(i + 1) : i + 1;
          const c = geometry.index ? geometry.index.getX(i + 2) : i + 2;
          indices.push(
            offset + a,
            offset + (reflected ? c : b),
            offset + (reflected ? b : c),
          );
        }
        offset += position.count;
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      merged.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      merged.setIndex(indices);
      const combined = mesh(merged, material, bucket[0].parent);
      output.push(combined);
      for (const object of bucket) {
        object.removeFromParent();
        geometries.delete(object.geometry);
        object.geometry.dispose();
      }
    }
    return output;
  };
  const animated = new Set([torso, ...tails, glint, ...hairLocks]);
  const rigidParents = [
    rig,
    headPivot,
    horns,
    demonMark,
    sword,
    sheath,
    ...legs.flatMap(({ leg, knee }) => [leg, knee]),
    ...arms.flatMap(({ shoulder, elbow, hand, claws }) => [
      shoulder,
      elbow,
      hand,
      claws,
    ]),
  ];
  for (const parent of rigidParents)
    batch(
      parent.children.filter(
        (object) => object.isMesh && !animated.has(object),
      ),
    );
  hairLocks.splice(0, hairLocks.length, ...batch(hairLocks));
  let demon = enemy || faction === "demon",
    health = 1,
    elapsed = 0,
    movement = 0;
  const applyFaction = () => {
    horns.visible = demon;
    demonMark.visible = demon;
    arms.forEach((a) => {
      a.claws.visible = demon;
    });
    sword.visible = !demon;
    sheath.visible = !demon;
    skin.color.set(demon ? "#c8aec8" : "#f1c6ac");
    uniform.color.set(demon ? "#241632" : "#182632");
    hair.color.set(demon ? "#34213f" : "#14272c");
    hairLight.color.set(demon ? "#79516e" : "#23494a");
  };
  applyFaction();
  return {
    group,
    update(
      dt,
      {
        moving = false,
        sprinting = false,
        attack = 0,
        combo = 0,
        blocking = false,
        airborne = false,
        ability = 0,
        dead = false,
        time,
      } = {},
    ) {
      elapsed = time === undefined ? elapsed + dt : time;
      movement = THREE.MathUtils.damp(
        movement,
        moving && !dead ? 1 : 0,
        12,
        dt,
      );
      const pace = elapsed * (sprinting ? 14 : 9.6),
        stride = Math.sin(pace),
        step = movement * (sprinting ? 0.79 : 0.5);
      rig.position.y =
        movement * Math.abs(Math.cos(pace)) * (sprinting ? 0.048 : 0.027) +
        Math.sin(elapsed * 2.1) * 0.008;
      rig.rotation.x = THREE.MathUtils.damp(
        rig.rotation.x,
        dead ? 0 : sprinting && moving ? 0.13 : health < 0.25 ? 0.07 : 0,
        10,
        dt,
      );
      rig.rotation.z = THREE.MathUtils.damp(
        rig.rotation.z,
        dead ? 1.57 : stride * movement * 0.025,
        7,
        dt,
      );
      rig.rotation.y = 0;
      if (dead) {
        rig.position.y = 0.1;
        rig.position.x = -0.55;
      } else rig.position.x = 0;
      torso.rotation.x = Math.sin(elapsed * 2.1) * 0.013;
      headPivot.rotation.x =
        Math.sin(elapsed * 1.6) * 0.015 - (blocking ? 0.08 : 0);
      headPivot.rotation.y = Math.sin(elapsed * 0.8) * 0.028 * (1 - movement);
      legs.forEach(({ leg, knee }, n) => {
        const wave = n === 0 ? stride : -stride;
        leg.rotation.x = wave * step;
        knee.rotation.x = Math.max(0, -wave) * step * 0.8;
        if (airborne) {
          leg.rotation.x = n === 0 ? -0.53 : 0.31;
          knee.rotation.x = n === 0 ? 0.9 : 0.42;
        }
      });
      arms.forEach(({ shoulder, elbow }, n) => {
        shoulder.rotation.set(
          (n === 0 ? -stride : stride) * step * 0.72 - 0.07,
          0,
          n === 0 ? 0.14 : -0.14,
        );
        elbow.rotation.set(-0.08 - movement * 0.16, 0, 0);
      });
      sword.rotation.set(1.72, 0, -0.22);
      if (blocking && !dead) {
        arms[1].shoulder.rotation.set(-0.87, -0.55, -0.64);
        arms[1].elbow.rotation.x = -1.12;
        arms[0].shoulder.rotation.set(-0.95, 0.3, 0.6);
        arms[0].elbow.rotation.x = -0.9;
        sword.rotation.set(0.28, -0.2, -1.15);
      }
      if (attack > 0 && !dead) {
        const p = THREE.MathUtils.clamp(attack, 0, 1),
          swing = Math.sin(p * Math.PI),
          cut = THREE.MathUtils.smoothstep(p, 0.1, 0.65);
        const flip = combo % 2 ? -1 : 1;
        rig.rotation.y = flip * (-0.7 + cut * 1.35) * swing;
        rig.rotation.x += swing * 0.13;
        if (combo % 3 === 2) {
          arms[1].shoulder.rotation.set(-2.4 + cut * 3.1, -0.35, -0.15);
          arms[1].elbow.rotation.x = -0.6 * (1 - cut);
          sword.rotation.set(0.6, 0, -0.12);
        } else {
          arms[1].shoulder.rotation.set(
            -1.02 + cut * 0.44,
            flip * (-1.22 + cut * 2.5),
            -0.4 - swing * 0.7,
          );
          arms[1].elbow.rotation.x = -0.6 + cut * 0.35;
          sword.rotation.set(1.1, -0.3, flip * -1.1);
        }
        arms[0].shoulder.rotation.set(-0.52, 0.3, 0.45 + swing * 0.2);
        if (demon)
          arms[0].shoulder.rotation.set(-1.25 + cut * 1.7, -flip * 0.7, 0.5);
      }
      if (ability > 0 && !dead) {
        const p = THREE.MathUtils.clamp(ability, 0, 1),
          power = Math.sin(p * Math.PI);
        if (style === "water" || style === "wind" || style === "moon") {
          rig.rotation.y = Math.PI * 2 * p;
          arms[1].shoulder.rotation.set(-0.5, -0.9, -1.2);
          arms[0].shoulder.rotation.set(-0.4, 0.3, 1.05);
        } else if (style === "thunder") {
          rig.rotation.x = power * 0.45;
          arms[1].shoulder.rotation.set(-0.45, -1.05 + p * 2, -0.8);
          legs[0].leg.rotation.x = -0.48;
          legs[1].leg.rotation.x = 0.45;
        } else if (style === "mist") {
          rig.rotation.y = -0.45 + p * 0.9;
          arms[1].shoulder.rotation.set(-0.85, -0.6, -0.3);
          arms[1].elbow.rotation.x = -0.9;
        } else {
          arms[1].shoulder.rotation.set(-2.55 + p * 3.2, -0.3, -0.35);
          arms[0].shoulder.rotation.set(-1.7 * power, 0.2, 0.5);
          rig.rotation.x = power * 0.12;
        }
      }
      tails.forEach((tail, n) => {
        tail.rotation.x =
          Math.sin(elapsed * 3 + n) * 0.011 +
          movement * (sprinting ? -0.11 : -0.045);
        tail.rotation.z = Math.sin(pace + n) * movement * 0.012;
      });
      hairLocks.forEach((lock, n) => {
        lock.rotation.x =
          Math.sin(elapsed * 3.4 + n * 0.7) * 0.008 + (airborne ? -0.015 : 0);
      });
      glintMat.opacity =
        0.4 + Math.sin(elapsed * 4) * 0.3 + (attack > 0 ? 0.5 : 0);
      glint.position.y = 0.35 + (Math.sin(elapsed * 1.8) * 0.5 + 0.5) * 0.32;
      shadowMaterial.opacity = airborne ? 0.16 : 0.62;
    },
    setAppearance(options = {}) {
      if (options.color) color = options.color;
      if (options.faction) faction = options.faction;
      if (options.style) style = options.style;
      const nextDemon = enemy || faction === "demon";
      if (options.color || nextDemon !== demon) {
        const previous = jacket.map;
        jacket.map = clothTexture(color, nextDemon);
        jacket.needsUpdate = true;
        textures.delete(previous);
        previous.dispose();
      }
      if (nextDemon !== demon) {
        const previous = faceMaterial.map;
        faceMaterial.map = faceTexture(nextDemon);
        faceMaterial.needsUpdate = true;
        textures.delete(previous);
        previous.dispose();
      }
      demon = nextDemon;
      applyFaction();
      if (options.equipment) {
        const equipment =
          typeof options.equipment === "string"
            ? options.equipment
            : options.equipment.sword || "";
        gold.color.set(
          String(equipment).toLowerCase().includes("moon")
            ? "#b69ee8"
            : "#cbb581",
        );
      }
    },
    setHealth(ratio) {
      health = THREE.MathUtils.clamp(Number(ratio) || 0, 0, 1);
    },
    dispose() {
      group.removeFromParent();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
