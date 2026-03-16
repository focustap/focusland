import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { supabase } from "../lib/supabase";

type PlayerPresence = {
  userId: string;
  username: string;
  onlineAt: string;
};

type Invader = {
  id: string;
  x: number;
  y: number;
  alive: boolean;
};

type Bullet = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
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
};

const ROOM_NAME = "focusland-invaders";
const WIDTH = 640;
const HEIGHT = 420;
const SHIP_Y = HEIGHT - 34;
const SHIP_WIDTH = 28;
const SHIP_HEIGHT = 18;
const ENEMY_WIDTH = 28;
const ENEMY_HEIGHT = 18;
const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 12;
const STARTING_LIVES = 3;

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
  waveDelayMs: 0
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
  const rows = Math.min(4 + Math.floor((wave - 1) / 2), 6);
  const cols = 8;
  const invaders: Invader[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      invaders.push({
        id: `wave-${wave}-enemy-${row}-${col}`,
        x: 100 + col * 52,
        y: 68 + row * 36,
        alive: true
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
    waveDelayMs: 0
  };
}

function playTone(context: AudioContext, frequency: number, durationMs: number, type: OscillatorType) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.035;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + durationMs / 1000);
  oscillator.stop(context.currentTime + durationMs / 1000);
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
  const isHostRef = useRef(false);
  const inputStatesRef = useRef<Record<string, InputState>>({});
  const tickRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousStateRef = useRef<GameState>(DEFAULT_STATE);

  const isSeated = currentUserId ? players.some((player) => player.userId === currentUserId) : false;
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
    isHostRef.current = isHost;
  }, [players, isHost]);

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

      if (gameState.effects.length > previousState.effects.length) {
        const playerLostLife = players.some((player) => {
          const prevLives = previousState.players[player.userId]?.lives ?? STARTING_LIVES;
          const nextLives = gameState.players[player.userId]?.lives ?? STARTING_LIVES;
          return nextLives < prevLives;
        });

        playTone(context, playerLostLife ? 160 : 240, playerLostLife ? 180 : 120, "sawtooth");
      }

      if (gameState.wave > previousState.wave) {
        playTone(context, 520, 130, "triangle");
        playTone(context, 760, 150, "triangle");
      }

      if (gameState.phase === "gameOver" && previousState.phase !== "gameOver") {
        playTone(context, 120, 300, "sawtooth");
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

      const presenceState = channel.presenceState() as Record<
        string,
        Array<{ userId: string; username: string; onlineAt: string }>
      >;
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

      if (!session || isUnmounted) {
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", session.user.id)
        .maybeSingle();

      const username = (profile?.username as string | null) ?? session.user.email ?? "Player";
      setCurrentUserId(session.user.id);
      setCurrentUsername(username);

      const channel = supabase.channel(ROOM_NAME, {
        config: {
          presence: {
            key: session.user.id
          }
        }
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
        if (subscriptionStatus !== "SUBSCRIBED" || isUnmounted) {
          return;
        }

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
      if (currentState.phase !== "playing") {
        return;
      }

      const currentPlayers = playersRef.current;
      const wave = currentState.wave;
      const playerSpeed = 5.6;
      const playerBulletSpeed = 8.5 + wave * 0.25;
      const enemyBulletSpeed = 4.6 + wave * 0.35;
      const enemyStep = 1.8 + wave * 0.35;
      const enemyDrop = 16 + wave * 1.5;
      const enemyFireChance = Math.min(0.018 + wave * 0.004, 0.07);

      const nextPlayers = Object.fromEntries(
        Object.entries(currentState.players).map(([playerId, playerState]) => [
          playerId,
          { ...playerState }
        ])
      ) as Record<string, PlayerState>;

      let nextBullets = [...currentState.bullets];
      let nextEnemyBullets = [...currentState.enemyBullets];
      let nextEffects = currentState.effects
        .map((effect) => ({
          ...effect,
          ttlMs: effect.ttlMs - 33
        }))
        .filter((effect) => effect.ttlMs > 0);
      let nextInvaders = currentState.invaders.map((invader) => ({ ...invader }));
      let nextDirection = currentState.enemyDirection;
      let nextScore = currentState.score;
      let nextWave = currentState.wave;
      let nextWaveDelayMs = Math.max(0, currentState.waveDelayMs - 33);
      let nextMessage = currentState.message;

      currentPlayers.forEach((player) => {
        const playerState = nextPlayers[player.userId];
        if (!playerState) {
          return;
        }

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

        if (!playerState.alive) {
          return;
        }

        const input = inputStatesRef.current[player.userId] ?? {
          left: false,
          right: false,
          shoot: false
        };

        if (input.left) {
          playerState.x -= playerSpeed;
        }
        if (input.right) {
          playerState.x += playerSpeed;
        }
        playerState.x = Math.min(Math.max(playerState.x, 20), WIDTH - 20);

        playerState.cooldownMs = Math.max(0, playerState.cooldownMs - 33);
        if (input.shoot && playerState.cooldownMs === 0) {
          nextBullets.push({
            id: `${player.userId}-${Date.now()}-${Math.random()}`,
            ownerId: player.userId,
            x: playerState.x,
            y: SHIP_Y - 14
          });
          playerState.cooldownMs = Math.max(120, 340 - wave * 18);
        }
      });

      if (nextWaveDelayMs === 0) {
        let hitEdge = false;
        nextInvaders = nextInvaders.map((invader) => {
          if (!invader.alive) {
            return invader;
          }

          const nextX = invader.x + nextDirection * enemyStep;
          if (nextX <= 28 || nextX >= WIDTH - 28) {
            hitEdge = true;
          }

          return {
            ...invader,
            x: nextX
          };
        });

        if (hitEdge) {
          nextDirection = nextDirection === 1 ? -1 : 1;
          nextInvaders = nextInvaders.map((invader) =>
            invader.alive
              ? {
                  ...invader,
                  x: invader.x + nextDirection * enemyStep,
                  y: invader.y + enemyDrop
                }
              : invader
          );
        }

        if (Math.random() < enemyFireChance) {
          const livingInvaders = nextInvaders.filter((invader) => invader.alive);
          const bottomByColumn = new Map<number, Invader>();

          livingInvaders.forEach((invader) => {
            const column = Math.round(invader.x / 52);
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
              y: shooter.y + ENEMY_HEIGHT / 2
            });
          }
        }
      }

      nextBullets = nextBullets
        .map((bullet) => ({
          ...bullet,
          y: bullet.y - playerBulletSpeed
        }))
        .filter((bullet) => bullet.y > -20);

      nextEnemyBullets = nextEnemyBullets
        .map((bullet) => ({
          ...bullet,
          y: bullet.y + enemyBulletSpeed
        }))
        .filter((bullet) => bullet.y < HEIGHT + 20);

      const survivingPlayerBullets: Bullet[] = [];
      nextBullets.forEach((bullet) => {
        const hitEnemy = nextInvaders.find(
          (invader) =>
            invader.alive &&
            Math.abs(invader.x - bullet.x) < ENEMY_WIDTH / 2 &&
            Math.abs(invader.y - bullet.y) < ENEMY_HEIGHT / 2
        );

        if (hitEnemy) {
          hitEnemy.alive = false;
          nextScore += 10;
          nextEffects.push({
            id: `effect-${hitEnemy.id}`,
            x: hitEnemy.x,
            y: hitEnemy.y,
            ttlMs: 180,
            color: "#facc15",
            radius: 10
          });
          return;
        }

        survivingPlayerBullets.push(bullet);
      });
      nextBullets = survivingPlayerBullets;

      const survivingEnemyBullets: Bullet[] = [];
      nextEnemyBullets.forEach((bullet) => {
        let hitPlayer = false;

        currentPlayers.forEach((player) => {
          const playerState = nextPlayers[player.userId];
          if (!playerState?.alive || playerState.flashMs > 0) {
            return;
          }

          if (
            Math.abs(playerState.x - bullet.x) < SHIP_WIDTH / 2 &&
            Math.abs(SHIP_Y - bullet.y) < SHIP_HEIGHT / 2
          ) {
            hitPlayer = true;
            playerState.lives = Math.max(0, playerState.lives - 1);
            playerState.alive = false;
            playerState.respawnMs = playerState.lives > 0 ? 1800 : 0;
            playerState.flashMs = 0;
            nextEffects.push({
              id: `player-hit-${player.userId}-${Date.now()}`,
              x: playerState.x,
              y: SHIP_Y,
              ttlMs: 240,
              color: "#fb7185",
              radius: 14
            });
            nextMessage =
              playerState.lives > 0
                ? `${player.username} got hit. ${playerState.lives} lives left.`
                : `${player.username} is out.`;
          }
        });

        if (!hitPlayer) {
          survivingEnemyBullets.push(bullet);
        }
      });
      nextEnemyBullets = survivingEnemyBullets;

      const anyEnemyReachedBottom = nextInvaders.some(
        (invader) => invader.alive && invader.y >= SHIP_Y - 20
      );

      const activePlayers = currentPlayers.filter(
        (player) => (nextPlayers[player.userId]?.alive ?? false) || (nextPlayers[player.userId]?.lives ?? 0) > 0
      );
      const everybodyOut = activePlayers.length === 0;
      const allEnemiesDead = nextInvaders.every((invader) => !invader.alive);

      if (allEnemiesDead && nextWaveDelayMs === 0) {
        nextWave += 1;
        nextWaveDelayMs = 900;
        nextInvaders = createWaveInvaders(nextWave);
        nextDirection = 1;
        nextEnemyBullets = [];
        nextEffects.push({
          id: `wave-${nextWave}-effect`,
          x: WIDTH / 2,
          y: 90,
          ttlMs: 320,
          color: "#a78bfa",
          radius: 24
        });
        nextMessage = `Wave ${nextWave}. It gets worse.`;
      }

      const nextPhase =
        anyEnemyReachedBottom || everybodyOut ? "gameOver" : "playing";

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
        waveDelayMs: nextWaveDelayMs
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
      if (!currentUserId || !channelRef.current || players.length !== 2) {
        return;
      }

      inputStatesRef.current = {
        ...inputStatesRef.current,
        [currentUserId]: input
      };

      void channelRef.current.send({
        type: "broadcast",
        event: "invaders-input",
        payload: {
          userId: currentUserId,
          input
        }
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      ensureAudio();

      if (gameState.phase !== "playing") {
        return;
      }

      const current = inputStatesRef.current[currentUserIdRef.current ?? ""] ?? {
        left: false,
        right: false,
        shoot: false
      };

      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        event.preventDefault();
        sendInput({ ...current, left: true });
      } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        event.preventDefault();
        sendInput({ ...current, right: true });
      } else if (event.key === " " || event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        event.preventDefault();
        sendInput({ ...current, shoot: true });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const current = inputStatesRef.current[currentUserIdRef.current ?? ""] ?? {
        left: false,
        right: false,
        shoot: false
      };

      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        sendInput({ ...current, left: false });
      } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        sendInput({ ...current, right: false });
      } else if (event.key === " " || event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        sendInput({ ...current, shoot: false });
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
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

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
      if (!invader.alive) {
        return;
      }

      ctx.fillStyle = "#22c55e";
      ctx.fillRect(
        invader.x - ENEMY_WIDTH / 2,
        invader.y - ENEMY_HEIGHT / 2,
        ENEMY_WIDTH,
        ENEMY_HEIGHT
      );
      ctx.fillStyle = "#052e16";
      ctx.fillRect(invader.x - 8, invader.y + 2, 4, 6);
      ctx.fillRect(invader.x + 4, invader.y + 2, 4, 6);
    });

    gameState.bullets.forEach((bullet) => {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(
        bullet.x - BULLET_WIDTH / 2,
        bullet.y - BULLET_HEIGHT / 2,
        BULLET_WIDTH,
        BULLET_HEIGHT
      );
    });

    gameState.enemyBullets.forEach((bullet) => {
      ctx.fillStyle = "#fb7185";
      ctx.fillRect(
        bullet.x - BULLET_WIDTH / 2,
        bullet.y - BULLET_HEIGHT / 2,
        BULLET_WIDTH,
        BULLET_HEIGHT
      );
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
      if (!playerState?.alive) {
        return;
      }

      if (playerState.flashMs > 0 && Math.floor(playerState.flashMs / 100) % 2 === 0) {
        return;
      }

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

    players.forEach((player, index) => {
      const playerState = gameState.players[player.userId];
      const lives = playerState?.lives ?? STARTING_LIVES;
      ctx.fillStyle = index === 0 ? "#38bdf8" : "#f97316";
      ctx.fillText(`${player.username}: ${lives}`, 22 + index * 260, HEIGHT - 14);
    });
  }, [gameState, players]);

  const startGame = async () => {
    ensureAudio();

    if (!isHost || players.length !== 2) {
      return;
    }

    const nextState = buildInitialState(players);
    players.forEach((player) => {
      inputStatesRef.current[player.userId] = {
        left: false,
        right: false,
        shoot: false
      };
    });
    await broadcastState(nextState);
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card">
        <h2>Space Invaders</h2>
        <p>Two-player co-op. Two ships, three lives each, enemy bullets, respawns, and waves that ramp fast.</p>
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
              {currentUsername} and {opponent?.username ?? "your co-pilot"} defend the bottom line.
            </p>
            <p>Controls: `A/D` or `Arrow Left/Right` to move, `W`, `Arrow Up`, or `Space` to shoot.</p>
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
