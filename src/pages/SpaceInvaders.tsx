import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { supabase } from "../lib/supabase";

type PlayerPresence = {
  userId: string;
  username: string;
  onlineAt: string;
};

type InvaderKind = "normal" | "tank" | "yellow" | "boss" | "duoFat" | "duoSkinny";
type BulletKind = "player" | "fireball" | "enemy" | "missile" | "bola" | "boss";

type Invader = {
  id: string;
  x: number;
  y: number;
  alive: boolean;
  kind: InvaderKind;
  hp: number;
  maxHp: number;
  width: number;
  height: number;
  shieldActive?: boolean;
  shieldCooldownMs?: number;
  weakPointPhase?: number;
  homeX?: number;
  homeY?: number;
  attackMode?: "idle" | "slam" | "return";
  attackCooldownMs?: number;
};

type Bullet = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  damage: number;
  width: number;
  height: number;
  speed: number;
  color: string;
  kind: BulletKind;
  vx?: number;
};

type Effect = {
  id: string;
  x: number;
  y: number;
  ttlMs: number;
  color: string;
  radius: number;
};

type PlayerState = {
  x: number;
  alive: boolean;
  lives: number;
  cooldownMs: number;
  respawnMs: number;
  flashMs: number;
};

type InputState = {
  left: boolean;
  right: boolean;
  shoot: boolean;
  fireball: boolean;
};

type GameState = {
  phase: "waiting" | "playing" | "gameOver";
  players: Record<string, PlayerState>;
  invaders: Invader[];
  bullets: Bullet[];
  enemyBullets: Bullet[];
  effects: Effect[];
  enemyDirection: 1 | -1;
  score: number;
  wave: number;
  message: string;
  waveDelayMs: number;
  killsTowardFireball: number;
  fireballsReady: number;
};

const ROOM_NAME = "focusland-invaders";
const WIDTH = 640;
const HEIGHT = 420;
const SHIP_Y = HEIGHT - 34;
const SHIP_WIDTH = 28;
const SHIP_HEIGHT = 18;
const STARTING_LIVES = 3;
const FIREBALL_KILL_REQUIREMENT = 40;
const FIREBALL_SPLASH_RADIUS = 60;
const BOSS_SHIELD_RESPAWN_MS = 8000;
const INVADER_COLS = 8;
const INVADER_SPACING_X = 60;
const INVADER_START_X = WIDTH / 2 - ((INVADER_COLS - 1) * INVADER_SPACING_X) / 2;
const SPACE_INVADERS_VERSION = "1.0.3";

const DEFAULT_STATE: GameState = {
  phase: "waiting",
  players: {},
  invaders: [],
  bullets: [],
  enemyBullets: [],
  effects: [],
  enemyDirection: 1,
  score: 0,
  wave: 1,
  message: "Waiting for two players.",
  waveDelayMs: 0,
  killsTowardFireball: 0,
  fireballsReady: 0
};

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

function createWaveInvaders(wave: number): Invader[] {
  if (wave === 8) {
    return [
      {
        id: "boss-wave-8",
        x: WIDTH / 2,
        y: 96,
        alive: true,
        kind: "boss",
        hp: 100,
        maxHp: 100,
        width: 150,
        height: 58,
        shieldActive: true,
        shieldCooldownMs: 0,
        weakPointPhase: 0
      }
    ];
  }

  if (wave === 12) {
    return [
      {
        id: "duo-fat",
        x: WIDTH * 0.33,
        y: 96,
        alive: true,
        kind: "duoFat",
        hp: 130,
        maxHp: 130,
        width: 94,
        height: 64,
        homeX: WIDTH * 0.33,
        homeY: 96,
        attackMode: "idle",
        attackCooldownMs: 1800
      },
      {
        id: "duo-skinny",
        x: WIDTH * 0.67,
        y: 92,
        alive: true,
        kind: "duoSkinny",
        hp: 90,
        maxHp: 90,
        width: 38,
        height: 78,
        homeX: WIDTH * 0.67,
        homeY: 92,
        attackMode: "idle",
        attackCooldownMs: 0
      }
    ];
  }

  const rows = Math.min(4 + Math.floor((wave - 1) / 2), 6);
  const cols = INVADER_COLS;
  const tankCount = wave >= 3 ? Math.min(2 + Math.floor((wave - 3) / 2), 6) : 0;
  const yellowCount = wave >= 9 && wave <= 11 ? Math.min(2 + (wave - 9), 4) : 0;
  const tankSlots: Array<{ row: number; col: number }> = [
    { row: 0, col: 2 },
    { row: 0, col: 5 },
    { row: 1, col: 1 },
    { row: 1, col: 6 },
    { row: 0, col: 3 },
    { row: 0, col: 4 }
  ];
  const yellowSlots: Array<{ row: number; col: number }> = [
    { row: 0, col: 0 },
    { row: 0, col: 7 },
    { row: 1, col: 3 },
    { row: 1, col: 4 }
  ];
  const activeTankSlots = tankSlots.slice(0, Math.min(tankCount, rows > 1 ? tankSlots.length : 2));
  const activeYellowSlots = yellowSlots.slice(0, Math.min(yellowCount, rows > 1 ? yellowSlots.length : 2));
  const invaders: Invader[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const isTank = activeTankSlots.some((slot) => slot.row === row && slot.col === col);
      const isYellow = activeYellowSlots.some((slot) => slot.row === row && slot.col === col);
      invaders.push({
        id: `wave-${wave}-enemy-${row}-${col}`,
        x: INVADER_START_X + col * INVADER_SPACING_X,
        y: 70 + row * 36,
        alive: true,
        kind: isTank ? "tank" : isYellow ? "yellow" : "normal",
        hp: isTank ? 3 : isYellow ? 2 : 1,
        maxHp: isTank ? 3 : isYellow ? 2 : 1,
        width: isTank ? 56 : isYellow ? 22 : 28,
        height: isTank ? 36 : isYellow ? 22 : 18,
        attackCooldownMs: isYellow ? 600 + row * 180 + col * 45 : 0
      });
    }
  }

  return invaders;
}

