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

const COLS = 10;
const ROWS = 20;
const BLOCK = canvas.width / COLS;
const NEXT_BLOCK = nextCanvas.width / 6;
const COLORS = {
  I: "#39cfff",
  J: "#4d72ff",
  L: "#ff9b36",
  O: "#ffe066",
  S: "#56e0c6",
  T: "#c86bff",
  Z: "#ff6778",
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
const RULESETS = ["Classic", "Sprint", "Marathon", "Duel"];
const LOBBY_NAMES = [
  "Neon Stackers",
  "Drop Dynasty",
  "Hard Drop Heroes",
  "Tetromino Titans",
  "Grid Runners",
  "Last Brick Standing",
];
let gameState = null;
let selectedLobbyId = null;
let lobbies = [];
let animationFrameId = null;

function showScreen(screenName) {
  Object.values(screens).forEach((screen) =>
    screen.classList.remove("screen-active"),
  );
  screens[screenName].classList.add("screen-active");
  const inGame = screenName === "game";
  buttons.globalMenu.hidden = !inGame && screenName === "menu";
}

function createMatrix(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(0));
}

function randomPieceType() {
  const pieceTypes = Object.keys(SHAPES);
  return pieceTypes[Math.floor(Math.random() * pieceTypes.length)];
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

function buildBag() {
  const bag = Object.keys(SHAPES);
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
  }
  return bag;
}

function createPieceQueue() {
  let bag = buildBag();
  return function nextType() {
    if (!bag.length) {
      bag = buildBag();
    }
    return bag.pop();
  };
}

function createLobbyData() {
  return Array.from({ length: 5 }, (_, index) => {
    const maxPlayers = Math.random() > 0.5 ? 2 : 4;
    const players = Math.max(1, Math.floor(Math.random() * maxPlayers) + 1);
    return {
      id: `${Date.now()}-${index}`,
      name: LOBBY_NAMES[Math.floor(Math.random() * LOBBY_NAMES.length)],
      region: REGIONS[Math.floor(Math.random() * REGIONS.length)],
      ruleset: RULESETS[Math.floor(Math.random() * RULESETS.length)],
      players,
      maxPlayers,
      ping: 18 + Math.floor(Math.random() * 90),
    };
  });
}

function renderLobbies() {
  lobbyElements.list.innerHTML = "";
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
        <span>${lobby.players}/${lobby.maxPlayers} Players</span>
        <span>${lobby.ping}ms</span>
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

  lobbyElements.detailName.textContent = lobby.name;
  lobbyElements.detailText.textContent =
    "A browser-style placeholder lobby with room info, region, and quick-join flow. This is the menu side of multiplayer, ready for future networking.";
  lobbyElements.detailStats.innerHTML = `
    <span>Ruleset: ${lobby.ruleset}</span>
    <span>Players: ${lobby.players}/${lobby.maxPlayers}</span>
    <span>Latency: ${lobby.ping}ms</span>
  `;
  buttons.joinLobby.disabled = false;
}

function refreshLobbies() {
  lobbies = createLobbyData();
  selectedLobbyId = lobbies[0]?.id ?? null;
  renderLobbies();
  if (selectedLobbyId) {
    selectLobby(selectedLobbyId);
  }
}

function drawCell(target, x, y, color, size) {
  target.fillStyle = color;
  target.fillRect(x * size, y * size, size, size);
  target.fillStyle = "rgba(255,255,255,0.12)";
  target.fillRect(x * size + 3, y * size + 3, size - 6, size - 6);
  target.strokeStyle = "rgba(0,0,0,0.22)";
  target.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
}

function drawGhostPiece() {
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

  gameState.active.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawCell(
          context,
          gameState.active.x + x,
          gameState.active.y + y,
          COLORS[gameState.active.type],
          BLOCK,
        );
      }
    });
  });
}

function drawNextPiece() {
  nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextContext.fillStyle = "#071118";
  nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  const preview = clonePiece(gameState.nextType);
  const offsetX = Math.floor((6 - preview.matrix[0].length) / 2);
  const offsetY = Math.floor((6 - preview.matrix.length) / 2);

  preview.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawCell(
          nextContext,
          offsetX + x,
          offsetY + y,
          COLORS[preview.type],
          NEXT_BLOCK,
        );
      }
    });
  });
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
      if (value) {
        board[active.y + y][active.x + x] = COLORS[active.type];
      }
    });
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
  }
}

