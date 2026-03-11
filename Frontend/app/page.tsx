"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "@/lib/socket";

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface PlayerState {
  id: string;
  nickname: string;
  color: string;
  snake: [number, number][];
  dir: string;
  score: number;
  alive: boolean;
  deathTimer: number;
}
interface FoodState { x: number; y: number; bonus: boolean; }
interface GameState {
  players: PlayerState[];
  foods: FoodState[];
  gridW: number;
  gridH: number;
  tick: number;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CELL = 18;
const OPPOSITE: Record<string, string> = { up:"down", down:"up", left:"right", right:"left" };

// ─── DRAW ─────────────────────────────────────────────────────────────────────
function draw(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  myId: string,
  camX: number,
  camY: number,
  vpW: number,
  vpH: number
) {
  const { players, foods, gridW, gridH, tick } = state;
  const W = gridW * CELL;
  const H = gridH * CELL;

  ctx.clearRect(0, 0, vpW, vpH);

  // BG
  ctx.fillStyle = "#080d1a";
  ctx.fillRect(0, 0, vpW, vpH);

  ctx.save();
  ctx.translate(-camX, -camY);

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= gridW; x++) {
    ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke();
  }
  for (let y = 0; y <= gridH; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke();
  }

  // Border
  ctx.strokeStyle = "rgba(0,255,204,0.2)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Foods
  foods.forEach(f => {
    const cx = f.x * CELL + CELL / 2;
    const cy = f.y * CELL + CELL / 2;
    const pulse = 0.75 + 0.25 * Math.sin(tick * 0.18 + f.x * 0.5);

    ctx.save();
    if (f.bonus) {
      // Star
      ctx.shadowColor = "rgba(249,199,79,0.9)";
      ctx.shadowBlur = 20 * pulse;
      ctx.fillStyle = `rgba(249,199,79,${pulse})`;
      const outerR = (CELL / 2 - 2) * pulse;
      const innerR = outerR * 0.4;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.shadowColor = "rgba(255,60,90,0.9)";
      ctx.shadowBlur = 14 * pulse;
      ctx.fillStyle = `rgba(255,60,90,${pulse})`;
      ctx.beginPath();
      ctx.arc(cx, cy, (CELL / 2 - 3) * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  // Snakes
  players.forEach(player => {
    if (!player.alive || player.snake.length === 0) return;
    const isMe = player.id === myId;
    const color = player.color;

    player.snake.forEach(([x, y], i) => {
      const isHead = i === 0;
      const cx = x * CELL + CELL / 2;
      const cy = y * CELL + CELL / 2;
      const alpha = isHead ? 1 : Math.max(0.25, 1 - i * 0.025);
      const r = isHead ? CELL / 2 - 1 : CELL / 2 - 3;

      ctx.save();
      if (isHead) {
        ctx.shadowColor = color + "aa";
        ctx.shadowBlur = isMe ? 22 : 14;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = isHead ? color : color + "bb";
      ctx.beginPath();
      ctx.roundRect(cx - r, cy - r, r * 2, r * 2, isHead ? 6 : 3);
      ctx.fill();

      // Eyes on head
      if (isHead) {
        const dx = player.dir === "right" ? 1 : player.dir === "left" ? -1 : 0;
        const dy = player.dir === "down" ? 1 : player.dir === "up" ? -1 : 0;
        const perp = dx !== 0 ? [0, 1] : [1, 0];
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#080d1a";
        ctx.beginPath();
        ctx.arc(cx + dx * 3 + perp[0] * 4, cy + dy * 3 + perp[1] * 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + dx * 3 - perp[0] * 4, cy + dy * 3 - perp[1] * 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    // Nickname above head
    const [hx, hy] = player.snake[0];
    const labelX = hx * CELL + CELL / 2;
    const labelY = hy * CELL - 6;
    ctx.save();
    ctx.font = `bold ${isMe ? 12 : 11}px 'Orbitron', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    // Background pill
    const tw = ctx.measureText(player.nickname).width + 10;
    const th = 16;
    ctx.fillStyle = "rgba(8,13,26,0.85)";
    ctx.beginPath();
    ctx.roundRect(labelX - tw / 2, labelY - th, tw, th, 4);
    ctx.fill();

    // Border for self
    if (isMe) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(labelX - tw / 2, labelY - th, tw, th, 4);
      ctx.stroke();
    }

    ctx.fillStyle = isMe ? color : color + "cc";
    ctx.shadowColor = color;
    ctx.shadowBlur = isMe ? 8 : 4;
    ctx.fillText(player.nickname, labelX, labelY);
    ctx.restore();
  });

  ctx.restore();
}

// ─── JOIN SCREEN ──────────────────────────────────────────────────────────────
function JoinScreen({ onJoin }: { onJoin: (nick: string) => void }) {
  const [nick, setNick] = useState("");

  return (
    <div style={{
      minHeight: "100vh", background: "#080d1a",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Orbitron', monospace",
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes glow { 0%,100%{text-shadow:0 0 20px #00ffcc,0 0 60px #00ffcc40} 50%{text-shadow:0 0 40px #00ffcc,0 0 120px #00ffcc60} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .join-input:focus { outline: none; border-color: #00ffcc !important; box-shadow: 0 0 30px rgba(0,255,204,0.3) !important; }
        .join-btn:hover { background: rgba(0,255,204,0.15) !important; box-shadow: 0 0 40px rgba(0,255,204,0.5) !important; transform: scale(1.04); }
      `}</style>

      {/* Grid bg */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: "linear-gradient(rgba(0,255,204,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,204,0.03) 1px, transparent 1px)",
        backgroundSize: "36px 36px",
      }} />
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse at center, transparent 30%, #080d1a 80%)", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "0 24px", width: "100%", maxWidth: 440 }}>
        <div style={{ fontSize: 10, letterSpacing: 8, color: "#00ffcc60", marginBottom: 8, animation: "blink 2s infinite" }}>
          MULTIPLAYER
        </div>
        <h1 style={{
          fontSize: "clamp(52px, 12vw, 96px)", fontWeight: 900,
          color: "#fff", letterSpacing: 4, animation: "glow 2s ease-in-out infinite",
          lineHeight: 1, marginBottom: 4,
        }}>SNAKE</h1>
        <div style={{ fontSize: 10, letterSpacing: 5, color: "#a78bfa60", marginBottom: 52 }}>
          JOIN THE ARENA
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            className="join-input"
            placeholder="ENTER YOUR NICKNAME"
            maxLength={16}
            value={nick}
            onChange={e => setNick(e.target.value)}
            onKeyDown={e => e.key === "Enter" && nick.trim() && onJoin(nick.trim())}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.04)",
              border: "2px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "16px 20px",
              color: "#fff",
              fontFamily: "'Orbitron', monospace",
              fontSize: 14,
              letterSpacing: 3,
              textAlign: "center",
              transition: "all 0.2s",
            }}
          />
        </div>

        <button
          className="join-btn"
          disabled={!nick.trim()}
          onClick={() => nick.trim() && onJoin(nick.trim())}
          style={{
            width: "100%",
            background: "transparent",
            border: "2px solid #00ffcc",
            borderRadius: 12,
            padding: "16px",
            color: "#00ffcc",
            fontFamily: "'Orbitron', monospace",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 4,
            cursor: nick.trim() ? "pointer" : "not-allowed",
            opacity: nick.trim() ? 1 : 0.4,
            transition: "all 0.2s",
            animation: nick.trim() ? "float 2s ease-in-out infinite" : "none",
          }}
        >
          PLAY →
        </button>

        <div style={{ marginTop: 40, display: "flex", gap: 28, justifyContent: "center", flexWrap: "wrap", fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: 2 }}>
          <span>WASD / ARROWS TO MOVE</span>
          <span>🔴 +1 PTS</span>
          <span>⭐ +3 PTS</span>
        </div>
      </div>
    </div>
  );
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
function Leaderboard({ players, myId }: { players: PlayerState[]; myId: string }) {
  const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 8);
  return (
    <div style={{
      position: "fixed", top: 16, right: 16, zIndex: 100,
      background: "rgba(8,13,26,0.85)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding: "14px 18px",
      backdropFilter: "blur(12px)",
      minWidth: 180,
    }}>
      <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
        LEADERBOARD
      </div>
      {sorted.map((p, i) => (
        <div key={p.id} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "4px 0",
          borderBottom: i < sorted.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
        }}>
          <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 9, color: "rgba(255,255,255,0.25)", minWidth: 14 }}>
            {i + 1}
          </span>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <span style={{
            fontFamily: "'Orbitron', monospace", fontSize: 10,
            color: p.id === myId ? p.color : "rgba(255,255,255,0.7)",
            fontWeight: p.id === myId ? 700 : 400,
            flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {p.nickname}
          </span>
          <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 11, color: "#fff", fontWeight: 700 }}>
            {p.score}
          </span>
          {!p.alive && <span style={{ fontSize: 8, color: "#ff4d6d" }}>💀</span>}
        </div>
      ))}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const myIdRef = useRef<string>("");
  const animRef = useRef<number>(0);
  const currentDirRef = useRef<string>("right");

  const [phase, setPhase] = useState<"join" | "game">("join");
  const [myId, setMyId] = useState("");
  const [renderPlayers, setRenderPlayers] = useState<PlayerState[]>([]);

  // Socket setup
  useEffect(() => {
    socket.on("joined", ({ id }: { id: string }) => {
      myIdRef.current = id;
      setMyId(id);
      setPhase("game");
    });

    socket.on("game_state", (state: GameState) => {
      stateRef.current = state;
      setRenderPlayers(state.players);
    });

    return () => {
      socket.off("joined");
      socket.off("game_state");
    };
  }, []);

  const handleJoin = useCallback((nick: string) => {
    socket.emit("join", nick);
  }, []);

  // Keyboard
  useEffect(() => {
    if (phase !== "game") return;
    const onKey = (e: KeyboardEvent) => {
      let dir: string | null = null;
      switch (e.key) {
        case "ArrowUp": case "w": case "W": dir = "up"; break;
        case "ArrowDown": case "s": case "S": dir = "down"; break;
        case "ArrowLeft": case "a": case "A": dir = "left"; break;
        case "ArrowRight": case "d": case "D": dir = "right"; break;
      }
      if (!dir) return;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault();
      if (dir === OPPOSITE[currentDirRef.current]) return;
      currentDirRef.current = dir;
      socket.emit("change_direction", dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  // Mobile swipe
  useEffect(() => {
    if (phase !== "game") return;
    let startX = 0, startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      let dir: string;
      if (Math.abs(dx) > Math.abs(dy)) {
        dir = dx > 0 ? "right" : "left";
      } else {
        dir = dy > 0 ? "down" : "up";
      }
      if (dir === OPPOSITE[currentDirRef.current]) return;
      currentDirRef.current = dir;
      socket.emit("change_direction", dir);
    };
    window.addEventListener("touchstart", onTouchStart);
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [phase]);

  // Render loop
  useEffect(() => {
    if (phase !== "game") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const state = stateRef.current;
      if (!state) { animRef.current = requestAnimationFrame(render); return; }

      const vpW = canvas.width;
      const vpH = canvas.height;
      const ctx = canvas.getContext("2d")!;

      // Camera: follow my snake head
      let camX = 0, camY = 0;
      const me = state.players.find(p => p.id === myIdRef.current);
      if (me && me.snake.length > 0) {
        const [hx, hy] = me.snake[0];
        camX = hx * CELL + CELL / 2 - vpW / 2;
        camY = hy * CELL + CELL / 2 - vpH / 2;
        const maxCamX = state.gridW * CELL - vpW;
        const maxCamY = state.gridH * CELL - vpH;
        camX = Math.max(0, Math.min(camX, maxCamX));
        camY = Math.max(0, Math.min(camY, maxCamY));
      }

      draw(ctx, state, myIdRef.current, camX, camY, vpW, vpH);
      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase]);

  // Canvas size = full window — re-run when phase switches to "game"
  useEffect(() => {
    if (phase !== "game") return;
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    // Small timeout lets React finish rendering the canvas element first
    const t = setTimeout(resize, 0);
    window.addEventListener("resize", resize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", resize);
    };
  }, [phase]);

  if (phase === "join") return <JoinScreen onJoin={handleJoin} />;

  const me = renderPlayers.find(p => p.id === myId);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#080d1a", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      <canvas ref={canvasRef} style={{ display: "block" }} />

      {/* My score - bottom left */}
      {me && (
        <div style={{
          position: "fixed", bottom: 20, left: 20, zIndex: 100,
          background: "rgba(8,13,26,0.85)",
          border: `1px solid ${me.color}40`,
          borderRadius: 12, padding: "12px 20px",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 20px ${me.color}20`,
        }}>
          <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 9, letterSpacing: 3, color: me.color + "99", marginBottom: 2 }}>
            {me.nickname}
          </div>
          <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 32, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
            {me.score}
          </div>
          {!me.alive && (
            <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 9, color: "#ff4d6d", marginTop: 4, letterSpacing: 2 }}>
              RESPAWNING...
            </div>
          )}
        </div>
      )}

      {/* Leaderboard */}
      <Leaderboard players={renderPlayers} myId={myId} />

      {/* Player count */}
      <div style={{
        position: "fixed", top: 16, left: 16, zIndex: 100,
        fontFamily: "'Orbitron', monospace", fontSize: 9,
        letterSpacing: 3, color: "rgba(255,255,255,0.25)",
      }}>
        {renderPlayers.length} ONLINE
      </div>

      {/* Mobile d-pad */}
      <div style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 100,
        display: "grid", gridTemplateColumns: "48px 48px 48px",
        gridTemplateRows: "48px 48px 48px", gap: 4,
        opacity: 0.7,
      }}>
        {[
          [null, "up", null],
          ["left", null, "right"],
          [null, "down", null],
        ].map((row, ri) =>
          row.map((dir, ci) =>
            dir ? (
              <button key={`${ri}-${ci}`}
                onTouchStart={e => { e.preventDefault(); socket.emit("change_direction", dir); currentDirRef.current = dir; }}
                onClick={() => { socket.emit("change_direction", dir); currentDirRef.current = dir; }}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 10, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 18,
                  WebkitTapHighlightColor: "transparent",
                }}>
                {dir === "up" ? "▲" : dir === "down" ? "▼" : dir === "left" ? "◀" : "▶"}
              </button>
            ) : <div key={`${ri}-${ci}`} />
          )
        )}
      </div>
    </div>
  );
}