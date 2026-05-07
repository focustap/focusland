export type VolleyballMode = "1v1" | "2v2";
export type VolleyballPhase = "lobby" | "countdown" | "playing" | "point" | "gameOver";
export type VolleyballTeam = "sun" | "tide";
export type VolleyballAction = "idle" | "run" | "jump" | "bump" | "set" | "spike" | "dive";

export type VolleyballPresencePlayer = {
  userId: string;
  username: string;
  onlineAt: string;
};

export type VolleyballPlayer = {
  id: string;
  username: string;
  team: VolleyballTeam;
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: -1 | 1;
  grounded: boolean;
  action: VolleyballAction;
  actionMs: number;
  recoveryMs: number;
  contactCooldownMs: number;
};

export type VolleyballBall = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastTeam: VolleyballTeam | null;
};

export type VolleyballScore = Record<VolleyballTeam, number>;

export type VolleyballMatchState = {
  version: number;
  mode: VolleyballMode;
  phase: VolleyballPhase;
  players: VolleyballPlayer[];
  ball: VolleyballBall;
  score: VolleyballScore;
  targetScore: number;
  servingTeam: VolleyballTeam;
  winner: VolleyballTeam | null;
  possessionTeam: VolleyballTeam;
  sideHitCount: number;
  message: string;
  countdownMs: number;
  pointPauseMs: number;
  sequence: number;
};

export type VolleyballInput = {
  left?: boolean;
  right?: boolean;
  jump?: boolean;
  bump?: boolean;
  set?: boolean;
  spike?: boolean;
  dive?: boolean;
};

export type VolleyballInputs = Record<string, VolleyballInput>;

export type RoomSummary = {
  code: string;
  hostId: string;
  hostName: string;
  mode: VolleyballMode;
  targetScore: number;
  playerCount: number;
  maxPlayers: number;
  status: "open" | "playing";
  updatedAt: number;
};

export const VOLLEYBALL_WIDTH = 960;
export const VOLLEYBALL_HEIGHT = 540;
export const VOLLEYBALL_FLOOR_Y = 456;
export const VOLLEYBALL_NET_X = VOLLEYBALL_WIDTH / 2;
export const VOLLEYBALL_NET_TOP = 306;
export const VOLLEYBALL_NET_WIDTH = 16;
export const VOLLEYBALL_PLAYER_RADIUS = 24;
export const VOLLEYBALL_BALL_RADIUS = 14;

const PLAYER_SPEED = 270;
const DIVE_SPEED = 430;
const JUMP_SPEED = -710;
const GRAVITY = 1420;
const BALL_GRAVITY = 980;
const BALL_DRAG = 0.998;
const COURT_MARGIN = 44;
const DEFAULT_TARGET_SCORE = 7;

export function createRoomCode(seed = Math.random()) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = Math.floor(seed * 0x7fffffff) || Date.now();
  let code = "";
  for (let index = 0; index < 5; index += 1) {
    value = (value * 48271) % 0x7fffffff;
    code += alphabet[value % alphabet.length];
  }
  return code;
}

export function getMaxPlayers(mode: VolleyballMode) {
  return mode === "2v2" ? 4 : 2;
}

export function canStartVolleyballMatch(players: VolleyballPresencePlayer[], mode: VolleyballMode) {
  return players.length === getMaxPlayers(mode);
}

export function sanitizeTargetScore(value: number) {
  return Math.min(21, Math.max(3, Math.round(Number.isFinite(value) ? value : DEFAULT_TARGET_SCORE)));
}

export function assignVolleyballTeams(players: VolleyballPresencePlayer[], mode: VolleyballMode): VolleyballPlayer[] {
  return players.slice(0, getMaxPlayers(mode)).map((player, index) => {
    const team: VolleyballTeam = index % 2 === 0 ? "sun" : "tide";
    const slot = Math.floor(index / 2);
    const spawn = getSpawnPosition(team, slot, mode);
    return {
      id: player.userId,
      username: player.username,
      team,
      slot,
      x: spawn.x,
      y: VOLLEYBALL_FLOOR_Y - VOLLEYBALL_PLAYER_RADIUS,
      vx: 0,
      vy: 0,
      facing: team === "sun" ? 1 : -1,
      grounded: true,
      action: "idle",
      actionMs: 0,
      recoveryMs: 0,
      contactCooldownMs: 0
    };
  });
}

