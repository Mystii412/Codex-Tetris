const screens = {
  menu: document.getElementById("menuScreen"),
  lobby: document.getElementById("lobbyScreen"),
  game: document.getElementById("gameScreen"),
};

const buttons = {
  singleplayer: document.getElementById("singleplayerButton"),
  multiplayer: document.getElementById("multiplayerButton"),
  globalMenu: document.getElementById("globalMenuButton"),
  refreshLobbies: document.getElementById("refreshLobbiesButton"),
  createLobby: document.getElementById("createLobbyButton"),
  joinLobby: document.getElementById("joinLobbyButton"),
  pause: document.getElementById("pauseButton"),
  overlayPrimary: document.getElementById("overlayPrimaryButton"),
  overlaySecondary: document.getElementById("overlaySecondaryButton"),
  createAccount: document.getElementById("createAccountButton"),
  signIn: document.getElementById("signInButton"),
  signOut: document.getElementById("signOutButton"),
};

const lobbyElements = {
  list: document.getElementById("lobbyList"),
  detailName: document.getElementById("lobbyDetailName"),
  detailText: document.getElementById("lobbyDetailText"),
  detailStats: document.getElementById("lobbyDetailStats"),
};

const hud = {
  player: document.getElementById("playerNameValue"),
  mode: document.getElementById("gameModeLabel"),
  score: document.getElementById("scoreValue"),
  lines: document.getElementById("linesValue"),
  level: document.getElementById("levelValue"),
  wins: document.getElementById("winsValue"),
  losses: document.getElementById("lossesValue"),
};

const matchHud = {
  label: document.getElementById("matchStatusLabel"),
  text: document.getElementById("matchStatusText"),
};

const overlay = {
  root: document.getElementById("gameOverlay"),
  eyebrow: document.getElementById("overlayEyebrow"),
  title: document.getElementById("overlayTitle"),
  text: document.getElementById("overlayText"),
};

const panels = {
  opponent: document.getElementById("opponentPanel"),
};

const inputs = {
  blockSkin: document.getElementById("blockSkinSelect"),
  accountName: document.getElementById("accountNameInput"),
  accountPassword: document.getElementById("accountPasswordInput"),
};

const accountElements = {
  name: document.getElementById("accountNameValue"),
  status: document.getElementById("accountStatusText"),
};

const canvas = document.getElementById("tetrisCanvas");
const context = canvas.getContext("2d");
const nextCanvas = document.getElementById("nextCanvas");
const nextContext = nextCanvas.getContext("2d");
const opponentCanvas = document.getElementById("opponentCanvas");
const opponentContext = opponentCanvas.getContext("2d");

