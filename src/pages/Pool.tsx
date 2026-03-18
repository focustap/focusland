import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";
import { supabase } from "../lib/supabase";

type PlayerPresence = {
  userId: string;
  username: string;
  onlineAt: string;
};

type BallGroup = "solids" | "stripes";

type Ball = {
  id: string;
  label: string;
  number: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  isStripe: boolean;
  isCue: boolean;
  isEight: boolean;
  pocketed: boolean;
};

type PoolState = {
  phase: "waiting" | "playing" | "gameOver";
  balls: Ball[];
  currentTurnId: string | null;
  groups: Record<string, BallGroup | null>;
  winnerId: string | null;
  cueBallInHandForId: string | null;
  shotOwnerId: string | null;
  shotPocketedIds: string[];
  shotScratch: boolean;
  rewardTotals: Record<string, number>;
  message: string;
};

type ShotPayload = {
  userId: string;
  aimX: number;
  aimY: number;
  power: number;
};

type PlaceCuePayload = {
  userId: string;
  x: number;
  y: number;
};

const ROOM_NAME = "focusland-pool";
const TABLE_WIDTH = 920;
const TABLE_HEIGHT = 520;
const RAIL = 36;
const PLAY_X = RAIL;
const PLAY_Y = RAIL;
const PLAY_WIDTH = TABLE_WIDTH - RAIL * 2;
const PLAY_HEIGHT = TABLE_HEIGHT - RAIL * 2;
const BALL_RADIUS = 11;
const POCKET_RADIUS = 24;
const FRICTION = 0.985;
const MIN_SPEED = 0.06;
const MAX_POWER = 12;
const POWER_BAR_X = TABLE_WIDTH - 54;
const POWER_BAR_Y = 80;
const POWER_BAR_HEIGHT = 300;
const POWER_BAR_WIDTH = 18;
const BALL_REWARD_GOLD = 1;
const WIN_REWARD_GOLD = 25;

const POCKETS = [
  { x: PLAY_X, y: PLAY_Y },
  { x: PLAY_X + PLAY_WIDTH / 2, y: PLAY_Y - 4 },
  { x: PLAY_X + PLAY_WIDTH, y: PLAY_Y },
  { x: PLAY_X, y: PLAY_Y + PLAY_HEIGHT },
  { x: PLAY_X + PLAY_WIDTH / 2, y: PLAY_Y + PLAY_HEIGHT + 4 },
  { x: PLAY_X + PLAY_WIDTH, y: PLAY_Y + PLAY_HEIGHT }
];

const DEFAULT_STATE: PoolState = {
  phase: "waiting",
  balls: [],
  currentTurnId: null,
  groups: {},
  winnerId: null,
  cueBallInHandForId: null,
  shotOwnerId: null,
  shotPocketedIds: [],
  shotScratch: false,
  rewardTotals: {},
  message: "Waiting for two players."
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function getPlayersFromPresence(
  rawPresence: Record<string, Array<{ userId: string; username: string; onlineAt: string }>>
) {
  const players = Object.values(rawPresence)
    .flat()
    .map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      onlineAt: entry.onlineAt
    }));

  const deduped = new Map<string, PlayerPresence>();
  players.forEach((player) => {
    if (!deduped.has(player.userId)) {
      deduped.set(player.userId, player);
    }
  });

  return Array.from(deduped.values()).sort((a, b) => a.onlineAt.localeCompare(b.onlineAt));
}

