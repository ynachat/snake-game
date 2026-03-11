import express from "express";
import http from "http";
import { Server } from "socket.io";
import {
  initGame, addPlayer, removePlayer,
  setDirection, updateGame, getState,
} from "./game";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const game = initGame();

app.get("/", (_, res) => res.send("🐍 Snake server running"));

io.on("connection", socket => {
  console.log(`Socket connected: ${socket.id}`);

  // Client sends nickname on join
  socket.on("join", (nickname: string) => {
    const clean = (nickname || "Player").toString().trim().slice(0, 16) || "Player";
    console.log(`${clean} joined (${socket.id})`);
    addPlayer(game, socket.id, clean);
    // Send them their own ID so frontend can track themselves
    socket.emit("joined", { id: socket.id });
  });

  socket.on("change_direction", (dir: "up" | "down" | "left" | "right") => {
    setDirection(game, socket.id, dir);
  });

  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id}`);
    removePlayer(game, socket.id);
  });
});

// Game loop — 100ms tick (10 FPS logic, smooth enough)
setInterval(() => {
  updateGame(game);
  io.emit("game_state", getState(game));
}, 100);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));