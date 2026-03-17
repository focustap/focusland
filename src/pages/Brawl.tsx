import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { supabase } from "../lib/supabase";

type PlayerPresence = {
  userId: string;
  username: string;
  onlineAt: string;
};

type CharacterId = "mage" | "fighter";

type InputState = {
  left: boolean;
  right: boolean;
  jump: boolean;
  drop: boolean;
  attack: boolean;
  special: boolean;
  ultimate: boolean;
};

type FighterPlayer = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  health: number;
  stocks: number;
  onGround: boolean;
  dropThroughMs: number;
  jumpCooldownMs: number;
  attackCooldownMs: number;
  specialCooldownMs: number;
  respawnMs: number;
  invulnMs: number;
  ultimateCharge: number;
  attackFlashMs: number;
  selectedCharacter: CharacterId | null;
};

type Projectile = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  knockbackX: number;
  knockbackY: number;
  color: string;
  isUltimate: boolean;
};

type BrawlState = {
  phase: "waiting" | "select" | "playing" | "gameOver";
  players: Record<string, FighterPlayer>;
  projectiles: Projectile[];
  winnerId: string | null;
  message: string;
};

type CharacterConfig = {
  name: string;
  color: string;
  accent: string;
  meleeDamage: number;
  meleeRange: number;
  meleeKnockbackX: number;
  meleeKnockbackY: number;
  projectileDamage: number;
  projectileRadius: number;
  projectileSpeed: number;
  projectileColor: string;
  projectileKnockbackX: number;
  projectileKnockbackY: number;
  ultimateDamage: number;
  ultimateRadius: number;
  ultimateSpeed: number;
  ultimateColor: string;
  ultimateKnockbackX: number;
  ultimateKnockbackY: number;
};

const ROOM_NAME = "focusland-brawl";
const WIDTH = 700;
const HEIGHT = 400;
const FLOOR_Y = 330;
const PLATFORM_WIDTH = 180;
const PLATFORM_HEIGHT = 12;
const STAGE_PLATFORMS = [
  { x: WIDTH / 2, y: 250, width: 180 },
  { x: WIDTH / 2 - 150, y: 170, width: 120 },
  { x: WIDTH / 2 + 150, y: 170, width: 120 }
] as const;
const PLAYER_WIDTH = 26;
const PLAYER_HEIGHT = 42;
const MOVE_SPEED = 4.2;
const JUMP_VELOCITY = -11;
const GRAVITY = 0.62;
const MAX_FALL_SPEED = 11;
const RESPAWN_Y = 140;
const STOCKS = 3;
const ULTIMATE_CHARGE_MAX = 100;
const MAX_HEALTH = 100;

const CHARACTER_CONFIGS: Record<CharacterId, CharacterConfig> = {
  mage: {
    name: "Mage",
    color: "#8b5cf6",
    accent: "#c4b5fd",
    meleeDamage: 8,
    meleeRange: 48,
    meleeKnockbackX: 5.4,
    meleeKnockbackY: 5.8,
    projectileDamage: 4,
    projectileRadius: 10,
    projectileSpeed: 6,
    projectileColor: "#fb923c",
    projectileKnockbackX: 4.8,
    projectileKnockbackY: 5.2,
    ultimateDamage: 25,
    ultimateRadius: 18,
    ultimateSpeed: 7,
    ultimateColor: "#f97316",
    ultimateKnockbackX: 7.8,
    ultimateKnockbackY: 8.8
  },
  fighter: {
    name: "Fighter",
    color: "#ef4444",
    accent: "#fecaca",
    meleeDamage: 8,
    meleeRange: 54,
    meleeKnockbackX: 6.2,
    meleeKnockbackY: 5.6,
    projectileDamage: 4,
    projectileRadius: 7,
    projectileSpeed: 8,
    projectileColor: "#e2e8f0",
    projectileKnockbackX: 4.6,
    projectileKnockbackY: 4.8,
    ultimateDamage: 25,
    ultimateRadius: 12,
    ultimateSpeed: 9.5,
    ultimateColor: "#f8fafc",
    ultimateKnockbackX: 8.5,
    ultimateKnockbackY: 7.2
  }
};

const DEFAULT_INPUT: InputState = {
  left: false,
  right: false,
  jump: false,
  drop: false,
  attack: false,
  special: false,
  ultimate: false
};