function createRack() {
  const cueX = PLAY_X + PLAY_WIDTH * 0.24;
  const cueY = PLAY_Y + PLAY_HEIGHT / 2;
  const rackX = PLAY_X + PLAY_WIDTH * 0.72;
  const rackY = PLAY_Y + PLAY_HEIGHT / 2;
  const spacing = BALL_RADIUS * 2.15;
  const rows = [
    [1],
    [9, 2],
    [10, 8, 3],
    [11, 4, 12, 5],
    [13, 6, 14, 7, 15]
  ];

  const colors: Record<number, string> = {
    1: "#facc15",
    2: "#2563eb",
    3: "#dc2626",
    4: "#7c3aed",
    5: "#f97316",
    6: "#15803d",
    7: "#7f1d1d",
    8: "#111827",
    9: "#facc15",
    10: "#2563eb",
    11: "#dc2626",
    12: "#7c3aed",
    13: "#f97316",
    14: "#15803d",
    15: "#7f1d1d"
  };

  const balls: Ball[] = [
    {
      id: "cue",
      label: "",
      number: 0,
      x: cueX,
      y: cueY,
      vx: 0,
      vy: 0,
      color: "#f8fafc",
      isStripe: false,
      isCue: true,
      isEight: false,
      pocketed: false
    }
  ];

  rows.forEach((row, rowIndex) => {
    row.forEach((number, rowBallIndex) => {
      balls.push({
        id: `ball-${number}`,
        label: String(number),
        number,
        x: rackX + rowIndex * spacing,
        y: rackY - (row.length - 1) * BALL_RADIUS + rowBallIndex * spacing,
        vx: 0,
        vy: 0,
        color: colors[number],
        isStripe: number >= 9,
        isCue: false,
        isEight: number === 8,
        pocketed: false
      });
    });
  });

  return balls;
}

function createInitialState(players: PlayerPresence[]): PoolState {
  return {
    phase: "playing",
    balls: createRack(),
    currentTurnId: players[0]?.userId ?? null,
    groups: players.reduce<Record<string, BallGroup | null>>((acc, player) => {
      acc[player.userId] = null;
      return acc;
    }, {}),
    winnerId: null,
    cueBallInHandForId: null,
    shotOwnerId: null,
    shotPocketedIds: [],
    shotScratch: false,
    rewardTotals: players.reduce<Record<string, number>>((acc, player) => {
      acc[player.userId] = 0;
      return acc;
    }, {}),
    message: `${players[0]?.username ?? "Host"} breaks. First made ball claims solids or stripes.`
  };
}

function getOpponentId(players: PlayerPresence[], userId: string) {
  return players.find((player) => player.userId !== userId)?.userId ?? null;
}

function getGroupForBall(ball: Ball): BallGroup | null {
  if (ball.isCue || ball.isEight) return null;
  return ball.isStripe ? "stripes" : "solids";
}

