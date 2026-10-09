import { randomInt } from "node:crypto";
import {
  STYLES,
  SPAWN,
  ENEMY_SPAWNS,
  NPC,
  WORLD_LIMIT,
  TECHNIQUE_LEVELS,
  canOccupy,
} from "../shared/config.js";

export const MAX_PLAYERS = 6;
const COLORS = /^#[0-9a-f]{6}$/i;
const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const alive = (entity) => !entity.dead && entity.hp > 0;
const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const EXPLORATION = [
  { id: "shrine", x: 0, z: -28, name: "Moonlit Shrine" },
  { id: "overlook", x: -38, z: -4, name: "Lantern Overlook" },
];
export const levelFor = (xp) => Math.min(30, 1 + Math.floor(xp / 70));

export function safeAppearance(input = {}) {
  if (!input || typeof input !== "object") input = {};
  const faction = input.faction === "demon" ? "demon" : "slayer";
  return {
    name:
      String(input.name || "Wanderer")
        .replace(/[\u0000-\u001f<>]/g, "")
        .trim()
        .slice(0, 18) || "Wanderer",
    style:
      faction === "demon"
        ? "blood"
        : Object.hasOwn(STYLES, input.style) && input.style !== "blood"
          ? input.style
          : "water",
    faction,
    color: COLORS.test(String(input.color))
      ? input.color.toLowerCase()
      : "#405d75",
  };
}

export function safeProgress(input = {}) {
  if (!input || typeof input !== "object") input = {};
  return {
    xp: clamp(Math.floor(finite(input.xp)), 0, 2_030),
    coins: clamp(Math.floor(finite(input.coins, 30)), 0, 99_999),
    kills: clamp(Math.floor(finite(input.kills)), 0, 99_999),
    bossKills: clamp(Math.floor(finite(input.bossKills)), 0, 99_999),
    questAccepted: input.questAccepted === true,
    questClaimed: input.questClaimed === true,
    visited: Array.isArray(input.visited)
      ? [
          ...new Set(
            input.visited.filter((id) =>
              EXPLORATION.some((point) => point.id === id),
            ),
          ),
        ]
      : [],
  };
}

export function createRoom(code, mode, now) {
  return {
    code,
    mode,
    players: new Map(),
    createdAt: now,
    enemies: ENEMY_SPAWNS.map((spawn) => ({
      ...spawn,
      spawnX: spawn.x,
      spawnZ: spawn.z,
      y: 0,
      yaw: Math.PI,
      hp: spawn.boss ? 1_000 : 110,
      maxHp: spawn.boss ? 1_000 : 110,
      boss: !!spawn.boss,
      dead: false,
      action: "idle",
      actionAt: now,
      nextAttack: now + 1_000,
      windup: null,
      respawnAt: 0,
      contributors: new Set(),
    })),
  };
}

export function createPlayer(id, input, now, index = 0) {
  const progress = safeProgress(input.progress);
  const p = {
    id,
    ...safeAppearance(input),
    ...progress,
    level: levelFor(progress.xp),
    equipment: "standard",
    x: SPAWN.x + index * 1.3,
    y: 0,
    z: SPAWN.z,
    yaw: Math.PI,
    hp: 100,
    stamina: 100,
    energy: 100,
    dead: false,
    moving: false,
    sprinting: false,
    blocking: false,
    blockAt: 0,
    action: "idle",
    actionAt: now,
    combo: 0,
    abilityIndex: 0,
    cooldowns: [0, 0, 0],
    lastMove: now,
    lastAttack: now - 1_000,
    lastCombo: 0,
    lastCombat: now - 10_000,
    dashUntil: 0,
    dashAt: 0,
    invulnerableUntil: 0,
    lastPotion: now - 10_000,
    jumpAt: null,
    jumpReady: true,
  };
  if (equipmentAllowed(input.equipment, p.level)) p.equipment = input.equipment;
  return p;
}

export function equipmentAllowed(equipment, level) {
  return (
    equipment === "standard" ||
    (equipment === "ember" && level >= 2) ||
    (equipment === "moon" && level >= 3)
  );
}

