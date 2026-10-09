import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Server } from "socket.io";
import {
  createGameplay,
  createRoom,
  createPlayer,
  randomRoomCode,
  roomSnapshot,
  MAX_PLAYERS,
} from "./gameplay.js";

const root = fileURLToPath(new URL("../", import.meta.url));

export function createGameServer({ now = Date.now, autoTick = true } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 8_192,
    serveClient: true,
  });
  const rooms = new Map();
  const game = createGameplay({ io, now, rooms });

  app.get("/health", (_request, response) =>
    response.json({
      ok: true,
      rooms: rooms.size,
      players: io.engine.clientsCount,
    }),
  );
  app.use("/shared", express.static(path.join(root, "shared")));
  app.use(
    "/vendor/three",
    express.static(path.join(root, "node_modules/three/build")),
  );
  app.use(express.static(path.join(root, "client")));

  io.on("connection", (socket) => {
    let joinAttempts = 0;
    let lastJoinWindow = now();
    function leaveRoom() {
      const old = rooms.get(socket.data.code);
      if (old) {
        old.players.delete(socket.id);
        socket.leave(old.code);
        if (!old.players.size) rooms.delete(old.code);
        else io.to(old.code).emit("state", roomSnapshot(old, now()));
      }
      socket.data.code = null;
    }

    socket.on("join", (input, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      if (!input || typeof input !== "object" || Array.isArray(input))
        return ack({ ok: false, error: "Please enter a valid room request." });
      if (now() - lastJoinWindow > 10_000) {
        joinAttempts = 0;
        lastJoinWindow = now();
      }
      if (++joinAttempts > 8)
        return ack({
          ok: false,
          error: "Too many room requests. Try again in a few seconds.",
        });
      const code = String(input.code || "")
        .trim()
        .toUpperCase();
      let room;
      if (code && !input.create) {
        room = rooms.get(code);
        if (!room)
          return ack({
            ok: false,
            error: "Room not found. Check the five-character code.",
          });
        if (room.players.size >= MAX_PLAYERS && !room.players.has(socket.id))
          return ack({
            ok: false,
            error: "This room is full (6 players maximum).",
          });
      } else {
        if (rooms.size >= 200)
          return ack({
            ok: false,
            error: "The server is full. Please try again later.",
          });
        room = createRoom(
          randomRoomCode(rooms),
          input.mode === "duel" ? "duel" : "coop",
          now(),
        );
        rooms.set(room.code, room);
      }
      if (socket.data.code === room.code) {
        ack({ ok: true, code: room.code, id: socket.id });
        socket.emit("state", roomSnapshot(room, now()));
        return;
      }
      leaveRoom();
      const player = createPlayer(socket.id, input, now(), room.players.size);
      room.players.set(socket.id, player);
      socket.data.code = room.code;
      socket.join(room.code);
      ack({ ok: true, code: room.code, id: socket.id });
      io.to(room.code).emit("state", roomSnapshot(room, now()));
      socket.emit(
        "notice",
        room.mode === "duel"
          ? "Duel room: friendly fire is enabled. Your friends are your rivals."
          : "Explore the village, speak to Master Hoshino, and hunt together.",
      );
      game.save(player);
    });

    for (const event of [
      "move",
      "attack",
      "ability",
      "dash",
      "block",
      "interact",
      "customize",
      "potion",
      "respawn",
    ]) {
      socket.on(event, (payload) => {
        const room = rooms.get(socket.data.code);
        const player = room?.players.get(socket.id);
        if (!room || !player) return;
        if (
          payload !== undefined &&
          (typeof payload !== "object" ||
            payload === null ||
            Array.isArray(payload))
        )
          return;
        game[event](room, player, payload || {});
      });
    }
    socket.on("disconnect", leaveRoom);
    socket.on("leave", leaveRoom);
  });

  const timer = autoTick ? setInterval(() => game.tick(0.05), 50) : null;
  timer?.unref();

  return {
    app,
    io,
    httpServer,
    rooms,
    tick: game.tick,
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, host, () => {
          httpServer.off("error", reject);
          resolve(httpServer.address());
        });
      });
    },
    async close() {
      if (timer) clearInterval(timer);
      await new Promise((resolve) => io.close(resolve));
    },
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = createGameServer();
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  server
    .listen(Number.isFinite(port) ? port : 3000, "0.0.0.0")
    .then((address) => {
      console.log(`Moonveil Chronicles ready on port ${address.port}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await server.close();
      process.exit(0);
    });
}