const COLS = 10;
const ROWS = 20;
const BLOCK = canvas.width / COLS;
const NEXT_BLOCK = nextCanvas.width / 6;
const OPPONENT_BLOCK = opponentCanvas.width / COLS;
const HEARTBEAT_MS = 5000;
const SNAPSHOT_INTERVAL_MS = 150;
const LOCK_DELAY_MS = 550;
const MAX_LOCK_RESETS = 12;
const STORAGE_KEYS = {
  profileBase: "codex-tetris-profile-base",
  sessionProfile: "codex-tetris-session-profile",
  blockSkin: "codex-tetris-block-skin",
  accounts: "codex-tetris-accounts",
  currentAccountId: "codex-tetris-current-account-id",
};
const COLORS = {
  I: "#39cfff",
  J: "#4d72ff",
  L: "#ff9b36",
  O: "#ffe066",
  S: "#56e0c6",
  T: "#c86bff",
  Z: "#ff6778",
  garbage: "#314554",
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function adjustColor(hex, amount) {
  const normalized = hex.replace("#", "");
  const safeHex = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  const red = clamp(parseInt(safeHex.slice(0, 2), 16) + amount, 0, 255);
  const green = clamp(parseInt(safeHex.slice(2, 4), 16) + amount, 0, 255);
  const blue = clamp(parseInt(safeHex.slice(4, 6), 16) + amount, 0, 255);

  return `rgb(${red}, ${green}, ${blue})`;
}

function drawBevelSkin(target, px, py, color, size, config) {
  const inset = Math.max(2, Math.floor(size * (config.insetScale ?? 0.1)));
  const innerSize = size - inset * 2;
  const baseGradient = target.createLinearGradient(px, py, px + size, py + size);
  baseGradient.addColorStop(0, adjustColor(color, config.light ?? 58));
  baseGradient.addColorStop(0.45, adjustColor(color, config.mid ?? 0));
  baseGradient.addColorStop(1, adjustColor(color, config.dark ?? -34));

  target.fillStyle = `rgba(3, 8, 11, ${config.shadowAlpha ?? 0.42})`;
  target.fillRect(px + 1, py + 2, size - 2, size - 2);
  target.fillStyle = baseGradient;
  target.fillRect(px, py, size, size);

  const glossGradient = target.createLinearGradient(px, py, px, py + size);
  glossGradient.addColorStop(0, `rgba(255,255,255,${config.glossTop ?? 0.26})`);
  glossGradient.addColorStop(0.4, `rgba(255,255,255,${config.glossMid ?? 0.08})`);
  glossGradient.addColorStop(1, "rgba(255,255,255,0)");
  target.fillStyle = glossGradient;
  target.fillRect(px + inset, py + inset, innerSize, innerSize);

  target.strokeStyle = `rgba(255,255,255,${config.edgeLight ?? 0.3})`;
  target.lineWidth = 1.5;
  target.beginPath();
  target.moveTo(px + 1, py + size - 1);
  target.lineTo(px + 1, py + 1);
  target.lineTo(px + size - 1, py + 1);
  target.stroke();

  target.strokeStyle = `rgba(0,0,0,${config.edgeDark ?? 0.3})`;
  target.beginPath();
  target.moveTo(px + size - 1, py + 1);
  target.lineTo(px + size - 1, py + size - 1);
  target.lineTo(px + 1, py + size - 1);
  target.stroke();

  target.strokeStyle = `rgba(255,255,255,${config.frameAlpha ?? 0.1})`;
  target.strokeRect(px + 0.75, py + 0.75, size - 1.5, size - 1.5);
}

function drawArcadeSkin(target, px, py, color, size, config) {
  const inset = Math.max(2, Math.floor(size * (config.insetScale ?? 0.12)));
  const midInset = inset + (config.midOffset ?? 2);
  const strip = Math.max(3, Math.floor(size * (config.stripScale ?? 0.18)));

  target.fillStyle = `rgba(2, 6, 8, ${config.shadowAlpha ?? 0.5})`;
  target.fillRect(px + 2, py + 3, size - 2, size - 2);
  target.fillStyle = adjustColor(color, config.shellDark ?? -28);
  target.fillRect(px, py, size, size);
  target.fillStyle = adjustColor(color, config.baseShift ?? 0);
  target.fillRect(px + inset, py + inset, size - inset * 2, size - inset * 2);
  target.fillStyle = adjustColor(color, config.stripLight ?? 72);
  target.fillRect(px + inset, py + inset, size - inset * 2, strip);
  target.fillRect(px + inset, py + inset, strip, size - inset * 2);
  target.fillStyle = adjustColor(color, config.coreShift ?? 20);
  target.fillRect(px + midInset, py + midInset, size - midInset * 2, size - midInset * 2);
  target.strokeStyle = `rgba(0, 0, 0, ${config.frameAlpha ?? 0.42})`;
  target.lineWidth = 1.25;
  target.strokeRect(px + 0.6, py + 0.6, size - 1.2, size - 1.2);
}

function drawGlassSkin(target, px, py, color, size, config) {
  const inset = Math.max(2, Math.floor(size * (config.insetScale ?? 0.1)));
  const innerSize = size - inset * 2;
  const shellGradient = target.createLinearGradient(px, py, px + size, py + size);
  shellGradient.addColorStop(0, `rgba(255,255,255,${config.shellAlpha ?? 0.34})`);
  shellGradient.addColorStop(0.16, adjustColor(color, config.light ?? 55));
  shellGradient.addColorStop(0.5, adjustColor(color, config.mid ?? 0));
  shellGradient.addColorStop(1, adjustColor(color, config.dark ?? -30));

  target.fillStyle = `rgba(2, 6, 8, ${config.shadowAlpha ?? 0.4})`;
  target.fillRect(px + 1, py + 2, size - 2, size - 2);
  target.fillStyle = shellGradient;
  target.fillRect(px, py, size, size);

  const innerGradient = target.createLinearGradient(px, py + inset, px, py + size - inset);
  innerGradient.addColorStop(0, `rgba(255,255,255,${config.innerTop ?? 0.3})`);
  innerGradient.addColorStop(0.45, `rgba(255,255,255,${config.innerMid ?? 0.09})`);
  innerGradient.addColorStop(1, `rgba(255,255,255,${config.innerBottom ?? 0.03})`);
  target.fillStyle = innerGradient;
  target.fillRect(px + inset, py + inset, innerSize, innerSize);
  target.fillStyle = `rgba(255,255,255,${config.bandAlpha ?? 0.2})`;
  target.fillRect(px + inset, py + inset, innerSize, Math.max(3, Math.floor(size * (config.bandScale ?? 0.15))));
  target.strokeStyle = `rgba(255,255,255,${config.frameAlpha ?? 0.26})`;
  target.lineWidth = 1.2;
  target.strokeRect(px + 0.6, py + 0.6, size - 1.2, size - 1.2);
}

function drawNeoSkin(target, px, py, color, size, config) {
  const inset = Math.max(3, Math.floor(size * (config.insetScale ?? 0.14)));
  const innerSize = size - inset * 2;
  target.fillStyle = `rgba(0, 0, 0, ${config.shadowAlpha ?? 0.28})`;
  target.fillRect(px + 2, py + 2, size - 2, size - 2);
  target.fillStyle = adjustColor(color, config.shellDark ?? -46);
  target.fillRect(px, py, size, size);
  target.fillStyle = adjustColor(color, config.baseShift ?? 0);
  target.fillRect(px + inset, py + inset, innerSize, innerSize);
  target.strokeStyle = adjustColor(color, config.edgeLight ?? 88);
  target.lineWidth = config.edgeWidth ?? 2;
  target.strokeRect(px + inset - 0.5, py + inset - 0.5, innerSize + 1, innerSize + 1);
  target.strokeStyle = `rgba(255,255,255,${config.frameAlpha ?? 0.18})`;
  target.lineWidth = 1;
  target.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

function drawMatteSkin(target, px, py, color, size, config) {
  const inset = Math.max(2, Math.floor(size * (config.insetScale ?? 0.08)));
  const innerSize = size - inset * 2;
  target.fillStyle = `rgba(1, 5, 7, ${config.shadowAlpha ?? 0.34})`;
  target.fillRect(px + 1, py + 2, size - 1, size - 1);
  target.fillStyle = adjustColor(color, config.baseShift ?? -8);
  target.fillRect(px, py, size, size);
  target.fillStyle = adjustColor(color, config.innerShift ?? 10);
  target.fillRect(px + inset, py + inset, innerSize, innerSize);
  target.strokeStyle = `rgba(255,255,255,${config.frameAlpha ?? 0.12})`;
  target.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

function drawHaloSkin(target, px, py, color, size, config) {
  const inset = Math.max(3, Math.floor(size * (config.insetScale ?? 0.16)));
  const innerSize = size - inset * 2;
  target.fillStyle = `rgba(4, 10, 14, ${config.shadowAlpha ?? 0.3})`;
  target.fillRect(px + 1, py + 2, size - 1, size - 1);
  target.fillStyle = adjustColor(color, config.shellDark ?? -52);
  target.fillRect(px, py, size, size);
  target.fillStyle = adjustColor(color, config.baseShift ?? -6);
  target.fillRect(px + inset, py + inset, innerSize, innerSize);
  target.strokeStyle = adjustColor(color, config.ringLight ?? 110);
  target.lineWidth = config.ringWidth ?? 1.8;
  target.strokeRect(px + inset - 0.5, py + inset - 0.5, innerSize + 1, innerSize + 1);
  target.strokeStyle = `rgba(255,255,255,${config.frameAlpha ?? 0.08})`;
  target.lineWidth = 1;
  target.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

const SKIN_RENDERERS = {
  bevel: drawBevelSkin,
  arcade: drawArcadeSkin,
  glass: drawGlassSkin,
  neo: drawNeoSkin,
  matte: drawMatteSkin,
  halo: drawHaloSkin,
};

const BLOCK_SKIN_DEFINITIONS = [
  { key: "bevel", label: "Bevel", mode: "bevel", options: {} },
  { key: "arcade", label: "Arcade", mode: "arcade", options: {} },
  { key: "glass", label: "Glass", mode: "glass", options: {} },
  { key: "neo", label: "Neo", mode: "neo", options: {} },
  { key: "candy", label: "Candy", mode: "bevel", options: { light: 74, dark: -20, glossTop: 0.34, glossMid: 0.12 } },
  { key: "ember", label: "Ember", mode: "bevel", options: { light: 42, dark: -48, edgeDark: 0.44, frameAlpha: 0.06 } },
  { key: "frost", label: "Frost", mode: "glass", options: { light: 76, dark: -18, innerTop: 0.4, bandAlpha: 0.28 } },
  { key: "steel", label: "Steel", mode: "matte", options: { baseShift: -18, innerShift: 4, frameAlpha: 0.18 } },
  { key: "prism", label: "Prism", mode: "glass", options: { shellAlpha: 0.42, bandAlpha: 0.26, frameAlpha: 0.32 } },
  { key: "soft", label: "Soft", mode: "matte", options: { baseShift: 6, innerShift: 18, shadowAlpha: 0.22 } },
  { key: "carbon", label: "Carbon", mode: "neo", options: { shellDark: -68, edgeLight: 58, frameAlpha: 0.12 } },
  { key: "plasma", label: "Plasma", mode: "halo", options: { ringLight: 128, ringWidth: 2.2, baseShift: 10 } },
  { key: "sunset", label: "Sunset", mode: "bevel", options: { light: 52, mid: 10, dark: -24, glossTop: 0.24 } },
  { key: "crystal", label: "Crystal", mode: "glass", options: { shellAlpha: 0.5, innerTop: 0.34, innerMid: 0.14, frameAlpha: 0.36 } },
  { key: "gridline", label: "Gridline", mode: "neo", options: { insetScale: 0.2, edgeWidth: 1.6, edgeLight: 120 } },
  { key: "pixel", label: "Pixel", mode: "arcade", options: { insetScale: 0.16, stripScale: 0.14, shellDark: -36, coreShift: 8 } },
  { key: "aqua", label: "Aqua", mode: "glass", options: { light: 64, dark: -14, bandAlpha: 0.24, shellAlpha: 0.38 } },
  { key: "velvet", label: "Velvet", mode: "matte", options: { baseShift: -14, innerShift: -2, shadowAlpha: 0.4 } },
  { key: "shock", label: "Shock", mode: "halo", options: { ringLight: 138, baseShift: 18, ringWidth: 2.4 } },
  { key: "retro", label: "Retro", mode: "arcade", options: { shellDark: -18, stripLight: 54, coreShift: -8 } },
  { key: "onyx", label: "Onyx", mode: "neo", options: { shellDark: -82, baseShift: -24, edgeLight: 42, frameAlpha: 0.08 } },
  { key: "mint", label: "Mint", mode: "bevel", options: { light: 66, dark: -16, glossTop: 0.3, edgeLight: 0.22 } },
  { key: "laser", label: "Laser", mode: "halo", options: { insetScale: 0.22, ringLight: 150, ringWidth: 1.5, frameAlpha: 0.16 } },
  { key: "slate", label: "Slate", mode: "matte", options: { baseShift: -26, innerShift: -8, frameAlpha: 0.2 } },
];

const BLOCK_SKINS = Object.fromEntries(
  BLOCK_SKIN_DEFINITIONS.map((definition) => [
    definition.key,
    {
      label: definition.label,
      drawCell(target, x, y, color, size) {
        SKIN_RENDERERS[definition.mode](
          target,
          x * size,
          y * size,
          color,
          size,
          definition.options,
        );
      },
    },
  ]),
);

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

const SCORE_BY_LINES = [0, 100, 300, 500, 800];

let gameState = null;
let lobbies = [];
let selectedLobbyId = null;
let currentLobbyId = null;
let animationFrameId = null;
let heartbeatId = null;
let events = null;
let isLeavingLobby = false;
let isSyncingLobbies = false;
let currentBlockSkin = getStoredBlockSkin();
let clientProfile = getOrCreateProfile();

function showScreen(screenName) {
  Object.values(screens).forEach((screen) =>
    screen.classList.remove("screen-active"),
  );
  screens[screenName].classList.add("screen-active");
  buttons.globalMenu.hidden = screenName === "menu";
}

function createMatrix(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(0));
}

function getStoredBlockSkin() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.blockSkin);
    if (saved && BLOCK_SKINS[saved]) {
      return saved;
    }
  } catch {}

  return "bevel";
}

