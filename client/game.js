import * as THREE from "/vendor/three/three.module.js";
import { createWorld } from "./world.js";
import { createCharacter } from "./character.js";
import { createEffects } from "./effects.js";
import { createUI } from "./ui.js";
import { createAudio } from "./audio.js";
import { SPAWN, NPC, COLLIDERS, canOccupy } from "/shared/config.js";

const container = document.querySelector("#game");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  55,
  innerWidth / innerHeight,
  0.1,
  1000,
);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
} catch (error) {
  container.innerHTML =
    '<div style="padding:15vh 10vw;color:white;font:20px sans-serif">Moonveil requires WebGL. Enable hardware acceleration in your browser and reload.</div>';
  throw error;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
container.appendChild(renderer.domElement);
const world = createWorld(scene),
  effects = createEffects(scene),
  audio = createAudio();
const socket = io({ autoConnect: true });
let state = { players: [], enemies: [] },
  selfId = null,
  playing = false,
  paused = false,
  cameraYaw = Math.PI,
  cameraPitch = 0.2;
let local = { x: SPAWN.x, y: 0, z: SPAWN.z, yaw: Math.PI },
  velocityY = 0,
  dashTime = 0,
  sendTimer = 0,
  combo = 0,
  lastAttack = 0,
  elapsed = 0,
  frames = 0,
  fpsTime = 0;
let shake = 0,
  blockActive = false,
  locked = false,
  dragging = false,
  joining = false,
  awaitingSpawn = false,
  lastDash = -10;
const keys = new Set(),
  entities = new Map(),
  labels = new Map(),
  animationEvents = new Map();
const labelLayer = document.createElement("div");
labelLayer.className = "world-labels";
container.appendChild(labelLayer);
const labelStyle = document.createElement("style");
labelStyle.textContent = `.world-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}.world-label{position:absolute;color:#f6eeee;font:11px system-ui;text-align:center;transform:translate(-50%,-100%);text-shadow:0 2px 5px #15131e;white-space:nowrap;letter-spacing:.5px}.world-label i{display:block;width:52px;height:3px;margin:5px auto;background:#241c30;border-radius:3px;overflow:hidden}.world-label i b{display:block;height:100%;background:#e786a6}.world-label.friendly{color:#d7fff5}.world-label.boss{font-size:13px;color:#f8bdce}.connection-note{position:absolute;bottom:20px;right:22px;color:#e5c1d3;font:12px system-ui}`;
document.head.appendChild(labelStyle);
const ui = createUI({
  play(profile) {
    join(profile, { create: true, mode: "coop" });
  },
  createRoom(profile, mode) {
    join(profile, { create: true, mode });
  },
  joinRoom(profile, code) {
    join(profile, { code });
  },
  resume() {
    paused = false;
    ui.showPause(false);
    requestLock();
  },
  menu() {
    exitToMenu();
  },
  customize(profile) {
    if (playing) socket.emit("customize", profile);
    else preview.setAppearance(profile);
  },
  potion() {
    if (playing) socket.emit("potion");
  },
  ability(index) {
    if (playing && !paused) {
      faceCamera();
      socket.emit("ability", { index });
    }
  },
  interact() {
    if (playing) socket.emit("interact");
  },
  respawn() {
    socket.emit("respawn");
    requestLock();
  },
  settings(settings) {
    audio.setVolume(settings.volume);
    renderer.setPixelRatio(
      settings.quality === "low" ? 1 : Math.min(devicePixelRatio, 1.65),
    );
    renderer.shadowMap.enabled = settings.quality !== "low";
  },
});
audio.setVolume(ui.settings.volume);
renderer.setPixelRatio(
  ui.settings.quality === "low" ? 1 : Math.min(devicePixelRatio, 1.65),
);
renderer.shadowMap.enabled = ui.settings.quality !== "low";
const preview = createCharacter(ui.getProfile());
preview.group.position.set(0, 0, 18);
preview.group.rotation.y = Math.PI;
scene.add(preview.group);
const npc = createCharacter({ color: "#958aaf", style: "mist" });
npc.group.position.set(NPC.x, 0, NPC.z);
npc.group.rotation.y = 0.8;
scene.add(npc.group);
const npcLabel = document.createElement("div");
npcLabel.className = "world-label friendly";
npcLabel.textContent = NPC.name;
labelLayer.appendChild(npcLabel);

function join(profile, options) {
  if (joining) return;
  if (!socket.connected) {
    ui.notice("Connecting to the server. Please try again in a moment.");
    return;
  }
  joining = true;
  audio.start();
  socket.emit(
    "join",
    { ...profile, ...options, progress: ui.getProgress() },
    (result) => {
      joining = false;
      if (!result?.ok) {
        ui.notice(result?.error || "Could not join this room.");
        return;
      }
      selfId = result.id;
      awaitingSpawn = true;
      playing = true;
      paused = false;
      local = { x: SPAWN.x, y: 0, z: SPAWN.z, yaw: Math.PI };
      velocityY = 0;
      dashTime = 0;
      blockActive = false;
      cameraYaw = Math.PI;
      cameraPitch = 0.2;
      ui.setPlaying(true);
      ui.setRoom(result.code, options.mode || "coop");
      preview.group.visible = false;
      ui.notice("Welcome to Wisteria Valley. Meet Master Hoshino nearby.");
      requestLock();
    },
  );
}
function requestLock() {
  if (playing && !ui.isOverlayOpen()) {
    try {
      const promise = renderer.domElement.requestPointerLock?.();
      promise?.catch(() => {});
    } catch {}
  }
}
function exitToMenu() {
  playing = false;
  paused = false;
  socket.emit("leave");
  keys.clear();
  document.exitPointerLock?.();
  ui.setPlaying(false);
  ui.showPause(false);
  preview.group.visible = true;
  selfId = null;
  state = { players: [], enemies: [] };
  ui.setState(state, null);
  ui.setRoom("", "coop");
  for (const [id, entity] of entities) {
    scene.remove(entity.group);
    entity.dispose?.();
    entities.delete(id);
  }
  for (const label of labels.values()) label.remove();
  labels.clear();
}
socket.on("connect", () => ui.setConnection(true));
socket.on("disconnect", () => {
  ui.setConnection(false);
  keys.clear();
  ui.notice("Connection lost. Reconnect, then enter a room to continue.");
  if (playing) exitToMenu();
});
socket.on("connect_error", () => ui.setConnection(false));
socket.on("notice", (data) =>
  ui.notice(typeof data === "string" ? data : data.message || data.text || ""),
);
socket.on("progress", (progress) => ui.saveProgress(progress));
socket.on("state", (snapshot) => {
  state = snapshot;
  const me = state.players.find((p) => p.id === selfId);
  if (me) {
    if (awaitingSpawn) {
      local = { x: me.x, y: me.y || 0, z: me.z, yaw: me.yaw };
      awaitingSpawn = false;
    }
    if (me.dead) {
      keys.clear();
      blockActive = false;
      velocityY = 0;
      dashTime = 0;
      local.y = 0;
    }
    const error = Math.hypot(me.x - local.x, me.z - local.z);
    if (error > 4 || me.dead) {
      local.x = me.x;
      local.z = me.z;
    } else if (!keys.size && dashTime <= 0) {
      local.x = THREE.MathUtils.lerp(local.x, me.x, 0.25);
      local.z = THREE.MathUtils.lerp(local.z, me.z, 0.25);
    }
  }
  if (playing) {
    ui.setState(state, selfId);
    ui.setRoom(state.code, state.mode);
  }
});
socket.on("action", (event) => {
  effects.action(event);
  animationEvents.set(event.id, { ...event, at: performance.now() });
  if (playing && Math.hypot(event.x - local.x, event.z - local.z) < 30)
    audio.action(event);
  if (event.kind === "hit" && event.target === selfId) shake = 0.15;
  if (event.kind === "ability" && event.id === selfId) shake = 0.08;
});
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked) {
    keys.clear();
    if (blockActive) {
      blockActive = false;
      socket.emit("block", { active: false });
    }
  }
});
document.addEventListener("mousemove", (event) => {
  if (playing && !paused && (locked || dragging)) {
    cameraYaw -= event.movementX * 0.0024 * ui.settings.sensitivity;
    cameraPitch = THREE.MathUtils.clamp(
      cameraPitch + event.movementY * 0.0018,
      0.08,
      0.95,
    );
  }
});
renderer.domElement.addEventListener("mousedown", (event) => {
  if (!playing || paused || ui.isOverlayOpen()) return;
  audio.start();
  if (!locked) {
    dragging = true;
    requestLock();
  }
  if (event.button === 0) attack();
  if (event.button === 2) {
    faceCamera();
    blockActive = true;
    socket.emit("block", { active: true });
  }
});
document.addEventListener("mouseup", (event) => {
  dragging = false;
  if (event.button === 2) {
    blockActive = false;
    socket.emit("block", { active: false });
  }
});
document.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input,textarea,select")) return;
  if (event.defaultPrevented) return;
  const me = state.players.find((p) => p.id === selfId);
  if (playing && me?.dead) {
    if (event.code === "KeyR") socket.emit("respawn");
    return;
  }
  if (event.code === "Escape" && playing) {
    event.preventDefault();
    paused = !paused;
    ui.showPause(paused);
    keys.clear();
    if (paused) document.exitPointerLock?.();
    return;
  }
  if (!playing || paused || ui.isOverlayOpen()) return;
  if (
    [
      "Space",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ShiftLeft",
      "ShiftRight",
    ].includes(event.code)
  )
    event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (!me) return;
  if (event.code === "Space" && local.y < 0.05) velocityY = 7.5;
  if (event.code === "KeyQ" && me.stamina >= 24 && elapsed - lastDash > 0.9) {
    dashTime = 0.22;
    lastDash = elapsed;
    socket.emit("dash");
  }
  if (event.code === "KeyE") socket.emit("interact");
  if (event.code === "KeyR") socket.emit("potion");
  if (
    event.code === "Digit1" ||
    event.code === "Digit2" ||
    event.code === "Digit3"
  ) {
    faceCamera();
    socket.emit("ability", { index: Number(event.code.at(-1)) - 1 });
  }
  if (event.code === "KeyJ") attack();
});
document.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => {
  keys.clear();
  blockActive = false;
  socket.emit("block", { active: false });
});
function faceCamera() {
  local.yaw = cameraYaw;
  socket.emit("move", {
    ...local,
    moving:
      keys.has("KeyW") ||
      keys.has("KeyS") ||
      keys.has("KeyA") ||
      keys.has("KeyD"),
    sprinting: keys.has("ShiftLeft"),
  });
}
function attack() {
  const now = performance.now();
  if (now - lastAttack < 365) return;
  faceCamera();
  combo = now - lastAttack < 1100 ? (combo + 1) % 3 : 0;
  lastAttack = now;
  socket.emit("attack", { combo });
}