export function getSpawnPosition(team: VolleyballTeam, slot: number, mode: VolleyballMode) {
  const leftSpawns = mode === "2v2"
    ? [{ x: 214 }, { x: 362 }]
    : [{ x: 292 }];
  const rightSpawns = mode === "2v2"
    ? [{ x: 746 }, { x: 598 }]
    : [{ x: 668 }];
  return (team === "sun" ? leftSpawns : rightSpawns)[slot] ?? (team === "sun" ? leftSpawns[0] : rightSpawns[0]);
}

export function createInitialVolleyballState(
  players: VolleyballPresencePlayer[] = [],
  mode: VolleyballMode = "1v1",
  targetScore = DEFAULT_TARGET_SCORE
): VolleyballMatchState {
  const assignedPlayers = assignVolleyballTeams(players, mode);
  return {
    version: 1,
    mode,
    phase: canStartVolleyballMatch(players, mode) ? "countdown" : "lobby",
    players: assignedPlayers,
    ball: createServeBall("sun"),
    score: { sun: 0, tide: 0 },
    targetScore: sanitizeTargetScore(targetScore),
    servingTeam: "sun",
    winner: null,
    possessionTeam: "sun",
    sideHitCount: 0,
    message: canStartVolleyballMatch(players, mode) ? "Serve in 3" : "Waiting for players",
    countdownMs: canStartVolleyballMatch(players, mode) ? 2200 : 0,
    pointPauseMs: 0,
    sequence: 0
  };
}

export function createServeBall(servingTeam: VolleyballTeam): VolleyballBall {
  const direction = servingTeam === "sun" ? 1 : -1;
  return {
    x: servingTeam === "sun" ? VOLLEYBALL_NET_X - 238 : VOLLEYBALL_NET_X + 238,
    y: 206,
    vx: 210 * direction,
    vy: -260,
    lastTeam: servingTeam
  };
}

export function configureVolleyballPlayers(
  state: VolleyballMatchState,
  players: VolleyballPresencePlayer[],
  mode = state.mode,
  targetScore = state.targetScore
): VolleyballMatchState {
  const assignedPlayers = assignVolleyballTeams(players, mode);
  return {
    ...state,
    mode,
    targetScore: sanitizeTargetScore(targetScore),
    players: assignedPlayers,
    phase: assignedPlayers.length < getMaxPlayers(mode) ? "lobby" : state.phase,
    countdownMs: assignedPlayers.length < getMaxPlayers(mode) ? 0 : state.countdownMs,
    message: assignedPlayers.length < getMaxPlayers(mode) ? "Waiting for players" : state.message,
    sequence: state.sequence + 1
  };
}

export function startVolleyballMatch(
  players: VolleyballPresencePlayer[],
  mode: VolleyballMode,
  targetScore = DEFAULT_TARGET_SCORE
) {
  if (!canStartVolleyballMatch(players, mode)) {
    return createInitialVolleyballState(players, mode, targetScore);
  }
  return createInitialVolleyballState(players, mode, targetScore);
}

export function calculateHitVelocity(
  action: Exclude<VolleyballAction, "idle" | "run" | "jump">,
  player: Pick<VolleyballPlayer, "team" | "facing" | "grounded" | "x">,
  ball: Pick<VolleyballBall, "x" | "y" | "vx" | "vy">
) {
    const sideDirection = player.team === "sun" ? 1 : -1;
  const reachDirection = ball.x >= player.x ? 1 : -1;
  const forward = player.facing || sideDirection;
  const crossNetBias = Math.sign(forward) === sideDirection ? sideDirection : reachDirection;

  if (action === "set") {
    return {
      vx: 90 * crossNetBias + (ball.x - player.x) * 1.2,
      vy: -760
    };
  }

  if (action === "spike") {
    const airborneBonus = player.grounded ? 0.72 : 1;
    const targetX = player.team === "sun"
      ? Math.max(VOLLEYBALL_NET_X + 145, Math.min(VOLLEYBALL_WIDTH - 118, ball.x + 275))
      : Math.min(VOLLEYBALL_NET_X - 145, Math.max(118, ball.x - 275));
    const distance = Math.max(130, Math.abs(targetX - ball.x));
    const speed = (player.grounded ? 660 : 840) * airborneBonus;
    const travelTime = Math.min(0.58, Math.max(0.24, distance / speed));
    const targetY = player.grounded ? VOLLEYBALL_FLOOR_Y - 92 : VOLLEYBALL_FLOOR_Y - 54;
    const vy = (targetY - ball.y - 0.5 * BALL_GRAVITY * travelTime * travelTime) / travelTime;
    return {
      vx: speed * sideDirection,
      vy: PhaserClamp(vy, player.grounded ? -420 : -220, player.grounded ? 120 : 120)
    };
  }

  if (action === "dive") {
    return {
      vx: 335 * sideDirection + 130 * reachDirection,
      vy: -520
    };
  }

  return {
    vx: 255 * crossNetBias + (ball.x - player.x) * 0.7,
    vy: -610
  };
}