function setBlockSkin(skinName) {
  if (!BLOCK_SKINS[skinName]) {
    return;
  }

  currentBlockSkin = skinName;
  if (inputs.blockSkin) {
    inputs.blockSkin.value = skinName;
  }

  try {
    localStorage.setItem(STORAGE_KEYS.blockSkin, skinName);
  } catch {}

  if (gameState) {
    drawBoard();
    drawNextPiece();
    drawOpponentBoard();
  }
}

function makeMulberry32(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
}

function clonePiece(type) {
  return {
    type,
    matrix: SHAPES[type].map((row) => [...row]),
    x: 0,
    y: 0,
  };
}

function buildBag(randomFn = Math.random) {
  const bag = Object.keys(SHAPES);
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomFn() * (index + 1));
    [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
  }
  return bag;
}

function createPieceQueue(randomFn = Math.random) {
  let bag = buildBag(randomFn);
  return function nextType() {
    if (!bag.length) {
      bag = buildBag(randomFn);
    }
    return bag.pop();
  };
}

function randomPlayerId(prefix = "player") {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function readJsonStorage(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {}
}

function normalizeAccountName(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, 18);
}

function getStoredAccounts() {
  const accounts = readJsonStorage(localStorage, STORAGE_KEYS.accounts, []);
  return Array.isArray(accounts) ? accounts : [];
}

function saveAccounts(accounts) {
  writeJsonStorage(localStorage, STORAGE_KEYS.accounts, accounts);
}

function getGuestBaseProfile() {
  const fallbackName = `Player ${Math.floor(1000 + Math.random() * 9000)}`;
  const storedBase = readJsonStorage(localStorage, STORAGE_KEYS.profileBase, null);
  const baseProfile = {
    baseName: storedBase?.baseName || fallbackName,
    wins: storedBase?.wins || 0,
    losses: storedBase?.losses || 0,
  };
  writeJsonStorage(localStorage, STORAGE_KEYS.profileBase, baseProfile);
  return baseProfile;
}

function buildGuestProfile() {
  const baseProfile = getGuestBaseProfile();
  return {
    id: randomPlayerId("guest"),
    name: `${baseProfile.baseName} ${Math.floor(10 + Math.random() * 90)}`,
    guest: true,
    wins: baseProfile.wins,
    losses: baseProfile.losses,
  };
}

function buildAccountProfile(account) {
  return {
    id: account.id,
    accountId: account.id,
    name: account.username,
    guest: false,
    wins: account.wins || 0,
    losses: account.losses || 0,
  };
}

function persistSessionProfile(profile = clientProfile) {
  writeJsonStorage(sessionStorage, STORAGE_KEYS.sessionProfile, profile);
}

function getOrCreateProfile() {
  const accounts = getStoredAccounts();
  const currentAccountId = localStorage.getItem(STORAGE_KEYS.currentAccountId);
  const currentAccount = accounts.find((account) => account.id === currentAccountId);
  if (currentAccount) {
    const profile = buildAccountProfile(currentAccount);
    persistSessionProfile(profile);
    return profile;
  }

  const existingSession = readJsonStorage(
    sessionStorage,
    STORAGE_KEYS.sessionProfile,
    null,
  );
  if (existingSession?.id && existingSession?.name && existingSession.guest) {
    return existingSession;
  }

  const profile = buildGuestProfile();
  persistSessionProfile(profile);
  return profile;
}

function getAccountByName(username) {
  return getStoredAccounts().find(
    (account) => account.username.toLowerCase() === username.toLowerCase(),
  );
}

function updateAccountUi(statusText = "") {
  accountElements.name.textContent = clientProfile.name;
  accountElements.status.textContent = statusText || (clientProfile.guest
    ? "Guest profile active. Create an account to keep a persistent ranked record."
    : "Signed in. Your wins and losses will keep tracking on this device.");
  hud.player.textContent = clientProfile.name;
  hud.wins.textContent = String(clientProfile.wins || 0);
  hud.losses.textContent = String(clientProfile.losses || 0);
  if (inputs.accountName) {
    inputs.accountName.value = clientProfile.guest ? "" : clientProfile.name;
  }
  if (inputs.accountPassword) {
    inputs.accountPassword.value = "";
  }
}

function populateSkinPicker() {
  if (!inputs.blockSkin) {
    return;
  }

  inputs.blockSkin.innerHTML = "";
  BLOCK_SKIN_DEFINITIONS.forEach((skin) => {
    const option = document.createElement("option");
    option.value = skin.key;
    option.textContent = skin.label;
    inputs.blockSkin.appendChild(option);
  });
  inputs.blockSkin.value = currentBlockSkin;
}

function setClientProfile(profile, statusText) {
  clientProfile = profile;
  persistSessionProfile(clientProfile);
  updateAccountUi(statusText);
  if (gameState) {
    updateHud();
    updateMatchHud();
  }
}

