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

const panels = {
  opponent: document.getElementById("opponentPanel"),
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
const STORAGE_KEYS = {
  profileBase: "codex-tetris-profile-base",
  sessionProfile: "codex-tetris-session-profile",
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

function getOrCreateProfile() {
  try {
    const existingSession = JSON.parse(
      sessionStorage.getItem(STORAGE_KEYS.sessionProfile) ?? "null",
    );
    if (existingSession?.id && existingSession?.name) {
      return existingSession;
    }
  } catch {}

  let baseName = `Player ${Math.floor(1000 + Math.random() * 9000)}`;
  try {
    const storedBase = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.profileBase) ?? "null",
    );
    if (storedBase?.baseName) {
      baseName = storedBase.baseName;
    } else {
      localStorage.setItem(
        STORAGE_KEYS.profileBase,
        JSON.stringify({ baseName }),
      );
    }
  } catch {
    localStorage.setItem(
      STORAGE_KEYS.profileBase,
      JSON.stringify({ baseName }),
    );
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
    return;
  }
  isSyncingLobbies = true;
  try {
    const payload = await apiRequest("/api/lobbies");
    setLobbies(payload.lobbies ?? []);
  } catch (error) {
    lobbyElements.detailName.textContent = "Server unavailable";
    lobbyElements.detailText.textContent = error.message;
    lobbyElements.detailStats.innerHTML = "";
    buttons.joinLobby.disabled = true;
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
    lastFrame: 0,
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
  drawNextPiece();

  if (collides(gameState.active, gameState.board)) {
    handlePlayerLoss();
  }
}

function updateHud() {
  hud.score.textContent = String(gameState.score);
  hud.lines.textContent = String(gameState.lines);
  hud.level.textContent = String(gameState.level);
}

function getCurrentLobby() {
  return lobbies.find((lobby) => lobby.id === currentLobbyId) ?? null;
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
  if (gameState?.multiplayer?.enabled) {
    const multiplayer = gameState.multiplayer;
    multiplayer.matchEnded = true;
    multiplayer.result = "loss";
    multiplayer.waitingForStart = false;
    gameState.paused = true;
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
      gameState.dropCounter = 0;
      stepDown();
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
    enterMultiplayerRoom(payload.lobby);
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
    enterMultiplayerRoom(payload.lobby);
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

  const enoughPlayers = lobby.players.length >= 2;
  if (gameState.multiplayer.waitingForStart) {
    showOverlay({
      eyebrow: "Multiplayer Lobby",
      title: enoughPlayers && gameState.multiplayer.isHost ? "Ready to Start" : "Waiting for Players",
      text: enoughPlayers
        ? gameState.multiplayer.isHost
          ? "Another device joined the room. Start the match whenever you're ready."
          : "The room is full. Waiting for the host to start the duel."
        : "Share this server URL with another device and join the same lobby there.",
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
    enterMultiplayerRoom(payload.lobby);
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
  gameState.paused = true;
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
    const enoughPlayers = lobby.players.length >= 2;
    showOverlay({
      eyebrow: "Multiplayer Lobby",
      title: enoughPlayers && gameState.multiplayer.isHost ? "Ready to Start" : "Waiting for Players",
      text: enoughPlayers
        ? gameState.multiplayer.isHost
          ? "Another device has joined. Start the duel when you want."
          : "The room is full. Waiting for the host to start."
        : "This room needs one more player connected to the same server.",
      primaryLabel: gameState.multiplayer.isHost ? "Start Match" : "Waiting...",
      action: gameState.multiplayer.isHost ? "start-match" : "noop",
    });
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