export function roomSnapshot(room, now) {
  return {
    code: room.code,
    mode: room.mode,
    time: now,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      hp: p.hp,
      stamina: p.stamina,
      energy: p.energy,
      style: p.style,
      faction: p.faction,
      color: p.color,
      level: p.level,
      xp: p.xp,
      coins: p.coins,
      kills: p.kills,
      bossKills: p.bossKills,
      questAccepted: p.questAccepted,
      questClaimed: p.questClaimed,
      visited: p.visited,
      equipment: p.equipment,
      moving: p.moving,
      sprinting: p.sprinting,
      blocking: p.blocking,
      dead: p.dead,
      action: p.action,
      actionAt: p.actionAt,
      combo: p.combo,
      abilityIndex: p.abilityIndex,
      cooldowns: p.cooldowns.map((time) => Math.max(0, (time - now) / 1_000)),
    })),
    enemies: room.enemies.map((e) => ({
      id: e.id,
      x: e.x,
      z: e.z,
      yaw: e.yaw,
      hp: e.hp,
      maxHp: e.maxHp,
      boss: e.boss,
      dead: e.dead,
      action: e.action,
      actionAt: e.actionAt,
      windupRadius: e.windup?.radius || 0,
      respawnIn: e.dead ? Math.max(0, (e.respawnAt - now) / 1_000) : 0,
    })),
  };
}

export function randomRoomCode(rooms) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from(
      { length: 5 },
      () => alphabet[randomInt(alphabet.length)],
    ).join("");
  } while (rooms.has(code));
  return code;
}