function createAccount() {
  const username = normalizeAccountName(inputs.accountName?.value || "");
  const password = (inputs.accountPassword?.value || "").trim();
  if (username.length < 3) {
    updateAccountUi("Usernames need at least 3 characters.");
    return;
  }
  if (password.length < 4) {
    updateAccountUi("Passwords need at least 4 characters.");
    return;
  }
  if (getAccountByName(username)) {
    updateAccountUi("That username already exists on this device. Sign in instead.");
    return;
  }

  const accounts = getStoredAccounts();
  const account = {
    id: randomPlayerId("account"),
    username,
    password,
    wins: 0,
    losses: 0,
    createdAt: Date.now(),
  };
  accounts.push(account);
  saveAccounts(accounts);
  localStorage.setItem(STORAGE_KEYS.currentAccountId, account.id);
  setClientProfile(buildAccountProfile(account), "Account created. You are signed in.");
}

function signInAccount() {
  const username = normalizeAccountName(inputs.accountName?.value || "");
  const password = (inputs.accountPassword?.value || "").trim();
  const account = getAccountByName(username);
  if (!account || account.password !== password) {
    updateAccountUi("That username/password combo was not found on this device.");
    return;
  }

  localStorage.setItem(STORAGE_KEYS.currentAccountId, account.id);
  setClientProfile(buildAccountProfile(account), "Signed in successfully.");
}

function useGuestProfile() {
  localStorage.removeItem(STORAGE_KEYS.currentAccountId);
  setClientProfile(buildGuestProfile(), "Guest mode active. Your guest record stays local to this browser.");
}

function recordMatchResult(result) {
  if (result !== "win" && result !== "loss") {
    return;
  }

  if (result === "win") {
    clientProfile.wins = (clientProfile.wins || 0) + 1;
  } else {
    clientProfile.losses = (clientProfile.losses || 0) + 1;
  }

  if (clientProfile.accountId) {
    const accounts = getStoredAccounts();
    const updatedAccounts = accounts.map((account) =>
      account.id === clientProfile.accountId
        ? {
            ...account,
            wins: clientProfile.wins,
            losses: clientProfile.losses,
          }
        : account,
    );
    saveAccounts(updatedAccounts);
  } else {
    const baseProfile = getGuestBaseProfile();
    writeJsonStorage(localStorage, STORAGE_KEYS.profileBase, {
      ...baseProfile,
      wins: clientProfile.wins,
      losses: clientProfile.losses,
    });
  }

  persistSessionProfile(clientProfile);
  updateAccountUi();
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function drawCell(target, x, y, color, size) {
  BLOCK_SKINS[currentBlockSkin].drawCell(target, x, y, color, size);
}

function drawPiece(target, piece, size, alpha = 1) {
  if (!piece) {
    return;
  }
  target.save();
  target.globalAlpha = alpha;
  piece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawCell(target, piece.x + x, piece.y + y, COLORS[piece.type], size);
      }
    });
  });
  target.restore();
}

function drawGhostPiece() {
  if (!gameState?.active) {
    return;
  }
  const ghostY = getGhostY(gameState.active);
  context.save();
  context.globalAlpha = 0.32;

  gameState.active.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      const cellX = (gameState.active.x + x) * BLOCK;
      const cellY = (ghostY + y) * BLOCK;
      const ghostInset = Math.max(4, Math.floor(BLOCK * 0.18));
      const ghostSize = BLOCK - ghostInset * 2;
      context.fillStyle = "rgba(255, 255, 255, 0.06)";
      context.fillRect(cellX + ghostInset, cellY + ghostInset, ghostSize, ghostSize);
      context.strokeStyle = "rgba(255, 255, 255, 0.5)";
      context.lineWidth = 1.5;
      context.strokeRect(
        cellX + ghostInset - 1,
        cellY + ghostInset - 1,
        ghostSize + 2,
        ghostSize + 2,
      );
    });
  });

  context.restore();
}

function drawBoard() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#071118";
  context.fillRect(0, 0, canvas.width, canvas.height);

  gameState.board.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawCell(context, x, y, value, BLOCK);
      } else {
        context.strokeStyle = "rgba(255,255,255,0.04)";
        context.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
      }
    });
  });

  drawGhostPiece();
  drawPiece(context, gameState.active, BLOCK);
}

function drawNextPiece() {
  nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextContext.fillStyle = "#071118";
  nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  const preview = clonePiece(gameState.nextType);
  preview.x = Math.floor((6 - preview.matrix[0].length) / 2);
  preview.y = Math.floor((6 - preview.matrix.length) / 2);
  drawPiece(nextContext, preview, NEXT_BLOCK);
}

function drawOpponentBoard() {
  opponentContext.clearRect(0, 0, opponentCanvas.width, opponentCanvas.height);
  opponentContext.fillStyle = "#071118";
  opponentContext.fillRect(0, 0, opponentCanvas.width, opponentCanvas.height);

  const snapshot = gameState?.multiplayer?.opponentSnapshot;
  if (!snapshot) {
    opponentContext.fillStyle = "rgba(255,255,255,0.5)";
    opponentContext.font = "14px Trebuchet MS";
    opponentContext.textAlign = "center";
    opponentContext.fillText("Waiting...", opponentCanvas.width / 2, opponentCanvas.height / 2);
    return;
  }

  snapshot.board.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawCell(opponentContext, x, y, value, OPPONENT_BLOCK);
      } else {
        opponentContext.strokeStyle = "rgba(255,255,255,0.05)";
        opponentContext.strokeRect(
          x * OPPONENT_BLOCK,
          y * OPPONENT_BLOCK,
          OPPONENT_BLOCK,
          OPPONENT_BLOCK,
        );
      }
    });
  });

  drawPiece(opponentContext, snapshot.active, OPPONENT_BLOCK, 0.92);
}

function updateGamePanels() {
  const showOpponent = Boolean(gameState?.multiplayer?.enabled);
  panels.opponent.classList.toggle("hidden-panel", !showOpponent);
}

function setLobbies(nextLobbies) {
  lobbies = nextLobbies;
  if (selectedLobbyId && !lobbies.some((lobby) => lobby.id === selectedLobbyId)) {
    selectedLobbyId = null;
  }
  if (!selectedLobbyId) {
    selectedLobbyId = lobbies[0]?.id ?? null;
  }
  renderLobbies();
  if (selectedLobbyId) {
    selectLobby(selectedLobbyId);
  } else {
    buttons.joinLobby.disabled = true;
    buttons.joinLobby.textContent = "Join Selected Lobby";
    lobbyElements.detailName.textContent = "Choose a lobby";
    lobbyElements.detailText.textContent =
      "Create a room on one device, then join it from a second device on the same server.";
    lobbyElements.detailStats.innerHTML = "";
  }
}

async function refreshLobbies() {
  if (isSyncingLobbies) {
    return lobbies;
  }
  isSyncingLobbies = true;
  try {
    const payload = await apiRequest("/api/lobbies");
    setLobbies(payload.lobbies ?? []);
    return lobbies;
  } catch (error) {
    lobbyElements.detailName.textContent = "Server unavailable";
    lobbyElements.detailText.textContent = error.message;
    lobbyElements.detailStats.innerHTML = "";
    buttons.joinLobby.disabled = true;
    return lobbies;
  } finally {
    isSyncingLobbies = false;
  }
}

