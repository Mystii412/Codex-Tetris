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
};

const lobbyElements = {
  list: document.getElementById("lobbyList"),
  detailName: document.getElementById("lobbyDetailName"),
  detailText: document.getElementById("lobbyDetailText"),
  detailStats: document.getElementById("lobbyDetailStats"),
};

const hud = {
  mode: document.getElementById("gameModeLabel"),
  score: document.getElementById("scoreValue"),
  lines: document.getElementById("linesValue"),
  level: document.getElementById("levelValue"),
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
const STORAGE_KEYS = {
  lobbies: "codex-tetris-lobbies",
  profile: "codex-tetris-profile",
  sessionProfile: "codex-tetris-session-profile",
};
const HEARTBEAT_MS = 5000;
const LOBBY_STALE_MS = 20000;
const SNAPSHOT_INTERVAL_MS = 150;
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
const REGIONS = ["USE", "USW", "EU", "APAC"];
const RULESETS = ["Classic Duel", "Sprint Duel", "Marathon Duel"];
const LOBBY_NAMES = [
  "Neon Stackers",
  "Drop Dynasty",
  "Hard Drop Heroes",
  "Tetromino Titans",
  "Grid Runners",
  "Last Brick Standing",
];

const multiplayerChannel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("codex-tetris-multiplayer")
    : null;

let gameState = null;
let selectedLobbyId = null;
let lobbies = [];
let animationFrameId = null;
let heartbeatId = null;
let currentLobbyId = null;
let suppressLobbyLeave = false;
const clientProfile = getOrCreateProfile();

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

function readStoredLobbies() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.lobbies) ?? "[]");
  } catch {
    return [];
  }
}

function writeStoredLobbies(nextLobbies) {
  localStorage.setItem(STORAGE_KEYS.lobbies, JSON.stringify(nextLobbies));
}

function normalizeLobby(lobby, now = Date.now()) {
  const players = (lobby.players ?? [])
    .filter(
      (player) =>
        now - (player.lastSeen ?? player.joinedAt ?? 0) < LOBBY_STALE_MS,
    )
    .sort((left, right) => (left.joinedAt ?? 0) - (right.joinedAt ?? 0));

  if (!players.length) {
    return null;
  }

  return {
    ...lobby,
    players,
    hostId: players.some((player) => player.id === lobby.hostId)
      ? lobby.hostId
      : players[0].id,
    status:
      lobby.status === "in-game" && players.length > 1
        ? "in-game"
        : lobby.status === "finished"
          ? "finished"
          : "waiting",
    maxPlayers: lobby.maxPlayers ?? 2,
  };
}

function loadLobbies() {
  const normalized = readStoredLobbies()
    .map((lobby) => normalizeLobby(lobby))
    .filter(Boolean);
  writeStoredLobbies(normalized);
  return normalized;
}

function updateLobbies(mutator) {
  const nextLobbies = mutator(loadLobbies()) ?? [];
  writeStoredLobbies(nextLobbies);
  lobbies = nextLobbies;
  broadcastMessage({ type: "lobby-sync" });
  refreshLobbies();
  return nextLobbies;
}

function broadcastMessage(message) {
  if (multiplayerChannel) {
    multiplayerChannel.postMessage(message);
  }
}

