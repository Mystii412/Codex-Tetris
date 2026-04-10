const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { URL } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PLAYER_STALE_MS = 20000;
const CLEANUP_INTERVAL_MS = 5000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const lobbies = new Map();
const eventClients = new Set();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      const contentType = request.headers["content-type"] || "";
      try {
        if (contentType.includes("application/json")) {
          resolve(JSON.parse(raw));
          return;
        }

        const trimmed = raw.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          resolve(JSON.parse(trimmed));
          return;
        }

        resolve({ raw: trimmed });
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function randomFrom(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function createLobbyName() {
  return randomFrom([
    "Neon Stackers",
    "Drop Dynasty",
    "Hard Drop Heroes",
    "Tetromino Titans",
    "Grid Runners",
    "Last Brick Standing",
  ]);
}

function createRuleset() {
  return randomFrom(["Classic Duel", "Sprint Duel", "Marathon Duel"]);
}

function createRegion() {
  return randomFrom(["USE", "USW", "EU", "APAC"]);
}

function isPlayerActive(player, now = Date.now()) {
  return now - (player.lastSeen || player.joinedAt || 0) < PLAYER_STALE_MS;
}

function serializeLobby(lobby) {
  return {
    id: lobby.id,
    name: lobby.name,
    region: lobby.region,
    ruleset: lobby.ruleset,
    maxPlayers: lobby.maxPlayers,
    hostId: lobby.hostId,
    status: lobby.status,
    seed: lobby.seed,
    startedAt: lobby.startedAt || null,
    players: lobby.players.map((player) => ({
      id: player.id,
      name: player.name,
      joinedAt: player.joinedAt,
      lastSeen: player.lastSeen,
    })),
  };
}

function serializeLobbies() {
  return Array.from(lobbies.values())
    .map((lobby) => serializeLobby(lobby))
    .sort((left, right) => (right.startedAt || 0) - (left.startedAt || 0));
}

function broadcast(message) {
  const payload = `data: ${JSON.stringify(message)}\n\n`;
  for (const client of eventClients) {
    client.write(payload);
  }
}

function notifyLobbySync() {
  broadcast({
    type: "lobby-sync",
    lobbies: serializeLobbies(),
  });
}

function cleanupLobbies() {
  let changed = false;
  const now = Date.now();

  for (const [lobbyId, lobby] of lobbies.entries()) {
    lobby.players = lobby.players.filter((player) => isPlayerActive(player, now));

    if (!lobby.players.length) {
      lobbies.delete(lobbyId);
      changed = true;
      continue;
    }

    if (!lobby.players.some((player) => player.id === lobby.hostId)) {
      lobby.hostId = lobby.players[0].id;
      changed = true;
    }

    if (lobby.status === "in-game" && lobby.players.length < 2) {
      lobby.status = "waiting";
      lobby.startedAt = null;
      changed = true;
    }
  }

  if (changed) {
    notifyLobbySync();
  }
}

function requirePlayer(body) {
  if (!body.playerId || !body.playerName) {
    throw new Error("playerId and playerName are required.");
  }
}

function getLobby(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    throw new Error("Lobby not found.");
  }
  return lobby;
}

function upsertPlayer(lobby, playerId, playerName) {
  const existing = lobby.players.find((player) => player.id === playerId);
  if (existing) {
    existing.name = playerName;
    existing.lastSeen = Date.now();
    return existing;
  }

  if (lobby.players.length >= lobby.maxPlayers) {
    throw new Error("Lobby is full.");
  }

  const player = {
    id: playerId,
    name: playerName,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
  };
  lobby.players.push(player);
  return player;
}

function leaveLobby(lobbyId, playerId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    return;
  }

  lobby.players = lobby.players.filter((player) => player.id !== playerId);
  if (!lobby.players.length) {
    lobbies.delete(lobbyId);
    notifyLobbySync();
    return;
  }

  if (!lobby.players.some((player) => player.id === lobby.hostId)) {
    lobby.hostId = lobby.players[0].id;
  }

  if (lobby.status === "in-game" && lobby.players.length < 2) {
    lobby.status = "waiting";
    lobby.startedAt = null;
  }

  notifyLobbySync();
}