function renderLobbies() {
  lobbyElements.list.innerHTML = "";

  if (!lobbies.length) {
    const empty = document.createElement("div");
    empty.className = "panel";
    empty.innerHTML = `
      <p class="eyebrow">No Active Rooms</p>
      <h3>Start a duel lobby</h3>
      <p>Create a lobby here, then join it from another device using the same server URL.</p>
    `;
    lobbyElements.list.appendChild(empty);
    return;
  }

  lobbies.forEach((lobby) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `lobby-card${lobby.id === selectedLobbyId ? " selected" : ""}`;
    button.innerHTML = `
      <div class="lobby-card-top">
        <h3>${lobby.name}</h3>
        <span class="pill">${lobby.region}</span>
      </div>
      <div class="lobby-meta">
        <span>${lobby.ruleset}</span>
        <span>${lobby.players.length}/${lobby.maxPlayers} Players</span>
        <span>${lobby.status === "in-game" ? "Match Live" : lobby.status === "finished" ? "Finished" : "Waiting"}</span>
      </div>
      <div class="lobby-meta">
        <span>${lobby.players.map((player) => player.name).join(" vs ")}</span>
      </div>
    `;
    button.addEventListener("click", () => selectLobby(lobby.id));
    lobbyElements.list.appendChild(button);
  });
}

function selectLobby(lobbyId) {
  selectedLobbyId = lobbyId;
  const lobby = lobbies.find((entry) => entry.id === lobbyId);
  renderLobbies();

  if (!lobby) {
    buttons.joinLobby.disabled = true;
    return;
  }

  const currentPlayer = lobby.players.find((player) => player.id === clientProfile.id);
  const isFull = lobby.players.length >= lobby.maxPlayers && !currentPlayer;

  lobbyElements.detailName.textContent = lobby.name;
  lobbyElements.detailText.textContent = currentPlayer
    ? "You are already in this lobby. Rejoin the room or wait for the match to start."
    : "Join this room from another device to play a live networked duel.";
  lobbyElements.detailStats.innerHTML = `
    <span>Ruleset: ${lobby.ruleset}</span>
    <span>Players: ${lobby.players.map((player) => player.name).join(" / ")}</span>
    <span>Status: ${lobby.status === "in-game" ? "Match Live" : lobby.status === "finished" ? "Finished" : "Waiting for Opponent"}</span>
  `;
  buttons.joinLobby.disabled = isFull;
  buttons.joinLobby.textContent = currentPlayer ? "Rejoin Lobby" : "Join Selected Lobby";
}

function collides(piece, board, moveX = 0, moveY = 0, matrix = piece.matrix) {
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[y].length; x += 1) {
      if (!matrix[y][x]) {
        continue;
      }
      const boardX = piece.x + x + moveX;
      const boardY = piece.y + y + moveY;
      if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
        return true;
      }
      if (boardY >= 0 && board[boardY][boardX]) {
        return true;
      }
    }
  }
  return false;
}

function isPieceGrounded(piece = gameState?.active) {
  return piece ? collides(piece, gameState.board, 0, 1, piece.matrix) : false;
}

function resetLockDelay() {
  if (!gameState) {
    return;
  }
  gameState.lockTimer = 0;
  gameState.lockResets = Math.min(gameState.lockResets + 1, MAX_LOCK_RESETS);
}

function getGhostY(piece) {
  let ghostY = piece.y;
  while (
    !collides(piece, gameState.board, 0, ghostY - piece.y + 1, piece.matrix)
  ) {
    ghostY += 1;
  }
  return ghostY;
}

function mergePiece() {
  const { board, active } = gameState;
  active.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value && board[active.y + y]) {
        board[active.y + y][active.x + x] = COLORS[active.type];
      }
    });
  });
}

function getAttackLines(cleared) {
  if (cleared === 2) {
    return 1;
  }
  if (cleared === 3) {
    return 2;
  }
  if (cleared >= 4) {
    return 4;
  }
  return 0;
}

async function sendGarbage(lines) {
  const multiplayer = gameState?.multiplayer;
  if (!multiplayer?.enabled || !lines || !multiplayer.opponentId) {
    return;
  }

  try {
    await apiRequest(`/api/lobbies/${multiplayer.lobbyId}/garbage`, {
      method: "POST",
      body: JSON.stringify({
        fromPlayerId: multiplayer.playerId,
        toPlayerId: multiplayer.opponentId,
        lines,
      }),
    });
  } catch {}
}

function clearLines() {
  let cleared = 0;
  outer: for (let y = ROWS - 1; y >= 0; y -= 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!gameState.board[y][x]) {
        continue outer;
      }
    }
    const row = gameState.board.splice(y, 1)[0].fill(0);
    gameState.board.unshift(row);
    cleared += 1;
    y += 1;
  }

  if (cleared > 0) {
    gameState.lines += cleared;
    gameState.score += SCORE_BY_LINES[cleared] * gameState.level;
    gameState.level = Math.floor(gameState.lines / 10) + 1;
    gameState.dropInterval = Math.max(120, 850 - (gameState.level - 1) * 70);
    updateHud();
    sendGarbage(getAttackLines(cleared));
  }
}

function applyPendingGarbage() {
  if (!gameState?.multiplayer?.pendingGarbage) {
    return;
  }

  for (let index = 0; index < gameState.multiplayer.pendingGarbage; index += 1) {
    const hole = Math.floor(gameState.random() * COLS);
    gameState.board.shift();
    gameState.board.push(
      Array.from({ length: COLS }, (_, column) =>
        column === hole ? 0 : COLORS.garbage,
      ),
    );
  }

  gameState.multiplayer.pendingGarbage = 0;
  updateMatchHud();
}

function createMultiplayerMeta(config) {
  if (!config) {
    return {
      enabled: false,
      opponentSnapshot: null,
      lastSnapshotAt: 0,
    };
  }

  return {
    enabled: true,
    lobbyId: config.lobbyId,
    playerId: clientProfile.id,
    opponentId: null,
    isHost: config.hostId === clientProfile.id,
    waitingForStart: !config.started,
    pendingGarbage: 0,
    opponentSnapshot: null,
    matchEnded: false,
    result: null,
    lastSnapshotAt: 0,
  };
}

function resetGame(modeLabel, multiplayerConfig = null) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  const randomFn = multiplayerConfig
    ? makeMulberry32(multiplayerConfig.seed)
    : Math.random;
  const nextRandomType = createPieceQueue(randomFn);

  gameState = {
    board: createMatrix(COLS, ROWS),
    active: null,
    nextRandomType,
    nextType: nextRandomType(),
    score: 0,
    lines: 0,
    level: 1,
    dropCounter: 0,
    dropInterval: 850,
    lockTimer: 0,
    lockResets: 0,
    lastFrame: 0,
    resultRecorded: false,
    paused: Boolean(multiplayerConfig && !multiplayerConfig.started),
    modeLabel,
    random: randomFn,
    multiplayer: createMultiplayerMeta(multiplayerConfig),
  };

  hud.mode.textContent = modeLabel;
  buttons.pause.textContent = gameState.paused ? "Resume" : "Pause";
  updateGamePanels();
  hideOverlay();
  updateHud();
  updateMatchHud();
  spawnPiece();
  drawBoard();
  drawNextPiece();
  drawOpponentBoard();
  gameLoop(0);
}