function getOrCreateProfile() {
  try {
    const sessionProfile = JSON.parse(
      sessionStorage.getItem(STORAGE_KEYS.sessionProfile) ?? "null",
    );
    if (sessionProfile?.id && sessionProfile?.name) {
      return sessionProfile;
    }
  } catch {}

  let baseName = `Player ${Math.floor(1000 + Math.random() * 9000)}`;
  try {
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.profile) ?? "null",
    );
    if (stored?.baseName) {
      baseName = stored.baseName;
    } else if (stored?.name) {
      baseName = stored.name;
      localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify({ baseName }));
    } else {
      localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify({ baseName }));
    }
  } catch {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify({ baseName }));
  }

  const profile = {
    id:
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : `player-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: `${baseName} ${Math.floor(10 + Math.random() * 90)}`,
  };
  sessionStorage.setItem(STORAGE_KEYS.sessionProfile, JSON.stringify(profile));
  return profile;
}

function randomFrom(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function refreshLobbies() {
  lobbies = loadLobbies();
  if (
    selectedLobbyId &&
    !lobbies.some((lobby) => lobby.id === selectedLobbyId)
  ) {
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
    lobbyElements.detailName.textContent = "Choose a lobby";
    lobbyElements.detailText.textContent =
      "Create a room in one tab, then join it from another tab or browser window to play a live duel.";
    lobbyElements.detailStats.innerHTML = "";
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
      <p id="emptyLobbyText">Create a lobby here, then open this page in another tab to join and play.</p>
    `;
    lobbyElements.list.appendChild(empty);
    return;
  }

  lobbies.forEach((lobby) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `lobby-card${lobby.id === selectedLobbyId ? " selected" : ""}`;
    const playerNames = lobby.players.map((player) => player.name).join(" vs ");
    button.innerHTML = `
      <div class="lobby-card-top">
        <h3>${lobby.name}</h3>
        <span class="pill">${lobby.region}</span>
      </div>
      <div class="lobby-meta">
        <span>${lobby.ruleset}</span>
        <span>${lobby.players.length}/${lobby.maxPlayers} Players</span>
        <span>${lobby.status === "in-game" ? "Match Live" : "Waiting"}</span>
      </div>
      <div class="lobby-meta">
        <span>${playerNames}</span>
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

  const currentPlayer = lobby.players.find(
    (player) => player.id === clientProfile.id,
  );
  const isFull = lobby.players.length >= lobby.maxPlayers && !currentPlayer;
  const readyToStart = lobby.players.length >= 2;

  lobbyElements.detailName.textContent = lobby.name;
  lobbyElements.detailText.textContent = currentPlayer
    ? "You are already in this lobby. Rejoin the match room or wait for the host to start."
    : "Join from another tab or window to turn this into a real head-to-head browser match.";
  lobbyElements.detailStats.innerHTML = `
    <span>Ruleset: ${lobby.ruleset}</span>
    <span>Players: ${lobby.players.map((player) => player.name).join(" / ")}</span>
    <span>Status: ${lobby.status === "in-game" ? "Match Live" : readyToStart ? "Ready to Start" : "Waiting for Opponent"}</span>
  `;
  buttons.joinLobby.disabled = isFull;
  buttons.joinLobby.textContent = currentPlayer
    ? "Rejoin Lobby"
    : "Join Selected Lobby";
}

function drawCell(target, x, y, color, size) {
  target.fillStyle = color;
  target.fillRect(x * size, y * size, size, size);
  target.fillStyle = "rgba(255,255,255,0.12)";
  target.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  target.strokeStyle = "rgba(0,0,0,0.22)";
  target.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
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
      context.fillStyle = COLORS[gameState.active.type];
      context.fillRect(cellX + 6, cellY + 6, BLOCK - 12, BLOCK - 12);
      context.strokeStyle = "rgba(255, 255, 255, 0.85)";
      context.lineWidth = 2;
      context.strokeRect(cellX + 4, cellY + 4, BLOCK - 8, BLOCK - 8);
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
    opponentContext.fillText(
      "Waiting...",
      opponentCanvas.width / 2,
      opponentCanvas.height / 2,
    );
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

function sendGarbage(lines) {
  const multiplayer = gameState?.multiplayer;
  if (!multiplayer?.enabled || !lines || !multiplayer.opponentId) {
    return;
  }
  broadcastMessage({
    type: "garbage",
    lobbyId: multiplayer.lobbyId,
    fromPlayerId: multiplayer.playerId,
    toPlayerId: multiplayer.opponentId,
    lines,
  });
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

  for (
    let index = 0;
    index < gameState.multiplayer.pendingGarbage;
    index += 1
  ) {
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

function spawnPiece() {
  applyPendingGarbage();
  const nextType = gameState.nextType;
  gameState.nextType = gameState.nextRandomType();
  gameState.active = clonePiece(nextType);
  gameState.active.x = Math.floor(
    (COLS - gameState.active.matrix[0].length) / 2,
  );
  gameState.active.y = 0;
  drawNextPiece();

  if (collides(gameState.active, gameState.board)) {
    handlePlayerLoss();
  }
}

function createMultiplayerMeta(config) {
  if (!config) {
    return {
      enabled: false,
      lastSnapshotAt: 0,
      opponentSnapshot: null,
    };
  }

  return {
    enabled: true,
    lobbyId: config.lobbyId,
    playerId: clientProfile.id,
    playerName: clientProfile.name,
    opponentId: null,
    opponentSnapshot: null,
    pendingGarbage: 0,
    seed: config.seed,
    isHost: config.hostId === clientProfile.id,
    waitingForStart: !config.started,
    matchEnded: false,
    result: null,
    started: Boolean(config.started),
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
    lastFrame: 0,
    paused: Boolean(multiplayerConfig && !multiplayerConfig.started),
    modeLabel,
    random: randomFn,
    multiplayer: createMultiplayerMeta(multiplayerConfig),
  };

  hud.mode.textContent = modeLabel;
  buttons.pause.textContent = gameState.paused ? "Resume" : "Pause";
  hideOverlay();
  updateHud();
  updateMatchHud();
  spawnPiece();
  drawBoard();
  drawNextPiece();
  drawOpponentBoard();
  gameLoop(0);
}

function updateHud() {
  hud.score.textContent = String(gameState.score);
  hud.lines.textContent = String(gameState.lines);
  hud.level.textContent = String(gameState.level);
}

function currentLobbyPlayers() {
  return lobbies.find((lobby) => lobby.id === currentLobbyId)?.players ?? [];
}

function updateMatchHud() {
  if (!gameState?.multiplayer?.enabled) {
    matchHud.label.textContent = "Solo Run";
    matchHud.text.textContent = "Singleplayer mode is active.";
    drawOpponentBoard();
    return;
  }

  const multiplayer = gameState.multiplayer;
  const opponentName =
    multiplayer.opponentSnapshot?.name ??
    currentLobbyPlayers().find((player) => player.id !== clientProfile.id)
      ?.name ??
    "Opponent";

  if (multiplayer.matchEnded) {
    matchHud.label.textContent =
      multiplayer.result === "win" ? "Victory" : "Defeat";
    matchHud.text.textContent =
      multiplayer.result === "win"
        ? `You outlasted ${opponentName}.`
        : `${opponentName} survived the duel.`;
  } else if (multiplayer.waitingForStart) {
    matchHud.label.textContent = "Lobby Room";
    matchHud.text.textContent = multiplayer.isHost
      ? "Wait for another player, then press Start Match."
      : "Connected to the room. Waiting for the host to launch the duel.";
  } else {
    matchHud.label.textContent = `${clientProfile.name} vs ${opponentName}`;
    matchHud.text.textContent = multiplayer.pendingGarbage
      ? `${multiplayer.pendingGarbage} garbage line(s) queued against you.`
      : "Live match synced across tabs. Clear doubles, triples, and tetrises to attack.";
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

function handlePlayerLoss() {
  if (gameState?.multiplayer?.enabled) {
    const multiplayer = gameState.multiplayer;
    multiplayer.matchEnded = true;
    multiplayer.result = "loss";
    multiplayer.waitingForStart = false;
    gameState.paused = true;
    broadcastMessage({
      type: "player-lost",
      lobbyId: multiplayer.lobbyId,
      playerId: multiplayer.playerId,
    });
    showOverlay({
      eyebrow: "Match Finished",
      title: "Defeat",
      text: "Your stack topped out. The other board keeps running until the result locks in.",
      primaryLabel: "Rematch",
      action: "rematch",
    });
    finalizeLobbyStatus("finished");
    updateMatchHud();
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

function finalizeLobbyStatus(status, extra = {}) {
  if (!currentLobbyId) {
    return;
  }

  updateLobbies((existing) =>
    existing.map((lobby) =>
      lobby.id === currentLobbyId
        ? {
            ...lobby,
            status,
            ...extra,
          }
        : lobby,
    ),
  );
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
      gameState.dropCounter = 0;
      stepDown();
    }
    drawBoard();
  }

  maybeBroadcastSnapshot(time);
  animationFrameId = requestAnimationFrame(gameLoop);
}

function maybeBroadcastSnapshot(time) {
  const multiplayer = gameState?.multiplayer;
  if (!multiplayer?.enabled || multiplayer.waitingForStart) {
    return;
  }

  if (time - multiplayer.lastSnapshotAt < SNAPSHOT_INTERVAL_MS) {
    return;
  }

  multiplayer.lastSnapshotAt = time;
  broadcastMessage({
    type: "state-update",
    lobbyId: multiplayer.lobbyId,
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
      result: multiplayer.result,
    },
  });
}

function stepDown() {
  if (!gameState || gameState.paused) {
    return;
  }
  if (!collides(gameState.active, gameState.board, 0, 1)) {
    gameState.active.y += 1;
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
  stepDown();
}

function movePiece(direction) {
  if (!gameState || gameState.paused) {
    return;
  }
  if (!collides(gameState.active, gameState.board, direction, 0)) {
    gameState.active.x += direction;
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
      gameState.active.matrix = rotated;
      gameState.active.x += offset;
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
    updateHud();
    drawBoard();
  } else {
    stepDown();
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

function leaveCurrentLobby() {
  if (!currentLobbyId || suppressLobbyLeave) {
    return;
  }

  const lobbyId = currentLobbyId;
  currentLobbyId = null;
  updateLobbies((existing) =>
    existing
      .map((lobby) => {
        if (lobby.id !== lobbyId) {
          return lobby;
        }
        const players = lobby.players.filter(
          (player) => player.id !== clientProfile.id,
        );
        if (!players.length) {
          return null;
        }
        return {
          ...lobby,
          players,
          hostId: players[0].id,
          status:
            players.length > 1 && lobby.status === "in-game"
              ? "in-game"
              : "waiting",
        };
      })
      .filter(Boolean),
  );
}

function startSingleplayer() {
  leaveCurrentLobby();
  showScreen("game");
  resetGame("Singleplayer");
}

function syncLobbyMembership(lobbyId) {
  updateLobbies((existing) =>
    existing.map((lobby) => {
      if (lobby.id !== lobbyId) {
        return lobby;
      }

      const existingPlayer = lobby.players.find(
        (player) => player.id === clientProfile.id,
      );
      const players = existingPlayer
        ? lobby.players.map((player) =>
            player.id === clientProfile.id
              ? { ...player, name: clientProfile.name, lastSeen: Date.now() }
              : player,
          )
        : [
            ...lobby.players,
            {
              id: clientProfile.id,
              name: clientProfile.name,
              joinedAt: Date.now(),
              lastSeen: Date.now(),
            },
          ];

      return {
        ...lobby,
        players: players.slice(0, lobby.maxPlayers),
      };
    }),
  );
}

function enterMultiplayerRoom(lobby) {
  currentLobbyId = lobby.id;
  showScreen("game");
  resetGame(`Lobby: ${lobby.name}`, {
    lobbyId: lobby.id,
    seed: lobby.seed ?? Math.floor(Math.random() * 2147483647),
    started: lobby.status === "in-game",
    hostId: lobby.hostId,
  });
  syncLobbyMembership(lobby.id);

  const enoughPlayers = currentLobbyPlayers().length >= 2;
  if (gameState.multiplayer.waitingForStart) {
    showOverlay({
      eyebrow: "Multiplayer Lobby",
      title:
        enoughPlayers && gameState.multiplayer.isHost
          ? "Ready to Start"
          : "Waiting for Players",
      text: enoughPlayers
        ? gameState.multiplayer.isHost
          ? "Another player has joined. Launch the duel whenever you're ready."
          : "The room is full. Waiting for the host to launch the duel."
        : "Open this page in another tab or browser window and join the same lobby to start playing.",
      primaryLabel: gameState.multiplayer.isHost ? "Start Match" : "Waiting...",
      action: gameState.multiplayer.isHost ? "start-match" : "noop",
    });
  } else {
    hideOverlay();
    gameState.paused = false;
    buttons.pause.textContent = "Live Match";
  }
  updateMatchHud();
}

function createLobby() {
  leaveCurrentLobby();
  const newLobby = {
    id:
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : `lobby-${Date.now()}`,
    name: randomFrom(LOBBY_NAMES),
    region: randomFrom(REGIONS),
    ruleset: randomFrom(RULESETS),
    players: [
      {
        id: clientProfile.id,
        name: clientProfile.name,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
      },
    ],
    maxPlayers: 2,
    hostId: clientProfile.id,
    status: "waiting",
    seed: Math.floor(Math.random() * 2147483647),
  };

  updateLobbies((existing) => [newLobby, ...existing]);
  selectedLobbyId = newLobby.id;
  enterMultiplayerRoom(newLobby);
}

function joinSelectedLobby() {
  const selected = lobbies.find((entry) => entry.id === selectedLobbyId);
  if (!selected) {
    return;
  }

  const alreadyInLobby = selected.players.some(
    (player) => player.id === clientProfile.id,
  );
  const full = selected.players.length >= selected.maxPlayers;
  if (full && !alreadyInLobby) {
    refreshLobbies();
    return;
  }

  syncLobbyMembership(selected.id);
  const latestLobby = loadLobbies().find((entry) => entry.id === selected.id);
  if (latestLobby) {
    enterMultiplayerRoom(latestLobby);
  }
}

function startMultiplayerMatch() {
  if (!gameState?.multiplayer?.enabled || !gameState.multiplayer.isHost) {
    return;
  }
  const lobby = loadLobbies().find((entry) => entry.id === currentLobbyId);
  if (!lobby || lobby.players.length < 2) {
    updateMatchHud();
    showOverlay({
      eyebrow: "Multiplayer Lobby",
      title: "Waiting for Players",
      text: "You need one more player in the room before the duel can begin.",
      primaryLabel: "Start Match",
      action: "start-match",
    });
    return;
  }

  const startedAt = Date.now();
  updateLobbies((existing) =>
    existing.map((entry) =>
      entry.id === currentLobbyId
        ? { ...entry, status: "in-game", startedAt }
        : entry,
    ),
  );
  broadcastMessage({
    type: "match-start",
    lobbyId: currentLobbyId,
    startedAt,
  });
  applyMatchStart();
}

function applyMatchStart() {
  if (!gameState?.multiplayer?.enabled) {
    return;
  }
  gameState.multiplayer.waitingForStart = false;
  gameState.multiplayer.started = true;
  gameState.paused = false;
  buttons.pause.textContent = "Live Match";
  hideOverlay();
  updateMatchHud();
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
  gameState.paused = true;
  showOverlay({
    eyebrow: "Match Finished",
    title: "Victory",
    text: "Your opponent topped out. You won the duel.",
    primaryLabel: "Rematch",
    action: "rematch",
  });
  finalizeLobbyStatus("finished");
  updateMatchHud();
}

function syncCurrentLobbyView() {
  if (!currentLobbyId || !gameState?.multiplayer?.enabled) {
    return;
  }

  const lobby = loadLobbies().find((entry) => entry.id === currentLobbyId);
  if (!lobby) {
    suppressLobbyLeave = true;
    currentLobbyId = null;
    suppressLobbyLeave = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    gameState = null;
    showScreen("menu");
    return;
  }

  gameState.multiplayer.isHost = lobby.hostId === clientProfile.id;
  if (lobby.status === "in-game" && gameState.multiplayer.waitingForStart) {
    applyMatchStart();
  }
  if (gameState.multiplayer.waitingForStart) {
    const enoughPlayers = lobby.players.length >= 2;
    showOverlay({
      eyebrow: "Multiplayer Lobby",
      title:
        enoughPlayers && gameState.multiplayer.isHost
          ? "Ready to Start"
          : "Waiting for Players",
      text: enoughPlayers
        ? gameState.multiplayer.isHost
          ? "Another player has joined. Start the duel when you want."
          : "The lobby is full. Waiting for the host to start the duel."
        : "This room needs one more player. Open another tab and join it there.",
      primaryLabel: gameState.multiplayer.isHost ? "Start Match" : "Waiting...",
      action: gameState.multiplayer.isHost ? "start-match" : "noop",
    });
  }
  updateMatchHud();
}

function heartbeat() {
  if (!currentLobbyId) {
    return;
  }
  syncLobbyMembership(currentLobbyId);
  syncCurrentLobbyView();
}

function handleMatchMessage(message) {
  if (!message || (message.lobbyId && message.lobbyId !== currentLobbyId)) {
    if (message?.type === "lobby-sync") {
      refreshLobbies();
    }
    return;
  }

  switch (message.type) {
    case "lobby-sync":
      refreshLobbies();
      syncCurrentLobbyView();
      break;
    case "match-start":
      refreshLobbies();
      syncCurrentLobbyView();
      applyMatchStart();
      break;
    case "state-update":
      if (
        gameState?.multiplayer?.enabled &&
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
        message.toPlayerId === gameState.multiplayer.playerId &&
        !gameState.multiplayer.matchEnded
      ) {
        gameState.multiplayer.pendingGarbage += message.lines;
        updateMatchHud();
      }
      break;
    case "player-lost":
      handleRemoteLoss(message.playerId);
      break;
    default:
      break;
  }
}

buttons.singleplayer.addEventListener("click", startSingleplayer);
buttons.multiplayer.addEventListener("click", () => {
  refreshLobbies();
  showScreen("lobby");
});
buttons.globalMenu.addEventListener("click", () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  gameState = null;
  leaveCurrentLobby();
  hideOverlay();
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
      if (currentLobbyId) {
        updateLobbies((existing) =>
          existing.map((lobby) =>
            lobby.id === currentLobbyId
              ? {
                  ...lobby,
                  status: "waiting",
                  seed: Math.floor(Math.random() * 2147483647),
                }
              : lobby,
          ),
        );
        const lobby = loadLobbies().find(
          (entry) => entry.id === currentLobbyId,
        );
        if (lobby) {
          enterMultiplayerRoom(lobby);
        }
      } else {
        startSingleplayer();
      }
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

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEYS.lobbies) {
    refreshLobbies();
    syncCurrentLobbyView();
  }
});

window.addEventListener("beforeunload", () => {
  if (currentLobbyId) {
    leaveCurrentLobby();
  }
});

if (multiplayerChannel) {
  multiplayerChannel.addEventListener("message", (event) =>
    handleMatchMessage(event.data),
  );
}

heartbeatId = window.setInterval(heartbeat, HEARTBEAT_MS);
refreshLobbies();
showScreen("menu");