export function applyPoint(state: VolleyballMatchState, winner: VolleyballTeam): VolleyballMatchState {
  const score = { ...state.score, [winner]: state.score[winner] + 1 };
  const matchWinner = score[winner] >= state.targetScore ? winner : null;
  return {
    ...state,
    phase: matchWinner ? "gameOver" : "point",
    score,
    servingTeam: winner,
    winner: matchWinner,
    possessionTeam: winner,
    sideHitCount: 0,
    pointPauseMs: matchWinner ? 0 : 1500,
    message: matchWinner ? `${getTeamLabel(winner)} wins!` : `${getTeamLabel(winner)} scores`,
    sequence: state.sequence + 1
  };
}

export function resetForServe(state: VolleyballMatchState): VolleyballMatchState {
  const presence = state.players.map((player) => ({
    userId: player.id,
    username: player.username,
    onlineAt: ""
  }));
  return {
    ...state,
    phase: "countdown",
    players: assignVolleyballTeams(presence, state.mode),
    ball: createServeBall(state.servingTeam),
    possessionTeam: state.servingTeam,
    sideHitCount: 0,
    countdownMs: 1800,
    pointPauseMs: 0,
    message: "Serve in 2",
    sequence: state.sequence + 1
  };
}

export function stepVolleyballState(
  state: VolleyballMatchState,
  inputs: VolleyballInputs,
  deltaMs: number
): VolleyballMatchState {
  if (state.phase === "gameOver" || state.phase === "lobby") {
    return state;
  }

  const dt = Math.min(0.034, Math.max(0, deltaMs / 1000));

  if (state.phase === "point") {
    const pointPauseMs = Math.max(0, state.pointPauseMs - deltaMs);
    return pointPauseMs <= 0 ? resetForServe({ ...state, pointPauseMs }) : { ...state, pointPauseMs };
  }

  if (state.phase === "countdown") {
    const countdownMs = Math.max(0, state.countdownMs - deltaMs);
    return {
      ...state,
      countdownMs,
      phase: countdownMs <= 0 ? "playing" : "countdown",
      message: countdownMs <= 0 ? "Play!" : `Serve in ${Math.max(1, Math.ceil(countdownMs / 1000))}`
    };
  }

  const players = updatePlayers(state, inputs, dt);
  const ball = updateBall(state.ball, dt);
  const possession = updatePossessionForCrossing(state, ball);
  const separatedPlayers = separatePlayers(players, state.mode);
  const hitResult = applyPlayerHits(ball, separatedPlayers, possession.possessionTeam, possession.sideHitCount);
  if (hitResult.fault) {
    return applyPoint({ ...state, players: hitResult.players, ball }, hitResult.fault.winner);
  }
  const hitBall = hitResult.ball;
  const netBall = resolveNet(hitBall);
  const scored = getPointWinner(netBall);
  if (scored) {
    return applyPoint({ ...state, players: hitResult.players, ball: netBall }, scored);
  }

  return {
    ...state,
    possessionTeam: hitResult.possessionTeam,
    sideHitCount: hitResult.sideHitCount,
    players: hitResult.players,
    ball: netBall,
    sequence: state.sequence + 1
  };
}

