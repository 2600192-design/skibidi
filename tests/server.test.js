import test from "node:test";
import assert from "node:assert/strict";
import { io as connect } from "socket.io-client";
import { createGameServer } from "../server/index.js";
import { canOccupy, NPC, STYLES, WORLD_LIMIT } from "../shared/config.js";

async function fixture(t) {
  let time = 100_000;
  const game = createGameServer({ now: () => time, autoTick: false });
  await game.listen(0, "127.0.0.1");
  const url = `http://127.0.0.1:${game.httpServer.address().port}`;
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.disconnect();
    await game.close();
  });
  const advance = (seconds) => {
    time += seconds * 1000;
  };
  async function client() {
    const socket = connect(url, {
      transports: ["websocket"],
      reconnection: false,
    });
    clients.push(socket);
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return socket;
  }
  async function join(socket, options = {}) {
    return socket.timeout(2000).emitWithAck("join", {
      name: "Test Slayer",
      style: "water",
      faction: "slayer",
      color: "#74d8f0",
      mode: "coop",
      create: true,
      ...options,
    });
  }
  // The listener is appended after the gameplay handlers. It creates an event
  // delivery barrier without timing-sensitive sleeps or a test-only protocol.
  async function send(socket, event, payload) {
    const serverSocket = game.io.sockets.sockets.get(socket.id);
    assert.ok(serverSocket, "client has a server socket");
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        serverSocket.off(event, received);
        reject(new Error(`Timed out delivering ${event}`));
      }, 2000);
      function received() {
        clearTimeout(timeout);
        resolve();
      }
      serverSocket.once(event, received);
      socket.emit(event, payload);
    });
  }
  async function room(options = {}) {
    const socket = await client();
    const result = await join(socket, options);
    assert.equal(result.ok, true, result.error);
    const instance = game.rooms.get(result.code);
    assert.ok(instance, "created room exists");
    return {
      socket,
      result,
      instance,
      player: instance.players.get(socket.id),
    };
  }
  return { game, url, client, join, send, room, advance };
}