function spawnPiece() {
  const nextType = gameState.nextType;
  gameState.nextType = gameState.nextRandomType();
  gameState.active = clonePiece(nextType);
  gameState.active.x = Math.floor(
    (COLS - gameState.active.matrix[0].length) / 2,
  );
  gameState.active.y = 0;
  drawNextPiece();

  if (collides(gameState.active, gameState.board)) {
    endGame(
      "Game Over",
      "The stack hit the ceiling. Start another run when you're ready.",
    );
  }
}

function resetGame(modeLabel) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  gameState = {
    board: createMatrix(COLS, ROWS),
    active: null,
    nextRandomType: createPieceQueue(),
    nextType: randomPieceType(),
    score: 0,
    lines: 0,
    level: 1,
    dropCounter: 0,
    dropInterval: 850,
    lastFrame: 0,
    paused: false,
    modeLabel,
  };

  hud.mode.textContent = modeLabel;
  buttons.pause.textContent = "Pause";
  hideOverlay();
  updateHud();
  spawnPiece();
  drawBoard();
  drawNextPiece();
  gameLoop(0);
}

function updateHud() {
  hud.score.textContent = String(gameState.score);
  hud.lines.textContent = String(gameState.lines);
  hud.level.textContent = String(gameState.level);
}

function hideOverlay() {
  overlay.root.classList.add("hidden");
}

function showOverlay(eyebrow, title, text, primaryLabel) {
  overlay.eyebrow.textContent = eyebrow;
  overlay.title.textContent = title;
  overlay.text.textContent = text;
  buttons.overlayPrimary.textContent = primaryLabel;
  overlay.root.classList.remove("hidden");
}

function endGame(title, text) {
  gameState.paused = true;
  showOverlay("Run Ended", title, text, "Play Again");
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

  animationFrameId = requestAnimationFrame(gameLoop);
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
  if (!gameState) {
    return;
  }
  gameState.paused = paused;
  buttons.pause.textContent = paused ? "Resume" : "Pause";
  if (paused) {
    showOverlay(
      "Paused",
      "Game Paused",
      "Take a breather, then jump back into the stack.",
      "Resume",
    );
  } else {
    hideOverlay();
  }
}

function startSingleplayer() {
  showScreen("game");
  resetGame("Singleplayer");
}

function startMultiplayerPreview(lobby) {
  showScreen("game");
  resetGame(`Lobby: ${lobby.name}`);
  showOverlay(
    "Multiplayer Preview",
    "Lobby Joined",
    `You joined ${lobby.name}. This prototype drops you into a local board after the lobby finder flow.`,
    "Start Match",
  );
  gameState.paused = true;
  buttons.pause.textContent = "Resume";
}

function createLobby() {
  const newLobby = {
    id: `${Date.now()}-created`,
    name: "Your Custom Lobby",
    region: "USE",
    ruleset: "Classic",
    players: 1,
    maxPlayers: 2,
    ping: 12,
  };
  lobbies.unshift(newLobby);
  selectedLobbyId = newLobby.id;
  renderLobbies();
  selectLobby(newLobby.id);
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
  showScreen("menu");
});
buttons.refreshLobbies.addEventListener("click", refreshLobbies);
buttons.createLobby.addEventListener("click", createLobby);
buttons.joinLobby.addEventListener("click", () => {
  const lobby = lobbies.find((entry) => entry.id === selectedLobbyId);
  if (lobby) {
    startMultiplayerPreview(lobby);
  }
});
buttons.pause.addEventListener("click", () => {
  if (!gameState) {
    return;
  }
  setPaused(!gameState.paused);
});
buttons.overlayPrimary.addEventListener("click", () => {
  if (!gameState) {
    startSingleplayer();
    return;
  }

  if (overlay.title.textContent === "Game Paused") {
    setPaused(false);
    return;
  }

  if (overlay.title.textContent === "Lobby Joined") {
    setPaused(false);
    return;
  }

  resetGame(gameState.modeLabel);
});
buttons.overlaySecondary.addEventListener("click", () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  gameState = null;
  hideOverlay();
  showScreen("menu");
});

document.addEventListener("keydown", (event) => {
  if (!gameState || !screens.game.classList.contains("screen-active")) {
    return;
  }

  if (event.code === "Escape") {
    setPaused(!gameState.paused);
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

refreshLobbies();
showScreen("menu");
