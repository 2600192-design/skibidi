import { STYLES, TECHNIQUE_LEVELS } from "/shared/config.js";

const ICONS = {
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 2-1 3 1 3-2-1-3 2-2-2-3-3-1-1-3z"/><circle cx="10" cy="10" r="3" transform="translate(2 2)"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  sword:
    '<path d="m5 19 3-3M3 21l2-2m2-6 4 4m-2-3 10-11 2-1-1 4-10 11M5 15l4 4"/>',
  bag: '<path d="M7 7V5a5 5 0 0 1 10 0v2M4 7h16l1 14H3L4 7Z"/>',
  scroll:
    '<path d="M6 3h13a2 2 0 0 1 0 4h-1v12a2 2 0 0 1-2 2H5m1-18v14H3a2 2 0 0 0 0 4h13M10 8h4m-4 4h4"/>',
  character:
    '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2M8 15l4 3 4-3"/>',
  moon: '<path d="M21 13.5A9 9 0 0 1 10.5 3a9 9 0 1 0 10.5 10.5Z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  potion:
    '<path d="M9 2h6v3H9V2Zm1 3v5l-5 7a3 3 0 0 0 2 5h10a3 3 0 0 0 2-5l-5-7V5M7 15h10"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  heart: '<path d="M20 5c-2-3-6-3-8 0-2-3-6-3-8 0-4 6 8 14 8 14s12-8 8-14Z"/>',
  bolt: '<path d="m14 2-10 12h7l-1 8 10-12h-7l1-8Z"/>',
  breath: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  volume:
    '<path d="M11 5 6 9H2v6h4l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>',
  save: '<path d="M4 3h14l3 3v15H3V3h1Zm3 0v7h10V3M7 21v-7h10v7"/>',
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.moon}</svg>`;
const escape = (str) =>
  String(str ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const key = "moonveil.player.v1";
const progressKey = "moonveil.progress.v1";
const settingsKey = "moonveil.settings.v1";
const read = (name, fallback) => {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(name) || "{}") };
  } catch {
    return { ...fallback };
  }
};
const persist = (name, data) => {
  try {
    localStorage.setItem(name, JSON.stringify(data));
  } catch {}
};
const swords = [
  {
    id: "standard",
    name: "Nichirin Blade",
    note: "A trusted companion on your first journey.",
    level: 1,
  },
  {
    id: "ember",
    name: "Ember Nichirin",
    note: "A tempered blade. +3 attack damage.",
    level: 2,
  },
  {
    id: "moon",
    name: "Lunar Nichirin",
    note: "Forged under a pale moon. +6 attack damage.",
    level: 3,
  },
];
const palettes = [
  "#678b9b",
  "#9375a5",
  "#9c575f",
  "#6e917d",
  "#c6a66b",
  "#4c536b",
];

export function createUI(callbacks = {}) {
  const root = document.querySelector("#ui");
  let profile = read(key, {
    name: "Wanderer",
    style: "water",
    faction: "slayer",
    color: "#678b9b",
    equipment: "standard",
  });
  if (!STYLES[profile.style]) profile.style = "water";
  if (!swords.some((s) => s.id === profile.equipment))
    profile.equipment = "standard";
  let progress = read(progressKey, {
    xp: 0,
    coins: 30,
    kills: 0,
    bossKills: 0,
    questAccepted: false,
    questClaimed: false,
    visited: [],
  });
  const settings = read(settingsKey, {
    volume: 0.45,
    sensitivity: 1,
    quality: "high",
  });
  let playing = false,
    paused = false,
    panel = null,
    dead = false,
    connected = false;
  let roomCode = "",
    roomMode = "coop",
    selectedMode = "coop",
    state = null,
    own = null;
  let interactText = null,
    requestPending = false,
    progressSignature = "",
    panelSignature = "",
    lastCustomizeAt = 0;
  const style = () => STYLES[profile.style] || STYLES.water;
  const level = () => own?.level || 1 + Math.floor((progress.xp || 0) / 70);
  const players = () =>
    Array.isArray(state?.players)
      ? state.players
      : Object.values(state?.players || {});
  const enemyList = () =>
    Array.isArray(state?.enemies)
      ? state.enemies
      : Object.values(state?.enemies || {});
  const iconButton = (action, symbol, label) =>
    `<button class="icon-button" data-action="${action}" title="${label}" aria-label="${label}">${icon(symbol)}</button>`;
  const setStyleColor = () => root.style.setProperty("--style", style().color);
  setStyleColor();

  root.innerHTML = `
    <div id="main-menu" class="menu">
      <header class="topbar"><div class="brand"><svg class="brand-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M34 6C20-1 5 8 5 23c0 13 11 22 23 20 7-1 12-5 15-11-14 5-26-5-23-18 2-6 7-9 14-8Z" stroke="currentColor" stroke-width="1"/><path d="m33 11 1.8 4.2L39 17l-4.2 1.8L33 23l-1.8-4.2L27 17l4.2-1.8L33 11Z" fill="currentColor"/><circle cx="40" cy="8" r="1" fill="currentColor"/></svg><div><div class="brand-name">MOONVEIL</div><div class="brand-sub">CHRONICLES</div></div></div><nav class="topnav" aria-label="Main navigation"><button class="nav-link active" data-action="journey">Journey</button><button class="nav-link" data-action="techniques">Techniques</button><button class="nav-link" data-action="quests">Chronicles</button><span class="nav-divider"></span>${iconButton("settings", "settings", "Settings")}</nav></header>
      <div class="chapter-label">TAISHŌ ERA &nbsp; / &nbsp; CHAPTER 01</div>
      <main class="hero"><div class="eyebrow">A demon slayer adventure</div><h1>The night<br>is <em>yours.</em></h1><p class="hero-description">Where wisteria blooms, a new story begins.<br>Draw your blade. Find your breath. Defy the dark.</p><div class="hero-actions"><button class="primary-button" data-action="play"><span>Begin your journey</span>${icon("arrow")}</button><button class="secondary-button" data-action="lobby">${icon("users")}<span>Play with friends</span></button></div><div class="hero-hint"><span>WASD to move</span><span class="hint-dot"></span><span>Mouse to look</span><span class="hint-dot"></span><span>Your story, together</span></div></main>
      <div class="vertical-caption" lang="ja">夜明けへの道</div>
      <footer class="world-footer"><div class="style-card"><div class="location-label"><span>01</span><span class="separator"></span><span>WISTERIA VALLEY</span></div><div class="style-current"><div id="menu-kanji" class="style-kanji"></div><div><div id="menu-style-name" class="style-name"></div><div id="menu-style-caption" class="style-caption"></div></div></div><div id="menu-style-options" class="style-options"></div></div><div class="session-footer"><div class="connection-line"><span class="live-dot offline" id="menu-live-dot"></span><span id="menu-connection">Connecting to the valley</span></div><div class="session-sub">6 PLAYERS MAX &nbsp; · &nbsp; COOPERATIVE PvE</div><div class="edition"><span class="version-mark">EARLY CHAPTER</span> &nbsp; / &nbsp; v1.0</div></div></footer>
    </div>
    <div id="game-hud" class="hud hidden">
      <div class="player-hud"><div class="portrait"><span class="portrait-kanji" id="hud-kanji">水</span><span class="portrait-level" id="hud-level">1</span></div><div class="player-info"><div class="player-heading"><span class="player-name" id="hud-name">Wanderer</span><span class="player-class" id="hud-class">DEMON SLAYER</span></div><div class="bar-row">${icon("heart")}<div class="meter"><div id="hp-bar" class="meter-fill health"></div></div><span id="hp-value" class="meter-caption">100/100</span></div><div class="bar-row">${icon("bolt")}<div class="meter"><div id="stamina-bar" class="meter-fill stamina"></div></div><span id="stamina-value" class="meter-caption">100</span></div><div class="bar-row">${icon("breath")}<div class="meter"><div id="energy-bar" class="meter-fill energy"></div></div><span id="energy-value" class="meter-caption">100</span></div></div></div>
      <div class="hud-quest"><div class="hud-quest-label">YOUR JOURNEY</div><div class="hud-quest-name" id="hud-quest-title">A blade in the dark</div><div class="hud-quest-text" id="hud-quest-text">Find Master Hoshino in the village.</div><button data-action="quests">View chronicle &nbsp; →</button></div>
      <div class="room-strip">${icon("users")}<span class="room-mode" id="hud-room-mode">CO-OP</span><span class="room-code" id="hud-room-code">—</span><span id="hud-room-count">1/6</span><button data-action="copy-room" title="Copy room code">${icon("copy")}</button></div>
      <div class="mini-area"><div class="mini-header">${icon("compass")} WISTERIA VALLEY</div><div class="minimap-wrap"><canvas id="minimap" width="180" height="180" aria-label="Minimap"></canvas><span class="map-north">N</span></div><div class="mini-menus">${iconButton("character", "character", "Character · C")}${iconButton("inventory", "bag", "Inventory · I")}${iconButton("quests", "scroll", "Quests · K")}${iconButton("lobby", "users", "Party · L")}${iconButton("settings", "settings", "Settings · O")}</div></div>
      <div id="party-list" class="party-list"></div>
      <div id="boss-hud" class="boss-hud hidden"><div class="boss-hud-label">UPPER NIGHT DEMON</div><div class="boss-hud-name">The Hollow King</div><div class="boss-meter"><div id="boss-bar" class="boss-fill"></div></div></div>
      <div id="interact-prompt" class="interact-prompt hidden"><kbd>E</kbd><span id="interact-text"></span></div>
      <div class="hotbar-wrap"><div id="hud-style-name" class="combat-style">Water breathing</div><div id="hotbar" class="hotbar"></div><div class="controls-bottom"><span><kbd>LMB</kbd> Attack</span><span><kbd>RMB</kbd> Block / parry</span><span><kbd>Q</kbd> Dodge</span><span><kbd>Shift</kbd> Sprint</span><span><kbd>Esc</kbd> Pause</span></div></div>
      <div class="bottom-status"><span class="live-dot" id="hud-live-dot"></span><span id="hud-connection">Connected</span><span id="hud-coins">0 coins</span></div><div id="fps" class="fps-label"></div><div class="xp-strip"><div id="xp-bar" class="xp-fill"></div></div>
    </div>
    <div id="panel-root"></div><div id="modal-root"></div><div id="toast-stack" class="toast-stack" role="status" aria-live="polite"></div>
  `;
  const $ = (id) => root.querySelector(`#${id}`);
  function syncStyle() {
    setStyleColor();
    $("menu-kanji").textContent = style().kanji;
    $("menu-style-name").textContent =
      `${style().name}${profile.faction === "demon" ? "" : " Breathing"}`;
    $("menu-style-caption").textContent = style().description;
    const choices =
      profile.faction === "demon"
        ? ["blood"]
        : Object.keys(STYLES).filter((id) => id !== "blood");
    $("menu-style-options").innerHTML =
      choices
        .map(
          (id) =>
            `<button class="style-option ${id === profile.style ? "selected" : ""}" data-style="${id}" style="--choice:${STYLES[id].color}" title="${STYLES[id].name} Breathing" aria-label="Select ${STYLES[id].name}">${STYLES[id].kanji}</button>`,
        )
        .join("") +
      `<div class="faction-toggle"><button data-faction="slayer" class="faction-button ${profile.faction === "slayer" ? "active" : ""}">Slayer</button><button data-faction="demon" class="faction-button ${profile.faction === "demon" ? "active" : ""}">Demon</button></div>`;
    $("hud-kanji").textContent = style().kanji;
    $("hud-style-name").textContent =
      `${style().name}${profile.faction === "demon" ? "" : " breathing"}`;
    $("hud-class").textContent =
      profile.faction === "demon" ? "DEMON" : "DEMON SLAYER";
    $("hud-name").textContent = profile.name;
    renderHotbar();
  }
  function renderHotbar() {
    $("hotbar").innerHTML =
      style()
        .abilities.map(
          (ability, i) =>
            `<button class="ability-slot" data-ability="${i}" title="${ability.name} · ${ability.cost} energy · ${ability.cooldown}s cooldown${level() < TECHNIQUE_LEVELS[i] ? " · Unlocks at level " + TECHNIQUE_LEVELS[i] : ""}" aria-label="${ability.name}"><span class="ability-key">${i + 1}</span><span class="ability-symbol">${[style().kanji, "閃", "極"][i]}</span><span class="ability-short">${ability.short}</span><span id="ability-cd-${i}" class="ability-cooldown hidden"></span><span id="ability-lock-${i}" class="ability-lock ${level() < TECHNIQUE_LEVELS[i] ? "" : "hidden"}">${icon("lock")}Lv. ${TECHNIQUE_LEVELS[i]}</span></button>`,
        )
        .join("") +
      `<div class="hotbar-divider"></div><button class="ability-slot potion-slot" data-action="potion" title="Healing tea · R · 10 coins · restores 50 HP">${icon("potion")}<span class="ability-key">R</span><span class="ability-short">Heal · 10c</span></button>`;
  }
  const profileChanged = () => {
    lastCustomizeAt = Date.now();
    persist(key, profile);
    syncStyle();
    callbacks.customize?.({ ...profile });
  };
  function panelShell(title, body) {
    return `<div class="panel-shade" data-action="close-panel"></div><aside class="panel" aria-label="${title}"><div class="panel-header"><h2 class="panel-heading">${title}</h2>${iconButton("close-panel", "close", "Close panel")}</div><div class="panel-body">${body}</div></aside>`;
  }
  function openPanel(name) {
    if (document.pointerLockElement) document.exitPointerLock();
    panel = name;
    renderPanel();
  }
  function closePanel() {
    panel = null;
    $("panel-root").innerHTML = "";
  }
  function renderPanel() {
    let title = "",
      body = "";
    const nameField = `<div class="field-group"><label class="field-label" for="profile-name">Your name</label><input class="text-input" id="profile-name" name="username" maxlength="18" autocomplete="nickname" value="${escape(profile.name)}" placeholder="Wanderer">${playing ? '<p class="muted-copy" style="font-size:9px;margin:8px 0 0">Name changes apply when you enter a new room.</p>' : ""}</div>`;
    const saveNote = `<div class="local-save-note">${icon("save")}Your character and progress are saved in this browser.</div>`;
    if (panel === "lobby") {
      title = "Journey together";
      body = `<p class="muted-copy" style="margin-top:0;margin-bottom:25px">A private world for you and your companions.<br>Share your room code. Face the night together.</p>${nameField}<div class="field-group"><div class="field-label">Choose your encounter</div><div class="segmented"><button data-mode="coop" class="${selectedMode === "coop" ? "active" : ""}">Cooperative PvE</button><button data-mode="duel" class="${selectedMode === "duel" ? "active" : ""}">Friendly duel</button></div><p class="muted-copy" id="mode-description" style="font-size:9px">${selectedMode === "coop" ? "Hunt demons and challenge the Hollow King with up to 6 players." : "Challenge your friends. Player damage is enabled in this room."}</p></div><button class="primary-button" data-action="create-room"><span class="button-label">Create private room</span>${icon("arrow")}</button><div class="line-divider">OR FOLLOW A FRIEND</div><label class="field-label" for="join-code">Room code</label><input class="text-input" id="join-code" maxlength="5" placeholder="ENTER CODE" autocomplete="off" style="letter-spacing:3px;text-transform:uppercase"><button class="subtle-button wide" data-action="join-room">${icon("users")}Join room</button>${roomCode ? `<div class="room-display"><div class="room-display-label">YOUR CURRENT ROOM · ${roomMode === "duel" ? "DUEL" : "CO-OP"}</div><div class="room-display-code">${escape(roomCode)}</div><button class="subtle-button wide" data-action="copy-room">${icon("copy")}Copy invite code</button><div id="lobby-party" class="lobby-party"></div></div>` : ""}<div class="panel-note">Share this world’s address and your room code with your companions. Friends can join from the same game address.</div>`;
    } else if (panel === "techniques") {
      title = "Find your breath";
      const entries = Object.entries(STYLES).filter(([id]) =>
        profile.faction === "demon" ? id === "blood" : id !== "blood",
      );
      body = `<p class="small-label">${profile.faction === "demon" ? "Blood demon art" : "Seven paths. One blade."}</p><div class="technique-style-list">${entries.map(([id, s]) => `<button data-style="${id}" class="${profile.style === id ? "selected" : ""}" style="--choice:${s.color}"><span>${s.kanji}</span>${s.name}</button>`).join("")}</div><h3 class="quest-title">${style().name}${profile.faction === "demon" ? "" : " Breathing"}</h3><p class="muted-copy">${style().description}</p><div class="technique-list">${style()
        .abilities.map(
          (a, i) =>
            `<div class="technique-row"><span class="technique-number">${i + 1}</span><div><div class="technique-name">${a.name}</div><div class="technique-meta">${a.damage} damage &nbsp; · &nbsp; ${a.cost} energy<br>${a.cooldown}s cooldown &nbsp; · &nbsp; ${a.range}m range</div></div><span class="technique-level">${level() >= TECHNIQUE_LEVELS[i] ? "UNLOCKED" : "LV. " + TECHNIQUE_LEVELS[i]}</span></div>`,
        )
        .join(
          "",
        )}</div><div class="panel-note">Gain experience from demon hunts to unlock your second and third forms at levels 2 and 3. Press 1, 2, or 3 to cast an unlocked technique.</div>`;
    } else if (panel === "character") {
      title = "Your story";
      body = `<div class="avatar-custom">${icon("sword")}</div><div class="profile-title">${escape(profile.name)}</div><div class="profile-tag">LEVEL ${level()} · ${profile.faction === "demon" ? "DEMON" : "DEMON SLAYER"}</div><div class="stat-grid"><div class="stat-tile"><div class="stat-number" id="profile-xp">${progress.xp || 0}</div><div class="stat-caption">EXPERIENCE</div></div><div class="stat-tile"><div class="stat-number" id="profile-kills">${progress.kills || 0}</div><div class="stat-caption">DEMONS SLAIN</div></div><div class="stat-tile"><div class="stat-number" id="profile-bosses">${progress.bossKills || 0}</div><div class="stat-caption">BOSSES</div></div></div>${nameField}<div class="field-group"><div class="field-label">Your allegiance</div><div class="segmented"><button data-faction="slayer" class="${profile.faction === "slayer" ? "active" : ""}">Demon Slayer</button><button data-faction="demon" class="${profile.faction === "demon" ? "active" : ""}">Demon</button></div><p class="muted-copy" style="font-size:9px">${profile.faction === "demon" ? "Blood Demon Arts and passive health regeneration." : "Nichirin swordsmanship and elemental breathing techniques."}</p></div><div class="field-group"><div class="field-label">Haori color</div><div class="color-swatches">${palettes.map((color) => `<button class="color-swatch ${profile.color === color ? "selected" : ""}" data-color="${color}" style="--swatch:${color}" title="Haori color ${color}" aria-label="Haori color ${color}"></button>`).join("")}</div></div><button class="subtle-button wide" data-action="techniques">${icon("breath")}Choose your technique</button>${saveNote}`;
    } else if (panel === "inventory") {
      title = "The traveler’s satchel";
      body = `<p class="small-label">Your equipment</p><div class="equipment-list">${swords.map((s) => `<div class="equipment-item"><div class="equipment-icon">${icon("sword")}</div><div class="equipment-info"><div class="equipment-name">${s.name}</div><div class="equipment-note">${s.note}</div></div><button class="equipment-action" data-equipment="${s.id}" ${level() < s.level ? "disabled" : ""}>${level() < s.level ? "LV. " + s.level : profile.equipment === s.id ? "EQUIPPED" : "EQUIP"}</button></div>`).join("")}</div><div class="potion-row">${icon("potion")}<div><div class="equipment-name">Wisteria healing tea</div><div class="equipment-note">Restores 50 health · 10 coins</div></div><button class="equipment-action" data-action="potion">DRINK</button></div><div class="stat-grid" style="grid-template-columns:1fr 1fr"><div class="stat-tile"><div class="stat-number">${progress.coins || 0}</div><div class="stat-caption">COINS</div></div><div class="stat-tile"><div class="stat-number">${level()}</div><div class="stat-caption">LEVEL</div></div></div><div class="panel-note">Defeat demons and complete your mission to earn coins and experience. New blades unlock as your level increases.</div>${saveNote}`;
    } else if (panel === "quests") {
      title = "Chronicles";
      const accepted = progress.questAccepted,
        claimed = progress.questClaimed;
      const count = Math.min(3, progress.kills || 0);
      body = `<p class="small-label">Chapter 01 · Wisteria Valley</p><div class="quest-card">${icon("scroll", "quest-icon")}<h3 class="quest-title">A blade in the dark</h3><p class="muted-copy">Master Hoshino watches over the valley. Demons have crossed the wisteria boundary. Answer his call and restore peace to the village.</p><div class="quest-objective"><span class="objective-circle ${accepted ? "done" : ""}"></span>Speak to Master Hoshino<span class="quest-status">${accepted ? "COMPLETE" : "VILLAGE"}</span></div><div class="quest-objective"><span class="objective-circle ${count >= 3 ? "done" : ""}"></span>Defeat three demons<span class="quest-status">${count} / 3</span></div><div class="quest-objective"><span class="objective-circle ${claimed ? "done" : ""}"></span>Return to Master Hoshino<span class="quest-status">${claimed ? "COMPLETE" : accepted && count >= 3 ? "READY" : "PENDING"}</span></div><div class="reward-row"><span>160 XP</span><span>100 coins</span></div></div><div class="quest-card" style="margin-top:18px"><p class="small-label">World encounter</p><h3 class="quest-title">The Hollow King</h3><p class="muted-copy">Beyond the northern torii gates, an ancient demon stirs. Gather your companions and challenge the guardian of the endless night.</p><div class="reward-row"><span>${progress.bossKills || 0} victories</span><span>Cooperative boss encounter</span></div></div><p class="small-label" style="margin-top:26px">The exploration journal</p><div class="technique-list">${[
        { id: "shrine", name: "Moonlit Shrine" },
        { id: "overlook", name: "Lantern Overlook" },
      ]
        .map(
          (point) =>
            `<div class="quest-objective" style="margin-top:0;padding:13px 0"><span class="objective-circle ${(progress.visited || []).includes(point.id) ? "done" : ""}"></span>${point.name}<span class="quest-status">${(progress.visited || []).includes(point.id) ? "DISCOVERED" : "35 XP · 25c"}</span></div>`,
        )
        .join(
          "",
        )}</div><div class="panel-note">Find Hoshino near the village square. Approach him and press E to accept the mission or claim your reward. Visit landmarks and press E to record your discoveries.</div>`;
    } else if (panel === "settings") {
      title = "Make yourself at home";
      body = `<div class="setting-row"><label class="setting-top" for="volume">Sound volume<span id="volume-value" class="setting-value">${Math.round(settings.volume * 100)}%</span></label><input id="volume" type="range" min="0" max="1" step=".01" value="${settings.volume}"></div><div class="setting-row"><label class="setting-top" for="sensitivity">Mouse sensitivity<span id="sensitivity-value" class="setting-value">${Number(settings.sensitivity).toFixed(1)}×</span></label><input id="sensitivity" type="range" min=".3" max="2" step=".1" value="${settings.sensitivity}"></div><div class="setting-row"><div class="setting-top">Visual quality</div><div class="segmented"><button data-quality="low" class="${settings.quality === "low" ? "active" : ""}">Performance</button><button data-quality="high" class="${settings.quality === "high" ? "active" : ""}">Cinematic</button></div><p class="muted-copy" style="font-size:9px">Performance reduces render resolution and disables shadows.</p></div><p class="small-label" style="margin-top:35px">Know your blade</p><div class="control-reference"><div><kbd>WASD</kbd> Move</div><div><kbd>Mouse</kbd> Camera</div><div><kbd>Shift</kbd> Sprint</div><div><kbd>Space</kbd> Jump</div><div><kbd>Q</kbd> Dodge</div><div><kbd>LMB</kbd> Sword combo</div><div><kbd>RMB</kbd> Block / parry</div><div><kbd>1 2 3</kbd> Techniques</div><div><kbd>R</kbd> Healing tea</div><div><kbd>E</kbd> Interact</div><div><kbd>I</kbd> Inventory</div><div><kbd>C</kbd> Character</div><div><kbd>K</kbd> Quests</div><div><kbd>Esc</kbd> Pause</div></div><div class="local-save-note">${icon("save")}Preferences are saved automatically.</div>`;
    }
    $("panel-root").innerHTML = panelShell(title, body);
    updateParty();
    panelSignature = `${progress.xp}|${progress.coins}|${progress.kills}|${progress.bossKills}|${progress.questAccepted}|${progress.questClaimed}`;
  }
  function showPause(value) {
    if (!playing || dead) return;
    paused = value;
    if (value) {
      closePanel();
      if (document.pointerLockElement) document.exitPointerLock();
      $("modal-root").innerHTML =
        `<div class="modal-shade"></div><div class="modal"><div class="modal-symbol">月</div><p class="small-label">Take a breath</p><h2>The night can wait.</h2><p class="muted-copy">Your world continues while you rest.</p><button class="primary-button" data-action="resume">Return to the valley ${icon("arrow")}</button><button class="subtle-button" data-action="settings">${icon("settings")}Settings</button><button class="secondary-button" style="justify-content:center;width:100%;margin-top:12px" data-action="menu">Return to main menu</button></div>`;
    } else $("modal-root").innerHTML = "";
  }
  function showDeath() {
    if (document.pointerLockElement) document.exitPointerLock();
    closePanel();
    $("modal-root").innerHTML =
      `<div class="modal-shade"></div><div class="modal"><div class="modal-symbol" style="color:#cb8f9f">散</div><p class="small-label">A moment. Not the end.</p><h2>Rise with the dawn.</h2><p class="muted-copy">The valley still needs your blade.<br>Your progress lives on.</p><button class="primary-button" data-action="respawn">Return to battle ${icon("arrow")}</button><button class="secondary-button" style="justify-content:center;width:100%;margin-top:13px" data-action="menu">Return to main menu</button></div>`;
  }
  function setPlaying(value) {
    playing = value;
    root.querySelectorAll("button:disabled").forEach((button) => {
      if (!button.dataset.equipment) button.disabled = false;
    });
    paused = false;
    dead = false;
    requestPending = false;
    $("main-menu").classList.toggle("hidden", value);
    $("game-hud").classList.toggle("hidden", !value);
    closePanel();
    $("modal-root").innerHTML = "";
    syncStyle();
  }
  function notice(message) {
    requestPending = false;
    root.querySelectorAll("button:disabled").forEach((button) => {
      if (!button.dataset.equipment) button.disabled = false;
    });
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    $("toast-stack").appendChild(node);
    while ($("toast-stack").children.length > 3)
      $("toast-stack").firstElementChild.remove();
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transition = "opacity .4s";
      setTimeout(() => node.remove(), 400);
    }, 4500);
  }
  function updateParty() {
    const party = players();
    $("hud-room-count").textContent = `${party.length || (playing ? 1 : 0)}/6`;
    $("party-list").innerHTML = party
      .filter((p) => p !== own)
      .map(
        (p) =>
          `<div class="party-member" style="--party-color:${STYLES[p.style]?.color || "#c1a7d6"}"><i></i>${escape(p.name)}${p.dead ? " · fallen" : ""}</div>`,
      )
      .join("");
    const lobbyParty = $("lobby-party");
    if (lobbyParty)
      lobbyParty.innerHTML = party
        .map((p) => `<span>${escape(p.name)}</span>`)
        .join("");
  }
  function setRoom(code, mode = "coop") {
    const changed = roomCode !== String(code || "") || roomMode !== mode;
    roomCode = String(code || "");
    roomMode = mode;
    requestPending = false;
    $("hud-room-code").textContent = roomCode || "—";
    $("hud-room-mode").textContent = mode === "duel" ? "DUEL" : "CO-OP";
    if (panel === "lobby" && changed) renderPanel();
  }
  function setConnection(value) {
    connected = value;
    $("menu-live-dot").classList.toggle("offline", !value);
    $("hud-live-dot").classList.toggle("offline", !value);
    $("menu-connection").textContent = value
      ? "The valley is waiting"
      : "Reconnecting to the valley";
    $("hud-connection").textContent = value ? "Connected" : "Reconnecting…";
  }
  function saveProgress(value) {
    progress = { ...progress, ...value };
    persist(progressKey, progress);
  }
  function setState(value, selfId) {
    state = value;
    own =
      players().find((p) => p.id === selfId) ||
      state?.players?.[selfId] ||
      null;
    if (!own) {
      updateParty();
      return;
    }
    if (Date.now() - lastCustomizeAt > 600) {
      const appearance = {
        style: own.style || profile.style,
        faction: own.faction || profile.faction,
        color: own.color || profile.color,
        equipment: own.equipment || profile.equipment,
      };
      if (Object.entries(appearance).some(([k, v]) => profile[k] !== v)) {
        profile = { ...profile, ...appearance };
        persist(key, profile);
        syncStyle();
      }
    }
    const hp = Math.max(0, own.hp ?? own.health ?? 100),
      maxHp = own.maxHp || own.maxHealth || 100;
    $("hp-bar").style.width = `${(100 * hp) / maxHp}%`;
    $("hp-value").textContent = `${Math.ceil(hp)}/${maxHp}`;
    $("stamina-bar").style.width =
      `${Math.max(0, Math.min(100, own.stamina ?? 100))}%`;
    $("stamina-value").textContent = Math.ceil(own.stamina ?? 100);
    $("energy-bar").style.width =
      `${Math.max(0, Math.min(100, own.energy ?? 100))}%`;
    $("energy-value").textContent = Math.ceil(own.energy ?? 100);
    $("hud-level").textContent = own.level || level();
    $("hud-name").textContent = own.name || profile.name;
    $("hud-coins").textContent = `${Math.floor(own.coins || 0)} coins`;
    $("xp-bar").style.width = `${(((own.xp || 0) % 70) / 70) * 100}%`;
    const newProgress = {
      xp: own.xp || 0,
      coins: own.coins || 0,
      kills: own.kills || 0,
      bossKills: own.bossKills || 0,
      questAccepted: !!own.questAccepted,
      questClaimed: !!own.questClaimed,
      visited: own.visited || progress.visited || [],
    };
    const newSignature = JSON.stringify(newProgress);
    if (newSignature !== progressSignature) {
      progressSignature = newSignature;
      saveProgress(newProgress);
    }
    $("hud-quest-title").textContent = newProgress.questClaimed
      ? "Guardian of the valley"
      : "A blade in the dark";
    $("hud-quest-text").textContent = newProgress.questClaimed
      ? "Challenge the Hollow King beyond the northern gates."
      : !newProgress.questAccepted
        ? "Find Master Hoshino in the village."
        : newProgress.kills >= 3
          ? "Return to Hoshino to claim your reward."
          : `Defeat demons in the valley · ${Math.min(3, newProgress.kills)} / 3`;
    style().abilities.forEach((_, i) => {
      const cd = Number(own.cooldowns?.[i] || 0);
      $("ability-cd-" + i).classList.toggle("hidden", cd <= 0);
      $("ability-cd-" + i).textContent = cd > 0 ? Math.ceil(cd) : "";
      $("ability-lock-" + i).classList.toggle(
        "hidden",
        level() >= TECHNIQUE_LEVELS[i],
      );
    });
    const boss = enemyList().find(
      (e) => e.boss && !e.dead && (e.hp ?? e.health ?? 0) > 0,
    );
    const bossNearby =
      boss &&
      Math.hypot((boss.x || 0) - (own.x || 0), (boss.z || 0) - (own.z || 0)) <
        30;
    $("boss-hud").classList.toggle("hidden", !bossNearby);
    if (boss)
      $("boss-bar").style.width =
        `${(100 * (boss.hp ?? boss.health)) / (boss.maxHp || boss.maxHealth || 850)}%`;
    const isDead = !!own.dead || hp <= 0;
    if (playing && isDead && !dead) {
      dead = true;
      showDeath();
    } else if (dead && !isDead) {
      dead = false;
      paused = false;
      $("modal-root").innerHTML = "";
    }
    updateParty();
    const signature = `${progress.xp}|${progress.coins}|${progress.kills}|${progress.bossKills}|${progress.questAccepted}|${progress.questClaimed}`;
    if (
      panel &&
      panel !== "settings" &&
      panel !== "lobby" &&
      signature !== panelSignature &&
      document.activeElement?.tagName !== "INPUT"
    )
      renderPanel();
  }
  function setInteract(text) {
    interactText = text;
    $("interact-prompt").classList.toggle("hidden", !text);
    $("interact-text").textContent = text || "";
  }
  function updateName() {
    const field = $("profile-name");
    if (field) {
      profile.name = field.value.trim().slice(0, 18) || "Wanderer";
      lastCustomizeAt = Date.now();
      persist(key, profile);
      callbacks.customize?.({ ...profile });
      syncStyle();
    }
  }
  async function copyRoom() {
    if (!roomCode) {
      notice("Create or join a room first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(roomCode);
      notice(`Room code ${roomCode} copied. Send it to your companions.`);
    } catch {
      notice(`Your invite code is ${roomCode}. Share it with your companions.`);
    }
  }
  function startRequest(action, button) {
    if (requestPending) return;
    updateName();
    requestPending = true;
    if (button) button.disabled = true;
    try {
      action();
    } catch (error) {
      notice(error.message || "The valley is unavailable. Please try again.");
    }
    setTimeout(() => {
      requestPending = false;
      if (button?.isConnected) button.disabled = false;
    }, 5000);
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (event.target.classList.contains("panel-shade")) {
      closePanel();
      return;
    }
    if (!button) return;
    if (button.dataset.style) {
      profile.style = button.dataset.style;
      profileChanged();
      if (panel) renderPanel();
      return;
    }
    if (button.dataset.faction) {
      profile.faction = button.dataset.faction;
      profile.style =
        profile.faction === "demon"
          ? "blood"
          : profile.style === "blood"
            ? "water"
            : profile.style;
      profileChanged();
      if (panel) renderPanel();
      return;
    }
    if (button.dataset.color) {
      profile.color = button.dataset.color;
      profileChanged();
      renderPanel();
      return;
    }
    if (button.dataset.equipment) {
      const sword = swords.find((s) => s.id === button.dataset.equipment);
      if (level() >= sword.level) {
        profile.equipment = sword.id;
        profileChanged();
        renderPanel();
        notice(`${sword.name} equipped.`);
      }
      return;
    }
    if (button.dataset.mode) {
      updateName();
      selectedMode = button.dataset.mode;
      renderPanel();
      return;
    }
    if (button.dataset.quality) {
      settings.quality = button.dataset.quality;
      persist(settingsKey, settings);
      callbacks.settings?.({ ...settings });
      renderPanel();
      return;
    }
    if (button.dataset.ability !== undefined) {
      if (!panel && !paused && !dead && playing) {
        const i = Number(button.dataset.ability);
        if (level() < TECHNIQUE_LEVELS[i])
          notice(`This technique unlocks at level ${TECHNIQUE_LEVELS[i]}.`);
        else if (callbacks.ability) callbacks.ability(i);
        else
          document
            .querySelector("#game canvas")
            ?.dispatchEvent(
              new KeyboardEvent("keydown", {
                code: `Digit${i + 1}`,
                key: String(i + 1),
                bubbles: true,
              }),
            );
      }
      return;
    }
    const action = button.dataset.action;
    if (
      [
        "lobby",
        "character",
        "inventory",
        "techniques",
        "quests",
        "settings",
      ].includes(action)
    ) {
      openPanel(action);
      return;
    }
    if (action === "close-panel" || action === "journey") closePanel();
    if (action === "play")
      startRequest(() => callbacks.play?.({ ...profile }), button);
    if (action === "create-room")
      startRequest(
        () => callbacks.createRoom?.({ ...profile }, selectedMode),
        button,
      );
    if (action === "join-room") {
      const code = ($("join-code")?.value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      if (code.length !== 5) {
        notice("Enter the five-character room code from your friend.");
        return;
      }
      startRequest(() => callbacks.joinRoom?.({ ...profile }, code), button);
    }
    if (action === "copy-room") copyRoom();
    if (action === "potion") {
      if (!playing) notice("Enter the valley to use healing tea.");
      else callbacks.potion?.();
    }
    if (action === "resume") {
      closePanel();
      showPause(false);
      callbacks.resume?.();
    }
    if (action === "menu") {
      callbacks.menu?.();
      setPlaying(false);
    }
    if (action === "respawn") callbacks.respawn?.();
  });
  root.addEventListener("change", (event) => {
    if (event.target.id === "profile-name") updateName();
  });
  root.addEventListener("input", (event) => {
    if (event.target.id === "join-code")
      event.target.value = event.target.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
    if (event.target.id === "volume" || event.target.id === "sensitivity") {
      const setting = event.target.id;
      settings[setting] = Number(event.target.value);
      $(setting + "-value").textContent =
        setting === "volume"
          ? `${Math.round(settings.volume * 100)}%`
          : `${settings.sensitivity.toFixed(1)}×`;
      persist(settingsKey, settings);
      callbacks.settings?.({ ...settings });
    }
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(
          document.activeElement?.tagName,
        )
      )
        return;
      const shortcut = {
        KeyI: "inventory",
        KeyC: "character",
        KeyL: "lobby",
        KeyK: "quests",
        KeyO: "settings",
      }[event.code];
      if (shortcut && !event.repeat && playing && !dead) {
        event.preventDefault();
        if (panel === shortcut) closePanel();
        else openPanel(shortcut);
      }
      if (event.code === "Escape" && panel) {
        event.preventDefault();
        closePanel();
      }
    },
    true,
  );
  syncStyle();
  return {
    setState,
    notice,
    setPlaying,
    setRoom,
    setInteract,
    setConnection,
    showPause,
    setFPS(value) {
      $("fps").textContent = `${Math.round(value)} FPS`;
    },
    settings,
    getProfile: () => ({ ...profile }),
    getProgress: () => ({ ...progress }),
    saveProgress,
    isOverlayOpen: () => !playing || !!panel || paused || dead,
  };
}