function buildInitialState(players: PlayerPresence[]): GameState {
  const playerState = players.reduce<Record<string, PlayerState>>((acc, player, index) => {
    acc[player.userId] = {
      x: index === 0 ? WIDTH * 0.3 : WIDTH * 0.7,
      alive: true,
      lives: STARTING_LIVES,
      cooldownMs: 0,
      respawnMs: 0,
      flashMs: 0
    };
    return acc;
  }, {});

  return {
    phase: "playing",
    players: playerState,
    invaders: createWaveInvaders(1),
    bullets: [],
    enemyBullets: [],
    effects: [],
    enemyDirection: 1,
    score: 0,
    wave: 1,
    message: "Wave 1. It gets ugly fast.",
    waveDelayMs: 0,
    killsTowardFireball: 0,
    fireballsReady: 0
  };
}

function createEffect(
  x: number,
  y: number,
  color: string,
  radius: number,
  ttlMs: number
): Effect {
  return {
    id: `${color}-${x}-${y}-${Date.now()}-${Math.random()}`,
    x,
    y,
    color,
    radius,
    ttlMs
  };
}

function playTone(
  context: AudioContext,
  frequency: number,
  durationMs: number,
  type: OscillatorType
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.035;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    context.currentTime + durationMs / 1000
  );
  oscillator.stop(context.currentTime + durationMs / 1000);
}

function getInvaderColor(invader: Invader) {
  if (invader.kind === "tank") return "#a855f7";
  if (invader.kind === "yellow") return "#facc15";
  if (invader.kind === "duoFat") return "#f1e5c8";
  if (invader.kind === "duoSkinny") return "#1f1726";
  if (invader.kind === "boss") return "#f43f5e";
  return "#22c55e";
}

function getBossWeakPoint(invader: Invader) {
  const phase = invader.weakPointPhase ?? 0;
  const radiusX = invader.width / 2 + 18;
  const radiusY = invader.height / 2 + 14;
  return {
    x: invader.x + Math.cos(phase) * radiusX,
    y: invader.y + Math.sin(phase) * radiusY
  };
}