function spawnPiece() {
  applyPendingGarbage();
  const nextType = gameState.nextType;
  gameState.nextType = gameState.nextRandomType();
  gameState.active = clonePiece(nextType);
  gameState.active.x = Math.floor(
    (COLS - gameState.active.matrix[0].length) / 2,
  );
  gameState.active.y = 0;
  gameState.lockTimer = 0;
  gameState.lockResets = 0;
  drawNextPiece();

  if (collides(gameState.active, gameState.board)) {
    handlePlayerLoss();
  }
}

function updateHud() {
  hud.player.textContent = clientProfile.name;
  hud.score.textContent = String(gameState.score);
  hud.lines.textContent = String(gameState.lines);
  hud.level.textContent = String(gameState.level);
  hud.wins.textContent = String(clientProfile.wins || 0);
  hud.losses.textContent = String(clientProfile.losses || 0);
}

function getCurrentLobby() {
  return lobbies.find((lobby) => lobby.id === currentLobbyId) ?? null;
}

function findLobbyForPlayer(playerId, preferredLobbyId = null) {
  if (preferredLobbyId) {
    const preferredLobby = lobbies.find((lobby) => lobby.id === preferredLobbyId);
    if (preferredLobby) {
      return preferredLobby;
    }
  }

  const matchingLobbies = lobbies.filter((lobby) =>
    lobby.players.some((player) => player.id === playerId),
  );

  return (
    matchingLobbies.sort(
      (left, right) => (right.startedAt || 0) - (left.startedAt || 0),
    )[0] ?? null
  );
}

function getRematchReadyCount(lobby) {
  return lobby?.rematchReadyPlayerIds?.length || 0;
}

function getWaitingOverlayState(lobby) {
  const enoughPlayers = lobby.players.length >= 2;
  const rematchReadyCount = getRematchReadyCount(lobby);
  const localReady = lobby.rematchReadyPlayerIds?.includes(clientProfile.id);

  if (lobby.status === "finished") {
    return {
      eyebrow: "Rematch Lobby",
      title: localReady ? "Waiting for Rematch" : "Rematch Available",
      text: localReady
        ? `Waiting for the other player to confirm rematch (${rematchReadyCount}/${lobby.players.length} ready).`
        : "Both players must click rematch before the host can start the next duel.",
      primaryLabel: localReady ? "Waiting..." : "Rematch",
      action: localReady ? "noop" : "rematch",
    };
  }

  return {
    eyebrow: "Multiplayer Lobby",
    title: enoughPlayers && gameState.multiplayer.isHost ? "Ready to Start" : "Waiting for Players",
    text: enoughPlayers
      ? gameState.multiplayer.isHost
        ? "Another device joined the room. Start the match whenever you're ready."
        : "The room is full. Waiting for the host to start the duel."
      : "Share this server URL with another device and join the same lobby there.",
    primaryLabel: enoughPlayers && gameState.multiplayer.isHost ? "Start Match" : "Waiting...",
    action: enoughPlayers && gameState.multiplayer.isHost ? "start-match" : "noop",
  };
}

function updateMatchHud() {
  if (!gameState?.multiplayer?.enabled) {
    updateGamePanels();
    matchHud.label.textContent = "Solo Run";
    matchHud.text.textContent = "Singleplayer mode is active.";
    drawOpponentBoard();
    return;
  }

  updateGamePanels();
  const multiplayer = gameState.multiplayer;
  const currentLobby = getCurrentLobby();
  const opponentName =
    multiplayer.opponentSnapshot?.name ??
    currentLobby?.players.find((player) => player.id !== clientProfile.id)?.name ??
    "Opponent";

  if (multiplayer.matchEnded) {
    matchHud.label.textContent = multiplayer.result === "win" ? "Victory" : "Defeat";
    matchHud.text.textContent =
      multiplayer.result === "win"
        ? `You outlasted ${opponentName}.`
        : `${opponentName} survived the duel.`;
  } else if (currentLobby?.status === "finished") {
    const rematchReadyCount = getRematchReadyCount(currentLobby);
    matchHud.label.textContent = "Rematch Queue";
    matchHud.text.textContent = `${rematchReadyCount}/${currentLobby.players.length} player(s) are ready for another duel.`;
  } else if (multiplayer.waitingForStart) {
    matchHud.label.textContent = "Lobby Room";
    matchHud.text.textContent = multiplayer.isHost
      ? "Wait for another device to join, then press Start Match."
      : "Connected to the room. Waiting for the host to start.";
  } else {
    matchHud.label.textContent = `${clientProfile.name} vs ${opponentName}`;
    matchHud.text.textContent = multiplayer.pendingGarbage
      ? `${multiplayer.pendingGarbage} garbage line(s) queued against you.`
      : "Live network match is active. Clear doubles, triples, and tetrises to attack.";
  }

  drawOpponentBoard();
}

function hideOverlay() {
  overlay.root.classList.add("hidden");
  buttons.overlayPrimary.dataset.action = "";
}

function showOverlay({ eyebrow, title, text, primaryLabel, action }) {
  overlay.eyebrow.textContent = eyebrow;
  overlay.title.textContent = title;
  overlay.text.textContent = text;
  buttons.overlayPrimary.textContent = primaryLabel;
  buttons.overlayPrimary.dataset.action = action;
  overlay.root.classList.remove("hidden");
}

async function handlePlayerLoss() {
  if (!gameState || gameState.resultRecorded) {
    return;
  }
  gameState.resultRecorded = true;

  if (gameState.multiplayer?.enabled) {
    const multiplayer = gameState.multiplayer;
    multiplayer.matchEnded = true;
    multiplayer.result = "loss";
    multiplayer.waitingForStart = false;
    gameState.paused = true;
    recordMatchResult("loss");
    showOverlay({
      eyebrow: "Match Finished",
      title: "Defeat",
      text: "Your stack topped out. The result has been sent to the server.",
      primaryLabel: "Rematch",
      action: "rematch",
    });
    updateMatchHud();

    try {
      await apiRequest(`/api/lobbies/${multiplayer.lobbyId}/lost`, {
        method: "POST",
        body: JSON.stringify({
          playerId: multiplayer.playerId,
        }),
      });
    } catch {}
    return;
  }

  gameState.paused = true;
  showOverlay({
    eyebrow: "Run Ended",
    title: "Game Over",
    text: "The stack hit the ceiling. Start another run when you're ready.",
    primaryLabel: "Play Again",
    action: "restart",
  });
}

function gameLoop(time = 0) {
  if (!gameState) {
    return;
  }

  const delta = time - gameState.lastFrame;
  gameState.lastFrame = time;

  if (!gameState.paused) {
    gameState.dropCounter += delta;
    if (gameState.dropCounter >= gameState.dropInterval) {
      stepDown();
    }
    if (isPieceGrounded()) {
      gameState.lockTimer += delta;
      if (gameState.lockTimer >= LOCK_DELAY_MS) {
        placeActivePiece();
      }
    } else {
      gameState.lockTimer = 0;
      gameState.lockResets = 0;
    }
    drawBoard();
  }

  maybeSendSnapshot(time);
  animationFrameId = requestAnimationFrame(gameLoop);
}