function move(dt) {
  const me = state.players.find((p) => p.id === selfId);
  if (!me || me.dead || paused || ui.isOverlayOpen()) {
    sendTimer += dt;
    if (sendTimer > 0.05 && me) {
      socket.emit("move", { ...local, moving: false, sprinting: false });
      sendTimer = 0;
    }
    return;
  }
  let forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0),
    right = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const length = Math.hypot(forward, right);
  let dx = 0,
    dz = 0;
  if (length) {
    forward /= length;
    right /= length;
    dx = Math.sin(cameraYaw) * forward - Math.cos(cameraYaw) * right;
    dz = Math.cos(cameraYaw) * forward + Math.sin(cameraYaw) * right;
    local.yaw = Math.atan2(dx, dz);
  }
  if (blockActive) local.yaw = cameraYaw;
  const sprint =
    !!length &&
    (keys.has("ShiftLeft") || keys.has("ShiftRight")) &&
    me.stamina > 5 &&
    !blockActive;
  let speed = blockActive ? 2.8 : sprint ? 10 : 6.2;
  if (dashTime > 0) {
    dashTime -= dt;
    speed = 23;
    if (!length) {
      dx = Math.sin(local.yaw);
      dz = Math.cos(local.yaw);
    }
  }
  let nextX = local.x + dx * speed * dt,
    nextZ = local.z + dz * speed * dt;
  if (canOccupy(nextX, local.z)) local.x = nextX;
  if (canOccupy(local.x, nextZ)) local.z = nextZ;
  if (local.y > 0 || velocityY > 0) {
    local.y = Math.max(0, local.y + velocityY * dt - 10 * dt * dt);
    velocityY -= 20 * dt;
    if (local.y === 0) velocityY = 0;
  }
  if (length) audio.footstep(elapsed);
  sendTimer += dt;
  if (sendTimer >= 0.05) {
    sendTimer = 0;
    socket.emit("move", {
      ...local,
      moving: !!length || dashTime > 0,
      sprinting: sprint,
    });
  }
}
const projection = new THREE.Vector3();
function projectLabel(label, x, y, z) {
  projection.set(x, y, z).project(camera);
  const visible =
    projection.z < 1 &&
    projection.z > 0 &&
    Math.abs(projection.x) < 1.2 &&
    Math.abs(projection.y) < 1.2;
  label.style.display = visible ? "block" : "none";
  if (visible) {
    label.style.left = `${(projection.x * 0.5 + 0.5) * innerWidth}px`;
    label.style.top = `${(-projection.y * 0.5 + 0.5) * innerHeight}px`;
  }
}
function updateEntities(dt) {
  const existing = new Set();
  for (const data of [...state.players, ...state.enemies]) {
    if (data.dead && data.hp <= 0 && data.id !== selfId) continue;
    existing.add(data.id);
    const isEnemy = !("name" in data);
    let entity = entities.get(data.id);
    if (!entity) {
      entity = createCharacter({
        color: data.color,
        faction: data.faction,
        enemy: isEnemy,
        boss: data.boss,
        style: data.style,
      });
      entities.set(data.id, entity);
      scene.add(entity.group);
      entity.group.position.set(data.x, data.y || 0, data.z);
    }
    const mine = data.id === selfId,
      position = mine ? local : data;
    if (mine)
      entity.group.position.set(position.x, position.y || 0, position.z);
    else {
      entity.group.position.x = THREE.MathUtils.lerp(
        entity.group.position.x,
        position.x,
        1 - Math.exp(-14 * dt),
      );
      entity.group.position.z = THREE.MathUtils.lerp(
        entity.group.position.z,
        position.z,
        1 - Math.exp(-14 * dt),
      );
      entity.group.position.y = THREE.MathUtils.lerp(
        entity.group.position.y,
        position.y || 0,
        0.25,
      );
    }
    const angle = position.yaw || 0;
    entity.group.rotation.y +=
      Math.atan2(
        Math.sin(angle - entity.group.rotation.y),
        Math.cos(angle - entity.group.rotation.y),
      ) * Math.min(1, dt * 18);
    const anim = animationEvents.get(data.id);
    const age = anim ? (performance.now() - anim.at) / 1000 : 10;
    entity.update(dt, {
      moving: mine
        ? keys.has("KeyW") ||
          keys.has("KeyS") ||
          keys.has("KeyA") ||
          keys.has("KeyD")
        : data.moving || data.action === "walk",
      sprinting: mine ? keys.has("ShiftLeft") : data.sprinting,
      attack:
        (anim?.kind === "attack" || anim?.kind === "enemyAttack") && age < 0.5
          ? Math.max(0.001, age / 0.5)
          : 0,
      ability:
        anim?.kind === "ability" && age < 0.85
          ? Math.max(0.001, age / 0.85)
          : 0,
      combo: anim?.combo || 0,
      blocking: mine ? blockActive : data.blocking,
      airborne: (position.y || 0) > 0.05,
      dead: !!data.dead,
      time: elapsed,
    });
    if (
      !isEnemy &&
      entity.appearanceKey !==
        [data.color, data.faction, data.style, data.equipment].join("/")
    ) {
      entity.setAppearance(data);
      entity.appearanceKey = [
        data.color,
        data.faction,
        data.style,
        data.equipment,
      ].join("/");
    }
    entity.setHealth?.(data.hp / (data.maxHp || 100));
    let label = labels.get(data.id);
    if (!label) {
      label = document.createElement("div");
      label.className = `world-label ${isEnemy ? (data.boss ? "boss" : "") : "friendly"}`;
      labels.set(data.id, label);
      labelLayer.appendChild(label);
    }
    const distance = Math.hypot(data.x - local.x, data.z - local.z);
    if (mine || !playing || distance > (data.boss ? 35 : 22)) {
      label.style.display = "none";
    } else {
      label.replaceChildren(
        document.createTextNode(
          isEnemy ? (data.boss ? "THE HOLLOW KING" : "Night demon") : data.name,
        ),
      );
      if (isEnemy) {
        const bar = document.createElement("i"),
          fill = document.createElement("b");
        fill.style.width = `${Math.max(0, (data.hp / data.maxHp) * 100)}%`;
        bar.appendChild(fill);
        label.appendChild(bar);
      }
      projectLabel(
        label,
        entity.group.position.x,
        data.boss ? 4.8 : 2.5,
        entity.group.position.z,
      );
    }
  }
  for (const [id, entity] of entities) {
    if (!existing.has(id)) {
      scene.remove(entity.group);
      entity.dispose?.();
      entities.delete(id);
      labels.get(id)?.remove();
      labels.delete(id);
    }
  }
  if (playing) projectLabel(npcLabel, NPC.x, 2.55, NPC.z);
  else npcLabel.style.display = "none";
  npc.update(dt, { time: elapsed });
}
function updateCamera(dt) {
  let target, pos;
  if (playing) {
    const distance = 8.4;
    target = new THREE.Vector3(local.x, 1.4 + local.y, local.z);
    pos = new THREE.Vector3(
      local.x - Math.sin(cameraYaw) * Math.cos(cameraPitch) * distance,
      local.y + 2 + Math.sin(cameraPitch) * distance,
      local.z - Math.cos(cameraYaw) * Math.cos(cameraPitch) * distance,
    );
    const travel = pos.clone().sub(target);
    for (let step = 1; step <= 28; step++) {
      const t = step / 28,
        probe = target.clone().addScaledVector(travel, t);
      if (
        COLLIDERS.some(
          (c) =>
            Math.abs(probe.x - c.x) < c.w / 2 + 0.1 &&
            Math.abs(probe.z - c.z) < c.d / 2 + 0.1 &&
            probe.y < (c.x === -18 ? 9 : 6.2),
        )
      ) {
        pos.copy(target).addScaledVector(travel, Math.max(0.075, t - 1 / 28));
        break;
      }
    }
  } else {
    pos = new THREE.Vector3(13 + Math.sin(elapsed * 0.035) * 2, 8.4, 34);
    target = new THREE.Vector3(-1, 2, -9);
  }
  camera.position.lerp(pos, 1 - Math.exp(-8 * dt));
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 0.4);
  }
  camera.lookAt(target);
}
function minimap() {
  const canvas = document.querySelector("#minimap");
  if (!canvas || !playing) return;
  const ctx = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#191927";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#333346";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((w / 4) * i, 0);
    ctx.lineTo((w / 4) * i, h);
    ctx.moveTo(0, (h / 4) * i);
    ctx.lineTo(w, (h / 4) * i);
    ctx.stroke();
  }
  const dot = (x, z, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
      w / 2 + (x - local.x) * 1.5,
      h / 2 + (z - local.z) * 1.5,
      r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  };
  dot(NPC.x, NPC.z, "#e2c385", 3);
  for (const e of state.enemies)
    if (e.hp > 0) dot(e.x, e.z, e.boss ? "#ffb2c7" : "#b3759f", e.boss ? 4 : 2);
  for (const p of state.players)
    if (p.id !== selfId) dot(p.x, p.z, "#a3ddd7", 3);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI - cameraYaw);
  ctx.fillStyle = "#e6eeee";
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(-4, 4);
  ctx.lineTo(4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
let last = performance.now();
camera.position.set(13, 8.4, 34);
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = (now - last) / 1000,
    dt = Math.min(0.1, realDt);
  last = now;
  elapsed += dt;
  move(dt);
  world.update(dt, elapsed, ui.settings.quality);
  effects.update(realDt);
  updateCamera(dt);
  updateEntities(dt);
  preview.update(dt, { time: elapsed });
  if (playing) {
    let prompt = null;
    const d = Math.hypot(local.x - NPC.x, local.z - NPC.z);
    if (d < 4) prompt = "Speak to Master Hoshino";
    else if (Math.hypot(local.x, local.z + 28) < 4)
      prompt = "Discover the moon shrine";
    else if (Math.hypot(local.x + 38, local.z + 4) < 4)
      prompt = "Discover the lantern overlook";
    ui.setInteract(prompt);
  }
  renderer.render(scene, camera);
  frames++;
  fpsTime += realDt;
  if (fpsTime > 1) {
    ui.setFPS(Math.round(frames / fpsTime));
    fpsTime = 0;
    frames = 0;
  }
  if (frames % 5 === 0) minimap();
}
requestAnimationFrame(frame);
document.querySelector("#scene-loading")?.remove();
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
window.__moonveil = {
  get state() {
    return state;
  },
  get player() {
    return local;
  },
  get playing() {
    return playing;
  },
  get selfId() {
    return selfId;
  },
  get controls() {
    return {
      keys: [...keys],
      cameraYaw,
      paused,
      overlay: ui.isOverlayOpen(),
      locked,
    };
  },
  scene,
  renderer,
};