function updatePlayers(state: VolleyballMatchState, inputs: VolleyballInputs, dt: number) {
  return state.players.map((player) => {
    const input = inputs[player.id] ?? {};
    const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const minX = player.team === "sun" ? COURT_MARGIN : VOLLEYBALL_NET_X + VOLLEYBALL_NET_WIDTH / 2 + VOLLEYBALL_PLAYER_RADIUS;
    const maxX = player.team === "sun" ? VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2 - VOLLEYBALL_PLAYER_RADIUS : VOLLEYBALL_WIDTH - COURT_MARGIN;
    const nextRecovery = Math.max(0, player.recoveryMs - dt * 1000);
    let vx = move * PLAYER_SPEED;
    let vy = player.vy + GRAVITY * dt;
    let action: VolleyballAction = move === 0 ? "idle" : "run";
    let actionMs = Math.max(0, player.actionMs - dt * 1000);
    let recoveryMs = nextRecovery;
    const contactCooldownMs = Math.max(0, (player.contactCooldownMs ?? 0) - dt * 1000);

    if (player.actionMs > 0 && player.action !== "jump") {
      action = player.action;
    }

    if (player.grounded && input.jump && recoveryMs <= 0) {
      vy = JUMP_SPEED;
      action = "jump";
      actionMs = 240;
    }

    if (input.dive && recoveryMs <= 0) {
      vx = (move || player.facing) * DIVE_SPEED;
      action = "dive";
      actionMs = 360;
      recoveryMs = 560;
    } else if (input.spike && recoveryMs <= 0) {
      action = "spike";
      actionMs = 260;
      recoveryMs = 180;
    } else if (input.set && recoveryMs <= 0) {
      action = "set";
      actionMs = 260;
      recoveryMs = 160;
    } else if (input.bump && recoveryMs <= 0) {
      action = "bump";
      actionMs = 240;
      recoveryMs = 130;
    }

    let x = PhaserClamp(player.x + vx * dt, minX, maxX);
    let y = player.y + vy * dt;
    let grounded = false;
    if (y >= VOLLEYBALL_FLOOR_Y - VOLLEYBALL_PLAYER_RADIUS) {
      y = VOLLEYBALL_FLOOR_Y - VOLLEYBALL_PLAYER_RADIUS;
      vy = 0;
      grounded = true;
      if (action === "jump") action = move === 0 ? "idle" : "run";
    }

    return {
      ...player,
      x,
      y,
      vx,
      vy,
      facing: move < 0 ? -1 : move > 0 ? 1 : player.facing,
      grounded,
      action,
      actionMs,
      recoveryMs,
      contactCooldownMs
    };
  });
}

function updateBall(ball: VolleyballBall, dt: number): VolleyballBall {
  return {
    ...ball,
    x: ball.x + ball.vx * dt,
    y: ball.y + ball.vy * dt,
    vx: ball.vx * BALL_DRAG,
    vy: ball.vy + BALL_GRAVITY * dt
  };
}

function applyPlayerHits(
  ball: VolleyballBall,
  players: VolleyballPlayer[],
  possessionTeam: VolleyballTeam,
  sideHitCount: number
) {
  let nextBall = ball;
  const nextPlayers = players.map((player) => ({ ...player }));
  let nextPossessionTeam = possessionTeam;
  let nextSideHitCount = sideHitCount;
  let fault: { winner: VolleyballTeam } | null = null;
  nextPlayers.forEach((player, index) => {
    if (fault) return;
    const activeHit = player.action === "bump" || player.action === "set" || player.action === "spike" || player.action === "dive";
    if (player.contactCooldownMs > 0) {
      return;
    }
    const reachX = player.action === "dive" ? 76 : player.action === "spike" ? 60 : 54;
    const reachY = player.action === "spike" ? 90 : player.action === "set" ? 82 : 72;
    const distanceX = Math.abs(nextBall.x - player.x);
    const contactY = player.action === "spike" ? player.y - 58 : player.y - 24;
    const distanceY = Math.abs(nextBall.y - contactY);
    if (!activeHit || distanceX > reachX || distanceY > reachY || nextBall.lastTeam === player.team && nextBall.vy < -500) {
      return;
    }
    if (player.team !== nextPossessionTeam) {
      nextPossessionTeam = player.team;
      nextSideHitCount = 0;
    }
    if (nextSideHitCount >= 3) {
      fault = { winner: getOpponentTeam(player.team) };
      return;
    }
    const velocity = calculateHitVelocity(player.action as Exclude<VolleyballAction, "idle" | "run" | "jump">, player, nextBall);
    nextSideHitCount += 1;
    nextPlayers[index] = {
      ...player,
      contactCooldownMs: 220
    };
    nextBall = {
      ...nextBall,
      vx: velocity.vx,
      vy: velocity.vy,
      x: player.x + Math.sign(nextBall.x - player.x || player.facing) * (VOLLEYBALL_PLAYER_RADIUS + VOLLEYBALL_BALL_RADIUS + 2),
      y: Math.min(nextBall.y, contactY),
      lastTeam: player.team
    };
  });
  return { ball: nextBall, players: nextPlayers, possessionTeam: nextPossessionTeam, sideHitCount: nextSideHitCount, fault };
}

