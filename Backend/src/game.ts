export type Direction = "up" | "down" | "left" | "right";

export interface Player {
  id: string;
  nickname: string;
  color: string;
  snake: [number, number][];
  dir: Direction;
  nextDir: Direction;
  score: number;
  alive: boolean;
  deathTimer: number;
}

export interface Food {
  x: number;
  y: number;
  bonus: boolean;
}

export interface GameState {
  players: Map<string, Player>;
  foods: Food[];
  tick: number;
  bonusTimer: number;
}

// Big grid
export const GRID_W = 50;
export const GRID_H = 40;

// Lots of distinct colors for players
const PLAYER_COLORS = [
  "#00ffcc", "#ff4d6d", "#f9c74f", "#a78bfa",
  "#38bdf8", "#fb923c", "#4ade80", "#f472b6",
  "#e879f9", "#facc15", "#34d399", "#60a5fa",
  "#f87171", "#a3e635", "#c084fc", "#22d3ee",
  "#fbbf24", "#86efac", "#fca5a5", "#93c5fd",
];

const OPPOSITE: Record<Direction, Direction> = {
  up: "down", down: "up", left: "right", right: "left",
};

// Track used colors so every active player gets a unique one
const usedColors = new Set<string>();

function assignColor(): string {
  for (const color of PLAYER_COLORS) {
    if (!usedColors.has(color)) {
      usedColors.add(color);
      return color;
    }
  }
  // Fallback if all 20 taken (>20 players)
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

function releaseColor(color: string): void {
  usedColors.delete(color);
}

// Spawn in center with slight scatter so players don't stack
function centerSpawn(): { pos: [number, number]; dir: Direction } {
  const cx = Math.floor(GRID_W / 2);
  const cy = Math.floor(GRID_H / 2);
  const scatter = 5;
  const sx = cx + Math.floor((Math.random() - 0.5) * scatter * 2);
  const sy = cy + Math.floor((Math.random() - 0.5) * scatter * 2);
  const dirs: Direction[] = ["up", "down", "left", "right"];
  const dir = dirs[Math.floor(Math.random() * dirs.length)];
  return { pos: [sx, sy], dir };
}

function spawnPlayer(id: string, nickname: string, existingColor?: string): Player {
  const color = existingColor ?? assignColor();
  const { pos: [sx, sy], dir } = centerSpawn();
  return {
    id,
    nickname,
    color,
    snake: [[sx, sy]],
    dir,
    nextDir: dir,
    score: 0,
    alive: true,
    deathTimer: 0,
  };
}

function spawnFood(state: GameState, bonus: boolean): Food {
  const occupied = new Set<string>();
  state.players.forEach(p => p.snake.forEach(([x, y]) => occupied.add(`${x},${y}`)));
  state.foods.forEach(f => occupied.add(`${f.x},${f.y}`));
  let x: number, y: number;
  let attempts = 0;
  do {
    x = Math.floor(Math.random() * GRID_W);
    y = Math.floor(Math.random() * GRID_H);
    attempts++;
  } while (occupied.has(`${x},${y}`) && attempts < 200);
  return { x, y, bonus };
}

export function initGame(): GameState {
  const state: GameState = {
    players: new Map(),
    foods: [],
    tick: 0,
    bonusTimer: 60,
  };
  // Spawn initial regular foods
  for (let i = 0; i < 8; i++) {
    state.foods.push(spawnFood(state, false));
  }
  return state;
}

export function addPlayer(state: GameState, id: string, nickname: string): void {
  state.players.set(id, spawnPlayer(id, nickname));
}

export function removePlayer(state: GameState, id: string): void {
  const player = state.players.get(id);
  if (player) releaseColor(player.color);
  state.players.delete(id);
}

export function setDirection(state: GameState, id: string, dir: Direction): void {
  const player = state.players.get(id);
  if (!player || !player.alive) return;
  // Prevent reversing
  if (dir === OPPOSITE[player.dir]) return;
  player.nextDir = dir;
}

export function updateGame(state: GameState): void {
  state.tick++;

  // Bonus food logic
  state.bonusTimer--;
  const bonusCount = state.foods.filter(f => f.bonus).length;
  if (state.bonusTimer <= 0) {
    if (bonusCount < 2) {
      state.foods.push(spawnFood(state, true));
    }
    state.bonusTimer = 50 + Math.floor(Math.random() * 50);
  }

  // Expire bonus food after 80 ticks (track with a timer via index trick)
  // Simple: remove oldest bonus if too many
  if (bonusCount > 3) {
    const idx = state.foods.findIndex(f => f.bonus);
    if (idx !== -1) state.foods.splice(idx, 1);
  }

  // Keep regular food count at 8
  const regularCount = state.foods.filter(f => !f.bonus).length;
  for (let i = regularCount; i < 8; i++) {
    state.foods.push(spawnFood(state, false));
  }

  // Handle dead players respawn
  state.players.forEach(player => {
    if (!player.alive) {
      player.deathTimer--;
      if (player.deathTimer <= 0) {
        // Respawn at center, keep same color, reset score
        const respawned = spawnPlayer(player.id, player.nickname, player.color);
        state.players.set(player.id, respawned);
      }
    }
  });

  // Build occupied set for collision (all bodies)
  const bodyMap = new Map<string, string>(); // "x,y" -> playerId
  state.players.forEach(p => {
    if (!p.alive) return;
    p.snake.forEach(([x, y]) => bodyMap.set(`${x},${y}`, p.id));
  });

  // Move each alive player
  const newHeads = new Map<string, [number, number]>();

  state.players.forEach(player => {
    if (!player.alive) return;

    player.dir = player.nextDir;
    const head = player.snake[0];
    let nx = head[0], ny = head[1];

    switch (player.dir) {
      case "up":    ny -= 1; break;
      case "down":  ny += 1; break;
      case "left":  nx -= 1; break;
      case "right": nx += 1; break;
    }

    newHeads.set(player.id, [nx, ny]);
  });

  // Check collisions and move
  state.players.forEach(player => {
    if (!player.alive) return;
    const newHead = newHeads.get(player.id)!;
    const [nx, ny] = newHead;

    // Wall collision
    if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) {
      player.alive = false;
      player.deathTimer = 30;
      return;
    }

    // Self collision (check all but last tail segment)
    const selfHit = player.snake.slice(0, -1).some(([x, y]) => x === nx && y === ny);
    if (selfHit) {
      player.alive = false;
      player.deathTimer = 30;
      return;
    }

    // Check food
    const foodIdx = state.foods.findIndex(f => f.x === nx && f.y === ny);
    const ateFood = foodIdx !== -1;
    const isBonus = ateFood && state.foods[foodIdx].bonus;

    // Move snake
    player.snake.unshift([nx, ny]);
    if (!ateFood) {
      player.snake.pop();
      // Remove old tail from bodyMap
    } else {
      state.foods.splice(foodIdx, 1);
      player.score += isBonus ? 3 : 1;
    }
  });

  // Cross-collision: head hits another snake's body
  state.players.forEach(player => {
    if (!player.alive) return;
    const [hx, hy] = player.snake[0];

    state.players.forEach(other => {
      if (other.id === player.id || !other.alive) return;
      // Check if my head is in other's body (skip head for head-on = both die)
      const hitBody = other.snake.slice(1).some(([x, y]) => x === hx && y === hy);
      if (hitBody) {
        player.alive = false;
        player.deathTimer = 30;
      }
      // Head-on collision
      const [ohx, ohy] = other.snake[0];
      if (ohx === hx && ohy === hy) {
        player.alive = false;
        other.alive = false;
        player.deathTimer = 30;
        other.deathTimer = 30;
      }
    });
  });
}

export function getState(state: GameState) {
  return {
    players: Array.from(state.players.values()).map(p => ({
      id: p.id,
      nickname: p.nickname,
      color: p.color,
      snake: p.snake,
      dir: p.dir,
      score: p.score,
      alive: p.alive,
      deathTimer: p.deathTimer,
    })),
    foods: state.foods,
    gridW: GRID_W,
    gridH: GRID_H,
    tick: state.tick,
  };
}