export function createGameplay({ io, now, rooms }) {
  const notice = (p, message) => io.to(p.id).emit("notice", message);
  const save = (p) =>
    io.to(p.id).emit("progress", {
      xp: p.xp,
      coins: p.coins,
      kills: p.kills,
      bossKills: p.bossKills,
      questAccepted: p.questAccepted,
      questClaimed: p.questClaimed,
      visited: p.visited,
      equipment: p.equipment,
      style: p.style,
      faction: p.faction,
      color: p.color,
    });
  const action = (room, p, kind, extra = {}) => {
    p.action = kind;
    p.actionAt = now();
    if (kind === "attack") p.combo = extra.combo || 1;
    if (kind === "ability") p.abilityIndex = extra.index || 0;
    io.to(room.code).emit("action", {
      id: p.id,
      kind,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      style: p.style || "blood",
      boss: !!p.boss,
      ...extra,
    });
  };

  function award(room, enemy, killer) {
    const recipients = [...room.players.values()].filter(
      (p) =>
        alive(p) &&
        (p.id === killer.id ||
          enemy.contributors.has(p.id) ||
          distance(p, enemy) < 24),
    );
    for (const p of recipients) {
      const xp = enemy.boss ? 280 : 70;
      const coins = enemy.boss ? 120 : 20;
      const oldLevel = p.level;
      p.xp = Math.min(2_030, p.xp + xp);
      p.level = levelFor(p.xp);
      p.coins += coins;
      if (enemy.boss) p.bossKills += 1;
      else p.kills += 1;
      if (oldLevel < p.level) {
        p.energy = 100;
        notice(
          p,
          `Level ${p.level}! ${p.level <= 3 ? "A new technique is unlocked." : "Your strength has grown."}`,
        );
      }
      action(room, p, "reward", { xp, coins, target: enemy.id });
      save(p);
    }
  }

  function damageEnemy(room, enemy, attacker, amount) {
    if (!alive(enemy)) return;
    enemy.hp = Math.max(0, enemy.hp - amount);
    enemy.contributors.add(attacker.id);
    attacker.lastCombat = now();
    action(room, enemy, "hit", { damage: amount, target: enemy.id });
    if (enemy.hp === 0) {
      enemy.dead = true;
      enemy.windup = null;
      enemy.respawnAt = now() + (enemy.boss ? 35_000 : 18_000);
      action(room, enemy, "death");
      award(room, enemy, attacker);
    }
  }

  function damagePlayer(room, target, attacker, amount, unblockable = false) {
    if (!alive(target) || now() < target.invulnerableUntil) return;
    target.lastCombat = now();
    if (target.blocking && target.stamina >= 8 && !unblockable) {
      const sourceYaw = Math.atan2(
        attacker.x - target.x,
        attacker.z - target.z,
      );
      if (Math.abs(normalizeAngle(sourceYaw - target.yaw)) < 1.9) {
        if (now() - target.blockAt < 280) {
          target.stamina = Math.max(0, target.stamina - 8);
          target.energy = Math.min(100, target.energy + 12);
          target.invulnerableUntil = now() + 400;
          action(room, target, "parry", { target: attacker.id });
          if (attacker.contributors) {
            attacker.nextAttack = now() + 1_900;
            damageEnemy(room, attacker, target, 28);
          }
          return;
        }
        target.stamina = Math.max(0, target.stamina - 20);
        amount = Math.round(amount * 0.22);
        if (target.stamina <= 0) target.blocking = false;
      }
    }
    target.hp = Math.max(0, target.hp - amount);
    action(room, target, "hit", { damage: amount, target: target.id });
    if (target.hp === 0) {
      target.dead = true;
      target.moving = false;
      target.blocking = false;
      action(room, target, "death");
      notice(target, "You have fallen. Press R to return to the shrine.");
    }
  }

  function inCone(attacker, target, range, angle = 1.15) {
    const dist = distance(attacker, target);
    return (
      dist <= range &&
      (dist < 0.6 ||
        Math.abs(
          normalizeAngle(
            Math.atan2(target.x - attacker.x, target.z - attacker.z) -
              attacker.yaw,
          ),
        ) <= angle)
    );
  }

  function strike(room, p, damage, range, radial = false) {
    for (const enemy of room.enemies) {
      if (
        alive(enemy) &&
        (radial ? distance(p, enemy) < range : inCone(p, enemy, range))
      )
        damageEnemy(room, enemy, p, damage);
    }
    if (room.mode === "duel")
      for (const target of room.players.values()) {
        if (
          target.id !== p.id &&
          alive(target) &&
          (radial ? distance(p, target) < range : inCone(p, target, range))
        ) {
          damagePlayer(room, target, p, Math.round(damage * 0.8));
          p.lastCombat = now();
        }
      }
  }

  function move(room, p, data = {}) {
    if (
      !alive(p) ||
      !Number.isFinite(data.x) ||
      !Number.isFinite(data.z) ||
      !Number.isFinite(data.yaw)
    )
      return;
    const elapsed = clamp((now() - p.lastMove) / 1_000, 0, 0.25);
    p.lastMove = now();
    p.yaw = normalizeAngle(data.yaw);
    p.moving = data.moving === true;
    p.sprinting = data.sprinting === true && p.stamina > 5 && !p.blocking;
    const speed =
      now() < p.dashUntil ? 24 : p.blocking ? 3 : p.sprinting ? 10.2 : 6.4;
    let dx = clamp(data.x, -WORLD_LIMIT, WORLD_LIMIT) - p.x;
    let dz = clamp(data.z, -WORLD_LIMIT, WORLD_LIMIT) - p.z;
    const length = Math.hypot(dx, dz);
    const maxDistance = speed * elapsed;
    if (length > maxDistance && length) {
      dx *= maxDistance / length;
      dz *= maxDistance / length;
    }
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
    for (let i = 0; i < steps; i++) {
      if (canOccupy(p.x + dx / steps, p.z + dz / steps)) {
        p.x += dx / steps;
        p.z += dz / steps;
      } else {
        if (canOccupy(p.x + dx / steps, p.z)) p.x += dx / steps;
        if (canOccupy(p.x, p.z + dz / steps)) p.z += dz / steps;
      }
    }
    // A rising client height requests a jump; the server owns its trajectory.
    // This prevents hovering to avoid enemy attacks while retaining prediction.
    if (finite(data.y) > 0.05 && p.jumpReady && p.y <= 0.05) {
      p.jumpAt = now() - 40;
      p.jumpReady = false;
    }
    updateJump(p);
    if (finite(data.y) <= 0.05 && p.y <= 0.05) p.jumpReady = true;
    if (p.sprinting && length > 0.03)
      p.stamina = Math.max(0, p.stamina - elapsed * 11);
    if (now() - p.actionAt > 700) {
      p.action = p.blocking
        ? "block"
        : p.moving
          ? p.sprinting
            ? "run"
            : "walk"
          : "idle";
    }
  }

  function attack(room, p) {
    if (!alive(p) || p.blocking || now() - p.lastAttack < 360 || p.stamina < 7)
      return;
    const combo = now() - p.lastAttack < 1_100 ? (p.lastCombo % 3) + 1 : 1;
    p.lastCombo = combo;
    p.lastAttack = now();
    p.lastCombat = now();
    p.stamina -= 7;
    const equipmentBonus =
      p.equipment === "ember" ? 3 : p.equipment === "moon" ? 6 : 0;
    const damage =
      (combo === 3 ? 34 : combo === 2 ? 27 : 23) +
      equipmentBonus +
      Math.min(10, p.level - 1);
    action(room, p, "attack", { combo });
    strike(room, p, damage, 3.5 + (combo === 3 ? 0.5 : 0));
  }

  function ability(room, p, data = {}) {
    const index = data.index;
    if (
      !alive(p) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 2 ||
      p.blocking
    )
      return;
    if (p.level < TECHNIQUE_LEVELS[index])
      return notice(
        p,
        `This technique unlocks at level ${TECHNIQUE_LEVELS[index]}.`,
      );
    const technique = STYLES[p.style].abilities[index];
    if (p.cooldowns[index] > now()) return;
    if (p.energy < technique.cost)
      return notice(p, "Breathing energy is too low. Let it recover.");
    p.energy -= technique.cost;
    p.cooldowns[index] = now() + technique.cooldown * 1_000;
    p.lastCombat = now();
    if (p.style === "mist" && index === 2) p.invulnerableUntil = now() + 1_500;
    if (p.style === "blood" && index === 2) p.hp = Math.min(100, p.hp + 20);
    action(room, p, "ability", { index });
    strike(
      room,
      p,
      technique.damage + Math.min(15, p.level - 1),
      technique.range,
      technique.type === "spin" || technique.type === "nova",
    );
  }

  function dash(room, p) {
    if (!alive(p) || p.stamina < 24 || now() - p.dashAt < 900) return;
    p.stamina -= 24;
    p.blocking = false;
    p.dashAt = now();
    p.dashUntil = now() + 330;
    p.invulnerableUntil = now() + 380;
    action(room, p, "dash");
  }

  function block(room, p, data = {}) {
    if (!alive(p)) return;
    const active = data.active === true && p.stamina > 0;
    if (active && !p.blocking) p.blockAt = now();
    p.blocking = active;
    p.action = active ? "block" : "idle";
    p.actionAt = now();
  }

  function interact(room, p) {
    if (!alive(p)) return;
    const point = EXPLORATION.find((point) => distance(p, point) < 4.5);
    if (point) {
      if (p.visited.includes(point.id))
        return notice(
          p,
          `${point.name}: this place is already recorded in your journal.`,
        );
      p.visited.push(point.id);
      p.xp = Math.min(2_030, p.xp + 35);
      p.level = levelFor(p.xp);
      p.coins += 25;
      notice(p, `${point.name} discovered! +35 XP, +25 coins.`);
      action(room, p, "reward", { xp: 35, coins: 25 });
      save(p);
      return;
    }
    if (distance(p, NPC) > 4.5)
      return notice(p, "Find Master Hoshino at the village shrine.");
    if (!p.questAccepted) {
      p.questAccepted = true;
      notice(
        p,
        "Night Watch accepted: defeat 3 demons, then return to Master Hoshino.",
      );
      save(p);
    } else if (p.questClaimed)
      notice(
        p,
        "The village is in your debt. Challenge the Hollow King beyond the torii gates.",
      );
    else if (p.kills < 3)
      notice(
        p,
        `Night Watch: ${p.kills}/3 demons defeated. Return when the village is safe.`,
      );
    else {
      p.questClaimed = true;
      p.xp = Math.min(2_030, p.xp + 160);
      p.level = levelFor(p.xp);
      p.coins += 100;
      p.hp = p.stamina = p.energy = 100;
      notice(
        p,
        "Night Watch complete! +160 XP, +100 coins. Your strength is restored.",
      );
      action(room, p, "reward", { xp: 160, coins: 100 });
      save(p);
    }
  }

  function customize(room, p, data = {}) {
    if (now() - p.lastCombat < 5_000)
      return notice(p, "Wait until you are out of combat to change equipment.");
    const appearance = safeAppearance({ ...p, ...data, name: p.name });
    Object.assign(p, appearance);
    if (equipmentAllowed(data.equipment, p.level)) p.equipment = data.equipment;
    else if (data.equipment) notice(p, "That sword has not been unlocked yet.");
    save(p);
  }

  function potion(room, p) {
    if (!alive(p) || p.hp >= 100) return;
    if (now() - p.lastPotion < 1_500) return;
    if (p.coins < 10) return notice(p, "A healing draught costs 10 coins.");
    p.coins -= 10;
    p.hp = Math.min(100, p.hp + 50);
    p.lastPotion = now();
    notice(p, "Healing draught used. +50 health.");
    save(p);
  }

  function respawn(room, p) {
    if (!p.dead) return;
    p.x = SPAWN.x;
    p.y = 0;
    p.z = SPAWN.z;
    p.yaw = Math.PI;
    p.hp = p.energy = p.stamina = 100;
    p.dead = false;
    p.jumpAt = null;
    p.jumpReady = true;
    p.blocking = false;
    p.action = "idle";
    p.actionAt = now();
    p.lastMove = now();
    p.invulnerableUntil = now() + 2_000;
    notice(p, "The shrine grants you another chance.");
  }

  function updateEnemies(room, dt) {
    for (const enemy of room.enemies) {
      if (enemy.dead) {
        if (now() >= enemy.respawnAt) {
          enemy.dead = false;
          enemy.hp = enemy.maxHp;
          enemy.x = enemy.spawnX;
          enemy.z = enemy.spawnZ;
          enemy.action = "idle";
          enemy.actionAt = now();
          enemy.nextAttack = now() + 1_000;
          enemy.contributors.clear();
        }
        continue;
      }
      const targets = [...room.players.values()].filter(alive);
      const target = targets.sort(
        (a, b) => distance(a, enemy) - distance(b, enemy),
      )[0];
      if (enemy.windup) {
        if (now() >= enemy.windup.at) {
          const { radius, x, z } = enemy.windup;
          for (const p of targets) {
            if (
              Math.hypot(p.x - x, p.z - z) < radius &&
              (enemy.boss || p.y < 0.8)
            ) {
              damagePlayer(room, p, enemy, enemy.boss ? 36 : 17, enemy.boss);
            }
          }
          action(room, enemy, "enemyAttack", { radius });
          enemy.windup = null;
          enemy.nextAttack = now() + (enemy.boss ? 2_600 : 1_450);
        } else if (now() - enemy.actionAt > 200) enemy.action = "windup";
        continue;
      }
      const aggroRange = enemy.boss ? 22 : 17;
      const homeDistance = Math.hypot(
        enemy.x - enemy.spawnX,
        enemy.z - enemy.spawnZ,
      );
      if (
        !target ||
        distance(enemy, target) > aggroRange ||
        homeDistance > 25
      ) {
        const home = { x: enemy.spawnX, z: enemy.spawnZ };
        if (distance(enemy, home) > 0.8)
          walkEnemy(enemy, home, dt, enemy.boss ? 1.8 : 2.5);
        else enemy.action = "idle";
        continue;
      }
      enemy.yaw = Math.atan2(target.x - enemy.x, target.z - enemy.z);
      const attackRange = enemy.boss ? 6 : 2.8;
      if (distance(enemy, target) < attackRange && now() >= enemy.nextAttack) {
        const radius = enemy.boss ? 7 : 3.5;
        const duration = enemy.boss ? 1.15 : 0.65;
        enemy.windup = {
          at: now() + duration * 1_000,
          radius,
          x: enemy.x,
          z: enemy.z,
        };
        action(room, enemy, "windup", { radius, duration });
      } else if (distance(enemy, target) > attackRange * 0.75)
        walkEnemy(enemy, target, dt, enemy.boss ? 2.6 : 3.5);
    }
  }

  function walkEnemy(enemy, target, dt, speed) {
    const yaw = Math.atan2(target.x - enemy.x, target.z - enemy.z);
    const dx = Math.sin(yaw) * speed * dt,
      dz = Math.cos(yaw) * speed * dt;
    enemy.yaw = yaw;
    if (canOccupy(enemy.x + dx, enemy.z + dz, enemy.boss ? 1.1 : 0.5)) {
      enemy.x += dx;
      enemy.z += dz;
    } else {
      if (canOccupy(enemy.x + dx, enemy.z, 0.5)) enemy.x += dx;
      if (canOccupy(enemy.x, enemy.z + dz, 0.5)) enemy.z += dz;
    }
    if (enemy.action !== "walk") {
      enemy.action = "walk";
      enemy.actionAt = now();
    }
  }

  function tick(dt = 0.05) {
    dt = clamp(finite(dt, 0.05), 0, 0.25);
    for (const room of rooms.values()) {
      for (const p of room.players.values()) {
        if (!alive(p)) continue;
        updateJump(p);
        p.stamina = Math.min(
          100,
          p.stamina + dt * (p.sprinting && p.moving ? 3 : p.blocking ? 4 : 16),
        );
        p.energy = Math.min(
          100,
          p.energy + dt * (now() - p.lastCombat < 1_200 ? 3 : 9),
        );
        if (p.faction === "demon" && now() - p.lastCombat > 3_000)
          p.hp = Math.min(100, p.hp + dt * 3);
        if (now() - p.lastMove > 250) {
          p.moving = false;
          p.sprinting = false;
        }
        if (now() - p.actionAt > 700 && !p.moving)
          p.action = p.blocking ? "block" : "idle";
      }
      updateEnemies(room, dt);
      io.to(room.code).emit("state", roomSnapshot(room, now()));
    }
  }

  function updateJump(p) {
    if (p.jumpAt === null) {
      p.y = 0;
      return;
    }
    const seconds = Math.max(0, (now() - p.jumpAt) / 1_000);
    p.y = Math.max(0, 7.5 * seconds - 10 * seconds * seconds);
    if (seconds >= 0.75) {
      p.y = 0;
      p.jumpAt = null;
    }
  }

  return {
    move,
    attack,
    ability,
    dash,
    block,
    interact,
    customize,
    potion,
    respawn,
    tick,
    save,
  };
}