function resolveNet(ball: VolleyballBall): VolleyballBall {
  const hitsNetX = Math.abs(ball.x - VOLLEYBALL_NET_X) < VOLLEYBALL_NET_WIDTH / 2 + VOLLEYBALL_BALL_RADIUS;
  const hitsNetY = ball.y > VOLLEYBALL_NET_TOP && ball.y < VOLLEYBALL_FLOOR_Y;
  if (!hitsNetX || !hitsNetY) {
    return ball;
  }
  const side = ball.x < VOLLEYBALL_NET_X ? -1 : 1;
  return {
    ...ball,
    x: VOLLEYBALL_NET_X + side * (VOLLEYBALL_NET_WIDTH / 2 + VOLLEYBALL_BALL_RADIUS),
    vx: -ball.vx * 0.45,
    vy: Math.min(ball.vy, -210)
  };
}

function getPointWinner(ball: VolleyballBall): VolleyballTeam | null {
  if (ball.y >= VOLLEYBALL_FLOOR_Y - VOLLEYBALL_BALL_RADIUS) {
    return ball.x < VOLLEYBALL_NET_X ? "tide" : "sun";
  }
  if (ball.x < -VOLLEYBALL_BALL_RADIUS) {
    return "tide";
  }
  if (ball.x > VOLLEYBALL_WIDTH + VOLLEYBALL_BALL_RADIUS) {
    return "sun";
  }
  return null;
}

function separatePlayers(players: VolleyballPlayer[], mode: VolleyballMode) {
  if (mode !== "2v2") return players;
  const next = players.map((player) => ({ ...player }));
  (["sun", "tide"] as VolleyballTeam[]).forEach((team) => {
    const teamPlayers = next.filter((player) => player.team === team);
    if (teamPlayers.length < 2) return;
    const [a, b] = teamPlayers;
    const gap = Math.abs(a.x - b.x);
    if (gap >= 54) return;
    const push = (54 - gap) / 2;
    if (a.x <= b.x) {
      a.x -= push;
      b.x += push;
    } else {
      a.x += push;
      b.x -= push;
    }
  });
  return next;
}

function updatePossessionForCrossing(state: VolleyballMatchState, ball: VolleyballBall) {
  const crossedLeftToRight = state.ball.x < VOLLEYBALL_NET_X && ball.x >= VOLLEYBALL_NET_X;
  const crossedRightToLeft = state.ball.x > VOLLEYBALL_NET_X && ball.x <= VOLLEYBALL_NET_X;
  const cleanCross = ball.y < VOLLEYBALL_NET_TOP - VOLLEYBALL_BALL_RADIUS;
  if (cleanCross && crossedLeftToRight) {
    return { possessionTeam: "tide" as VolleyballTeam, sideHitCount: 0 };
  }
  if (cleanCross && crossedRightToLeft) {
    return { possessionTeam: "sun" as VolleyballTeam, sideHitCount: 0 };
  }
  return { possessionTeam: state.possessionTeam, sideHitCount: state.sideHitCount };
}

export function getOpponentTeam(team: VolleyballTeam): VolleyballTeam {
  return team === "sun" ? "tide" : "sun";
}

function PhaserClamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getTeamLabel(team: VolleyballTeam) {
  return team === "sun" ? "Sun Squad" : "Tide Crew";
}