const DEFAULT_STATE: BrawlState = {
  phase: "waiting",
  players: {},
  projectiles: [],
  winnerId: null,
  message: "Waiting for two players."
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createPlayerState(index: number): FighterPlayer {
  return {
    x: index === 0 ? WIDTH * 0.3 : WIDTH * 0.7,
    y: RESPAWN_Y,
    vx: 0,
    vy: 0,
    facing: index === 0 ? 1 : -1,
    health: MAX_HEALTH,
    stocks: STOCKS,
    onGround: false,
    dropThroughMs: 0,
    jumpCooldownMs: 0,
    attackCooldownMs: 0,
    specialCooldownMs: 0,
    respawnMs: 0,
    invulnMs: 0,
    ultimateCharge: 0,
    attackFlashMs: 0,
    selectedCharacter: null
  };
}

function createSelectState(players: PlayerPresence[]): BrawlState {
  const playerState = players.reduce<Record<string, FighterPlayer>>((acc, player, index) => {
    acc[player.userId] = createPlayerState(index);
    return acc;
  }, {});

  return {
    phase: "select",
    players: playerState,
    projectiles: [],
    winnerId: null,
    message: "Choose your fighters."
  };
}

function startMatchState(players: PlayerPresence[], currentState: BrawlState): BrawlState {
  const nextPlayers = players.reduce<Record<string, FighterPlayer>>((acc, player, index) => {
    const existing = currentState.players[player.userId];
    acc[player.userId] = {
      ...createPlayerState(index),
      selectedCharacter: existing?.selectedCharacter ?? null,
      invulnMs: 800
    };
    return acc;
  }, {});

  return {
    phase: "playing",
    players: nextPlayers,
    projectiles: [],
    winnerId: null,
    message: "Fight."
  };
}

function getStandingPlatform(player: FighterPlayer) {
  return (
    STAGE_PLATFORMS.find(
      (platform) =>
        Math.abs(player.y + PLAYER_HEIGHT / 2 - platform.y) < 2 &&
        Math.abs(player.x - platform.x) <= platform.width / 2 + PLAYER_WIDTH / 2
    ) ?? null
  );
}

const Brawl: React.FC = () => {
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [connected, setConnected] = useState(false);
  const [roomFull, setRoomFull] = useState(false);
  const [brawlState, setBrawlState] = useState<BrawlState>(DEFAULT_STATE);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const tickRef = useRef<number | null>(null);
  const renderRef = useRef<number | null>(null);
  const stateRef = useRef<BrawlState>(DEFAULT_STATE);
  const playersRef = useRef<PlayerPresence[]>([]);
  const currentUserIdRef = useRef<string | null>(null);
  const inputStatesRef = useRef<Record<string, InputState>>({});

  const isSeated = currentUserId ? players.some((player) => player.userId === currentUserId) : false;
  const isHost = Boolean(currentUserId && players[0]?.userId === currentUserId);
  const opponent = useMemo(
    () => players.find((player) => player.userId !== currentUserId) ?? null,
    [players, currentUserId]
  );

  useEffect(() => {
    stateRef.current = brawlState;
  }, [brawlState]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const broadcastState = async (nextState: BrawlState) => {
    setBrawlState(nextState);
    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "brawl-state",
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

      setBrawlState((currentState) => {
        if (nextPlayers.length < 2) {
          return DEFAULT_STATE;
        }
        if (currentState.phase === "waiting") {
          return createSelectState(nextPlayers);
        }
        return currentState;
      });
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
      channel.on("broadcast", { event: "brawl-state" }, ({ payload }) => {
        const nextState = payload as BrawlState;
        setBrawlState(nextState);
        stateRef.current = nextState;
      });
      channel.on("broadcast", { event: "brawl-input" }, ({ payload }) => {
        const nextPayload = payload as { userId: string; input: InputState };
        inputStatesRef.current = {
          ...inputStatesRef.current,
          [nextPayload.userId]: nextPayload.input
        };
      });
      channel.on("broadcast", { event: "brawl-select" }, ({ payload }) => {
        const nextPayload = payload as { userId: string; character: CharacterId };
        setBrawlState((currentState) => {
          const nextState: BrawlState = {
            ...currentState,
            players: {
              ...currentState.players,
              [nextPayload.userId]: {
                ...(currentState.players[nextPayload.userId] ?? createPlayerState(0)),
                selectedCharacter: nextPayload.character
              }
            }
          };
          stateRef.current = nextState;
          return nextState;
        });
      });

      channel.subscribe(async (status) => {
        if (status !== "SUBSCRIBED" || isUnmounted) return;

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
      if (renderRef.current) {
        window.cancelAnimationFrame(renderRef.current);
        renderRef.current = null;
      }
      const channel = channelRef.current;
      if (channel) {
        void supabase.removeChannel(channel);
        channelRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isHost || players.length !== 2 || stateRef.current.phase !== "playing") {
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
      const nextPlayers = Object.fromEntries(
        Object.entries(currentState.players).map(([playerId, playerState]) => [
          playerId,
          { ...playerState }
        ])
      ) as Record<string, FighterPlayer>;
      let nextProjectiles = currentState.projectiles.map((projectile) => ({ ...projectile }));
      let nextMessage = currentState.message;
      let winnerId: string | null = null;

      const getOtherPlayerId = (userId: string) =>
        currentPlayers.find((player) => player.userId !== userId)?.userId ?? null;

      const addCharge = (playerId: string, amount: number) => {
        const player = nextPlayers[playerId];
        if (!player) return;
        player.ultimateCharge = clamp(player.ultimateCharge + amount, 0, ULTIMATE_CHARGE_MAX);
      };

      const loseStock = (playerId: string, reason: string) => {
        const state = nextPlayers[playerId];
        if (!state) return;
        const defeatedPlayer = currentPlayers.find((player) => player.userId === playerId);
        state.stocks -= 1;
        state.health = MAX_HEALTH;
        state.vx = 0;
        state.vy = 0;
        state.respawnMs = state.stocks > 0 ? 1200 : 0;
        state.invulnMs = 0;
        nextMessage =
          state.stocks > 0
            ? `${defeatedPlayer?.username ?? "A fighter"} ${reason}.`
            : `${defeatedPlayer?.username ?? "A fighter"} is out.`;
        if (state.stocks <= 0) {
          winnerId = getOtherPlayerId(playerId);
        }
      };

      const applyHit = (
        targetId: string,
        sourceId: string,
        damage: number,
        knockbackX: number,
        knockbackY: number
      ) => {
        const target = nextPlayers[targetId];
        const source = nextPlayers[sourceId];
        if (!target || target.respawnMs > 0 || target.invulnMs > 0) return;
        const deltaX = target.x - (source?.x ?? target.x - 1);
        const deltaY = target.y - (source?.y ?? target.y);
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const horizontalDirection = Math.sign(deltaX) || target.facing;
        target.health = clamp(target.health - damage, 0, MAX_HEALTH);
        target.vx = (deltaX / distance) * Math.abs(knockbackX || 1.5);
        target.vy = (deltaY / distance) * Math.abs(knockbackY || 1.5);
        if (target.vy > -2.5) {
          target.vy = -2.5;
        }
        if (horizontalDirection !== 0) {
          target.facing = horizontalDirection > 0 ? 1 : -1;
        }
        target.onGround = false;
        addCharge(sourceId, 14);
        if (target.health <= 0) {
          loseStock(targetId, "got KO'd");
        }
      };

      currentPlayers.forEach((player) => {
        const state = nextPlayers[player.userId];
        if (!state) return;

        state.attackCooldownMs = Math.max(0, state.attackCooldownMs - 33);
        state.specialCooldownMs = Math.max(0, state.specialCooldownMs - 33);
        state.jumpCooldownMs = Math.max(0, state.jumpCooldownMs - 33);
        state.dropThroughMs = Math.max(0, state.dropThroughMs - 33);
        state.attackFlashMs = Math.max(0, state.attackFlashMs - 33);
        state.invulnMs = Math.max(0, state.invulnMs - 33);

        if (state.respawnMs > 0) {
          state.respawnMs = Math.max(0, state.respawnMs - 33);
          if (state.respawnMs === 0) {
            const index = currentPlayers.findIndex((entry) => entry.userId === player.userId);
            const reset = createPlayerState(index);
            nextPlayers[player.userId] = {
              ...state,
              ...reset,
              selectedCharacter: state.selectedCharacter,
              stocks: state.stocks,
              health: MAX_HEALTH,
              invulnMs: 1200
            };
          }
          return;
        }

        const characterId = state.selectedCharacter;
        if (!characterId) return;

        const config = CHARACTER_CONFIGS[characterId];
        const input = inputStatesRef.current[player.userId] ?? DEFAULT_INPUT;
        const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);

        state.vx = horizontal * MOVE_SPEED;
        if (horizontal !== 0) {
          state.facing = horizontal > 0 ? 1 : -1;
        }

        const standingPlatform = getStandingPlatform(state);
        const onPlatform = Boolean(standingPlatform);
        if (input.drop && onPlatform) {
          state.dropThroughMs = 250;
          state.onGround = false;
        }

        if (input.jump && state.jumpCooldownMs === 0 && (state.onGround || onPlatform)) {
          state.vy = JUMP_VELOCITY;
          state.onGround = false;
          state.jumpCooldownMs = 220;
        }

        if (input.attack && state.attackCooldownMs === 0) {
          const targetId = getOtherPlayerId(player.userId);
          const target = targetId ? nextPlayers[targetId] : null;
          if (
            target &&
            target.respawnMs === 0 &&
            Math.abs(target.y - state.y) < 40 &&
            Math.abs(target.x - state.x) <= config.meleeRange &&
            Math.sign(target.x - state.x || state.facing) === state.facing
          ) {
            applyHit(
              targetId!,
              player.userId,
              config.meleeDamage,
              config.meleeKnockbackX * state.facing,
              config.meleeKnockbackY
            );
            nextMessage = `${player.username} landed a hit.`;
          }
          state.attackCooldownMs = 320;
          state.attackFlashMs = 120;
        }

        if (input.special && state.specialCooldownMs === 0) {
          nextProjectiles.push({
            id: `special-${player.userId}-${Date.now()}-${Math.random()}`,
            ownerId: player.userId,
            x: state.x + state.facing * 24,
            y: state.y - 10,
            vx: config.projectileSpeed * state.facing,
            vy: 0,
            radius: config.projectileRadius,
            damage: config.projectileDamage,
            knockbackX: config.projectileKnockbackX * state.facing,
            knockbackY: config.projectileKnockbackY,
            color: config.projectileColor,
            isUltimate: false
          });
          state.specialCooldownMs = 540;
        }

        if (input.ultimate && state.specialCooldownMs === 0 && state.ultimateCharge >= ULTIMATE_CHARGE_MAX) {
          nextProjectiles.push({
            id: `ultimate-${player.userId}-${Date.now()}-${Math.random()}`,
            ownerId: player.userId,
            x: state.x + state.facing * 24,
            y: state.y - 12,
            vx: config.ultimateSpeed * state.facing,
            vy: 0,
            radius: config.ultimateRadius,
            damage: config.ultimateDamage,
            knockbackX: config.ultimateKnockbackX * state.facing,
            knockbackY: config.ultimateKnockbackY,
            color: config.ultimateColor,
            isUltimate: true
          });
          state.ultimateCharge = 0;
          state.specialCooldownMs = 850;
          nextMessage = `${player.username} unleashed an ultimate.`;
        }

        state.vy = Math.min(MAX_FALL_SPEED, state.vy + GRAVITY);
        const previousBottom = state.y + PLAYER_HEIGHT / 2;
        state.x = clamp(state.x + state.vx, 20, WIDTH - 20);
        state.y += state.vy;
        state.onGround = false;

        if (state.y + PLAYER_HEIGHT / 2 >= FLOOR_Y) {
          state.y = FLOOR_Y - PLAYER_HEIGHT / 2;
          state.vy = 0;
          state.onGround = true;
        } else {
          const landingPlatform = STAGE_PLATFORMS.find(
            (platform) =>
              state.dropThroughMs === 0 &&
              previousBottom <= platform.y &&
              state.y + PLAYER_HEIGHT / 2 >= platform.y &&
              Math.abs(state.x - platform.x) <= platform.width / 2 + PLAYER_WIDTH / 2
          );

          if (landingPlatform) {
            state.y = landingPlatform.y - PLAYER_HEIGHT / 2;
            state.vy = 0;
            state.onGround = true;
          }
        }

        if (state.y > HEIGHT + 90 || state.x < -90 || state.x > WIDTH + 90) {
          loseStock(player.userId, "got launched out");
        }
      });

      nextProjectiles = nextProjectiles
        .map((projectile) => ({
          ...projectile,
          x: projectile.x + projectile.vx,
          y: projectile.y + projectile.vy
        }))
        .filter((projectile) => projectile.x > -80 && projectile.x < WIDTH + 80);

      const survivingProjectiles: Projectile[] = [];
      nextProjectiles.forEach((projectile) => {
        const targetId = currentPlayers.find((player) => player.userId !== projectile.ownerId)?.userId;
        const target = targetId ? nextPlayers[targetId] : null;
        if (
          !target ||
          target.respawnMs > 0 ||
          target.invulnMs > 0 ||
          Math.abs(target.x - projectile.x) > PLAYER_WIDTH / 2 + projectile.radius ||
          Math.abs(target.y - projectile.y) > PLAYER_HEIGHT / 2 + projectile.radius
        ) {
          survivingProjectiles.push(projectile);
          return;
        }

        applyHit(
          targetId!,
          projectile.ownerId,
          projectile.damage,
          projectile.knockbackX,
          projectile.knockbackY
        );
        addCharge(projectile.ownerId, projectile.isUltimate ? 10 : 6);
        nextMessage = projectile.isUltimate ? "Ultimate connected." : "Projectile hit.";
      });

      const nextState: BrawlState = {
        phase: winnerId ? "gameOver" : "playing",
        players: nextPlayers,
        projectiles: survivingProjectiles,
        winnerId,
        message: winnerId
          ? `${currentPlayers.find((player) => player.userId === winnerId)?.username ?? "Winner"} wins.`
          : nextMessage
      };

      void broadcastState(nextState);
    }, 33);

    return () => {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [isHost, players, brawlState.phase]);

  useEffect(() => {
    const sendInput = (input: InputState) => {
      if (!currentUserId || !channelRef.current || players.length !== 2) return;
      inputStatesRef.current = {
        ...inputStatesRef.current,
        [currentUserId]: input
      };
      void channelRef.current.send({
        type: "broadcast",
        event: "brawl-input",
        payload: { userId: currentUserId, input }
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const current = inputStatesRef.current[currentUserIdRef.current ?? ""] ?? DEFAULT_INPUT;
      const key = event.key.toLowerCase();

      if (key === "a") {
        sendInput({ ...current, left: true });
      } else if (key === "d") {
        sendInput({ ...current, right: true });
      } else if (key === "w") {
        sendInput({ ...current, jump: true });
      } else if (key === "s") {
        sendInput({ ...current, drop: true });
      } else if (key === "j") {
        sendInput({ ...current, attack: true });
      } else if (key === "k") {
        sendInput({ ...current, special: true });
      } else if (key === "l") {
        sendInput({ ...current, ultimate: true });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const current = inputStatesRef.current[currentUserIdRef.current ?? ""] ?? DEFAULT_INPUT;
      const key = event.key.toLowerCase();

      if (key === "a") {
        sendInput({ ...current, left: false });
      } else if (key === "d") {
        sendInput({ ...current, right: false });
      } else if (key === "w") {
        sendInput({ ...current, jump: false });
      } else if (key === "s") {
        sendInput({ ...current, drop: false });
      } else if (key === "j") {
        sendInput({ ...current, attack: false });
      } else if (key === "k") {
        sendInput({ ...current, special: false });
      } else if (key === "l") {
        sendInput({ ...current, ultimate: false });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [players.length, currentUserId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const currentState = stateRef.current;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y);
      ctx.fillStyle = "#64748b";
      STAGE_PLATFORMS.forEach((platform) => {
        ctx.fillRect(
          platform.x - platform.width / 2,
          platform.y,
          platform.width,
          PLATFORM_HEIGHT
        );
      });

      currentState.projectiles.forEach((projectile) => {
        ctx.fillStyle = projectile.color;
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      playersRef.current.forEach((player) => {
        const fighter = currentState.players[player.userId];
        if (!fighter || fighter.respawnMs > 0) return;

        const config = fighter.selectedCharacter ? CHARACTER_CONFIGS[fighter.selectedCharacter] : null;
        ctx.fillStyle = config?.color ?? "#94a3b8";
        if (fighter.invulnMs > 0 && Math.floor(fighter.invulnMs / 100) % 2 === 0) {
          ctx.globalAlpha = 0.45;
        }
        ctx.fillRect(
          fighter.x - PLAYER_WIDTH / 2,
          fighter.y - PLAYER_HEIGHT / 2,
          PLAYER_WIDTH,
          PLAYER_HEIGHT
        );
        ctx.globalAlpha = 1;
        ctx.fillStyle = config?.accent ?? "#e2e8f0";
        ctx.fillRect(fighter.x - 8, fighter.y - PLAYER_HEIGHT / 2 - 8, 16, 8);
        if (fighter.attackFlashMs > 0) {
          ctx.fillStyle = "#fef3c7";
          ctx.fillRect(
            fighter.x + fighter.facing * 16,
            fighter.y - 10,
            16 * fighter.facing,
            8
          );
        }
      });

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "16px monospace";
      currentState.projectiles.forEach(() => {});
      playersRef.current.forEach((player, index) => {
        const fighter = currentState.players[player.userId];
        if (!fighter) return;
        const lineY = 24 + index * 24;
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(
          `${player.username} | ${fighter.selectedCharacter ?? "no pick"} | hp ${fighter.health.toFixed(0)} | stocks ${fighter.stocks} | ult ${fighter.ultimateCharge.toFixed(0)}`,
          18,
          lineY
        );
      });

      renderRef.current = window.requestAnimationFrame(draw);
    };

    renderRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (renderRef.current) {
        window.cancelAnimationFrame(renderRef.current);
        renderRef.current = null;
      }
    };
  }, []);

  const selectCharacter = async (character: CharacterId) => {
    if (!currentUserId || !channelRef.current || players.length !== 2) return;

    const nextState: BrawlState = {
      ...stateRef.current,
      players: {
        ...stateRef.current.players,
        [currentUserId]: {
          ...(stateRef.current.players[currentUserId] ?? createPlayerState(0)),
          selectedCharacter: character
        }
      }
    };
    setBrawlState(nextState);
    stateRef.current = nextState;

    await channelRef.current.send({
      type: "broadcast",
      event: "brawl-select",
      payload: { userId: currentUserId, character }
    });
  };

  const startMatch = async () => {
    if (!isHost || players.length !== 2) return;
    const everyoneSelected = players.every(
      (player) => Boolean(stateRef.current.players[player.userId]?.selectedCharacter)
    );
    if (!everyoneSelected) return;

    players.forEach((player) => {
      inputStatesRef.current[player.userId] = DEFAULT_INPUT;
    });

    await broadcastState(startMatchState(players, stateRef.current));
  };

  const resetRoom = async () => {
    if (!isHost || players.length !== 2) return;
    await broadcastState(createSelectState(players));
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card">
        <h2>Focus Brawl v0.1</h2>
        <p>Two-player platform fighter test build with one arena and simple character select.</p>
        <div className="info">
          Seats filled: {Math.min(players.length, 2)}/2
          {connected && !roomFull ? ` | ${currentUsername}` : ""}
        </div>
        {roomFull && !isSeated ? (
          <div className="error">Two players are already in this room. Wait for someone to leave.</div>
        ) : (
          <>
            <div className="button-row">
              {players.map((player) => {
                const selectedCharacter = brawlState.players[player.userId]?.selectedCharacter;
                return (
                  <span key={player.userId} className="secondary-button">
                    {player.username}: {selectedCharacter ?? "choosing"}
                  </span>
                );
              })}
            </div>
            <div className="button-row">
              {(["mage", "fighter"] as CharacterId[]).map((character) => (
                <button
                  key={character}
                  type="button"
                  className="secondary-button"
                  onClick={() => void selectCharacter(character)}
                  disabled={players.length !== 2}
                >
                  {CHARACTER_CONFIGS[character].name}
                </button>
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
                border: "1px solid #334155",
                background: "#020617"
              }}
            />
            <p className="info">{brawlState.message}</p>
            <p>
              Controls: `WASD` move, jump, and drop. `J` melee, `K` special, `L` ultimate once charged.
            </p>
            <p>
              Mage: staff swipe, fireball, bigger fireball. Fighter: sword slash, dagger, bigger dagger.
            </p>
            {brawlState.phase === "select" && isHost && (
              <button
                className="primary-button"
                type="button"
                onClick={() => void startMatch()}
                disabled={
                  players.length !== 2 ||
                  !players.every((player) => Boolean(brawlState.players[player.userId]?.selectedCharacter))
                }
              >
                Start match
              </button>
            )}
            {brawlState.phase === "gameOver" && isHost && (
              <button className="primary-button" type="button" onClick={() => void resetRoom()}>
                Back to character select
              </button>
            )}
            {opponent && <p>{currentUsername} versus {opponent.username}.</p>}
          </>
        )}
      </div>
    </div>
  );
};

export default Brawl;
