# Moonveil Chronicles

A playable, Japanese fantasy sword RPG inspired by anime demon hunting. Explore a procedurally authored sakura valley, take on the Night Watch quest, and fight the Hollow King with friends. The client uses HTML, CSS, JavaScript, and Three.js; one Node.js server serves the client and runs Socket.IO multiplayer.

## Run

Requires Node.js 22 or newer and a modern desktop browser with WebGL2 and hardware acceleration.

Download this repository using GitHub's **Code → Download ZIP**, then extract it. Open a terminal in the extracted `skibidi-main` folder (or the project folder if you obtained it another way) and run:

```sh
npm ci
npm start
```

Open `http://localhost:3000` in your browser. The client and multiplayer server run together on port 3000; override with `PORT=8080 npm start`. Development serves ES modules directly, so reload after editing client files and restart after editing server files. No build step, accounts, API keys, or external asset service is required.

If you clone the GitHub repository, enter the cloned `skibidi` directory instead. In the Codex cloud environment, the checkout is `/workspace/skibidi`; use `npm ci --cache /workspace/.npm-cache` there so npm uses a writable cache.

For friends on a LAN, allow the server port through your firewall and share your machine's LAN address. For Internet play, deploy this Node service to a host that supports persistent WebSockets and HTTPS. A room code identifies a room on the **same server**; it does not expose a local computer to the Internet. Pointer lock works on localhost or secure HTTPS origins. The room host's browser need not stay open; the server owns the room until the last player leaves.

## Play

Choose your name, faction, breathing style, and cloak color, then begin a solo expedition or create a private co-op/duel room. Use **Play with friends** to join a friend's five-character code. Rooms support up to six players. The room code can be copied from the lobby.

| Control | Action |
| --- | --- |
| WASD | Move relative to the camera |
| Mouse | Look around; click the world to capture the pointer |
| Shift | Sprint, consuming stamina |
| Space | Jump |
| Q | Dash/dodge with brief invulnerability |
| Left click or J | Sword combo |
| Right click | Hold block; a correctly timed block parries |
| 1 / 2 / 3 | Breathing techniques (unlock at levels 1 / 2 / 3) |
| E | Talk to Master Hoshino, or discover a landmark |
| R | Healing draught (10 coins); respawn when defeated |
| I / C / K / L / O | Inventory / character / quests / lobby / settings |
| Escape | Pause menu and release the pointer |

Talk to Master Hoshino beside the starting path. Defeat three roaming demons and return to claim the Night Watch reward. Each demon awards 70 XP, enough to unlock the next technique early. The shrine beyond the torii and the western lantern overlook award exploration XP once. The Hollow King waits in the clearing beyond the torii and telegraphs a large attack that must be dodged. Nearby teammates share enemy rewards; co-op disables friendly fire. Duel rooms enable player damage.

Water, Flame, Thunder, Wind, Mist, Sun, and Moon each have three techniques with their own damage, range, energy cost, cooldown, and visual effects. Choose Demon to use Blood Art, passive out-of-combat regeneration, and a healing ultimate. Mist's final technique grants temporary invulnerability. Block faces your opponent; parry during the first 280 ms of a fresh block. Combat, damage, cooldowns, rewards, resource regeneration, and enemy AI run on the server. Movement is predicted on the client and checked against speed limits and building collisions on the server.

## Progress and equipment

Progress and appearance save to this browser's local storage. The inventory offers healing draughts and three swords: the starter katana, a level-2 blade, and a level-3 blade with increasing damage bonuses. Styles and cloak colors can be changed through the character menu outside combat. Discovery rewards and the Night Watch quest are saved, including whether rewards were claimed. Clearing browser storage resets your save.

This is a complete playable **prototype**, with one valley, one quest, roaming enemies, and one boss. It does not include a campaign, account system, persistent server database, skill tree, matchmaking, or an MMO-sized world. Progress supplied from local storage is bounded but trusted; competitive deployment needs account-backed saves, stronger abuse protections, rate limiting, and a persistent database. Rooms and enemies live in memory and reset if the server restarts. Co-op PvE remains available in duel rooms.

## Project structure

```text
client/
  index.html, style.css   page and responsive interface
  game.js                render loop, controls, camera, prediction, networking
  world.js               valley scenery, lighting, atmosphere, day/night cycle
  character.js           articulated anime characters and animations
  effects.js, audio.js    technique effects and synthesized combat audio
  ui.js                  menus, HUD, lobby, inventory, save data, settings
shared/config.js         styles, techniques, spawn positions, collision geometry
server/index.js          HTTP and Socket.IO lifecycle
server/gameplay.js       authoritative rooms, combat, physics, AI, progression
tests/server.test.js     multiplayer and gameplay integration tests
```

All world and character assets are generated in code. The interface fonts are bundled locally. The high/low graphics option controls resolution and shadow rendering. The rendering batches foliage and particles, caps resolution, and uses a single main shadow-casting light. Combat audio is generated with Web Audio and starts after the first interaction.

## Validate

```sh
npm test
```

Tests run real Socket.IO clients against an ephemeral HTTP server and verify room isolation/capacity, movement constraints, combat, co-op protection, duel damage, progression, and resource mechanics. The browser integration check, if Chromium is installed, runs with:

```sh
node tests/browser.mjs
```

The Chromium check requires the server running on port 3000. It uses software WebGL for automated validation; software rendering performance does not reflect hardware-accelerated gameplay. Open the game in a regular desktop browser for the intended visual experience.

The optional browser check defaults to `/usr/bin/chromium` on Linux. On another system, set `CHROMIUM_PATH` to your Chrome or Chromium executable. Running the game with `npm start` does not require this automated browser check.