function getAimVector(cueBall: Ball, aimX: number, aimY: number) {
  const dx = aimX - cueBall.x;
  const dy = aimY - cueBall.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function getFirstTargetBall(cueBall: Ball, balls: Ball[], aimX: number, aimY: number) {
  const aim = getAimVector(cueBall, aimX, aimY);
  let bestBall: Ball | null = null;
  let bestProjection = Number.POSITIVE_INFINITY;

  balls.forEach((ball) => {
    if (ball.pocketed || ball.isCue) return;
    const toBallX = ball.x - cueBall.x;
    const toBallY = ball.y - cueBall.y;
    const projection = toBallX * aim.x + toBallY * aim.y;
    if (projection <= 0 || projection >= bestProjection) return;

    const perpendicular = Math.abs(toBallX * aim.y - toBallY * aim.x);
    if (perpendicular > BALL_RADIUS * 2.2) return;

    bestProjection = projection;
    bestBall = ball;
  });

  return bestBall;
}

function applyShotToState(currentState: PoolState, players: PlayerPresence[], shot: ShotPayload) {
  const cue = currentState.balls.find((ball) => ball.isCue);
  if (
    currentState.phase !== "playing" ||
    !cue ||
    cue.pocketed ||
    currentState.currentTurnId !== shot.userId ||
    currentState.cueBallInHandForId !== null ||
    currentState.balls.some(
      (ball) => !ball.pocketed && (Math.abs(ball.vx) >= MIN_SPEED || Math.abs(ball.vy) >= MIN_SPEED)
    )
  ) {
    return null;
  }

  const aim = getAimVector(cue, shot.aimX, shot.aimY);
  return {
    ...currentState,
    balls: currentState.balls.map((ball) =>
      ball.isCue
        ? {
            ...ball,
            vx: aim.x * shot.power * MAX_POWER,
            vy: aim.y * shot.power * MAX_POWER
          }
        : ball
    ),
    shotOwnerId: shot.userId,
    shotPocketedIds: [],
    shotScratch: false,
    message: `${players.find((player) => player.userId === shot.userId)?.username ?? "Player"} shoots.`
  } satisfies PoolState;
}

function canPlaceCueBall(balls: Ball[], x: number, y: number) {
  if (
    x < PLAY_X + BALL_RADIUS ||
    x > PLAY_X + PLAY_WIDTH - BALL_RADIUS ||
    y < PLAY_Y + BALL_RADIUS ||
    y > PLAY_Y + PLAY_HEIGHT - BALL_RADIUS
  ) {
    return false;
  }

  return balls.every((ball) => {
    if (ball.pocketed || ball.isCue) return true;
    return distance(ball.x, ball.y, x, y) > BALL_RADIUS * 2.1;
  });
}

const Pool: React.FC = () => {
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [connected, setConnected] = useState(false);
  const [roomFull, setRoomFull] = useState(false);
  const [poolState, setPoolState] = useState<PoolState>(DEFAULT_STATE);
  const [power, setPower] = useState(0.35);
  const [aimLocked, setAimLocked] = useState(false);
  const [lockedAim, setLockedAim] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stateRef = useRef<PoolState>(DEFAULT_STATE);
  const playersRef = useRef<PlayerPresence[]>([]);
  const currentUserIdRef = useRef<string | null>(null);
  const isHostRef = useRef(false);
  const tickRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const draggingPowerRef = useRef(false);
  const mouseRef = useRef({ x: PLAY_X + 120, y: PLAY_Y + PLAY_HEIGHT / 2, insideTable: false });
  const appliedRewardRef = useRef(0);

  useEffect(() => {
    stateRef.current = poolState;
  }, [poolState]);

  useEffect(() => {
    playersRef.current = players;
    isHostRef.current = Boolean(currentUserId && players[0]?.userId === currentUserId);
  }, [currentUserId, players]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const isSeated = currentUserId ? players.some((player) => player.userId === currentUserId) : false;
  const isHost = Boolean(currentUserId && players[0]?.userId === currentUserId);
  const cueBall = useMemo(() => poolState.balls.find((ball) => ball.isCue) ?? null, [poolState.balls]);
  const allStopped = useMemo(
    () => poolState.balls.every((ball) => ball.pocketed || (Math.abs(ball.vx) < MIN_SPEED && Math.abs(ball.vy) < MIN_SPEED)),
    [poolState.balls]
  );
  const canShoot = Boolean(
    currentUserId &&
      poolState.phase === "playing" &&
      poolState.currentTurnId === currentUserId &&
      poolState.cueBallInHandForId === null &&
      cueBall &&
      !cueBall.pocketed &&
      allStopped
  );
  const canPlaceCue = Boolean(
    currentUserId &&
      poolState.phase === "playing" &&
      poolState.cueBallInHandForId === currentUserId &&
      allStopped
  );
  const activeAim = aimLocked && lockedAim ? lockedAim : mouseRef.current;

  useEffect(() => {
    if (!currentUserId) return;
    const total = poolState.rewardTotals[currentUserId] ?? 0;
    const delta = total - appliedRewardRef.current;
    if (delta <= 0) return;
    appliedRewardRef.current = total;
    void recordArcadeResult({ goldEarned: delta });
  }, [currentUserId, poolState.rewardTotals]);

  const broadcastState = async (nextState: PoolState) => {
    setPoolState(nextState);
    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "pool-state",
        payload: nextState
      });
    }
  };

  useEffect(() => {
    let isUnmounted = false;

    const syncPresence = () => {
      const channel = channelRef.current;
      if (!channel) return;

      const nextPlayers = getPlayersFromPresence(
        channel.presenceState() as Record<string, Array<{ userId: string; username: string; onlineAt: string }>>
      ).slice(0, 2);
      setPlayers(nextPlayers);
      setRoomFull(
        nextPlayers.length >= 2 &&
          !nextPlayers.some((player) => player.userId === currentUserIdRef.current)
      );

    };

    const setup = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session || isUnmounted) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", session.user.id)
        .maybeSingle();

      const username = (profile?.username as string | null) ?? session.user.email ?? "Player";
      setCurrentUserId(session.user.id);
      setCurrentUsername(username);

      const channel = supabase.channel(ROOM_NAME, {
        config: { presence: { key: session.user.id } }
      });
      channelRef.current = channel;

      channel.on("presence", { event: "sync" }, syncPresence);
      channel.on("broadcast", { event: "pool-state" }, ({ payload }) => {
        setPoolState(payload as PoolState);
      });
      channel.on("broadcast", { event: "pool-shot" }, ({ payload }) => {
        if (!isHostRef.current) return;
        const nextState = applyShotToState(stateRef.current, playersRef.current, payload as ShotPayload);
        if (nextState) {
          void broadcastState(nextState);
        }
      });
      channel.on("broadcast", { event: "pool-place-cue" }, ({ payload }) => {
        if (!isHostRef.current) return;
        const placement = payload as PlaceCuePayload;
        const currentState = stateRef.current;
        if (
          currentState.phase !== "playing" ||
          currentState.cueBallInHandForId !== placement.userId ||
          !canPlaceCueBall(currentState.balls, placement.x, placement.y)
        ) {
          return;
        }

        const nextState: PoolState = {
          ...currentState,
          balls: currentState.balls.map((ball) =>
            ball.isCue
              ? {
                  ...ball,
                  pocketed: false,
                  x: placement.x,
                  y: placement.y,
                  vx: 0,
                  vy: 0
                }
              : ball
          ),
          cueBallInHandForId: null,
          message: "Cue ball placed. Take the shot."
        };
        void broadcastState(nextState);
      });

      channel.subscribe(async (subscriptionStatus) => {
        if (subscriptionStatus !== "SUBSCRIBED" || isUnmounted) return;

        const present = getPlayersFromPresence(
          channel.presenceState() as Record<string, Array<{ userId: string; username: string; onlineAt: string }>>
        );
        if (present.length >= 2) {
          setRoomFull(true);
          return;
        }

        const trackStatus = await channel.track({
          userId: session.user.id,
          username,
          onlineAt: new Date().toISOString()
        });

        if (trackStatus === "ok") {
          setConnected(true);
        }
      });
    };

    void setup();

    return () => {
      isUnmounted = true;
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      const channel = channelRef.current;
      if (channel) {
        void supabase.removeChannel(channel);
        channelRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isHost || poolState.phase !== "playing" || players.length !== 2) {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    tickRef.current = window.setInterval(() => {
      const currentState = stateRef.current;
      if (currentState.phase !== "playing") return;

      const nextBalls = currentState.balls.map((ball) => ({ ...ball }));
      let newPocketedIds = [...currentState.shotPocketedIds];
      let shotScratch = currentState.shotScratch;

      nextBalls.forEach((ball) => {
        if (ball.pocketed) return;
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.vx *= FRICTION;
        ball.vy *= FRICTION;
        if (Math.abs(ball.vx) < MIN_SPEED) ball.vx = 0;
        if (Math.abs(ball.vy) < MIN_SPEED) ball.vy = 0;

        if (ball.x - BALL_RADIUS <= PLAY_X) {
          ball.x = PLAY_X + BALL_RADIUS;
          ball.vx *= -1;
        }
        if (ball.x + BALL_RADIUS >= PLAY_X + PLAY_WIDTH) {
          ball.x = PLAY_X + PLAY_WIDTH - BALL_RADIUS;
          ball.vx *= -1;
        }
        if (ball.y - BALL_RADIUS <= PLAY_Y) {
          ball.y = PLAY_Y + BALL_RADIUS;
          ball.vy *= -1;
        }
        if (ball.y + BALL_RADIUS >= PLAY_Y + PLAY_HEIGHT) {
          ball.y = PLAY_Y + PLAY_HEIGHT - BALL_RADIUS;
          ball.vy *= -1;
        }
      });

      for (let i = 0; i < nextBalls.length; i += 1) {
        const a = nextBalls[i];
        if (a.pocketed) continue;
        for (let j = i + 1; j < nextBalls.length; j += 1) {
          const b = nextBalls[j];
          if (b.pocketed) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const minDist = BALL_RADIUS * 2;
          if (!dist || dist >= minDist) continue;

          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          const tx = -ny;
          const ty = nx;
          const dpTanA = a.vx * tx + a.vy * ty;
          const dpTanB = b.vx * tx + b.vy * ty;
          const dpNormA = a.vx * nx + a.vy * ny;
          const dpNormB = b.vx * nx + b.vy * ny;
          a.vx = tx * dpTanA + nx * dpNormB;
          a.vy = ty * dpTanA + ny * dpNormB;
          b.vx = tx * dpTanB + nx * dpNormA;
          b.vy = ty * dpTanB + ny * dpNormA;
        }
      }

      nextBalls.forEach((ball) => {
        if (ball.pocketed) return;
        if (!POCKETS.some((pocket) => distance(ball.x, ball.y, pocket.x, pocket.y) <= POCKET_RADIUS)) {
          return;
        }
        ball.pocketed = true;
        ball.vx = 0;
        ball.vy = 0;
        if (!newPocketedIds.includes(ball.id)) {
          newPocketedIds.push(ball.id);
        }
        if (ball.isCue) {
          shotScratch = true;
        }
      });

      const moving = nextBalls.some(
        (ball) => !ball.pocketed && (Math.abs(ball.vx) >= MIN_SPEED || Math.abs(ball.vy) >= MIN_SPEED)
      );

      let nextState: PoolState = {
        ...currentState,
        balls: nextBalls,
        shotPocketedIds: newPocketedIds,
        shotScratch
      };

      if (!moving && currentState.shotOwnerId) {
        const shooterId = currentState.shotOwnerId;
        const opponentId = getOpponentId(playersRef.current, shooterId);
        const nextGroups = { ...currentState.groups };
        const pocketedBalls = newPocketedIds
          .map((id) => nextBalls.find((ball) => ball.id === id) ?? null)
          .filter((ball): ball is Ball => Boolean(ball));
        const firstObjectBall = pocketedBalls.find((ball) => !ball.isCue && !ball.isEight) ?? null;

        if (shooterId && opponentId && !nextGroups[shooterId] && firstObjectBall) {
          const shooterGroup = getGroupForBall(firstObjectBall);
          nextGroups[shooterId] = shooterGroup;
          nextGroups[opponentId] = shooterGroup === "stripes" ? "solids" : "stripes";
        }

        const shooterGroup = nextGroups[shooterId];
        const shooterPocketedOwnGroup = Boolean(
          shooterGroup &&
            pocketedBalls.some((ball) => getGroupForBall(ball) === shooterGroup)
        );
        const remainingShooterGroupBalls = nextBalls.filter((ball) => {
          if (ball.pocketed || ball.isCue || ball.isEight) return false;
          if (!shooterGroup) return false;
          return shooterGroup === "stripes" ? ball.isStripe : !ball.isStripe;
        });
        const eightBallPocketed = pocketedBalls.some((ball) => ball.isEight);

        if (eightBallPocketed) {
          const legalWin = Boolean(shooterGroup && remainingShooterGroupBalls.length === 0 && !shotScratch);
          const winnerId = legalWin ? shooterId : opponentId;
          nextState = {
            ...nextState,
            phase: "gameOver",
            winnerId,
            groups: nextGroups,
            currentTurnId: null,
            cueBallInHandForId: null,
            shotOwnerId: null,
            shotPocketedIds: [],
            shotScratch: false,
            rewardTotals: legalWin && winnerId
              ? {
                  ...currentState.rewardTotals,
                  [winnerId]: (currentState.rewardTotals[winnerId] ?? 0) + WIN_REWARD_GOLD
                }
              : currentState.rewardTotals,
            message: legalWin
              ? `${playersRef.current.find((player) => player.userId === shooterId)?.username ?? "Player"} sinks the eight ball and wins.`
              : `${playersRef.current.find((player) => player.userId === opponentId)?.username ?? "Player"} wins after an illegal eight ball.`
          };
        } else {
          const rewardTotals = { ...currentState.rewardTotals };
          const rewardedBalls = pocketedBalls.filter((ball) => {
            if (ball.isCue || ball.isEight) {
              return false;
            }
            if (!shooterGroup) {
              return getGroupForBall(ball) === getGroupForBall(firstObjectBall ?? ball);
            }
            return getGroupForBall(ball) === shooterGroup;
          });
          rewardTotals[shooterId] = (rewardTotals[shooterId] ?? 0) + rewardedBalls.length * BALL_REWARD_GOLD;

          if (shotScratch) {
            const cue = nextBalls.find((ball) => ball.isCue);
            if (cue) {
              cue.pocketed = false;
              cue.vx = 0;
              cue.vy = 0;
              cue.x = PLAY_X + PLAY_WIDTH * 0.24;
              cue.y = PLAY_Y + PLAY_HEIGHT / 2;
            }
          }

          const nextTurnId = shotScratch || !shooterPocketedOwnGroup ? opponentId : shooterId;
          nextState = {
            ...nextState,
            groups: nextGroups,
            rewardTotals,
            currentTurnId: nextTurnId,
            cueBallInHandForId: shotScratch ? opponentId : null,
            shotOwnerId: null,
            shotPocketedIds: [],
            shotScratch: false,
            message: shotScratch
              ? "Scratch. Opponent has ball in hand."
              : shooterPocketedOwnGroup
                ? "Ball down. Same shooter."
                : "Turn passes."
          };
        }
      }

      void broadcastState(nextState);
    }, 16);

    return () => {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [isHost, players, poolState.phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const draw = () => {
      const currentState = stateRef.current;
      context.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      context.fillStyle = "#4b2e19";
      context.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      context.fillStyle = "#0f6b52";
      context.fillRect(PLAY_X, PLAY_Y, PLAY_WIDTH, PLAY_HEIGHT);
      context.strokeStyle = "rgba(255,255,255,0.12)";
      context.lineWidth = 2;
      context.strokeRect(PLAY_X + 2, PLAY_Y + 2, PLAY_WIDTH - 4, PLAY_HEIGHT - 4);

      POCKETS.forEach((pocket) => {
        context.fillStyle = "#020617";
        context.beginPath();
        context.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
        context.fill();
      });

      currentState.balls.forEach((ball) => {
        if (ball.pocketed) return;
        context.fillStyle = ball.color;
        context.beginPath();
        context.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        context.fill();

        if (ball.isStripe && !ball.isCue) {
          context.fillStyle = "#f8fafc";
          context.beginPath();
          context.arc(ball.x, ball.y, BALL_RADIUS - 4, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = ball.color;
          context.fillRect(ball.x - BALL_RADIUS + 3, ball.y - 4, BALL_RADIUS * 2 - 6, 8);
        }

        if (!ball.isCue) {
          context.fillStyle = ball.isEight ? "#f8fafc" : "#111827";
          context.font = "10px monospace";
          context.textAlign = "center";
          context.fillText(ball.label, ball.x, ball.y + 3);
        }
      });

      const currentCue = currentState.balls.find((ball) => ball.isCue);
      const canGuide =
        currentCue &&
        !currentCue.pocketed &&
        currentState.phase === "playing" &&
        currentState.currentTurnId === currentUserIdRef.current &&
        currentState.cueBallInHandForId === null &&
        currentState.balls.every(
          (ball) => ball.pocketed || (Math.abs(ball.vx) < MIN_SPEED && Math.abs(ball.vy) < MIN_SPEED)
        );

      if (currentCue && canGuide) {
        const aim = getAimVector(currentCue, activeAim.x, activeAim.y);
        context.strokeStyle = "rgba(255,255,255,0.6)";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(currentCue.x, currentCue.y);
        context.lineTo(currentCue.x + aim.x * 92, currentCue.y + aim.y * 92);
        context.stroke();

        context.strokeStyle = aimLocked ? "rgba(251,191,36,0.72)" : "rgba(255,255,255,0.18)";
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(currentCue.x - aim.x * 24, currentCue.y - aim.y * 24);
        context.lineTo(currentCue.x - aim.x * (38 + power * 18), currentCue.y - aim.y * (38 + power * 18));
        context.stroke();

        const targetBall = getFirstTargetBall(currentCue, currentState.balls, activeAim.x, activeAim.y);
        if (targetBall) {
          const targetDir = getAimVector(currentCue, targetBall.x, targetBall.y);
          context.strokeStyle = "rgba(96,165,250,0.55)";
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(targetBall.x, targetBall.y);
          context.lineTo(targetBall.x + targetDir.x * 54, targetBall.y + targetDir.y * 54);
          context.stroke();

          context.fillStyle = "rgba(96,165,250,0.75)";
          context.beginPath();
          context.arc(targetBall.x, targetBall.y, BALL_RADIUS + 3, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = targetBall.color;
          context.beginPath();
          context.arc(targetBall.x, targetBall.y, BALL_RADIUS, 0, Math.PI * 2);
          context.fill();

          if (targetBall.isStripe && !targetBall.isCue) {
            context.fillStyle = "#f8fafc";
            context.beginPath();
            context.arc(targetBall.x, targetBall.y, BALL_RADIUS - 4, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = targetBall.color;
            context.fillRect(targetBall.x - BALL_RADIUS + 3, targetBall.y - 4, BALL_RADIUS * 2 - 6, 8);
          }

          context.fillStyle = targetBall.isEight ? "#f8fafc" : "#111827";
          context.font = "10px monospace";
          context.textAlign = "center";
          context.fillText(targetBall.label, targetBall.x, targetBall.y + 3);
        }
      }

      if (currentState.cueBallInHandForId === currentUserIdRef.current) {
        context.strokeStyle = "rgba(96,165,250,0.8)";
        context.lineWidth = 2;
        context.strokeRect(PLAY_X + BALL_RADIUS, PLAY_Y + BALL_RADIUS, PLAY_WIDTH - BALL_RADIUS * 2, PLAY_HEIGHT - BALL_RADIUS * 2);
      }

      context.fillStyle = "#111827";
      context.fillRect(POWER_BAR_X, POWER_BAR_Y, POWER_BAR_WIDTH, POWER_BAR_HEIGHT);
      context.fillStyle = "#ef4444";
      context.fillRect(
        POWER_BAR_X,
        POWER_BAR_Y + POWER_BAR_HEIGHT * (1 - power),
        POWER_BAR_WIDTH,
        POWER_BAR_HEIGHT * power
      );
      context.strokeStyle = "#f8fafc";
      context.strokeRect(POWER_BAR_X, POWER_BAR_Y, POWER_BAR_WIDTH, POWER_BAR_HEIGHT);

      frameRef.current = window.requestAnimationFrame(draw);
    };

    frameRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [activeAim.x, activeAim.y, aimLocked, power]);

  const placeCueBall = async (x: number, y: number) => {
    if (!canPlaceCue || !currentUserId || !channelRef.current) return;
    if (!canPlaceCueBall(stateRef.current.balls, x, y)) return;

    if (isHost) {
      const nextState: PoolState = {
        ...stateRef.current,
        balls: stateRef.current.balls.map((ball) =>
          ball.isCue
            ? {
                ...ball,
                pocketed: false,
                x,
                y,
                vx: 0,
                vy: 0
              }
            : ball
        ),
        cueBallInHandForId: null,
        message: "Cue ball placed. Take the shot."
      };
      await broadcastState(nextState);
      return;
    }

    await channelRef.current.send({
      type: "broadcast",
      event: "pool-place-cue",
      payload: {
        userId: currentUserId,
        x,
        y
      } satisfies PlaceCuePayload
    });
  };

  const sendShot = async () => {
    if (!currentUserId || !canShoot || !channelRef.current) {
      return;
    }

    const target = aimLocked && lockedAim ? lockedAim : mouseRef.current;
    const shot = {
      userId: currentUserId,
      aimX: target.x,
      aimY: target.y,
      power
    } satisfies ShotPayload;

    if (isHost) {
      const nextState = applyShotToState(stateRef.current, playersRef.current, shot);
      if (nextState) {
        await broadcastState(nextState);
      }
    } else {
      await channelRef.current.send({
        type: "broadcast",
        event: "pool-shot",
        payload: shot
      });
    }

    setAimLocked(false);
    setLockedAim(null);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * TABLE_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * TABLE_HEIGHT;

    if (canPlaceCue) {
      void placeCueBall(x, y);
      return;
    }

    mouseRef.current = {
      x,
      y,
      insideTable: x >= PLAY_X && x <= PLAY_X + PLAY_WIDTH && y >= PLAY_Y && y <= PLAY_Y + PLAY_HEIGHT
    };

    if (
      x >= POWER_BAR_X - 10 &&
      x <= POWER_BAR_X + POWER_BAR_WIDTH + 10 &&
      y >= POWER_BAR_Y &&
      y <= POWER_BAR_Y + POWER_BAR_HEIGHT
    ) {
      if (!aimLocked) return;
      draggingPowerRef.current = true;
      setPower(clamp(1 - (y - POWER_BAR_Y) / POWER_BAR_HEIGHT, 0.12, 1));
      return;
    }

    if (canShoot && mouseRef.current.insideTable) {
      if (aimLocked) {
        setAimLocked(false);
        setLockedAim(null);
      } else {
        setAimLocked(true);
        setLockedAim({ x, y });
      }
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * TABLE_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * TABLE_HEIGHT;

    if (!aimLocked) {
      mouseRef.current = {
        x,
        y,
        insideTable: x >= PLAY_X && x <= PLAY_X + PLAY_WIDTH && y >= PLAY_Y && y <= PLAY_Y + PLAY_HEIGHT
      };
    }

    if (draggingPowerRef.current) {
      setPower(clamp(1 - (y - POWER_BAR_Y) / POWER_BAR_HEIGHT, 0.12, 1));
    }
  };

  const handlePointerUp = () => {
    if (!draggingPowerRef.current) return;
    draggingPowerRef.current = false;
    void sendShot();
  };

  const startMatch = async () => {
    if (!isHost || players.length !== 2) return;
    await broadcastState(createInitialState(players));
    setAimLocked(false);
    setLockedAim(null);
    appliedRewardRef.current = 0;
  };

  const opponent = players.find((player) => player.userId !== currentUserId) ?? null;
  const myGroup = currentUserId ? poolState.groups[currentUserId] : null;
  const opponentGroup = opponent ? poolState.groups[opponent.userId] : null;

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 980 }}>
        <h2>8 Ball</h2>
        <p>Two-player table. Click once to lock your aim, then drag the power bar and release to shoot. First made ball assigns solids or stripes.</p>
        <div className="info">
          Seats filled: {Math.min(players.length, 2)}/2
          {connected && !roomFull ? ` | ${currentUsername}` : ""}
          {poolState.currentTurnId ? ` | Turn: ${players.find((player) => player.userId === poolState.currentTurnId)?.username ?? "Player"}` : ""}
        </div>
        {roomFull && !isSeated ? (
          <div className="error">Two players are already at this table. Wait for someone to leave.</div>
        ) : (
          <>
            <div className="button-row">
              {players.map((player) => (
                <span key={player.userId} className="secondary-button">
                  {player.username} {poolState.groups[player.userId] ? `(${poolState.groups[player.userId]})` : ""}
                </span>
              ))}
            </div>
            <canvas
              ref={canvasRef}
              width={TABLE_WIDTH}
              height={TABLE_HEIGHT}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              style={{
                width: "100%",
                maxWidth: TABLE_WIDTH,
                display: "block",
                margin: "1rem auto",
                borderRadius: "1rem",
                border: "1px solid #334155",
                background: "#4b2e19",
                touchAction: "none",
                cursor: canPlaceCue ? "copy" : canShoot ? "crosshair" : "default"
              }}
            />
            <p className="info">{poolState.message}</p>
            <p className="score-display">
              You: {myGroup ?? "open"} | Opponent: {opponentGroup ?? "open"} | Aim: {aimLocked ? "locked" : "free"}
            </p>
            {poolState.phase === "waiting" && isHost && (
              <button className="primary-button" type="button" onClick={() => void startMatch()} disabled={players.length !== 2}>
                Start rack
              </button>
            )}
            {poolState.phase === "gameOver" && isHost && (
              <button className="primary-button" type="button" onClick={() => void startMatch()}>
                Rack again
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Pool;