const SpaceInvaders: React.FC = () => {
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [connected, setConnected] = useState(false);
  const [roomFull, setRoomFull] = useState(false);
  const [gameState, setGameState] = useState<GameState>(DEFAULT_STATE);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stateRef = useRef<GameState>(DEFAULT_STATE);
  const playersRef = useRef<PlayerPresence[]>([]);
  const currentUserIdRef = useRef<string | null>(null);
  const inputStatesRef = useRef<Record<string, InputState>>({});
  const tickRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousStateRef = useRef<GameState>(DEFAULT_STATE);

  const isSeated = currentUserId
    ? players.some((player) => player.userId === currentUserId)
    : false;
  const isHost = Boolean(currentUserId && players[0]?.userId === currentUserId);
  const opponent = useMemo(
    () => players.find((player) => player.userId !== currentUserId) ?? null,
    [players, currentUserId]
  );

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    const previousState = previousStateRef.current;
    const context = audioContextRef.current;

    if (context && context.state === "running") {
      if (gameState.score > previousState.score) {
        playTone(context, 620, 80, "square");
      }
      if (gameState.fireballsReady > previousState.fireballsReady) {
        playTone(context, 300, 120, "triangle");
        playTone(context, 520, 160, "triangle");
      }
      if (gameState.effects.length > previousState.effects.length) {
        const playerLostLife = players.some((player) => {
          const prevLives = previousState.players[player.userId]?.lives ?? STARTING_LIVES;
          const nextLives = gameState.players[player.userId]?.lives ?? STARTING_LIVES;
          return nextLives < prevLives;
        });
        playTone(context, playerLostLife ? 150 : 240, playerLostLife ? 190 : 120, "sawtooth");
      }
      if (gameState.wave > previousState.wave) {
        playTone(context, 520, 130, "triangle");
        playTone(context, 760, 150, "triangle");
      }
      if (gameState.phase === "gameOver" && previousState.phase !== "gameOver") {
        playTone(context, 120, 320, "sawtooth");
      }
    }

    previousStateRef.current = gameState;
  }, [gameState, players]);

  const ensureAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
  };

  const broadcastState = async (nextState: GameState) => {
    setGameState(nextState);
    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "invaders-state",
        payload: nextState
      });
    }
  };

  useEffect(() => {
    let isUnmounted = false;

    const syncPresence = () => {
      const channel = channelRef.current;
      if (!channel) return;

      const presenceState = channel.presenceState() as Record<string, PlayerPresence[]>;
      const nextPlayers = getPlayersFromPresence(presenceState).slice(0, 2);
      setPlayers(nextPlayers);
      setRoomFull(
        nextPlayers.length >= 2 &&
          !nextPlayers.some((player) => player.userId === currentUserIdRef.current)
      );
      if (nextPlayers.length < 2) {
        setGameState(DEFAULT_STATE);
      }
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
      channel.on("broadcast", { event: "invaders-state" }, ({ payload }) => {
        const nextState = payload as GameState;
        setGameState(nextState);
        stateRef.current = nextState;
      });
      channel.on("broadcast", { event: "invaders-input" }, ({ payload }) => {
        const nextPayload = payload as { userId: string; input: InputState };
        inputStatesRef.current = {
          ...inputStatesRef.current,
          [nextPayload.userId]: nextPayload.input
        };
      });

      channel.subscribe(async (subscriptionStatus) => {
        if (subscriptionStatus !== "SUBSCRIBED" || isUnmounted) return;

        const present = getPlayersFromPresence(
          channel.presenceState() as Record<string, PlayerPresence[]>
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
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
      const channel = channelRef.current;
      if (channel) {
        void supabase.removeChannel(channel);
        channelRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isHost || players.length !== 2 || gameState.phase !== "playing") {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    tickRef.current = window.setInterval(() => {
      const currentState = stateRef.current;
      if (currentState.phase !== "playing") return;

      const currentPlayers = playersRef.current;
      const wave = currentState.wave;
      const rainbowBossWave = wave === 8;
      const duoWave = wave === 12;
      const bossWave = rainbowBossWave || duoWave;
      const speedWave = Math.min(wave, 8);
      const playerSpeed = 5.6;
      const enemyStep = bossWave ? 3.8 : 1.8 + speedWave * 0.25;
      const enemyDrop = bossWave ? 0 : 16 + speedWave * 1.2;
      const enemyFireChance = rainbowBossWave ? 0.08 : duoWave ? 0.05 : Math.min(0.018 + speedWave * 0.004, 0.05);
      const tankMissileChance =
        bossWave ? 0 : Math.min(0.014 + Math.max(speedWave - 3, 0) * 0.004, 0.04);
      const yellowBurstChance = wave >= 9 && wave <= 11 ? 0.018 + (wave - 9) * 0.008 : 0;

      const nextPlayers = Object.fromEntries(
        Object.entries(currentState.players).map(([playerId, playerState]) => [
          playerId,
          { ...playerState }
        ])
      ) as Record<string, PlayerState>;

      let nextBullets = [...currentState.bullets];
      let nextEnemyBullets = [...currentState.enemyBullets];
      let nextEffects = currentState.effects
        .map((effect) => ({ ...effect, ttlMs: effect.ttlMs - 33 }))
        .filter((effect) => effect.ttlMs > 0);
      let nextInvaders = currentState.invaders.map((invader) => ({ ...invader }));
      let nextDirection = currentState.enemyDirection;
      let nextScore = currentState.score;
      let nextWave = currentState.wave;
      let nextWaveDelayMs = Math.max(0, currentState.waveDelayMs - 33);
      let nextMessage = currentState.message;
      let nextKillsTowardFireball = currentState.killsTowardFireball;
      let nextFireballsReady = currentState.fireballsReady;

      nextInvaders.forEach((invader) => {
        if (!invader.alive) return;

        if (invader.kind === "boss") {
          invader.weakPointPhase = (invader.weakPointPhase ?? 0) + 0.06;
          if (!invader.shieldActive) {
            invader.shieldCooldownMs = Math.max(0, (invader.shieldCooldownMs ?? 0) - 33);
            if (invader.shieldCooldownMs === 0) {
              invader.shieldActive = true;
              nextEffects.push(createEffect(invader.x, invader.y, "#60a5fa", 46, 320));
              nextMessage = "Boss shield restored.";
            }
          }
          return;
        }

        if (invader.kind === "yellow") {
          invader.attackCooldownMs = Math.max(0, (invader.attackCooldownMs ?? 0) - 33);
          if (invader.attackCooldownMs === 0 && nextWaveDelayMs === 0) {
            const dashDirection = invader.x < WIDTH / 2 ? 1 : -1;
            invader.x = Math.min(Math.max(invader.x + dashDirection * 26, 30), WIDTH - 30);
            invader.attackCooldownMs = 900 + Math.random() * 700;
            nextEffects.push(createEffect(invader.x, invader.y, "#fde047", 14, 150));
          }
          return;
        }

        if (invader.kind === "duoFat") {
          invader.attackCooldownMs = Math.max(0, (invader.attackCooldownMs ?? 0) - 33);
          if (invader.attackMode === "slam") {
            invader.y = Math.min(invader.y + 7.4, SHIP_Y - 48);
            if (invader.y >= SHIP_Y - 48) {
              invader.attackMode = "return";
              nextEffects.push(createEffect(invader.x, SHIP_Y - 10, "#f8d7a6", 28, 250));
            }
          } else if (invader.attackMode === "return") {
            invader.y = Math.max(invader.y - 5.2, invader.homeY ?? 96);
            if (invader.y <= (invader.homeY ?? 96)) {
              invader.attackMode = "idle";
              invader.attackCooldownMs = 2200;
            }
          } else if (invader.attackCooldownMs === 0 && nextWaveDelayMs === 0) {
            invader.attackMode = "slam";
            invader.x = currentPlayers.reduce((closestX, player) => {
              const playerState = nextPlayers[player.userId];
              if (!playerState?.alive) return closestX;
              return Math.abs(playerState.x - invader.x) < Math.abs(closestX - invader.x)
                ? playerState.x
                : closestX;
            }, invader.x);
            nextMessage = "The big one is dropping in.";
          }
          return;
        }

        if (invader.kind === "duoSkinny") {
          invader.attackCooldownMs = Math.max(0, (invader.attackCooldownMs ?? 0) - 33);
          invader.weakPointPhase = (invader.weakPointPhase ?? 0) + 0.08;
          invader.x = (invader.homeX ?? invader.x) + Math.sin(invader.weakPointPhase) * 34;
        }
      });

      currentPlayers.forEach((player) => {
        const playerState = nextPlayers[player.userId];
        if (!playerState) return;

        if (!playerState.alive && playerState.respawnMs > 0) {
          playerState.respawnMs = Math.max(0, playerState.respawnMs - 33);
          if (playerState.respawnMs === 0 && playerState.lives > 0) {
            playerState.alive = true;
            playerState.x = player.userId === currentPlayers[0]?.userId ? WIDTH * 0.3 : WIDTH * 0.7;
            playerState.flashMs = 1000;
            nextMessage = `${player.username} rejoined the fight.`;
          }
        }

        if (playerState.flashMs > 0) {
          playerState.flashMs = Math.max(0, playerState.flashMs - 33);
        }
        if (!playerState.alive) return;

        const input = inputStatesRef.current[player.userId] ?? {
          left: false,
          right: false,
          shoot: false,
          fireball: false
        };

        if (input.left) playerState.x -= playerSpeed;
        if (input.right) playerState.x += playerSpeed;
        playerState.x = Math.min(Math.max(playerState.x, 20), WIDTH - 20);
        playerState.cooldownMs = Math.max(0, playerState.cooldownMs - 33);

        if (input.fireball && nextFireballsReady > 0 && playerState.cooldownMs === 0) {
          nextBullets.push({
            id: `fireball-${player.userId}-${Date.now()}-${Math.random()}`,
            ownerId: player.userId,
            x: playerState.x,
            y: SHIP_Y - 20,
            damage: 3,
            width: 18,
            height: 28,
            speed: 7.5,
            color: "#f97316",
            kind: "fireball"
          });
          nextFireballsReady -= 1;
          playerState.cooldownMs = 650;
          nextMessage = `${player.username} launched a fireball.`;
        } else if (input.shoot && playerState.cooldownMs === 0) {
          nextBullets.push({
            id: `${player.userId}-${Date.now()}-${Math.random()}`,
            ownerId: player.userId,
            x: playerState.x,
            y: SHIP_Y - 14,
            damage: 1,
            width: 4,
            height: 12,
            speed: 8.2 + speedWave * 0.2,
            color: "#f8fafc",
            kind: "player"
          });
          playerState.cooldownMs = Math.max(120, 340 - speedWave * 18);
        }
      });

      if (nextWaveDelayMs === 0) {
        let hitEdge = false;
        nextInvaders = nextInvaders.map((invader) => {
          if (!invader.alive) return invader;
          if (invader.kind === "duoFat" || invader.kind === "duoSkinny") {
            return invader;
          }
          const nextX = invader.x + nextDirection * enemyStep;
          if (invader.kind === "boss") {
            if (nextX <= 110 || nextX >= WIDTH - 110) hitEdge = true;
          } else if (nextX <= 28 || nextX >= WIDTH - 28) {
            hitEdge = true;
          }
          return { ...invader, x: nextX };
        });

        if (hitEdge) {
          nextDirection = nextDirection === 1 ? -1 : 1;
          nextInvaders = nextInvaders.map((invader) => {
            if (!invader.alive) return invader;
            if (invader.kind === "duoFat" || invader.kind === "duoSkinny") return invader;
            return {
              ...invader,
              x: invader.x + nextDirection * enemyStep,
              y: invader.kind === "boss" ? invader.y : invader.y + enemyDrop
            };
          });
        }

        if (Math.random() < enemyFireChance) {
          const livingInvaders = nextInvaders.filter((invader) => invader.alive);
          if (rainbowBossWave) {
            const boss = livingInvaders[0];
            if (boss) {
              nextEnemyBullets.push({
                id: `boss-shot-${Date.now()}-${Math.random()}`,
                ownerId: "enemy",
                x: boss.x,
                y: boss.y + boss.height / 2,
                damage: 999,
                width: 18,
                height: 28,
                speed: 6.5,
                color: "#f43f5e",
                kind: "boss"
              });
            }
          } else if (duoWave) {
            const skinny = livingInvaders.find((invader) => invader.kind === "duoSkinny");
            const fat = livingInvaders.find((invader) => invader.kind === "duoFat");
            const duoEnraged =
              Boolean(skinny && fat) &&
              skinny!.hp / skinny!.maxHp <= 0.35 &&
              fat!.hp / fat!.maxHp <= 0.35;
            if (skinny) {
              const bolaSpeed = duoEnraged ? 5.8 : 4.8;
              [-1.9, 1.9].forEach((vx) => {
                nextEnemyBullets.push({
                  id: `bola-${Date.now()}-${Math.random()}-${vx}`,
                  ownerId: "enemy",
                  x: skinny.x,
                  y: skinny.y + 10,
                  damage: 1,
                  width: duoEnraged ? 16 : 12,
                  height: duoEnraged ? 16 : 12,
                  speed: bolaSpeed,
                  color: "#f4f1ea",
                  kind: "bola",
                  vx
                });
              });
            }
            if (duoEnraged && fat) {
              nextEnemyBullets.push({
                id: `duo-combo-${Date.now()}-${Math.random()}`,
                ownerId: "enemy",
                x: fat.x,
                y: fat.y + fat.height / 2,
                damage: 1,
                width: 26,
                height: 26,
                speed: 5.2,
                color: "#d6c38e",
                kind: "boss"
              });
              nextMessage = "The duo attacks together.";
            }
          } else {
            const bottomByColumn = new Map<number, Invader>();
            livingInvaders.forEach((invader) => {
              const column = Math.round((invader.x - INVADER_START_X) / INVADER_SPACING_X);
              const currentBottom = bottomByColumn.get(column);
              if (!currentBottom || invader.y > currentBottom.y) {
                bottomByColumn.set(column, invader);
              }
            });
            const shooters = Array.from(bottomByColumn.values());
            if (shooters.length > 0) {
              const shooter = shooters[Math.floor(Math.random() * shooters.length)];
              nextEnemyBullets.push({
                id: `enemy-${Date.now()}-${Math.random()}`,
                ownerId: "enemy",
                x: shooter.x,
                y: shooter.y + shooter.height / 2,
                damage: 1,
                width: 4,
                height: 12,
                speed: 4.4 + speedWave * 0.22,
                color:
                  shooter.kind === "tank" ? "#c084fc" : shooter.kind === "yellow" ? "#fde047" : "#fb7185",
                kind: "enemy"
              });
            }
          }
        }

        if (!bossWave && Math.random() < tankMissileChance) {
          const livingTanks = nextInvaders.filter((invader) => invader.alive && invader.kind === "tank");
          const activePlayers = currentPlayers
            .map((player) => ({ player, state: nextPlayers[player.userId] }))
            .filter((entry) => entry.state?.alive);
          if (livingTanks.length > 0 && activePlayers.length > 0) {
            const shooter = livingTanks[Math.floor(Math.random() * livingTanks.length)];
            const target = activePlayers.reduce((closest, candidate) => {
              if (!closest) return candidate;
              return Math.abs(candidate.state!.x - shooter.x) < Math.abs(closest.state!.x - shooter.x)
                ? candidate
                : closest;
            }, activePlayers[0]);
            const horizontalDirection = Math.sign((target.state?.x ?? shooter.x) - shooter.x) || 1;
            nextEnemyBullets.push({
              id: `missile-${Date.now()}-${Math.random()}`,
              ownerId: "enemy",
              x: shooter.x,
              y: shooter.y + shooter.height / 2,
              damage: 1,
              width: 12,
              height: 18,
              speed: 3.2 + speedWave * 0.16,
              color: "#c084fc",
              kind: "missile",
              vx: horizontalDirection * 1.6
            });
          }
        }

        if (yellowBurstChance > 0 && Math.random() < yellowBurstChance) {
          const yellowShooters = nextInvaders.filter((invader) => invader.alive && invader.kind === "yellow");
          if (yellowShooters.length > 0) {
            const shooter = yellowShooters[Math.floor(Math.random() * yellowShooters.length)];
            [-1.7, 0, 1.7].forEach((vx) => {
              nextEnemyBullets.push({
                id: `yellow-burst-${Date.now()}-${Math.random()}-${vx}`,
                ownerId: "enemy",
                x: shooter.x,
                y: shooter.y + shooter.height / 2,
                damage: 1,
                width: 6,
                height: 10,
                speed: 4.6,
                color: "#fde047",
                kind: "enemy",
                vx
              });
            });
          }
        }
      }

      nextBullets = nextBullets
        .map((bullet) => ({ ...bullet, y: bullet.y - bullet.speed }))
        .filter((bullet) => bullet.y > -30);
      nextEnemyBullets = nextEnemyBullets
        .map((bullet) => {
          if (bullet.kind === "bola") {
            const currentVx = bullet.vx ?? 0;
            const nextVx = currentVx * 0.98 + Math.sign(currentVx || 1) * 0.08;
            return {
              ...bullet,
              x: bullet.x + nextVx,
              y: bullet.y + bullet.speed,
              vx: nextVx
            };
          }

          if (bullet.kind !== "missile") {
            return { ...bullet, x: bullet.x + (bullet.vx ?? 0), y: bullet.y + bullet.speed };
          }

          const livingTargets = currentPlayers
            .map((player) => nextPlayers[player.userId])
            .filter((playerState): playerState is PlayerState => Boolean(playerState?.alive));
          const target = livingTargets.reduce<PlayerState | null>((closest, playerState) => {
            if (!closest) return playerState;
            return Math.abs(playerState.x - bullet.x) < Math.abs(closest.x - bullet.x) ? playerState : closest;
          }, null);
          const targetDelta = target ? target.x - bullet.x : 0;
          const desiredVx = Math.max(-3.4, Math.min(3.4, targetDelta * 0.07));
          const currentVx = bullet.vx ?? 0;
          const nextVx = currentVx + (desiredVx - currentVx) * 0.18;

          return {
            ...bullet,
            x: bullet.x + nextVx,
            y: bullet.y + bullet.speed * 0.88,
            vx: nextVx
          };
        })
        .filter((bullet) => bullet.y < HEIGHT + 30);

      nextInvaders.forEach((invader) => {
        if (invader.kind !== "duoFat" || !invader.alive || invader.attackMode !== "slam") return;
        currentPlayers.forEach((player) => {
          const playerState = nextPlayers[player.userId];
          if (!playerState?.alive || playerState.flashMs > 0) return;
          const slamHit =
            Math.abs(playerState.x - invader.x) < (SHIP_WIDTH + invader.width * 0.55) / 2 &&
            Math.abs(SHIP_Y - invader.y) < (SHIP_HEIGHT + invader.height) / 2;
          if (!slamHit) return;
          playerState.lives = Math.max(0, playerState.lives - 1);
          playerState.alive = false;
          playerState.respawnMs = playerState.lives > 0 ? 1800 : 0;
          nextEffects.push(createEffect(playerState.x, SHIP_Y, "#f8d7a6", 22, 220));
          nextMessage =
            playerState.lives > 0
              ? `${player.username} got flattened. ${playerState.lives} lives left.`
              : `${player.username} is out.`;
        });
      });

      const registerInvaderKill = (invader: Invader) => {
        if (!invader.alive) return;
        invader.alive = false;
        nextScore +=
          invader.kind === "boss"
            ? 500
            : invader.kind === "duoFat"
              ? 320
              : invader.kind === "duoSkinny"
                ? 280
                : invader.kind === "tank"
                  ? 30
                  : invader.kind === "yellow"
                    ? 25
                    : 10;
        nextKillsTowardFireball +=
          invader.kind === "boss"
            ? 8
            : invader.kind === "duoFat" || invader.kind === "duoSkinny"
              ? 6
              : invader.kind === "tank"
                ? 3
                : invader.kind === "yellow"
                  ? 2
                  : 1;
      };

      const survivingPlayerBullets: Bullet[] = [];
      nextBullets.forEach((bullet) => {
        const hitProjectileIndex = nextEnemyBullets.findIndex(
          (enemyBullet) =>
            Math.abs(enemyBullet.x - bullet.x) < (enemyBullet.width + bullet.width) / 2 &&
            Math.abs(enemyBullet.y - bullet.y) < (enemyBullet.height + bullet.height) / 2
        );

        if (hitProjectileIndex >= 0) {
          const destroyedProjectile = nextEnemyBullets[hitProjectileIndex];
          nextEnemyBullets.splice(hitProjectileIndex, 1);
          nextEffects.push(
            createEffect(
              destroyedProjectile.x,
              destroyedProjectile.y,
              destroyedProjectile.kind === "missile" ? "#c084fc" : "#f8fafc",
              destroyedProjectile.kind === "missile" ? 14 : 8,
              180
            )
          );
          return;
        }

        const hitEnemy = nextInvaders.find(
          (invader) =>
            invader.alive &&
            Math.abs(invader.x - bullet.x) < (invader.width + bullet.width) / 2 &&
            Math.abs(invader.y - bullet.y) < (invader.height + bullet.height) / 2
        );

        if (!hitEnemy) {
          survivingPlayerBullets.push(bullet);
          return;
        }

        if (hitEnemy.kind === "boss" && hitEnemy.shieldActive) {
          const weakPoint = getBossWeakPoint(hitEnemy);
          const hitWeakPoint =
            Math.hypot(bullet.x - weakPoint.x, bullet.y - weakPoint.y) < 14 + Math.max(bullet.width, bullet.height) / 2;

          if (hitWeakPoint) {
            hitEnemy.shieldActive = false;
            hitEnemy.shieldCooldownMs = BOSS_SHIELD_RESPAWN_MS;
            nextEffects.push(createEffect(weakPoint.x, weakPoint.y, "#93c5fd", 26, 260));
            nextMessage = "Boss shield broken. Burn it down.";
          } else {
            nextEffects.push(createEffect(bullet.x, bullet.y, "#60a5fa", 16, 180));
          }
          return;
        }

        if (bullet.kind === "fireball") {
          nextEffects.push(createEffect(hitEnemy.x, hitEnemy.y, "#fb923c", FIREBALL_SPLASH_RADIUS, 260));

          nextInvaders.forEach((invader) => {
            if (!invader.alive) return;
            if (invader.kind === "boss" && invader.shieldActive) return;
            const distance = Math.hypot(invader.x - hitEnemy.x, invader.y - hitEnemy.y);
            const splashReach = FIREBALL_SPLASH_RADIUS + Math.max(invader.width, invader.height) / 2;
            if (distance > splashReach) return;

            invader.hp -= bullet.damage;
            if (invader.hp <= 0) {
              registerInvaderKill(invader);
            }
          });
        } else {
          hitEnemy.hp -= bullet.damage;
          nextEffects.push(createEffect(hitEnemy.x, hitEnemy.y, "#facc15", 10, 200));
          if (hitEnemy.hp <= 0) {
            registerInvaderKill(hitEnemy);
          }
        }
      });
      nextBullets = survivingPlayerBullets;

      while (nextKillsTowardFireball >= FIREBALL_KILL_REQUIREMENT) {
        nextKillsTowardFireball -= FIREBALL_KILL_REQUIREMENT;
        nextFireballsReady += 1;
        nextMessage = "Fireball ready. Press Space.";
      }

      const survivingEnemyBullets: Bullet[] = [];
      nextEnemyBullets.forEach((bullet) => {
        let hitPlayer = false;
        currentPlayers.forEach((player) => {
          const playerState = nextPlayers[player.userId];
          if (!playerState?.alive || playerState.flashMs > 0) return;

          if (
            Math.abs(playerState.x - bullet.x) < (SHIP_WIDTH + bullet.width) / 2 &&
            Math.abs(SHIP_Y - bullet.y) < (SHIP_HEIGHT + bullet.height) / 2
          ) {
            hitPlayer = true;
            if (bullet.kind === "boss") {
              playerState.lives = 0;
              playerState.alive = false;
              playerState.respawnMs = 0;
              nextMessage = `${player.username} got erased by the boss.`;
            } else {
              playerState.lives = Math.max(0, playerState.lives - bullet.damage);
              playerState.alive = false;
              playerState.respawnMs = playerState.lives > 0 ? 1800 : 0;
              nextMessage =
                playerState.lives > 0
                  ? `${player.username} got hit. ${playerState.lives} lives left.`
                  : `${player.username} is out.`;
            }
            playerState.flashMs = 0;
            nextEffects.push(
              createEffect(
                playerState.x,
                SHIP_Y,
                bullet.kind === "boss" ? "#f43f5e" : "#fb7185",
                bullet.kind === "boss" ? 22 : 14,
                260
              )
            );
          }
        });
        if (!hitPlayer) survivingEnemyBullets.push(bullet);
      });
      nextEnemyBullets = survivingEnemyBullets;

      const anyEnemyReachedBottom = nextInvaders.some(
        (invader) =>
          invader.alive &&
          invader.kind !== "duoFat" &&
          invader.kind !== "duoSkinny" &&
          invader.y >= SHIP_Y - 20
      );
      const playersStillInRun = currentPlayers.some(
        (player) =>
          (nextPlayers[player.userId]?.alive ?? false) || (nextPlayers[player.userId]?.lives ?? 0) > 0
      );
      const allEnemiesDead = nextInvaders.every((invader) => !invader.alive);

      if (allEnemiesDead && nextWaveDelayMs === 0) {
        nextWave += 1;
        nextWaveDelayMs = 950;
        nextInvaders = createWaveInvaders(nextWave);
        nextDirection = 1;
        nextEnemyBullets = [];
        nextEffects.push(
          createEffect(
            WIDTH / 2,
            90,
            nextWave === 8 ? "#f43f5e" : "#a78bfa",
            nextWave === 8 ? 30 : 24,
            340
          )
        );
        nextMessage =
          nextWave === 8
            ? "Boss wave. Good luck."
            : nextWave >= 9 && nextWave <= 11
              ? `Wave ${nextWave}. Yellow blinkers incoming.`
              : nextWave === 12
                ? "Wave 12. The duo has arrived."
                : `Wave ${nextWave}. It gets worse.`;
      }

      const nextPhase = anyEnemyReachedBottom || !playersStillInRun ? "gameOver" : "playing";

      const nextState: GameState = {
        phase: nextPhase,
        players: nextPlayers,
        invaders: nextInvaders,
        bullets: nextBullets,
        enemyBullets: nextEnemyBullets,
        effects: nextEffects,
        enemyDirection: nextDirection,
        score: nextScore,
        wave: nextWave,
        message:
          nextPhase === "gameOver"
            ? anyEnemyReachedBottom
              ? "The invaders landed. Game over."
              : "Both ships are gone. Game over."
            : nextMessage,
        waveDelayMs: nextWaveDelayMs,
        killsTowardFireball: nextKillsTowardFireball,
        fireballsReady: nextFireballsReady
      };

      void broadcastState(nextState);
    }, 33);

    return () => {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [gameState.phase, isHost, players]);

  useEffect(() => {
    const sendInput = (input: InputState) => {
      if (!currentUserId || !channelRef.current || players.length !== 2) return;

      inputStatesRef.current = {
        ...inputStatesRef.current,
        [currentUserId]: input
      };

      void channelRef.current.send({
        type: "broadcast",
        event: "invaders-input",
        payload: { userId: currentUserId, input }
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      ensureAudio();
      if (gameState.phase !== "playing") return;

      const current = inputStatesRef.current[currentUserIdRef.current ?? ""] ?? {
        left: false,
        right: false,
        shoot: false,
        fireball: false
      };

      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        event.preventDefault();
        sendInput({ ...current, left: true });
      } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        event.preventDefault();
        sendInput({ ...current, right: true });
      } else if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        event.preventDefault();
        sendInput({ ...current, shoot: true });
      } else if (event.key === " ") {
        event.preventDefault();
        sendInput({ ...current, fireball: true });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const current = inputStatesRef.current[currentUserIdRef.current ?? ""] ?? {
        left: false,
        right: false,
        shoot: false,
        fireball: false
      };

      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        sendInput({ ...current, left: false });
      } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        sendInput({ ...current, right: false });
      } else if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        sendInput({ ...current, shoot: false });
      } else if (event.key === " ") {
        sendInput({ ...current, fireball: false });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [gameState.phase, players.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#040712";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (let i = 0; i < 60; i += 1) {
      ctx.fillStyle = i % 8 === 0 ? "#93c5fd" : "#e2e8f0";
      ctx.fillRect((i * 83) % WIDTH, (i * 59) % HEIGHT, 2, 2);
    }

    ctx.strokeStyle = "#1e293b";
    ctx.strokeRect(10, 10, WIDTH - 20, HEIGHT - 20);

    gameState.invaders.forEach((invader) => {
      if (!invader.alive) return;

      if (invader.kind === "boss") {
        const rainbow = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];
        rainbow.forEach((color, index) => {
          ctx.fillStyle = color;
          ctx.fillRect(
            invader.x - invader.width / 2,
            invader.y - invader.height / 2 + index * 9,
            invader.width,
            9
          );
        });
        ctx.fillStyle = "#111827";
        ctx.fillRect(invader.x - 18, invader.y - 6, 12, 12);
        ctx.fillRect(invader.x + 6, invader.y - 6, 12, 12);
        if (invader.shieldActive) {
          const weakPoint = getBossWeakPoint(invader);
          ctx.globalAlpha = 0.28;
          ctx.strokeStyle = "#60a5fa";
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.ellipse(invader.x, invader.y, invader.width / 2 + 18, invader.height / 2 + 14, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#bfdbfe";
          ctx.beginPath();
          ctx.arc(weakPoint.x, weakPoint.y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#1d4ed8";
          ctx.beginPath();
          ctx.arc(weakPoint.x, weakPoint.y, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "#bfdbfe";
          ctx.font = "12px monospace";
          ctx.fillText(`${Math.ceil((invader.shieldCooldownMs ?? 0) / 1000)}s`, invader.x - 10, invader.y - 44);
        }
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(invader.x - 50, invader.y - invader.height / 2 - 16, 100, 8);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(
          invader.x - 50,
          invader.y - invader.height / 2 - 16,
          100 * (invader.hp / invader.maxHp),
          8
        );
        return;
      }

      if (invader.kind === "duoFat") {
        ctx.fillStyle = "#f3e4be";
        ctx.beginPath();
        ctx.ellipse(invader.x, invader.y, invader.width / 2, invader.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.fillRect(invader.x - 18, invader.y - 10, 9, 9);
        ctx.fillRect(invader.x + 9, invader.y - 10, 9, 9);
        ctx.fillRect(invader.x - 14, invader.y + 12, 28, 10);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(invader.x - 44, invader.y - invader.height / 2 - 14, 88, 7);
        ctx.fillStyle = "#d4a373";
        ctx.fillRect(invader.x - 44, invader.y - invader.height / 2 - 14, 88 * (invader.hp / invader.maxHp), 7);
        return;
      }

      if (invader.kind === "duoSkinny") {
        ctx.fillStyle = "#211827";
        ctx.fillRect(invader.x - invader.width / 2, invader.y - invader.height / 2, invader.width, invader.height);
        ctx.fillStyle = "#f5efe2";
        ctx.fillRect(invader.x - 8, invader.y - 20, 16, 16);
        ctx.fillStyle = "#111827";
        ctx.fillRect(invader.x - 6, invader.y - 18, 3, 3);
        ctx.fillRect(invader.x + 3, invader.y - 18, 3, 3);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(invader.x - 26, invader.y - invader.height / 2 - 14, 52, 7);
        ctx.fillStyle = "#a78bfa";
        ctx.fillRect(invader.x - 26, invader.y - invader.height / 2 - 14, 52 * (invader.hp / invader.maxHp), 7);
        return;
      }

      ctx.fillStyle = getInvaderColor(invader);
      ctx.fillRect(
        invader.x - invader.width / 2,
        invader.y - invader.height / 2,
        invader.width,
        invader.height
      );
      ctx.fillStyle = invader.kind === "tank" ? "#581c87" : invader.kind === "yellow" ? "#713f12" : "#052e16";
      ctx.fillRect(invader.x - 8, invader.y + 2, 4, 6);
      ctx.fillRect(invader.x + 4, invader.y + 2, 4, 6);
      if (invader.kind === "tank") {
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(String(invader.hp), invader.x - 4, invader.y - 10);
      } else if (invader.kind === "yellow") {
        ctx.fillStyle = "#78350f";
        ctx.fillRect(invader.x - 3, invader.y - 11, 6, 6);
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(String(invader.hp), invader.x - 4, invader.y - 14);
      }
    });

    gameState.bullets.forEach((bullet) => {
      ctx.fillStyle = bullet.color;
      ctx.fillRect(
        bullet.x - bullet.width / 2,
        bullet.y - bullet.height / 2,
        bullet.width,
        bullet.height
      );
      if (bullet.kind === "fireball") {
        ctx.fillStyle = "#fde68a";
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    gameState.enemyBullets.forEach((bullet) => {
      ctx.fillStyle = bullet.color;
      if (bullet.kind === "missile") {
        ctx.beginPath();
        ctx.moveTo(bullet.x, bullet.y - bullet.height / 2);
        ctx.lineTo(bullet.x + bullet.width / 2, bullet.y + bullet.height / 3);
        ctx.lineTo(bullet.x, bullet.y + bullet.height / 2);
        ctx.lineTo(bullet.x - bullet.width / 2, bullet.y + bullet.height / 3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(bullet.x - 2, bullet.y + 1, 4, 7);
      } else if (bullet.kind === "bola") {
        ctx.beginPath();
        ctx.arc(bullet.x - 5, bullet.y, bullet.width / 3, 0, Math.PI * 2);
        ctx.arc(bullet.x + 5, bullet.y, bullet.width / 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bullet.x - 5, bullet.y);
        ctx.lineTo(bullet.x + 5, bullet.y);
        ctx.stroke();
      } else {
        ctx.fillRect(
          bullet.x - bullet.width / 2,
          bullet.y - bullet.height / 2,
          bullet.width,
          bullet.height
        );
      }
    });

    gameState.effects.forEach((effect) => {
      const alpha = Math.max(effect.ttlMs / 320, 0.15);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * (1.25 - alpha), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    players.forEach((player, index) => {
      const playerState = gameState.players[player.userId];
      if (!playerState?.alive) return;
      if (playerState.flashMs > 0 && Math.floor(playerState.flashMs / 100) % 2 === 0) return;

      ctx.fillStyle = index === 0 ? "#38bdf8" : "#f97316";
      ctx.fillRect(
        playerState.x - SHIP_WIDTH / 2,
        SHIP_Y - SHIP_HEIGHT / 2,
        SHIP_WIDTH,
        SHIP_HEIGHT
      );
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(playerState.x - 6, SHIP_Y - SHIP_HEIGHT / 2 - 6, 12, 8);
    });

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "18px monospace";
    ctx.fillText(`Score ${gameState.score}`, 22, 28);
    ctx.fillText(`Wave ${gameState.wave}`, WIDTH / 2 - 42, 28);
    ctx.fillText(`Fireballs ${gameState.fireballsReady}`, WIDTH - 170, 28);

    players.forEach((player, index) => {
      const playerState = gameState.players[player.userId];
      const lives = playerState?.lives ?? STARTING_LIVES;
      ctx.fillStyle = index === 0 ? "#38bdf8" : "#f97316";
      ctx.fillText(`${player.username}: ${lives}`, 22 + index * 260, HEIGHT - 14);
    });
  }, [gameState, players]);

  const startGame = async () => {
    ensureAudio();
    if (!isHost || players.length !== 2) return;

    const nextState = buildInitialState(players);
    players.forEach((player) => {
      inputStatesRef.current[player.userId] = {
        left: false,
        right: false,
        shoot: false,
        fireball: false
      };
    });
    await broadcastState(nextState);
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card">
        <h2>Space Invaders v{SPACE_INVADERS_VERSION}</h2>
        <p>Two-player co-op with tanks, blinkers, fireballs, a shielded wave 8 boss, and a brutal wave 12 duo.</p>
        <div className="info">
          Seats filled: {Math.min(players.length, 2)}/2
          {connected && !roomFull ? ` | ${currentUsername}` : ""}
        </div>
        {roomFull && !isSeated ? (
          <div className="error">Two players are already in this room. Wait for someone to leave.</div>
        ) : (
          <>
            <div className="button-row">
              {players.map((player) => (
                <span key={player.userId} className="secondary-button">
                  {player.username}
                </span>
              ))}
            </div>
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              style={{
                width: "100%",
                maxWidth: WIDTH,
                display: "block",
                margin: "1rem auto",
                borderRadius: "0.75rem",
                border: "1px solid #cbd5e1",
                background: "#08111f"
              }}
            />
            <p className="info">{gameState.message}</p>
            <p>
              Purple tanks fire heat-seeking missiles you can dodge or shoot. Waves 9-11 add yellow blinkers that dash and burst shots. The wave 8 boss shield only breaks if you hit the moving weak point, and it comes back after 8 seconds. Wave 12 is a two-boss fight. Kill 40 enemies to charge a fireball. Press `Space` to launch it. Use `W` or `Arrow Up` for normal shots.
            </p>
            <p>{currentUsername} and {opponent?.username ?? "your co-pilot"} defend the bottom line.</p>
            {gameState.phase === "waiting" && isHost && (
              <button
                className="primary-button"
                type="button"
                onClick={() => void startGame()}
                disabled={players.length !== 2}
              >
                Start wave
              </button>
            )}
            {gameState.phase === "gameOver" && isHost && (
              <button className="primary-button" type="button" onClick={() => void startGame()}>
                Restart run
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SpaceInvaders;