test("HTTP health check responds and the root serves the browser game", async (t) => {
  const { url } = await fixture(t);
  const health = await fetch(`${url}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const root = await fetch(url);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /<!doctype html/i);
});

test("private codes reject missing rooms and enforce a six-player limit", async (t) => {
  const f = await fixture(t);
  const { result, instance } = await f.room();
  assert.match(result.code, /^[A-Z0-9]{4,8}$/);
  const stranger = await f.client();
  assert.equal(
    (await f.join(stranger, { create: false, code: "BAD999" })).ok,
    false,
  );
  for (let i = 0; i < 5; i++) {
    const socket = await f.client();
    const joined = await f.join(socket, {
      create: false,
      code: result.code,
      name: `Friend ${i}`,
    });
    assert.equal(joined.ok, true, joined.error);
    assert.equal(joined.code, result.code);
  }
  assert.equal(instance.players.size, 6);
  const overflow = await f.client();
  assert.equal(
    (await f.join(overflow, { create: false, code: result.code })).ok,
    false,
  );
  assert.equal(instance.players.size, 6);
});

test("new rooms isolate players, enemies, and join state broadcasts", async (t) => {
  const f = await fixture(t);
  const first = await f.room({ name: "First" });
  const second = await f.room({ name: "Second" });
  assert.notEqual(first.result.code, second.result.code);
  assert.equal(first.instance.players.has(second.socket.id), false);
  assert.equal(second.instance.players.has(first.socket.id), false);
  assert.notEqual(first.instance.enemies, second.instance.enemies);
  first.instance.enemies[0].hp = 1;
  assert.notEqual(second.instance.enemies[0].hp, 1);
  const nextState = new Promise((resolve) =>
    first.socket.once("state", resolve),
  );
  f.game.tick(0.05);
  const state = await nextState;
  assert.equal(state.code, first.result.code);
  assert.deepEqual(
    state.players.map((p) => p.id),
    [first.socket.id],
  );
  assert.ok(state.enemies.some((enemy) => enemy.boss));
});

test("movement stays finite, bounded, and outside solid world geometry", async (t) => {
  const f = await fixture(t);
  const { socket, player } = await f.room();
  const initial = { x: player.x, z: player.z };
  f.advance(0.1);
  await f.send(socket, "move", {
    x: 10000,
    y: 10000,
    z: 10000,
    yaw: 0,
    sprint: true,
  });
  assert.ok(
    Math.hypot(player.x - initial.x, player.z - initial.z) < 5,
    "one packet cannot teleport",
  );
  assert.ok(
    Math.abs(player.x) <= WORLD_LIMIT && Math.abs(player.z) <= WORLD_LIMIT,
  );
  assert.ok(
    Number.isFinite(player.x) &&
      Number.isFinite(player.y) &&
      Number.isFinite(player.z),
  );
  const safe = { x: player.x, y: player.y, z: player.z };
  f.advance(0.1);
  await f.send(socket, "move", {
    x: "invalid",
    y: null,
    z: {},
    yaw: "invalid",
  });
  assert.ok(
    Number.isFinite(player.x) &&
      Number.isFinite(player.y) &&
      Number.isFinite(player.z),
  );
  assert.ok(Math.hypot(player.x - safe.x, player.z - safe.z) < 5);
  player.x = -10.7;
  player.z = -14;
  f.advance(1);
  await f.send(socket, "move", { x: -17, y: 0, z: -14, yaw: Math.PI / 2 });
  assert.ok(
    canOccupy(player.x, player.z),
    "player cannot enter a building collider",
  );
});

test("sword combat hits a nearby enemy in front and awards a kill once", async (t) => {
  const f = await fixture(t);
  const { socket, instance, player } = await f.room();
  player.x = 0;
  player.z = 0;
  player.yaw = 0;
  for (const enemy of instance.enemies) {
    enemy.x = 60;
    enemy.z = 60;
  }
  const front = instance.enemies[0];
  const behind = instance.enemies[1];
  Object.assign(front, { x: 0, z: 2, hp: 100, maxHp: 100, dead: false });
  Object.assign(behind, { x: 0, z: -2, hp: 100, maxHp: 100, dead: false });
  await f.send(socket, "attack", {});
  assert.ok(front.hp < 100, "front enemy receives sword damage");
  assert.equal(
    behind.hp,
    100,
    "sword cone does not hit an enemy behind the attacker",
  );
  front.hp = 1;
  const kills = player.kills;
  const xp = player.xp;
  f.advance(1);
  await f.send(socket, "attack", {});
  assert.equal(front.dead, true);
  assert.equal(player.kills, kills + 1);
  assert.ok(player.xp > xp);
  f.advance(1);
  await f.send(socket, "attack", {});
  assert.equal(
    player.kills,
    kills + 1,
    "dead enemies cannot pay a reward twice",
  );
});

test("co-op protects teammates while duel rooms allow sword damage", async (t) => {
  const f = await fixture(t);
  for (const mode of ["coop", "duel"]) {
    const { socket, result, instance, player } = await f.room({ mode });
    const partner = await f.client();
    const joined = await f.join(partner, { create: false, code: result.code });
    assert.equal(joined.ok, true);
    const target = instance.players.get(partner.id);
    Object.assign(player, { x: 0, z: 0, yaw: 0 });
    Object.assign(target, { x: 0, z: 2, yaw: 0 });
    const hp = target.hp;
    await f.send(socket, "attack", {});
    if (mode === "coop") assert.equal(target.hp, hp);
    else assert.ok(target.hp < hp, "duel opponent receives damage");
  }
});

test("join restores saved progression and keeps the host room mode", async (t) => {
  const f = await fixture(t);
  const { result, player, instance } = await f.room({
    mode: "coop",
    progress: {
      xp: 145,
      coins: 35,
      kills: 3,
      bossKills: 1,
      questAccepted: true,
      questClaimed: false,
    },
  });
  assert.equal(player.xp, 145);
  assert.equal(player.level, 3);
  assert.equal(player.coins, 35);
  assert.equal(player.kills, 3);
  assert.equal(player.bossKills, 1);
  assert.equal(player.questAccepted, true);
  const guest = await f.client();
  assert.equal(
    (await f.join(guest, { create: false, code: result.code, mode: "duel" }))
      .ok,
    true,
  );
  assert.equal(
    instance.mode,
    "coop",
    "joining cannot change the existing room rules",
  );
});

test("corrupted saved values and appearance cannot produce invalid player state", async (t) => {
  const f = await fixture(t);
  const { player } = await f.room({
    name: "<script>\u0000VeryLongPlayerNameThatIsClipped",
    style: "__proto__",
    color: "invalid",
    equipment: "moon",
    progress: {
      xp: "invalid",
      coins: -500,
      kills: null,
      bossKills: {},
      questAccepted: "true",
      visited: ["shrine", "shrine", "unknown", 123],
    },
  });
  assert.equal(player.xp, 0);
  assert.equal(player.level, 1);
  assert.equal(player.coins, 0);
  assert.equal(player.kills, 0);
  assert.equal(player.bossKills, 0);
  assert.equal(player.questAccepted, false);
  assert.deepEqual(player.visited, ["shrine"]);
  assert.equal(player.equipment, "standard");
  assert.equal(player.style, "water");
  assert.match(player.color, /^#[0-9a-f]{6}$/i);
  assert.ok(player.name.length <= 18 && !/[<>\u0000]/.test(player.name));
});

test("all seven breathing styles and Blood Art deliver their configured ability damage", async (t) => {
  const f = await fixture(t);
  for (const [style, definition] of Object.entries(STYLES)) {
    const { socket, instance, player } = await f.room({
      style,
      faction: style === "blood" ? "demon" : "slayer",
    });
    Object.assign(player, { x: 0, z: 0, yaw: 0 });
    for (const enemy of instance.enemies) {
      enemy.x = 60;
      enemy.z = 60;
    }
    const enemy = instance.enemies[0];
    Object.assign(enemy, { x: 0, z: 2, hp: 1000, maxHp: 1000 });
    await f.send(socket, "ability", { index: 0 });
    assert.equal(player.style, style);
    assert.equal(
      enemy.hp,
      1000 - definition.abilities[0].damage,
      `${style} applies ability damage`,
    );
    assert.equal(
      player.energy,
      100 - definition.abilities[0].cost,
      `${style} consumes breathing energy`,
    );
    assert.equal(player.action, "ability");
  }
});

test("techniques enforce level locks, cooldowns, and energy costs", async (t) => {
  const f = await fixture(t);
  const { socket, instance, player } = await f.room();
  Object.assign(player, { x: 0, z: 0, yaw: 0 });
  for (const enemy of instance.enemies) {
    enemy.x = 60;
    enemy.z = 60;
  }
  const target = instance.enemies[0];
  Object.assign(target, { x: 0, z: 2, hp: 1000, maxHp: 1000 });
  await f.send(socket, "ability", { index: 1 });
  assert.equal(player.energy, 100);
  assert.equal(target.hp, 1000);
  await f.send(socket, "ability", { index: 0.5 });
  assert.equal(player.energy, 100);
  await f.send(socket, "ability", { index: 0 });
  const afterFirst = {
    hp: target.hp,
    energy: player.energy,
    cooldown: player.cooldowns[0],
  };
  await f.send(socket, "ability", { index: 0 });
  assert.equal(target.hp, afterFirst.hp);
  assert.equal(player.energy, afterFirst.energy);
  assert.equal(player.cooldowns[0], afterFirst.cooldown);
  f.advance(STYLES.water.abilities[0].cooldown + 0.01);
  await f.send(socket, "ability", { index: 0 });
  assert.ok(target.hp < afterFirst.hp);
  player.xp = 70;
  player.level = 2;
  await f.send(socket, "ability", { index: 1 });
  assert.ok(player.cooldowns[1] > 0, "level two unlocks the second technique");
  player.xp = 140;
  player.level = 3;
  player.energy = 100;
  await f.send(socket, "ability", { index: 2 });
  assert.ok(player.cooldowns[2] > 0, "level three unlocks the third technique");
  f.advance(20);
  player.energy = 0;
  const hp = target.hp;
  await f.send(socket, "ability", { index: 0 });
  assert.equal(target.hp, hp, "empty energy prevents another ability");
});

test("a timed parry prevents damage, held block reduces it, and dash grants dodge protection", async (t) => {
  const f = await fixture(t);
  const { socket, result, instance, player } = await f.room({ mode: "duel" });
  const defender = await f.client();
  await f.join(defender, { create: false, code: result.code });
  const target = instance.players.get(defender.id);
  Object.assign(player, { x: 0, z: 0, yaw: 0 });
  Object.assign(target, { x: 0, z: 2, yaw: Math.PI, energy: 70 });
  await f.send(defender, "block", { active: true });
  await f.send(socket, "attack", {});
  assert.equal(target.hp, 100);
  assert.equal(target.action, "parry");
  assert.ok(target.energy > 70, "a successful parry returns energy");
  assert.ok(target.stamina < 100, "parry still has a stamina cost");
  f.advance(1);
  await f.send(socket, "attack", {});
  assert.ok(
    target.hp < 100 && target.hp > 90,
    "held block reduces sword damage",
  );
  await f.send(defender, "block", { active: false });
  f.advance(1);
  const health = target.hp;
  await f.send(defender, "dash", {});
  await f.send(socket, "attack", {});
  assert.equal(
    target.hp,
    health,
    "attacks during dash invulnerability do not connect",
  );
  const stamina = target.stamina;
  await f.send(defender, "dash", {});
  assert.equal(
    target.stamina,
    stamina,
    "dash cannot be repeated during its cooldown",
  );
});

test("quests require nearby interaction and pay a persisted reward once after three real kills", async (t) => {
  const f = await fixture(t);
  const { socket, instance, player } = await f.room();
  Object.assign(player, { x: 50, z: 50 });
  await f.send(socket, "interact", {});
  assert.equal(
    player.questAccepted,
    false,
    "a distant NPC cannot grant the quest",
  );
  Object.assign(player, { x: NPC.x, z: NPC.z, yaw: 0 });
  await f.send(socket, "interact", {});
  assert.equal(player.questAccepted, true);
  await f.send(socket, "interact", {});
  assert.equal(
    player.questClaimed,
    false,
    "incomplete objectives cannot claim rewards",
  );
  for (const enemy of instance.enemies) {
    enemy.x = 60;
    enemy.z = 60;
  }
  for (const enemy of instance.enemies.slice(0, 3)) {
    Object.assign(enemy, { x: NPC.x, z: NPC.z + 2, hp: 1 });
  }
  await f.send(socket, "ability", { index: 0 });
  assert.equal(player.kills, 3);
  const beforeReward = { xp: player.xp, coins: player.coins };
  player.hp = 30;
  const saved = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("progress", onProgress);
      reject(new Error("Quest reward did not emit a saved progress event"));
    }, 2000);
    function onProgress(progress) {
      if (!progress.questClaimed) return;
      clearTimeout(timeout);
      socket.off("progress", onProgress);
      resolve(progress);
    }
    socket.on("progress", onProgress);
  });
  await f.send(socket, "interact", {});
  assert.equal(player.questClaimed, true);
  assert.equal(player.xp, beforeReward.xp + 160);
  assert.equal(player.coins, beforeReward.coins + 100);
  assert.equal(player.hp, 100);
  const progress = await saved;
  assert.equal(progress.questClaimed, true);
  assert.equal(progress.xp, player.xp);
  await f.send(socket, "interact", {});
  assert.equal(player.xp, beforeReward.xp + 160);
  assert.equal(player.coins, beforeReward.coins + 100);
});

test("exploration rewards each landmark once and restores visited landmarks on rejoin", async (t) => {
  const f = await fixture(t);
  const { socket, player } = await f.room();
  const initial = { xp: player.xp, coins: player.coins };
  for (const point of [
    { id: "shrine", x: 0, z: -28 },
    { id: "overlook", x: -38, z: -4 },
  ]) {
    Object.assign(player, { x: point.x, z: point.z });
    await f.send(socket, "interact", {});
    assert.ok(player.visited.includes(point.id));
    const coins = player.coins;
    await f.send(socket, "interact", {});
    assert.equal(player.coins, coins);
  }
  assert.equal(player.xp, initial.xp + 70);
  assert.equal(player.coins, initial.coins + 50);
  const restored = await f.room({
    progress: {
      xp: player.xp,
      coins: player.coins,
      visited: [...player.visited],
    },
  });
  Object.assign(restored.player, { x: 0, z: -28 });
  await f.send(restored.socket, "interact", {});
  assert.equal(restored.player.coins, player.coins);
});

test("equipment unlocks follow level and customization is unavailable during combat", async (t) => {
  const f = await fixture(t);
  const { socket, player } = await f.room();
  await f.send(socket, "customize", { equipment: "ember" });
  assert.equal(player.equipment, "standard");
  player.xp = 70;
  player.level = 2;
  await f.send(socket, "customize", { equipment: "ember" });
  assert.equal(player.equipment, "ember");
  await f.send(socket, "attack", {});
  player.xp = 140;
  player.level = 3;
  await f.send(socket, "customize", { equipment: "moon" });
  assert.equal(player.equipment, "ember");
  f.advance(5.1);
  await f.send(socket, "customize", {
    equipment: "moon",
    style: "sun",
    color: "#ffddaa",
  });
  assert.equal(player.equipment, "moon");
  assert.equal(player.style, "sun");
  assert.equal(player.color, "#ffddaa");
});

test("demons regenerate, healing spends coins, and fallen players respawn with preserved progress", async (t) => {
  const f = await fixture(t);
  const demon = await f.room({ faction: "demon", style: "water" });
  const slayer = await f.room();
  assert.equal(demon.player.style, "blood");
  demon.player.hp = 50;
  slayer.player.hp = 50;
  f.advance(4);
  f.game.tick(0.25);
  assert.ok(demon.player.hp > 50);
  assert.equal(slayer.player.hp, 50);
  const coins = slayer.player.coins;
  await f.send(slayer.socket, "potion", {});
  assert.equal(slayer.player.hp, 100);
  assert.equal(slayer.player.coins, coins - 10);
  Object.assign(slayer.player, {
    hp: 0,
    dead: true,
    x: 40,
    z: 40,
    xp: 70,
    level: 2,
  });
  await f.send(slayer.socket, "respawn", {});
  assert.equal(slayer.player.dead, false);
  assert.equal(slayer.player.hp, 100);
  assert.equal(slayer.player.stamina, 100);
  assert.equal(slayer.player.energy, 100);
  assert.equal(slayer.player.xp, 70);
  assert.equal(slayer.player.coins, coins - 10);
});

test("leaving removes players and deletes an empty room", async (t) => {
  const f = await fixture(t);
  const { socket, result, instance } = await f.room();
  const friend = await f.client();
  await f.join(friend, { create: false, code: result.code });
  await f.send(socket, "leave", {});
  assert.equal(instance.players.has(socket.id), false);
  assert.equal(instance.players.size, 1);
  assert.ok(f.game.rooms.has(result.code));
  await f.send(friend, "leave", {});
  assert.equal(f.game.rooms.has(result.code), false);
});

test("jump requests follow a server trajectory and cannot sustain flight", async (t) => {
  const f = await fixture(t);
  const { socket, player } = await f.room();
  const position = { x: player.x, z: player.z, yaw: player.yaw };
  f.advance(0.1);
  await f.send(socket, "move", { ...position, y: 10000 });
  assert.ok(
    player.y > 0 && player.y < 1.5,
    "client height starts a bounded jump",
  );
  f.advance(0.34);
  f.game.tick(0.05);
  assert.ok(player.y > 1 && player.y < 1.5, "jump reaches its apex");
  await f.send(socket, "move", { ...position, y: 10000 });
  f.advance(0.4);
  f.game.tick(0.05);
  assert.equal(player.y, 0, "jump returns to the ground on the server clock");
  await f.send(socket, "move", { ...position, y: 10000 });
  assert.equal(
    player.y,
    0,
    "a sustained height request cannot restart the jump",
  );
  await f.send(socket, "move", { ...position, y: 0 });
  await f.send(socket, "move", { ...position, y: 1 });
  assert.ok(player.y > 0, "landing and a new jump request allow a second jump");
});

test("boss attacks telegraph before impact, reward nearby allies, and respawn after defeat", async (t) => {
  const f = await fixture(t);
  const { socket, result, instance, player } = await f.room();
  const friend = await f.client();
  await f.join(friend, { create: false, code: result.code });
  const ally = instance.players.get(friend.id);
  const boss = instance.enemies.find((enemy) => enemy.boss);
  for (const enemy of instance.enemies.filter((enemy) => !enemy.boss)) {
    enemy.x = 60;
    enemy.z = 60;
    enemy.spawnX = 60;
    enemy.spawnZ = 60;
  }
  Object.assign(player, { x: boss.x, z: boss.z + 2, yaw: Math.PI });
  Object.assign(ally, { x: boss.x + 1, z: boss.z + 2 });
  boss.nextAttack = 0;
  await f.send(socket, "block", { active: true });
  f.game.tick(0.05);
  assert.ok(boss.windup, "nearby boss starts a visible attack windup");
  assert.equal(player.hp, 100, "telegraph has no immediate damage");
  f.advance(0.9);
  f.game.tick(0.05);
  assert.equal(player.hp, 100, "damage waits for the telegraphed impact time");
  ally.z = boss.z + 8;
  f.advance(0.3);
  f.game.tick(0.05);
  assert.equal(player.hp, 64, "boss area attack deals damage through block");
  assert.equal(ally.hp, 100, "leaving the telegraphed area avoids damage");
  assert.equal(boss.windup, null);
  await f.send(socket, "block", { active: false });
  boss.hp = 1;
  await f.send(socket, "attack", {});
  assert.equal(boss.dead, true);
  assert.equal(player.bossKills, 1);
  assert.equal(ally.bossKills, 1, "nearby co-op allies share boss rewards");
  assert.equal(player.xp, 280);
  assert.equal(ally.xp, 280);
  f.advance(34);
  f.game.tick(0.05);
  assert.equal(
    boss.dead,
    true,
    "boss remains defeated until its respawn timer",
  );
  f.advance(1.1);
  f.game.tick(0.05);
  assert.equal(boss.dead, false);
  assert.equal(boss.hp, boss.maxHp);
  assert.equal(boss.x, boss.spawnX);
  assert.equal(boss.z, boss.spawnZ);
  assert.equal(player.bossKills, 1, "respawn does not award another kill");
});