async function maybeSendSnapshot(time) {
  const multiplayer = gameState?.multiplayer;
  if (!multiplayer?.enabled || multiplayer.waitingForStart || multiplayer.matchEnded) {
    return;
  }

  if (time - multiplayer.lastSnapshotAt < SNAPSHOT_INTERVAL_MS) {
    return;
  }

  multiplayer.lastSnapshotAt = time;

  try {
    await apiRequest(`/api/lobbies/${multiplayer.lobbyId}/state`, {
      method: "POST",
      body: JSON.stringify({
        playerId: multiplayer.playerId,
        snapshot: {
          name: clientProfile.name,
          board: gameState.board.map((row) => [...row]),
          active: gameState.active
            ? {
                type: gameState.active.type,
                matrix: gameState.active.matrix.map((row) => [...row]),
                x: gameState.active.x,
                y: gameState.active.y,
              }
            : null,
          score: gameState.score,
          lines: gameState.lines,
          level: gameState.level,
        },
      }),
    });
  } catch {}
}

function stepDown() {
  if (!gameState || gameState.paused) {
    return;
  }

  gameState.dropCounter = 0;
  if (!collides(gameState.active, gameState.board, 0, 1)) {
    gameState.active.y += 1;
    if (isPieceGrounded()) {
      gameState.lockTimer = 0;
    }
    return;
  }
}

function placeActivePiece() {
  if (!gameState || gameState.paused) {
    return;
  }

  mergePiece();
  clearLines();
  spawnPiece();
}

function hardDrop() {
  while (!collides(gameState.active, gameState.board, 0, 1)) {
    gameState.active.y += 1;
    gameState.score += 2;
  }
  updateHud();
  placeActivePiece();
}

function movePiece(direction) {
  if (!gameState || gameState.paused) {
    return;
  }
  if (!collides(gameState.active, gameState.board, direction, 0)) {
    const groundedBeforeMove = isPieceGrounded();
    gameState.active.x += direction;
    if (groundedBeforeMove && gameState.lockResets < MAX_LOCK_RESETS) {
      resetLockDelay();
    }
    drawBoard();
  }
}

function rotatePiece() {
  if (!gameState || gameState.paused) {
    return;
  }
  const rotated = rotateMatrix(gameState.active.matrix);
  const offsets = [0, -1, 1, -2, 2];
  for (const offset of offsets) {
    if (!collides(gameState.active, gameState.board, offset, 0, rotated)) {
      const groundedBeforeRotate = isPieceGrounded();
      gameState.active.matrix = rotated;
      gameState.active.x += offset;
      if (groundedBeforeRotate && gameState.lockResets < MAX_LOCK_RESETS) {
        resetLockDelay();
      }
      drawBoard();
      return;
    }
  }
}

function softDrop() {
  if (!gameState || gameState.paused) {
    return;
  }
  if (!collides(gameState.active, gameState.board, 0, 1)) {
    gameState.active.y += 1;
    gameState.score += 1;
    gameState.lockTimer = 0;
    updateHud();
    drawBoard();
  }
}

function setPaused(paused) {
  if (!gameState || gameState.multiplayer?.enabled) {
    return;
  }

  gameState.paused = paused;
  buttons.pause.textContent = paused ? "Resume" : "Pause";

  if (paused) {
    showOverlay({
      eyebrow: "Paused",
      title: "Game Paused",
      text: "Take a breather, then jump back into the stack.",
      primaryLabel: "Resume",
      action: "resume",
    });
  } else {
    hideOverlay();
  }
}

async function leaveCurrentLobby() {
  if (!currentLobbyId || isLeavingLobby) {
    return;
  }

  isLeavingLobby = true;
  const lobbyId = currentLobbyId;
  currentLobbyId = null;

  try {
    await apiRequest(`/api/lobbies/${lobbyId}/leave`, {
      method: "POST",
      body: JSON.stringify({
        playerId: clientProfile.id,
      }),
    });
  } catch {
  } finally {
    isLeavingLobby = false;
    refreshLobbies();
  }
}

function startSingleplayer() {
  leaveCurrentLobby();
  showScreen("game");
  resetGame("Singleplayer");
}

async function createLobby() {
  try {
    await leaveCurrentLobby();
    const payload = await apiRequest("/api/lobbies", {
      method: "POST",
      body: JSON.stringify({
        playerId: clientProfile.id,
        playerName: clientProfile.name,
      }),
    });
    await refreshLobbies();

    const createdLobby =
      payload?.lobby ?? findLobbyForPlayer(clientProfile.id);
    if (!createdLobby) {
      throw new Error("The lobby was created, but the server did not return its details.");
    }

    enterMultiplayerRoom(createdLobby);
  } catch (error) {
    lobbyElements.detailName.textContent = "Could not create lobby";
    lobbyElements.detailText.textContent = error.message;
  }
}

async function joinSelectedLobby() {
  const lobby = lobbies.find((entry) => entry.id === selectedLobbyId);
  if (!lobby) {
    return;
  }

  try {
    const payload = await apiRequest(`/api/lobbies/${lobby.id}/join`, {
      method: "POST",
      body: JSON.stringify({
        playerId: clientProfile.id,
        playerName: clientProfile.name,
      }),
    });
    await refreshLobbies();

    const joinedLobby =
      payload?.lobby ?? findLobbyForPlayer(clientProfile.id, lobby.id);
    if (!joinedLobby) {
      throw new Error("Joined the room, but could not load the latest lobby state.");
    }

    enterMultiplayerRoom(joinedLobby);
  } catch (error) {
    lobbyElements.detailName.textContent = "Could not join lobby";
    lobbyElements.detailText.textContent = error.message;
  }
}

function enterMultiplayerRoom(lobby) {
  currentLobbyId = lobby.id;
  showScreen("game");
  resetGame(`Lobby: ${lobby.name}`, {
    lobbyId: lobby.id,
    seed: lobby.seed,
    started: lobby.status === "in-game",
    hostId: lobby.hostId,
  });

  if (gameState.multiplayer.waitingForStart) {
    showOverlay(getWaitingOverlayState(lobby));
  } else {
    hideOverlay();
    gameState.paused = false;
    buttons.pause.textContent = "Live Match";
  }
  updateMatchHud();
}

async function startMultiplayerMatch() {
  if (!gameState?.multiplayer?.enabled || !gameState.multiplayer.isHost) {
    return;
  }

  try {
    const payload = await apiRequest(`/api/lobbies/${currentLobbyId}/start`, {
      method: "POST",
      body: JSON.stringify({
        playerId: clientProfile.id,
      }),
    });
    syncLobbyList(payload.lobby);
    applyMatchStart();
  } catch (error) {
    showOverlay({
      eyebrow: "Multiplayer Lobby",
      title: "Waiting for Players",
      text: error.message,
      primaryLabel: "Start Match",
      action: "start-match",
    });
  }
}

function applyMatchStart() {
  if (!gameState?.multiplayer?.enabled) {
    return;
  }

  gameState.multiplayer.waitingForStart = false;
  gameState.multiplayer.matchEnded = false;
  gameState.multiplayer.result = null;
  gameState.multiplayer.pendingGarbage = 0;
  gameState.multiplayer.opponentSnapshot = null;
  gameState.resultRecorded = false;
  gameState.paused = false;
  buttons.pause.textContent = "Live Match";
  hideOverlay();
  updateMatchHud();
}

