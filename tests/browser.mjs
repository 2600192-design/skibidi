import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

// Run the real UI against an already-running server: node tests/browser.mjs.
// All gameplay assertions read the public diagnostic snapshot; actions use only
// buttons, keyboard and mouse, exactly as a player does.
const baseURL = process.env.BASE_URL || "http://localhost:3000";
await mkdir("test-results", { recursive: true });
const launchOptions = {
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
  ],
};
const browser = await chromium.launch(launchOptions);
let friendBrowser = null;
const errors = [],
  checks = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const host = await context.newPage();
function observe(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
}
observe(host);
const ready = (page) =>
  page.waitForFunction(
    () =>
      window.__moonveil?.renderer.info.render.frame >= 3 &&
      document.querySelector("#main-menu"),
    undefined,
    { timeout: 45_000, polling: 100 },
  );
const self = (page) =>
  page.evaluate(() =>
    window.__moonveil.state.players.find(
      (p) => p.id === window.__moonveil.selfId,
    ),
  );
async function holdUntil(page, key, predicate, arg, timeout = 45_000) {
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(predicate, arg, { timeout, polling: 100 });
  } finally {
    await page.keyboard.up(key);
  }
}
try {
  await host.goto(baseURL, { waitUntil: "networkidle" });
  await ready(host);
  await host.screenshot({ path: "test-results/menu.png" });
  assert.equal(await host.locator("#main-menu").isVisible(), true);
  checks.push("menu renders a live 3D scene");
  // Software WebGL in CI is deliberately slower than a gaming GPU. Verify the
  // public performance setting and use it for the interactive smoke checks.
  await host.locator('#main-menu [data-action="settings"]').click();
  await host.locator('[data-quality="low"]').click();
  await host
    .locator('[data-action="close-panel"]')
    .filter({ hasText: "" })
    .last()
    .click();
  checks.push("performance quality setting");

  await host.locator('#main-menu [data-action="lobby"]').click();
  await host.locator("#profile-name").fill("Akira");
  await host.locator('[data-action="create-room"]').click();
  await host.waitForFunction(
    () =>
      window.__moonveil.playing && window.__moonveil.state.players.length === 1,
  );
  const code = await host.locator("#hud-room-code").textContent();
  assert.match(code, /^[A-Z0-9]{5}$/);
  assert.equal((await self(host)).name, "Akira");
  checks.push("private room creation and username");

  const start = await host.evaluate(() => ({ ...window.__moonveil.player }));
  await holdUntil(
    host,
    "w",
    (initial) => window.__moonveil.player.z < initial - 2.5,
    start.z,
  );
  assert.ok(
    (await host.evaluate(() => window.__moonveil.player.z)) < start.z - 2,
  );
  checks.push("WASD movement");
  await holdUntil(
    host,
    "Space",
    () => window.__moonveil.player.y > 0.3,
    undefined,
    15_000,
  );
  await host.waitForFunction(
    () => window.__moonveil.player.y === 0,
    undefined,
    { timeout: 45_000, polling: 100 },
  );
  checks.push("jump and landing");
  await host.keyboard.press("1");
  const cast = await host.waitForFunction(
    () => {
      const me = window.__moonveil.state.players.find(
        (p) => p.id === window.__moonveil.selfId,
      );
      return me?.cooldowns[0] > 0 && me.energy < 100
        ? { energy: me.energy, cooldown: me.cooldowns[0] }
        : false;
    },
    undefined,
    { polling: 100 },
  );
  assert.ok((await cast.jsonValue()).energy < 100);
  checks.push("breathing ability consumes energy and starts cooldown");

  await host.keyboard.press("q");
  await host.waitForFunction(
    () =>
      window.__moonveil.state.players.find(
        (p) => p.id === window.__moonveil.selfId,
      )?.stamina < 90,
  );
  checks.push("dodge consumes stamina");
  // Dodge points north; walk back only if it passes the NPC's interaction zone.
  const z = await host.evaluate(() => window.__moonveil.player.z);
  if (z > 13.6)
    await holdUntil(host, "w", () => window.__moonveil.player.z < 13.6);
  else if (z < 12)
    await holdUntil(host, "s", () => window.__moonveil.player.z > 12.3);
  await holdUntil(host, "a", () => window.__moonveil.player.x < -4.1);
  await host.keyboard.press("e");
  await host.waitForFunction(
    () =>
      window.__moonveil.state.players.find(
        (p) => p.id === window.__moonveil.selfId,
      )?.questAccepted === true,
  );
  checks.push("NPC interaction starts the quest");
  await host.screenshot({ path: "test-results/gameplay.png" });

  // Separate browser processes represent two computers and avoid sharing one
  // software WebGL context queue when this test runs without a physical GPU.
  friendBrowser = await chromium.launch(launchOptions);
  const friendContext = await friendBrowser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [
            {
              name: "moonveil.settings.v1",
              value: JSON.stringify({
                volume: 0.45,
                sensitivity: 1,
                quality: "low",
              }),
            },
          ],
        },
      ],
    },
  });
  const friend = await friendContext.newPage();
  observe(friend);
  await friend.bringToFront();
  await friend.goto(baseURL, { waitUntil: "networkidle" });
  await ready(friend);
  await friend.locator('#main-menu [data-action="settings"]').click();
  await friend.locator('[data-quality="low"]').click();
  await friend.locator('[data-action="close-panel"]').last().click();
  await friend.locator('#main-menu [data-action="lobby"]').click();
  await friend.locator("#profile-name").fill("Yuki");
  await friend.locator("#join-code").fill(code);
  await friend.locator('[data-action="join-room"]').click();
  await friend.waitForFunction(
    () =>
      window.__moonveil.playing && window.__moonveil.state.players.length === 2,
  );
  await host.waitForFunction(
    () => window.__moonveil.state.players.length === 2,
  );
  assert.deepEqual(
    (
      await host.evaluate(() =>
        window.__moonveil.state.players.map((p) => p.name),
      )
    ).sort(),
    ["Akira", "Yuki"],
  );
  checks.push("friend joins by room code and both clients synchronize");
  const friendStart = await friend.evaluate(() => window.__moonveil.player.x);
  await holdUntil(
    friend,
    "d",
    (initial) => window.__moonveil.player.x > initial + 1.5,
    friendStart,
  );
  const friendId = await friend.evaluate(() => window.__moonveil.selfId);
  await host.waitForFunction(
    ({ id, initial }) =>
      window.__moonveil.state.players.find((p) => p.id === id)?.x > initial + 1,
    { id: friendId, initial: friendStart },
  );
  checks.push("remote movement replication");
  await friend.keyboard.press("1");
  await host.waitForFunction(
    (id) =>
      window.__moonveil.state.players.find((p) => p.id === id)?.cooldowns[0] >
      0,
    friendId,
  );
  checks.push("remote ability and resource replication");
  await friend.screenshot({ path: "test-results/multiplayer.png" });
  await friendContext.close();
  await friendBrowser.close();
  friendBrowser = null;
  await host.bringToFront();
  await host.reload({ waitUntil: "networkidle" });
  await ready(host);
  await host.locator('#main-menu [data-action="play"]').click();
  await host.waitForFunction(
    () =>
      window.__moonveil.playing &&
      window.__moonveil.state.players.find(
        (p) => p.id === window.__moonveil.selfId,
      )?.questAccepted === true,
  );
  checks.push("progress survives a browser reload and a new room");
  assert.deepEqual(
    errors,
    [],
    "Browser runtime and shaders should have no errors",
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        checks,
        screenshots: ["menu.png", "gameplay.png", "multiplayer.png"],
        errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ checks, errors, message: error.message }));
  for (const runningBrowser of [browser, friendBrowser].filter(Boolean))
    for (const runningContext of runningBrowser.contexts())
      for (const page of runningContext.pages()) {
        console.error(
          "Browser diagnostic",
          await page
            .evaluate(() => ({
              ready: !!window.__moonveil,
              frame: window.__moonveil?.renderer.info.render.frame,
              player: window.__moonveil?.player,
              controls: window.__moonveil?.controls,
            }))
            .catch(() => null),
        );
      }
  throw error;
} finally {
  await friendBrowser?.close();
  await browser.close();
}