function serveStatic(requestPath, response) {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relativePath);

  if (!filePath.startsWith(ROOT)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      sendJson(response, 404, { error: "File not found." });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(buffer);
  });
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/lobbies") {
    sendJson(response, 200, { lobbies: serializeLobbies() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    response.write("\n");
    eventClients.add(response);
    response.write(`data: ${JSON.stringify({ type: "lobby-sync", lobbies: serializeLobbies() })}\n\n`);
    request.on("close", () => {
      eventClients.delete(response);
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/lobbies") {
    const body = await readBody(request);
    requirePlayer(body);
    const lobby = {
      id: createId("lobby"),
      name: createLobbyName(),
      region: createRegion(),
      ruleset: createRuleset(),
      maxPlayers: 2,
      hostId: body.playerId,
      status: "waiting",
      seed: Math.floor(Math.random() * 2147483647),
      startedAt: null,
      players: [
        {
          id: body.playerId,
          name: body.playerName,
          joinedAt: Date.now(),
          lastSeen: Date.now(),
        },
      ],
    };
    lobbies.set(lobby.id, lobby);
    notifyLobbySync();
    sendJson(response, 201, { lobby: serializeLobby(lobby) });
    return;
  }

  const lobbyMatch = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/([^/]+)$/);
  if (!lobbyMatch || request.method !== "POST") {
    sendJson(response, 404, { error: "Route not found." });
    return;
  }

  const [, lobbyId, action] = lobbyMatch;
  const body = await readBody(request);

  try {
    if (action === "join") {
      requirePlayer(body);
      const lobby = getLobby(lobbyId);
      upsertPlayer(lobby, body.playerId, body.playerName);
      notifyLobbySync();
      sendJson(response, 200, { lobby: serializeLobby(lobby) });
      return;
    }

    if (action === "leave") {
      if (!body.playerId) {
        throw new Error("playerId is required.");
      }
      leaveLobby(lobbyId, body.playerId);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (action === "heartbeat") {
      requirePlayer(body);
      const lobby = getLobby(lobbyId);
      upsertPlayer(lobby, body.playerId, body.playerName).lastSeen = Date.now();
      notifyLobbySync();
      sendJson(response, 200, { lobby: serializeLobby(lobby) });
      return;
    }

    if (action === "start") {
      if (!body.playerId) {
        throw new Error("playerId is required.");
      }
      const lobby = getLobby(lobbyId);
      if (lobby.hostId !== body.playerId) {
        throw new Error("Only the host can start the match.");
      }
      if (lobby.players.length < 2) {
        throw new Error("Two players are required to start.");
      }
      lobby.status = "in-game";
      lobby.startedAt = Date.now();
      notifyLobbySync();
      broadcast({
        type: "match-start",
        lobbyId,
        startedAt: lobby.startedAt,
      });
      sendJson(response, 200, { lobby: serializeLobby(lobby) });
      return;
    }

    if (action === "rematch") {
      if (!body.playerId) {
        throw new Error("playerId is required.");
      }
      const lobby = getLobby(lobbyId);
      if (!lobby.players.some((player) => player.id === body.playerId)) {
        throw new Error("Player is not in this lobby.");
      }
      lobby.status = "waiting";
      lobby.startedAt = null;
      lobby.seed = Math.floor(Math.random() * 2147483647);
      notifyLobbySync();
      sendJson(response, 200, { lobby: serializeLobby(lobby) });
      return;
    }

    if (action === "state") {
      const lobby = getLobby(lobbyId);
      broadcast({
        type: "state-update",
        lobbyId,
        playerId: body.playerId,
        snapshot: body.snapshot,
      });
      sendJson(response, 200, { ok: true, lobby: serializeLobby(lobby) });
      return;
    }

    if (action === "garbage") {
      getLobby(lobbyId);
      broadcast({
        type: "garbage",
        lobbyId,
        fromPlayerId: body.fromPlayerId,
        toPlayerId: body.toPlayerId,
        lines: body.lines,
      });
      sendJson(response, 200, { ok: true });
      return;
    }

    if (action === "lost") {
      const lobby = getLobby(lobbyId);
      lobby.status = "finished";
      notifyLobbySync();
      broadcast({
        type: "player-lost",
        lobbyId,
        playerId: body.playerId,
      });
      sendJson(response, 200, { lobby: serializeLobby(lobby) });
      return;
    }

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error." });
  }
});

setInterval(cleanupLobbies, CLEANUP_INTERVAL_MS);

function getNetworkUrls() {
  const interfaces = os.networkInterfaces();
  const urls = new Set([`http://127.0.0.1:${PORT}`]);

  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.add(`http://${entry.address}:${PORT}`);
      }
    });
  });

  return Array.from(urls);
}

server.listen(PORT, HOST, () => {
  console.log("Codex Tetris server running at:");
  getNetworkUrls().forEach((url) => {
    console.log(`  ${url}`);
  });
});