async function requestRematch() {
  if (!currentLobbyId) {
    startSingleplayer();
    return;
  }

  try {
    const payload = await apiRequest(`/api/lobbies/${currentLobbyId}/rematch`, {
      method: "POST",
      body: JSON.stringify({
        playerId: clientProfile.id,
      }),
    });
    await refreshLobbies();
    if (payload.lobby.status === "waiting") {
      enterMultiplayerRoom(payload.lobby);
      return;
    }

    gameState.multiplayer.waitingForStart = true;
    gameState.multiplayer.matchEnded = false;
    gameState.paused = true;
    updateMatchHud();
    showOverlay(getWaitingOverlayState(payload.lobby));
  } catch (error) {
    showOverlay({
      eyebrow: "Rematch Failed",
      title: "Try Again",
      text: error.message,
      primaryLabel: "Rematch",
      action: "rematch",
    });
  }
}

function syncLobbyList(updatedLobby) {
  const existingIndex = lobbies.findIndex((lobby) => lobby.id === updatedLobby.id);
  if (existingIndex === -1) {
    lobbies = [updatedLobby, ...lobbies];
  } else {
    lobbies.splice(existingIndex, 1, updatedLobby);
  }
  setLobbies([...lobbies]);
}

function handleRemoteLoss(playerId) {
  if (!gameState?.multiplayer?.enabled || gameState.multiplayer.matchEnded) {
    return;
  }
  if (playerId === gameState.multiplayer.playerId) {
    return;
  }

  gameState.multiplayer.matchEnded = true;
  gameState.multiplayer.result = "win";
  gameState.resultRecorded = true;
  gameState.paused = true;
  recordMatchResult("win");
  showOverlay({
    eyebrow: "Match Finished",
    title: "Victory",
    text: "Your opponent topped out. You won the duel.",
    primaryLabel: "Rematch",
    action: "rematch",
  });
  updateMatchHud();
}

function syncCurrentLobbyView() {
  if (!currentLobbyId || !gameState?.multiplayer?.enabled) {
    return;
  }

  const lobby = getCurrentLobby();
  if (!lobby) {
    currentLobbyId = null;
    gameState = null;
    showScreen("menu");
    return;
  }

  gameState.multiplayer.isHost = lobby.hostId === clientProfile.id;
  if (lobby.status === "in-game" && gameState.multiplayer.waitingForStart) {
    applyMatchStart();
  }

  if (gameState.multiplayer.waitingForStart) {
    showOverlay(getWaitingOverlayState(lobby));
  }

  updateMatchHud();
}

async function heartbeat() {
  if (!currentLobbyId) {
    return;
  }

  try {
    const payload = await apiRequest(`/api/lobbies/${currentLobbyId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({
        playerId: clientProfile.id,
        playerName: clientProfile.name,
      }),
    });
    syncLobbyList(payload.lobby);
    syncCurrentLobbyView();
  } catch {}
}

function connectEventStream() {
  if (events) {
    events.close();
  }

  events = new EventSource("/api/events");
  events.onmessage = (event) => {
    try {
      handleServerEvent(JSON.parse(event.data));
    } catch {}
  };
  events.onerror = () => {
    matchHud.label.textContent = "Server Link";
    matchHud.text.textContent = "Connection lost. Reconnecting to the multiplayer server...";
  };
}

function handleServerEvent(message) {
  if (!message) {
    return;
  }

  switch (message.type) {
    case "lobby-sync":
      setLobbies(message.lobbies ?? []);
      syncCurrentLobbyView();
      break;
    case "match-start":
      if (message.lobbyId === currentLobbyId) {
        applyMatchStart();
      }
      break;
    case "state-update":
      if (
        gameState?.multiplayer?.enabled &&
        message.lobbyId === currentLobbyId &&
        message.playerId !== gameState.multiplayer.playerId
      ) {
        gameState.multiplayer.opponentId = message.playerId;
        gameState.multiplayer.opponentSnapshot = message.snapshot;
        updateMatchHud();
      }
      break;
    case "garbage":
      if (
        gameState?.multiplayer?.enabled &&
        message.lobbyId === currentLobbyId &&
        message.toPlayerId === gameState.multiplayer.playerId &&
        !gameState.multiplayer.matchEnded
      ) {
        gameState.multiplayer.pendingGarbage += message.lines;
        updateMatchHud();
      }
      break;
    case "player-lost":
      if (message.lobbyId === currentLobbyId) {
        handleRemoteLoss(message.playerId);
      }
      break;
    default:
      break;
  }
}

populateSkinPicker();
updateAccountUi();

if (inputs.blockSkin) {
  inputs.blockSkin.addEventListener("change", (event) => {
    setBlockSkin(event.target.value);
  });
}

buttons.createAccount.addEventListener("click", createAccount);
buttons.signIn.addEventListener("click", signInAccount);
buttons.signOut.addEventListener("click", useGuestProfile);
inputs.accountPassword?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    signInAccount();
  }
});

buttons.singleplayer.addEventListener("click", startSingleplayer);
buttons.multiplayer.addEventListener("click", async () => {
  await refreshLobbies();
  showScreen("lobby");
});
buttons.globalMenu.addEventListener("click", () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  gameState = null;
  hideOverlay();
  leaveCurrentLobby();
  showScreen("menu");
});
buttons.refreshLobbies.addEventListener("click", refreshLobbies);
buttons.createLobby.addEventListener("click", createLobby);
buttons.joinLobby.addEventListener("click", joinSelectedLobby);
buttons.pause.addEventListener("click", () => {
  if (!gameState) {
    return;
  }
  if (gameState.multiplayer?.enabled) {
    return;
  }
  setPaused(!gameState.paused);
});
buttons.overlayPrimary.addEventListener("click", () => {
  const action = buttons.overlayPrimary.dataset.action;
  switch (action) {
    case "resume":
      setPaused(false);
      break;
    case "start-match":
      startMultiplayerMatch();
      break;
    case "restart":
      resetGame(gameState.modeLabel);
      break;
    case "rematch":
      requestRematch();
      break;
    default:
      break;
  }
});
buttons.overlaySecondary.addEventListener("click", () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  gameState = null;
  hideOverlay();
  leaveCurrentLobby();
  showScreen("menu");
});

document.addEventListener("keydown", (event) => {
  if (!gameState || !screens.game.classList.contains("screen-active")) {
    return;
  }

  if (event.code === "Escape") {
    if (!gameState.multiplayer?.enabled) {
      setPaused(!gameState.paused);
    }
    return;
  }

  if (gameState.paused) {
    return;
  }

  switch (event.code) {
    case "ArrowLeft":
      event.preventDefault();
      movePiece(-1);
      break;
    case "ArrowRight":
      event.preventDefault();
      movePiece(1);
      break;
    case "ArrowDown":
      event.preventDefault();
      softDrop();
      break;
    case "ArrowUp":
    case "KeyX":
      event.preventDefault();
      rotatePiece();
      break;
    case "Space":
      event.preventDefault();
      hardDrop();
      break;
    default:
      break;
  }
});

window.addEventListener("beforeunload", () => {
  if (!currentLobbyId) {
    return;
  }

  navigator.sendBeacon(
    `/api/lobbies/${currentLobbyId}/leave`,
    JSON.stringify({ playerId: clientProfile.id }),
  );
});

connectEventStream();
heartbeatId = window.setInterval(heartbeat, HEARTBEAT_MS);
refreshLobbies();
showScreen("menu");
