import * as THREE from "/vendor/three/three.module.js";

// All scenery is authored procedurally. The walkable valley is intentionally
// flat: visual hills sit beyond the arena so client and server agree on physics.
export function createWorld(scene) {
  const root = new THREE.Group();
  root.name = "Moonveil valley";
  scene.add(root);
  let randomState = 846721;
  const rand = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const range = (a, b) => a + rand() * (b - a);
  const materials = {};
  const mat = (name, color, extras = {}) =>
    (materials[name] ||= new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      ...extras,
    }));
  const wood = mat("wood", "#57392e");
  const red = mat("red", "#aa3838");
  const lacquer = mat("lacquer", "#cd5750", { roughness: 0.57 });
  const stone = mat("stone", "#8a939b");
  const paleStone = mat("paleStone", "#bbb6af");
  const roofMat = mat("roof", "#343b57", { roughness: 0.66 });
  const roofEdge = mat("roofEdge", "#586076");
  const gold = mat("gold", "#cfa46a", { metalness: 0.4, roughness: 0.4 });
  const paper = mat("paper", "#e9d6b5");
  const lanternPaper = mat("lanternPaper", "#ffd4a0", {
    emissive: "#ffb967",
    emissiveIntensity: 0.75,
  });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const sphere = new THREE.IcosahedronGeometry(1, 2);
  const mesh = (
    geometry,
    material,
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    parent = root,
  ) => {
    const obj = new THREE.Mesh(geometry, material);
    obj.position.set(x, y, z);
    obj.scale.set(sx, sy, sz);
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.userData.staticWorld = true;
    parent.add(obj);
    return obj;
  };
  const box = (material, x, y, z, w, h, d, parent = root) =>
    mesh(cube, material, x, y, z, w, h, d, parent);
  const pole = (material, x, y, z, r, h, parent = root) =>
    mesh(cylinder, material, x, y, z, r, h, r, parent);
  const line = (a, b, radius, material, parent = root) => {
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const result = pole(
      material,
      mid.x,
      mid.y,
      mid.z,
      radius,
      a.distanceTo(b),
      parent,
    );
    result.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    return result;
  };

  scene.fog = new THREE.FogExp2(0xa8a2b8, 0.0032);
  const skyUniforms = {
    zenith: { value: new THREE.Color("#858cc0") },
    horizon: { value: new THREE.Color("#f4c8bd") },
    night: { value: 0 },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyUniforms,
    vertexShader:
      "varying vec3 vPosition; void main(){vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `varying vec3 vPosition; uniform vec3 zenith; uniform vec3 horizon; uniform float night;
      void main(){float h=normalize(vPosition).y; vec3 c=mix(horizon,zenith,smoothstep(-.035,.73,h));
      c=mix(c,vec3(.07,.085,.19),night*smoothstep(-.2,.7,h)); gl_FragColor=vec4(c,1.);}`,
    toneMapped: false,
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 20),
    skyMaterial,
  );
  sky.renderOrder = -10;
  root.add(sky);
  const hemisphere = new THREE.HemisphereLight(0xd4d8ff, 0x645746, 1.3);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffd2b7, 2.2);
  sun.position.set(-35, 65, 35);
  sun.target.position.set(0, 0, -15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -65,
    right: 65,
    top: 65,
    bottom: -65,
    near: 0.5,
    far: 180,
  });
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.045;
  scene.add(sun, sun.target);
  const moonLight = new THREE.DirectionalLight(0xabb7ff, 0.85);
  moonLight.position.set(45, 65, -70);
  scene.add(moonLight);

  const moon = mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.MeshBasicMaterial({
      color: "#fff4dc",
      fog: false,
      toneMapped: false,
    }),
    -58,
    76,
    -210,
    15,
    15,
    15,
  );
  moon.castShadow = false;
  const moonHalo = mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader:
        "varying vec2 uvv; void main(){uvv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec2 uvv;void main(){float d=length(uvv-.5)*2.;gl_FragColor=vec4(1.,.83,.75,pow(max(0.,1.-d),4.)*.24);}",
      toneMapped: false,
    }),
    -58,
    76,
    -211,
    85,
    85,
    1,
  );
  moonHalo.castShadow = false;
  const starPositions = [];
  for (let i = 0; i < 230; i++) {
    const az = range(0, Math.PI * 2),
      h = range(0.16, 0.98),
      r = Math.sqrt(1 - h * h) * 490;
    starPositions.push(Math.cos(az) * r, h * 490, Math.sin(az) * r);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starPositions, 3),
  );
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: "#e8e5ff",
      size: 1.15,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      fog: false,
    }),
  );
  root.add(stars);

  const groundDetail = { value: 1 };
  const groundMaterial = mat("ground", "#979779");
  groundMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.groundDetail = groundDetail;
    shader.vertexShader =
      "varying vec3 groundPos;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ngroundPos=(modelMatrix*vec4(position,1.)).xyz;",
      );
    shader.fragmentShader =
      `varying vec3 groundPos; uniform float groundDetail;
      float groundHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float groundNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(groundHash(i),groundHash(i+vec2(1.,0.)),f.x),mix(groundHash(i+vec2(0.,1.)),groundHash(i+vec2(1.)),f.x),f.y);}
      ` +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float groundVariation=.5;float groundGrain=1.;
      if(groundDetail>.5){groundVariation=groundNoise(groundPos.xz*.07)*.65+groundNoise(groundPos.xz*.31)*.35;groundGrain=1.+(groundNoise(groundPos.xz*3.)-.5)*.075;}
      vec3 grassA=vec3(.17,.23,.145),grassB=vec3(.29,.31,.20);
      diffuseColor.rgb=mix(grassA,grassB,groundVariation)*groundGrain;`,
      );
  };
  const ground = mesh(
    new THREE.PlaneGeometry(240, 240),
    groundMaterial,
    0,
    0,
    0,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;

  const ribbon = (points, width, material, elevation = 0.035) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p[0], elevation, p[1])),
    );
    const vertices = [],
      uvs = [],
      indices = [],
      segments = 150;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments,
        p = curve.getPoint(t),
        tangent = curve.getTangent(t);
      const irregular =
        width * (1 + 0.07 * Math.sin(t * 61) + 0.04 * Math.cos(t * 94));
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x)
        .normalize()
        .multiplyScalar(irregular / 2);
      vertices.push(
        p.x + normal.x,
        elevation,
        p.z + normal.z,
        p.x - normal.x,
        elevation,
        p.z - normal.z,
      );
      uvs.push(0, t * curve.getLength(), 1, t * curve.getLength());
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const object = new THREE.Mesh(geo, material);
    object.receiveShadow = true;
    root.add(object);
    return curve;
  };
  const pathMaterial = mat("path", "#afa9a1");
  pathMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec2 pathUV;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\npathUV=uv;",
      );
    shader.fragmentShader =
      "varying vec2 pathUV;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec2 tile=vec2(pathUV.x*5.+mod(floor(pathUV.y),2.)*.5,pathUV.y);
      vec2 cell=fract(tile);float mortar=1.-smoothstep(.035,.065,min(min(cell.x,1.-cell.x),min(cell.y,1.-cell.y)));
      float variation=fract(sin(dot(floor(tile),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=.91+variation*.13;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.48,.49,.47),mortar*.4);`,
      );
  };
  ribbon(
    [
      [0, 35],
      [0, 18],
      [1, 8],
      [-1, -5],
      [0, -15],
      [1, -27],
      [0, -43],
      [0, -52],
    ],
    5,
    pathMaterial,
  );
  ribbon(
    [
      [0, 9],
      [8, 8],
      [16, 8],
      [23, 12],
    ],
    3,
    pathMaterial,
    0.04,
  );
  ribbon(
    [
      [0, -9],
      [-7, -9],
      [-18, -6],
    ],
    3.7,
    pathMaterial,
    0.045,
  );
  ribbon(
    [
      [-2, 16],
      [-14, 17],
      [-26, 17],
      [-32, 18],
    ],
    2.7,
    pathMaterial,
    0.046,
  );
  const clearing = mesh(
    new THREE.CircleGeometry(12, 64),
    mat("clearing", "#a5a7a1"),
    0,
    0.028,
    -43,
  );
  clearing.rotation.x = -Math.PI / 2;
  clearing.castShadow = false;
  const arenaRing = mesh(
    new THREE.RingGeometry(10.9, 11.05, 72),
    mat("arenaRing", "#bcaca0"),
    0,
    0.035,
    -43,
  );
  arenaRing.rotation.x = -Math.PI / 2;
  arenaRing.castShadow = false;

  // Curved tile roofs: raised corners, deep eaves and a continuous central ridge.
  function roof(parent, w, d, height, pitch = 0.38) {
    const vertices = [],
      indices = [],
      normals = [],
      uvs = [],
      sx = 32,
      sz = 12;
    const roofY = (x, z) =>
      height -
      Math.abs(x) * pitch +
      0.6 * Math.pow(Math.abs(x) / (w / 2), 6) +
      0.24 * Math.pow(Math.abs(z) / (d / 2), 8);
    for (let iz = 0; iz <= sz; iz++)
      for (let ix = 0; ix <= sx; ix++) {
        const x = (ix / sx - 0.5) * w,
          z = (iz / sz - 0.5) * d;
        vertices.push(x, roofY(x, z), z);
        uvs.push(ix / sx, iz / sz);
        if (ix < sx && iz < sz) {
          const a = iz * (sx + 1) + ix;
          indices.push(a, a + sx + 1, a + 1, a + 1, a + sx + 1, a + sx + 2);
        }
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const tiles = new THREE.Mesh(geo, roofMat);
    tiles.material.side = THREE.DoubleSide;
    tiles.castShadow = true;
    tiles.receiveShadow = true;
    parent.add(tiles);
    const curveLine = (points, r, material) => {
      const g = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        points.length * 2,
        r,
        5,
        false,
      );
      return mesh(g, material, 0, 0, 0, 1, 1, 1, parent);
    };
    for (const z of [-d / 2, d / 2]) {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const x = (i / 20 - 0.5) * w;
        pts.push(new THREE.Vector3(x, roofY(x, z), z));
      }
      curveLine(pts, 0.12, roofEdge);
    }
    for (let i = 0; i <= 20; i++) {
      const x = (i / 20 - 0.5) * w;
      curveLine(
        [
          new THREE.Vector3(x, roofY(x, -d / 2) + 0.02, -d / 2),
          new THREE.Vector3(x, roofY(x, 0) + 0.025, 0),
          new THREE.Vector3(x, roofY(x, d / 2) + 0.02, d / 2),
        ],
        0.038,
        roofEdge,
      );
    }
    box(roofEdge, 0, height + 0.13, 0, 0.26, 0.3, d + 0.45, parent);
    for (const z of [-d / 2, d / 2]) {
      const ornament = mesh(
        new THREE.TorusGeometry(0.34, 0.06, 6, 12, Math.PI * 1.4),
        gold,
        0,
        height + 0.35,
        z,
        1,
        1,
        1,
        parent,
      );
      ornament.rotation.y = Math.PI / 2;
    }
  }
  function lantern(x, y, z, parent = root, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.scale.setScalar(scale);
    parent.add(group);
    pole(wood, 0, 0.6, 0, 0.025, 1.1, group);
    const body = mesh(
      new THREE.SphereGeometry(0.34, 14, 10),
      lanternPaper,
      0,
      0,
      0,
      1,
      1.38,
      1,
      group,
    );
    body.castShadow = false;
    for (let j = -3; j <= 3; j++) {
      const r = Math.sqrt(Math.max(0.01, 1 - (j / 4) ** 2)) * 0.34;
      const hoop = mesh(
        new THREE.TorusGeometry(r, 0.01, 3, 14),
        gold,
        0,
        j * 0.105,
        0,
        1,
        1,
        1,
        group,
      );
      hoop.rotation.x = Math.PI / 2;
    }
    pole(wood, 0, 0.46, 0, 0.13, 0.07, group);
    pole(wood, 0, -0.46, 0, 0.12, 0.06, group);
    pole(lacquer, 0, -0.64, 0, 0.025, 0.29, group);
    return group;
  }
  function building(x, z, w, d, temple = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    const h = temple ? 4.2 : 3.2;
    box(stone, 0, 0.24, 0, w, 0.48, d, g);
    box(wood, 0, 0.57, 0, w + 0.7, 0.22, d + 0.7, g);
    box(paper, 0, h / 2 + 0.65, 0, w - 0.3, h, d - 0.3, g);
    for (const bx of [-w / 2, w / 2])
      for (const bz of [-d / 2, d / 2])
        pole(temple ? red : wood, bx, h / 2 + 0.65, bz, 0.16, h + 0.4, g);
    for (const faceZ of [-d / 2 - 0.02, d / 2 + 0.02]) {
      for (let bx = -w / 2; bx <= w / 2 + 0.01; bx += w / 6)
        box(wood, bx, h / 2 + 0.65, faceZ, 0.065, h, 0.085, g);
      for (let y = 0.8; y < h + 0.4; y += 0.59)
        box(wood, 0, y, faceZ, w, 0.045, 0.06, g);
      box(wood, 0, h + 0.63, faceZ, w + 0.3, 0.3, 0.28, g);
    }
    for (const bx of [-w / 2 - 0.02, w / 2 + 0.02]) {
      for (let bz = -d / 2; bz <= d / 2; bz += d / 5)
        box(wood, bx, h / 2 + 0.65, bz, 0.08, h, 0.07, g);
      box(wood, bx, h + 0.63, 0, 0.28, 0.3, d + 0.3, g);
    }
    box(wood, 0, 1.96, d / 2 + 0.05, temple ? 2.5 : 1.7, 2.75, 0.1, g);
    for (const dx of [-0.46, 0.46])
      box(paper, dx, 1.96, d / 2 + 0.12, 0.78, 2.4, 0.04, g);
    box(gold, 0, 1.88, d / 2 + 0.19, 0.07, 0.25, 0.07, g);
    roof(g, w + 2.9, d + 2.8, h + 2.65);
    for (let i = 0; i < 3; i++)
      box(
        paleStone,
        0,
        0.1 + i * 0.11,
        d / 2 + 0.55 + (2 - i) * 0.35,
        temple ? 4 : 2.5,
        0.22,
        0.7,
        g,
      );
    for (const bx of [-w * 0.36, w * 0.36])
      lantern(bx, h - 0.1, d / 2 + 0.6, g, 0.85);
    if (temple) {
      box(wood, 0, h + 1.84, 0, w * 0.5, 0.5, d * 0.68, g);
      roof(g, w * 0.74, d * 0.9, h + 4.05, 0.45);
      for (const bx of [-w / 2 + 0.5, w / 2 - 0.5])
        for (const bz of [-d / 2 + 0.4, d / 2 - 0.4])
          box(red, bx, h + 0.8, bz, 0.18, 0.7, 0.18, g);
      const sign = box(wood, 0, h + 0.29, d / 2 + 0.5, 3.1, 0.65, 0.14, g);
      for (let i = -1; i <= 1; i++)
        box(gold, i * 0.72, h + 0.29, d / 2 + 0.59, 0.2, 0.29, 0.02, g);
    }
    return g;
  }
  building(-18, -14, 12, 10, true);
  building(23, 6, 10, 9);
  building(29, -13, 9, 8);
  building(-32, 12, 9, 8);
  // Rooftop details and market goods lend the settlement an inhabited scale.
  for (let i = 0; i < 9; i++) {
    const x = range(17, 30),
      z = range(13, 18);
    if (i % 3 === 0)
      mesh(
        new THREE.CylinderGeometry(0.38, 0.42, 0.75, 12),
        mat("barrel", "#967553"),
        x,
        0.4,
        z,
      );
    else
      box(i % 2 ? wood : mat("crate", "#b39771"), x, 0.35, z, 0.65, 0.7, 0.7);
  }
  function fence(points) {
    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i];
      pole(wood, x, 0.72, z, 0.07, 1.5);
      if (i)
        for (const y of [0.42, 1.02])
          line(
            new THREE.Vector3(points[i - 1][0], y, points[i - 1][1]),
            new THREE.Vector3(x, y, z),
            0.043,
            wood,
          );
    }
  }
  fence(Array.from({ length: 11 }, (_, i) => [-27 + i * 1.2, -20]));
  fence(Array.from({ length: 10 }, (_, i) => [18 + i * 1.35, -18]));
  fence(Array.from({ length: 8 }, (_, i) => [-38 + i * 1.6, 7]));

  const torii = new THREE.Group();
  torii.position.set(0, 0, -15);
  root.add(torii);
  for (const x of [-4.3, 4.3]) {
    pole(stone, x, 0.25, 0, 0.5, 0.5, torii);
    pole(red, x, 3.3, 0, 0.29, 6.3, torii);
    pole(wood, x, 0.59, 0, 0.32, 0.34, torii);
  }
  box(red, 0, 4.75, 0, 9.85, 0.3, 0.38, torii);
  box(lacquer, 0, 6.18, 0, 10.65, 0.46, 0.75, torii);
  box(wood, 0, 6.49, 0, 10.95, 0.17, 0.83, torii);
  for (const dir of [-1, 1]) {
    const beam = box(wood, dir * 5.22, 6.61, 0, 1.55, 0.18, 0.82, torii);
    beam.rotation.z = dir * 0.12;
    const beam2 = box(lacquer, dir * 5.19, 6.39, 0, 1.5, 0.35, 0.71, torii);
    beam2.rotation.z = dir * 0.12;
  }
  box(red, 0, 5.43, 0, 0.32, 1.16, 0.35, torii);
  box(wood, 0, 5.53, 0.31, 0.87, 1.02, 0.16, torii);
  box(gold, 0, 5.53, 0.401, 0.5, 0.64, 0.025, torii);
  const ropeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.1, 4.65, 0.34),
    new THREE.Vector3(0, 4.05, 0.38),
    new THREE.Vector3(4.1, 4.65, 0.34),
  ]);
  mesh(
    new THREE.TubeGeometry(ropeCurve, 40, 0.046, 6, false),
    mat("rope", "#beac86"),
    0,
    0,
    0,
    1,
    1,
    1,
    torii,
  );
  for (const x of [-2.2, -0.75, 0.75, 2.2]) {
    const y = 4.08 + 0.033 * x * x;
    const streamer = box(paper, x, y - 0.3, 0.41, 0.16, 0.47, 0.012, torii);
    streamer.rotation.z = x > 0 ? -0.21 : 0.21;
    box(paper, x + 0.07, y - 0.6, 0.41, 0.15, 0.26, 0.012, torii).rotation.z =
      -0.4;
  }

  function stoneLantern(x, z) {
    pole(stone, x, 0.25, z, 0.45, 0.5);
    pole(stone, x, 0.75, z, 0.19, 0.65);
    box(stone, x, 1.11, z, 0.67, 0.18, 0.67);
    box(lanternPaper, x, 1.41, z, 0.38, 0.46, 0.38);
    for (const dx of [-0.25, 0.25])
      for (const dz of [-0.25, 0.25])
        box(stone, x + dx, 1.43, z + dz, 0.09, 0.49, 0.09);
    const cap = mesh(new THREE.ConeGeometry(0.66, 0.4, 4), stone, x, 1.83, z);
    cap.rotation.y = Math.PI / 4;
    mesh(sphere, stone, x, 2.08, z, 0.12, 0.16, 0.12);
  }
  for (const z of [15, 5, -7, -22, -32])
    for (const side of [-1, 1]) stoneLantern(side * (z === 15 ? 4.8 : 4.1), z);
  for (const [x, z] of [
    [-13, -6],
    [-23, -6],
    [18, 12],
    [28, 12],
  ])
    stoneLantern(x, z);
  // Both exploration rewards have physical landmarks in the world.
  const shrine = new THREE.Group();
  shrine.position.set(-3.6, 0, -28);
  root.add(shrine);
  box(stone, 0, 0.15, 0, 2.7, 0.3, 2.45, shrine);
  box(paleStone, 0, 0.37, 0, 2.2, 0.18, 1.95, shrine);
  box(wood, 0, 1.12, 0, 1.5, 1.4, 1.25, shrine);
  box(paper, 0, 1.15, 0.64, 1.25, 1.12, 0.045, shrine);
  for (const x of [-0.77, 0.77]) pole(red, x, 1.24, 0.57, 0.07, 1.65, shrine);
  roof(shrine, 2.45, 2.1, 2.55, 0.36);
  const crescent = mesh(
    new THREE.TorusGeometry(0.29, 0.045, 6, 28, Math.PI * 1.62),
    gold,
    0,
    1.2,
    0.71,
    1,
    1,
    1,
    shrine,
  );
  crescent.rotation.z = 0.5;
  lantern(0, 1.47, 0.93, shrine, 0.38);
  box(paleStone, 0, 0.16, 1.55, 1.2, 0.17, 0.45, shrine);
  const overlook = new THREE.Group();
  overlook.position.set(-38, 0, -4);
  root.add(overlook);
  box(stone, 0, 0.18, 0, 7.7, 0.35, 5.5, overlook);
  box(paleStone, 0, 0.4, 0, 7.35, 0.12, 5.2, overlook);
  box(wood, 0, 0.95, -1.35, 3.5, 0.14, 0.65, overlook);
  for (const x of [-1.3, 1.3])
    box(wood, x, 0.7, -1.35, 0.16, 0.49, 0.5, overlook);
  box(wood, 0, 1.37, -1.58, 3.5, 0.55, 0.12, overlook);
  for (const x of [-3.5, 3.5]) pole(wood, x, 1.9, 0, 0.105, 3.05, overlook);
  const overlookRope = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.5, 3.35, 0),
    new THREE.Vector3(0, 2.75, 0),
    new THREE.Vector3(3.5, 3.35, 0),
  ]);
  mesh(
    new THREE.TubeGeometry(overlookRope, 24, 0.025, 4, false),
    wood,
    0,
    0,
    0,
    1,
    1,
    1,
    overlook,
  );
  for (const x of [-2.6, -1.3, 0, 1.3, 2.6])
    lantern(x, 2.65 + x * x * 0.048, 0, overlook, 0.62);
  for (const x of [-3.5, 0, 3.5])
    pole(red, x, 1.05, -2.45, 0.07, 1.28, overlook);
  box(red, 0, 1.64, -2.45, 7, 0.12, 0.14, overlook);
  const warmLights = [];
  for (const [x, z] of [
    [-4.1, -7],
    [4.1, -22],
    [-13, -6],
  ]) {
    const light = new THREE.PointLight(0xffbc7b, 5, 13, 2);
    light.position.set(x, 1.5, z);
    scene.add(light);
    warmLights.push(light);
  }

  // One instanced canopy batch gives every tree a clustered, organic silhouette.
  const canopyMaterial = mat("blossom", "#eec0ce", { roughness: 1 });
  canopyMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 blossomPosition;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nblossomPosition=position;",
      );
    shader.fragmentShader =
      "varying vec3 blossomPosition;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float petalsTexture=sin(blossomPosition.x*64.+sin(blossomPosition.z*41.))*sin(blossomPosition.y*53.+blossomPosition.z*21.);
      diffuseColor.rgb*=.96+petalsTexture*.055;`,
      );
  };
  const canopyInstances = [];
  const treeTrunkMat = mat("treeTrunk", "#65515a");
  function tree(x, z, size = 1, seed = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = seed;
    root.add(g);
    const height = range(5.2, 7.6) * size;
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.12 * size, height * 0.3, 0),
      new THREE.Vector3(-0.18 * size, height * 0.62, 0.13 * size),
      new THREE.Vector3(0.15 * size, height, 0),
    ]);
    const trunk = mesh(
      new THREE.TubeGeometry(trunkCurve, 12, 0.22 * size, 7, false),
      treeTrunkMat,
      0,
      0,
      0,
      1,
      1,
      1,
      g,
    );
    for (let j = 0; j < 5; j++) {
      const angle = (j * Math.PI * 2) / 5 + seed,
        distance = range(1.35, 2.65) * size,
        endHeight = height * range(0.75, 1.12);
      const end = new THREE.Vector3(
        Math.cos(angle) * distance,
        endHeight,
        Math.sin(angle) * distance,
      );
      const start = new THREE.Vector3(0, height * (0.5 + j * 0.04), 0);
      const bend = start.clone().lerp(end, 0.57);
      bend.y += 0.3 * size;
      mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([start, bend, end]),
          8,
          0.09 * size,
          5,
          false,
        ),
        treeTrunkMat,
        0,
        0,
        0,
        1,
        1,
        1,
        g,
      );
      for (let k = 0; k < 3; k++) {
        const local = end
          .clone()
          .add(
            new THREE.Vector3(
              range(-0.95, 0.95) * size,
              range(-0.4, 0.8) * size,
              range(-0.95, 0.95) * size,
            ),
          );
        local.applyAxisAngle(new THREE.Vector3(0, 1, 0), seed);
        local.x += x;
        local.z += z;
        canopyInstances.push({
          position: local,
          scale: new THREE.Vector3(
            range(1.6, 2.4) * size,
            range(0.8, 1.25) * size,
            range(1.5, 2.3) * size,
          ),
          color: new THREE.Color().setHSL(
            range(0.925, 0.97),
            range(0.36, 0.55),
            range(0.7, 0.86),
          ),
        });
      }
    }
    return g;
  }
  const heroTrees = [
    [-9, 12, 1.02],
    [-13, 2, 1.13],
    [12, 3, 1.12],
    [9, -7, 0.92],
    [-9, -20, 1.12],
    [11, -27, 0.96],
    [-21, 22, 1.23],
    [30, 23, 1],
    [-30, -3, 1.12],
    [35, 1, 1.03],
    [-38, -23, 1.3],
    [35, -25, 1.24],
  ];
  heroTrees.forEach(([x, z, s]) => tree(x, z, s, range(0, 6)));
  for (let i = 0; i < 35; i++) {
    const side = i % 2 ? -1 : 1,
      x = side * range(32, 74),
      z = range(-62, 38);
    if (Math.abs(x - 29) < 9 && Math.abs(z + 13) < 8) continue;
    tree(x, z, range(0.73, 1.35), range(0, 6));
  }
  const dummy = new THREE.Object3D();
  const blossomGeo = new THREE.IcosahedronGeometry(1, 3);
  const blossomPositions = blossomGeo.attributes.position;
  for (let i = 0; i < blossomPositions.count; i++) {
    const x = blossomPositions.getX(i),
      y = blossomPositions.getY(i),
      z = blossomPositions.getZ(i);
    const bump =
      1 +
      0.055 * Math.sin(x * 11) * Math.cos(z * 9) +
      0.045 * Math.cos(y * 13 + x * 5);
    blossomPositions.setXYZ(i, x * bump, y * bump, z * bump);
  }
  const canopy = new THREE.InstancedMesh(
    blossomGeo,
    canopyMaterial,
    canopyInstances.length,
  );
  canopyInstances.forEach((item, i) => {
    dummy.position.copy(item.position);
    dummy.scale.copy(item.scale);
    dummy.rotation.set(range(-0.1, 0.1), range(0, 6), range(-0.1, 0.1));
    dummy.updateMatrix();
    canopy.setMatrixAt(i, dummy.matrix);
    canopy.setColorAt(i, item.color);
  });
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  root.add(canopy);
  const canopyLow = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    canopyMaterial,
    canopyInstances.length,
  );
  canopyLow.instanceMatrix = canopy.instanceMatrix;
  canopyLow.instanceColor = canopy.instanceColor;
  canopyLow.castShadow = false;
  canopyLow.receiveShadow = true;
  canopyLow.visible = false;
  root.add(canopyLow);

  const pineGeo = new THREE.ConeGeometry(1, 1, 9);
  const pineTrunkMaterial = mat("pineTrunk", "#55505c");
  const pineMaterial = mat("pine", "#586b73");
  const pineTrunks = new THREE.InstancedMesh(cylinder, pineTrunkMaterial, 150);
  const pines = new THREE.InstancedMesh(pineGeo, pineMaterial, 450);
  for (let i = 0; i < 150; i++) {
    const x = range(-112, 112),
      z = range(-104, -49),
      size = range(0.75, 1.9),
      height = range(7, 13) * size;
    dummy.position.set(x, height * 0.4, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.19 * size, height * 0.8, 0.19 * size);
    dummy.updateMatrix();
    pineTrunks.setMatrixAt(i, dummy.matrix);
    for (let tier = 0; tier < 3; tier++) {
      dummy.position.set(x, height * (0.51 + tier * 0.19), z);
      dummy.rotation.y = range(0, 6);
      dummy.scale.set(
        (3.1 - tier * 0.72) * size,
        height * 0.54,
        (3.1 - tier * 0.72) * size,
      );
      dummy.updateMatrix();
      pines.setMatrixAt(i * 3 + tier, dummy.matrix);
      pines.setColorAt(
        i * 3 + tier,
        new THREE.Color().setHSL(range(0.47, 0.55), 0.15, range(0.28, 0.4)),
      );
    }
  }
  pines.castShadow = true;
  pines.receiveShadow = true;
  pineTrunks.castShadow = true;
  root.add(pines, pineTrunks);

  function mountain(x, z, width, height, color, seed) {
    const rows = 18,
      cols = 56,
      verts = [],
      indices = [];
    for (let y = 0; y <= rows; y++)
      for (let a = 0; a <= cols; a++) {
        const f = y / rows,
          angle = (a / cols) * Math.PI * 2;
        const r =
          width *
          Math.pow(1 - f, 1.2) *
          (1 +
            0.14 * Math.sin(angle * 5 + seed) +
            0.07 * Math.cos(angle * 9 - seed));
        const ridge = 0.5 + 0.5 * Math.sin(angle * 3 + seed + f * 7);
        verts.push(
          x + Math.cos(angle) * r,
          f * height + (f > 0 && f < 1 ? ridge * height * 0.085 : 0) - 3,
          z + Math.sin(angle) * r * 0.7,
        );
        if (y < rows && a < cols) {
          const i = y * (cols + 1) + a;
          indices.push(
            i,
            i + cols + 1,
            i + 1,
            i + 1,
            i + cols + 1,
            i + cols + 2,
          );
        }
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mountainMesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
        flatShading: false,
      }),
    );
    mountainMesh.receiveShadow = true;
    root.add(mountainMesh);
  }
  mountain(-110, -220, 95, 105, "#7c82a6", 1.3);
  mountain(78, -255, 126, 126, "#9295b6", 2.4);
  mountain(200, -245, 125, 86, "#a1a0ba", 4.7);
  mountain(-214, -178, 115, 77, "#9d95b0", 0.8);
  mountain(-55, -151, 65, 61, "#78869c", 4.2);
  mountain(85, -162, 75, 64, "#7f8f9f", 5.7);
  mountain(150, -115, 70, 44, "#849699", 7.4);
  mountain(-127, -116, 62, 47, "#7d949b", 8.1);
  mountain(-155, 16, 55, 37, "#92a399", 5);
  mountain(142, 21, 46, 35, "#9cab9e", 3);

  // River beyond the eastern village. Flow is a shader, never a large texture.
  const waterUniforms = { time: { value: 0 } };
  const waterMat = new THREE.MeshStandardMaterial({
    color: "#799faa",
    roughness: 0.24,
    metalness: 0.2,
    transparent: true,
    opacity: 0.86,
  });
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.riverTime = waterUniforms.time;
    shader.vertexShader =
      "varying vec3 riverPosition;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nriverPosition=(modelMatrix*vec4(position,1.)).xyz;",
      );
    shader.fragmentShader =
      "uniform float riverTime;varying vec3 riverPosition;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float ripple=sin(riverPosition.z*2.+riverPosition.x*.7+riverTime)*sin(riverPosition.z*.83-riverPosition.x*1.3-riverTime*.45);
      diffuseColor.rgb+=vec3(.09,.12,.14)*smoothstep(.4,.9,ripple);`,
      );
  };
  ribbon(
    [
      [68, 96],
      [63, 58],
      [57, 30],
      [62, 0],
      [53, -32],
      [63, -60],
      [69, -95],
    ],
    9,
    waterMat,
    0.052,
  );
  const bankMat = mat("riverBank", "#c0b8a5");
  ribbon(
    [
      [68, 96],
      [63, 58],
      [57, 30],
      [62, 0],
      [53, -32],
      [63, -60],
      [69, -95],
    ],
    13,
    bankMat,
    0.018,
  );
  const bridge = new THREE.Group();
  bridge.position.set(57, 0, 30);
  bridge.rotation.y = -0.1;
  root.add(bridge);
  for (let i = 0; i < 16; i++) {
    const x = -7 + i * 0.93,
      y = 0.38 + Math.sin((i / 15) * Math.PI) * 0.8;
    box(wood, x, y, 0, 0.9, 0.18, 3.5, bridge);
    for (const z of [-1.65, 1.65]) {
      pole(red, x, y + 0.52, z, 0.065, 1.05, bridge);
      if (i < 15)
        line(
          new THREE.Vector3(x, y + 1, z),
          new THREE.Vector3(
            x + 0.93,
            0.38 + Math.sin(((i + 1) / 15) * Math.PI) * 0.8 + 1,
            z,
          ),
          0.08,
          red,
          bridge,
        );
    }
  }

  const rockMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    mat("rock", "#a3a4ab"),
    150,
  );
  for (let i = 0; i < 150; i++) {
    const x = range(-78, 78),
      z = range(-75, 60);
    const width = range(0.35, 1.55);
    const invalid =
      Math.abs(x) < 6 ||
      heroTrees.some((t) => Math.hypot(x - t[0], z - t[1]) < 1);
    dummy.position.set(x, invalid ? -0.9 : 0.1, z);
    dummy.scale.set(width, range(0.25, 0.8), width * 0.7);
    dummy.rotation.set(range(0, 1), range(0, 6), range(0, 0.3));
    dummy.updateMatrix();
    rockMesh.setMatrixAt(i, dummy.matrix);
    rockMesh.setColorAt(
      i,
      new THREE.Color().setHSL(0.61, 0.035, range(0.48, 0.65)),
    );
  }
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  root.add(rockMesh);

  // Bent grass blades rather than flat cards; instance colors break up the floor.
  const bladeVerts = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 2.4,
      x = Math.cos(a) * 0.14,
      z = Math.sin(a) * 0.14,
      h = 0.26 + i * 0.055;
    bladeVerts.push(
      x - 0.025,
      0,
      z,
      x + 0.025,
      0,
      z,
      x + 0.035,
      h * 0.65,
      z + 0.02,
      x - 0.025,
      0,
      z,
      x + 0.035,
      h * 0.65,
      z + 0.02,
      x + 0.065,
      h,
      z + 0.035,
    );
  }
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(bladeVerts, 3),
  );
  grassGeo.computeVertexNormals();
  const grass = new THREE.InstancedMesh(
    grassGeo,
    mat("grass", "#859076", { side: THREE.DoubleSide }),
    4200,
  );
  let grassCount = 0;
  for (let i = 0; i < 6500 && grassCount < 4200; i++) {
    const x = i < 1500 ? (i % 2 ? -1 : 1) * range(4, 12) : range(-80, 80),
      z = i < 1500 ? range(-37, 45) : range(-76, 59);
    if (Math.abs(x) < 4 || Math.hypot(x, z + 43) < 12) continue;
    if (
      (Math.abs(x + 18) < 7 && Math.abs(z + 14) < 6) ||
      (Math.abs(x - 23) < 6 && Math.abs(z - 6) < 6) ||
      (Math.abs(x - 29) < 5 && Math.abs(z + 13) < 5) ||
      (Math.abs(x + 32) < 5 && Math.abs(z - 12) < 5)
    )
      continue;
    dummy.position.set(x, 0.006, z);
    dummy.scale.setScalar(range(0.6, 1.9));
    dummy.rotation.set(0, range(0, 6), 0);
    dummy.updateMatrix();
    grass.setMatrixAt(grassCount, dummy.matrix);
    grass.setColorAt(
      grassCount,
      new THREE.Color().setHSL(
        range(0.18, 0.28),
        range(0.14, 0.3),
        range(0.4, 0.56),
      ),
    );
    grassCount++;
  }
  grass.count = grassCount;
  grass.receiveShadow = true;
  root.add(grass);
  const flowers = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    mat("flowers", "#e5bacd"),
    900,
  );
  for (let i = 0; i < 900; i++) {
    const cluster = heroTrees[i % heroTrees.length],
      angle = range(0, 6.28),
      r = range(1.9, 6.2),
      x = cluster[0] + Math.cos(angle) * r,
      z = cluster[1] + Math.sin(angle) * r;
    dummy.position.set(x, range(0.13, 0.3), z);
    dummy.rotation.set(range(0, 3), range(0, 6), 0);
    dummy.scale.set(0.07, 0.045, 0.07);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(
      i,
      new THREE.Color(
        i % 3 === 0 ? "#f2dbbb" : i % 3 === 1 ? "#dfaec7" : "#b3b6db",
      ),
    );
  }
  root.add(flowers);

  const petalCount = 190,
    petalPositions = new Float32Array(petalCount * 3),
    petalSeed = [];
  for (let i = 0; i < petalCount; i++) {
    const tree = heroTrees[i % heroTrees.length];
    petalSeed.push({
      x: tree[0] + range(-5, 5),
      z: tree[1] + range(-5, 5),
      y: range(0.5, 10),
      phase: range(0, 6.28),
      speed: range(0.15, 0.55),
    });
  }
  const petalGeo = new THREE.BufferGeometry();
  petalGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(petalPositions, 3),
  );
  const petals = new THREE.Points(
    petalGeo,
    new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color("#ffcadb") } },
      transparent: true,
      depthWrite: false,
      vertexShader:
        "void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(90./-p.z,1.3,6.);}",
      fragmentShader:
        "uniform vec3 color;void main(){vec2 p=gl_PointCoord-.5;float d=length(p*vec2(1.,1.6));if(d>.48)discard;gl_FragColor=vec4(color,(1.-smoothstep(.25,.48,d))*.8);}",
    }),
  );
  petals.frustumCulled = false;
  root.add(petals);

  const birds = [];
  const birdMaterial = new THREE.LineBasicMaterial({
    color: "#625b76",
    transparent: true,
    opacity: 0.65,
  });
  for (let i = 0; i < 13; i++) {
    const bird = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.65, 0.15, 0),
        new THREE.Vector3(0, 0, 0.1),
        new THREE.Vector3(0.65, 0.15, 0),
      ]),
      birdMaterial,
    );
    bird.position.set(-48 + i * 2.4, range(31, 37), -102 - i * 2);
    root.add(bird);
    birds.push(bird);
  }
  // A quest marker doubles as a quiet visual landmark near the starting path.
  const npcMarker = new THREE.Group();
  npcMarker.position.set(-5, 3.4, 13);
  root.add(npcMarker);
  const diamond = mesh(
    new THREE.OctahedronGeometry(0.22),
    new THREE.MeshBasicMaterial({ color: "#ffd496" }),
    0,
    0,
    0,
    1,
    1.5,
    1,
    npcMarker,
  );
  const markerRing = mesh(
    new THREE.TorusGeometry(0.35, 0.018, 5, 30),
    new THREE.MeshBasicMaterial({
      color: "#efd5a3",
      transparent: true,
      opacity: 0.55,
    }),
    0,
    -0.25,
    0,
    1,
    1,
    1,
    npcMarker,
  );
  markerRing.rotation.x = Math.PI / 2;
  const npcGroundRing = mesh(
    new THREE.RingGeometry(0.58, 0.64, 40),
    new THREE.MeshBasicMaterial({
      color: "#cabb99",
      transparent: true,
      opacity: 0.4,
    }),
    -5,
    0.06,
    13,
  );
  npcGroundRing.rotation.x = -Math.PI / 2;
  npcGroundRing.castShadow = false;

  // Batch authored timber, stone and architecture into one draw per material.
  // The scene keeps its detailed silhouettes without hundreds of tiny draws.
  diamond.userData.staticWorld = false;
  markerRing.userData.staticWorld = false;
  root.updateMatrixWorld(true);
  const staticBatches = new Map();
  root.traverse((object) => {
    if (
      !object.isMesh ||
      object.isInstancedMesh ||
      !object.userData.staticWorld ||
      Array.isArray(object.material)
    )
      return;
    const batch = staticBatches.get(object.material) || [];
    batch.push(object);
    staticBatches.set(object.material, batch);
  });
  for (const [material, objects] of staticBatches) {
    if (objects.length < 4) continue;
    const positions = [],
      normals = [],
      uvs = [];
    for (const object of objects) {
      const source = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      source.applyMatrix4(object.matrixWorld);
      const p = source.attributes.position,
        n = source.attributes.normal,
        u = source.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        positions.push(p.getX(i), p.getY(i), p.getZ(i));
        normals.push(n?.getX(i) ?? 0, n?.getY(i) ?? 1, n?.getZ(i) ?? 0);
        uvs.push(u?.getX(i) ?? 0, u?.getY(i) ?? 0);
      }
      source.dispose();
      object.removeFromParent();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    const batch = new THREE.Mesh(geometry, material);
    batch.castShadow = true;
    batch.receiveShadow = true;
    root.add(batch);
  }

  return {
    npcPosition: { x: -5, z: 13 },
    groundHeight: () => 0,
    update(dt, elapsed, quality = "high") {
      const cycle = (elapsed / 480) * Math.PI * 2;
      const night = (1 - Math.cos(cycle)) * 0.5;
      skyUniforms.night.value = night * 0.78;
      sun.intensity = 2.2 * (1 - night) + 0.25;
      hemisphere.intensity = 1.3 - night * 0.45;
      moonLight.intensity = 0.65 + night * 0.65;
      stars.material.opacity = 0.13 + night * 0.55;
      scene.fog.color.copy(
        new THREE.Color("#a8a2b8").lerp(
          new THREE.Color("#68728f"),
          night * 0.7,
        ),
      );
      sun.position.set(-35 + Math.sin(cycle) * 35, 65 - night * 45, 35);
      waterUniforms.time.value = elapsed;
      npcMarker.position.y = 3.4 + Math.sin(elapsed * 2) * 0.09;
      diamond.rotation.y = elapsed * 0.6;
      for (let i = 0; i < petalCount; i++) {
        const p = petalSeed[i];
        petalPositions[i * 3] = p.x + Math.sin(elapsed * 0.25 + p.phase) * 1.6;
        petalPositions[i * 3 + 1] =
          ((((p.y - elapsed * p.speed) % 10) + 10) % 10) + 0.15;
        petalPositions[i * 3 + 2] =
          p.z + Math.sin(elapsed * 0.19 + p.phase) * 1.1;
      }
      petalGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < birds.length; i++) {
        const bird = birds[i];
        bird.position.x = -48 + i * 2.4 + Math.sin(elapsed * 0.035) * 30;
        const a = bird.geometry.attributes.position;
        a.setY(0, Math.sin(elapsed * 3.5 + i) * 0.35);
        a.setY(2, Math.sin(elapsed * 3.5 + i) * 0.35);
        a.needsUpdate = true;
      }
      for (let i = 0; i < warmLights.length; i++)
        warmLights[i].intensity =
          4.6 + night * 3 + Math.sin(elapsed * 2.1 + i) * 0.2;
      const performance = quality === "low";
      groundDetail.value = performance ? 0 : 1;
      petals.visible = !performance;
      grass.visible = true;
      grass.count = performance ? Math.min(1200, grassCount) : grassCount;
      canopy.visible = !performance;
      canopyLow.visible = performance;
    },
    dispose() {
      root.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          for (const m of mats) m.dispose();
        }
      });
      scene.remove(root, hemisphere, sun, sun.target, moonLight, ...warmLights);
    },
  };
}
