import React, { useEffect, useMemo, useRef, useState } from "react";
import InputPrompt from "../components/InputPrompt";
import NavBar from "../components/NavBar";
import {
  CHARACTER_CONFIGS,
  clamp,
  drawBrawlCharacter,
  getDashProfile,
  normalizeVector,
  type CharacterId
} from "../lib/brawlShared";
import {
  createKenneyAudioPools,
  getKenneyParticleKey,
  KENNEY_PROMPTS,
  loadKenneyParticleImages,
  playKenneySfx,
  type KenneyParticleKey,
  type KenneySfxKey
} from "../lib/kenneyAssets";
import { recordArcadeResult } from "../lib/progression";
import { supabase } from "../lib/supabase";

type PlayerPresence = {
  userId: string;
  username: string;
  onlineAt: string;
};

type MapId = "sky-ruins" | "ember-yard" | "moon-pier";
type ProjectileKind = "fireball" | "dagger" | "arrow" | "ultimate";

type InputState = {
  left: boolean;
  right: boolean;
  jump: boolean;
  drop: boolean;
  dash: boolean;
  attack: boolean;
  special: boolean;
  ultimate: boolean;
  aimX: number;
  aimY: number;
};

type Platform = {
  x: number;
  y: number;
  width: number;
};

type StageConfig = {
  id: MapId;
  name: string;
  subtitle: string;
  floorY: number;
  respawnY: number;
  platforms: Platform[];
  bgTop: string;
  bgBottom: string;
  floorColor: string;
  floorEdge: string;
  platformColor: string;
  accent: string;
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
  jumpLockMs: number;
  coyoteMs: number;
  airJumpsRemaining: number;
  attackCooldownMs: number;
  specialCooldownMs: number;
  dashCooldownMs: number;
  respawnMs: number;
  invulnMs: number;
  weaknessMs: number;
  ultimateCharge: number;
  attackFlashMs: number;
  dashReleased: boolean;
  specialReleased: boolean;
  assassinKnifeId: string | null;
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
  knockback: number;
  lift: number;
  color: string;
  kind: ProjectileKind;
  gravity: number;
  ttlMs: number;
  isUltimate: boolean;
  spent?: boolean;
};

type Effect = {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  ttlMs: number;
  x2?: number;
  y2?: number;
};

type LavaHazard = {
  phase: "warning" | "active";
  x: number;
  width: number;
  ttlMs: number;
};

type MoonHazard = {
  phase: "warning" | "active";
  x: number;
  width: number;
  ttlMs: number;
  vx: number;
};

type BrawlState = {
  phase: "waiting" | "select" | "playing" | "gameOver";
  selectedMap: MapId;
  players: Record<string, FighterPlayer>;
  projectiles: Projectile[];
  effects: Effect[];
  lavaHazard: LavaHazard | null;
  moonHazard: MoonHazard | null;
  stageEventCooldownMs: number;
  winnerId: string | null;
  message: string;
};

const ROOM_NAME = "focusland-brawl";
const WIDTH = 920;
const HEIGHT = 540;
const PLAYER_WIDTH = 28;
const PLAYER_HEIGHT = 44;
const PLATFORM_HEIGHT = 12;
const GRAVITY = 0.62;
const MAX_FALL_SPEED = 12;
const FLOOR_MARGIN = 110;
const WALL_MARGIN = 16;
const STOCKS = 3;
const MAX_HEALTH = 100;
const ULTIMATE_CHARGE_MAX = 100;
const COYOTE_MS = 110;
const JUMP_LOCK_MS = 180;
const NETWORK_RENDER_WINDOW_MS = 60;
const BRAWL_VERSION = "1.2";
const DEFAULT_MAP: MapId = "sky-ruins";
const BLAST_ZONE_MARGIN = FLOOR_MARGIN + 48;
const LAVA_LANES = [WIDTH * 0.28, WIDTH * 0.5, WIDTH * 0.72];
const LAVA_WIDTH = 96;
const MOON_BEAM_WIDTH = 122;

const STAGES: Record<MapId, StageConfig> = {
  "sky-ruins": {
    id: "sky-ruins",
    name: "Sky Ruins",
    subtitle: "Balanced three-platform arena for pure footsies",
    floorY: 352,
    respawnY: 136,
    platforms: [
      { x: WIDTH / 2, y: 258, width: 190 },
      { x: WIDTH / 2 - 170, y: 192, width: 126 },
      { x: WIDTH / 2 + 170, y: 192, width: 126 }
    ],
    bgTop: "#153b5c",
    bgBottom: "#83c5be",
    floorColor: "#ddc39a",
    floorEdge: "#b08968",
    platformColor: "#d8e2dc",
    accent: "#f1faee"
  },
  "ember-yard": {
    id: "ember-yard",
    name: "Ember Yard",
    subtitle: "Lower center perch with timed lava bursts",
    floorY: 350,
    respawnY: 132,
    platforms: [
      { x: WIDTH / 2, y: 272, width: 170 },
      { x: WIDTH / 2 - 180, y: 205, width: 118 },
      { x: WIDTH / 2 + 180, y: 205, width: 118 }
    ],
    bgTop: "#391818",
    bgBottom: "#d97706",
    floorColor: "#5b3419",
    floorEdge: "#f59e0b",
    platformColor: "#7c2d12",
    accent: "#fed7aa"
  },
  "moon-pier": {
    id: "moon-pier",
    name: "Moon Pier",
    subtitle: "Wide side lanes with a roaming moonbeam hazard",
    floorY: 348,
    respawnY: 130,
    platforms: [
      { x: WIDTH / 2, y: 238, width: 160 },
      { x: WIDTH / 2 - 190, y: 205, width: 132 },
      { x: WIDTH / 2 + 190, y: 205, width: 132 }
    ],
    bgTop: "#111827",
    bgBottom: "#4338ca",
    floorColor: "#1f2937",
    floorEdge: "#93c5fd",
    platformColor: "#334155",
    accent: "#c4b5fd"
  }
};

const DEFAULT_INPUT: InputState = {
  left: false,
  right: false,
  jump: false,
  drop: false,
  dash: false,
  attack: false,
  special: false,
  ultimate: false,
  aimX: WIDTH / 2,
  aimY: HEIGHT / 2
};

const DEFAULT_STATE: BrawlState = {
  phase: "waiting",
  selectedMap: DEFAULT_MAP,
  players: {},
  projectiles: [],
  effects: [],
  lavaHazard: null,
  moonHazard: null,
  stageEventCooldownMs: 3200,
  winnerId: null,
  message: "Waiting for two players."
};

function approach(current: number, target: number, amount: number) {
  if (current < target) return Math.min(current + amount, target);
  if (current > target) return Math.max(current - amount, target);
  return current;
}

function lerp(start: number, end: number, alpha: number) {
  return start + (end - start) * alpha;
}

function createEffect(x: number, y: number, color: string, radius: number, ttlMs: number): Effect {
  return {
    id: `${color}-${x}-${y}-${Date.now()}-${Math.random()}`,
    x,
    y,
    radius,
    color,
    ttlMs
  };
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

function createPlayerState(index: number, stage: StageConfig): FighterPlayer {
  return {
    x: index === 0 ? WIDTH * 0.3 : WIDTH * 0.7,
    y: stage.respawnY,
    vx: 0,
    vy: 0,
    facing: index === 0 ? 1 : -1,
    health: MAX_HEALTH,
    stocks: STOCKS,
    onGround: false,
    dropThroughMs: 0,
    jumpLockMs: 0,
    coyoteMs: 0,
    airJumpsRemaining: 1,
    attackCooldownMs: 0,
    specialCooldownMs: 0,
    dashCooldownMs: 0,
    respawnMs: 0,
    invulnMs: 0,
    weaknessMs: 0,
    ultimateCharge: 0,
    attackFlashMs: 0,
    dashReleased: true,
    specialReleased: true,
    assassinKnifeId: null,
    selectedCharacter: null
  };
}

function createSelectState(players: PlayerPresence[], selectedMap: MapId): BrawlState {
  const stage = STAGES[selectedMap];
  const playerState = players.reduce<Record<string, FighterPlayer>>((acc, player, index) => {
    acc[player.userId] = createPlayerState(index, stage);
    return acc;
  }, {});

  return {
    phase: "select",
    selectedMap,
    players: playerState,
    projectiles: [],
    effects: [],
    lavaHazard: null,
    moonHazard: null,
    stageEventCooldownMs: 3200,
    winnerId: null,
    message: "Choose fighters and a stage."
  };
}

function startMatchState(players: PlayerPresence[], currentState: BrawlState): BrawlState {
  const stage = STAGES[currentState.selectedMap];
  const nextPlayers = players.reduce<Record<string, FighterPlayer>>((acc, player, index) => {
    const existing = currentState.players[player.userId];
    const characterId = existing?.selectedCharacter ?? null;
    const config = characterId ? CHARACTER_CONFIGS[characterId] : null;
    acc[player.userId] = {
      ...createPlayerState(index, stage),
      selectedCharacter: characterId,
      airJumpsRemaining: config?.airJumps ?? 1,
      invulnMs: 900
    };
    return acc;
  }, {});

  return {
    phase: "playing",
    selectedMap: currentState.selectedMap,
    players: nextPlayers,
    projectiles: [],
    effects: [],
    lavaHazard: null,
    moonHazard: null,
    stageEventCooldownMs: 2600,
    winnerId: null,
    message: `${stage.name}. Fight.`
  };
}

function getStandingPlatform(player: FighterPlayer, stage: StageConfig) {
  return (
    stage.platforms.find(
      (platform) =>
        Math.abs(player.y + PLAYER_HEIGHT / 2 - platform.y) < 2 &&
        Math.abs(player.x - platform.x) <= platform.width / 2 + PLAYER_WIDTH / 2
    ) ?? null
  );
}

function predictPlayerState(
  player: FighterPlayer,
  input: InputState,
  stage: StageConfig,
  elapsedMs: number
) {
  if (!player.selectedCharacter || player.respawnMs > 0 || elapsedMs <= 0) {
    return player;
  }

  const next = { ...player };
  const config = CHARACTER_CONFIGS[next.selectedCharacter];
  let remainingMs = Math.min(elapsedMs, 132);

  while (remainingMs > 0) {
    const stepMs = Math.min(33, remainingMs);
    const scale = stepMs / 33;
    remainingMs -= stepMs;

    next.attackCooldownMs = Math.max(0, next.attackCooldownMs - stepMs);
    next.specialCooldownMs = Math.max(0, next.specialCooldownMs - stepMs);
    next.dashCooldownMs = Math.max(0, next.dashCooldownMs - stepMs);
    next.dropThroughMs = Math.max(0, next.dropThroughMs - stepMs);
    next.jumpLockMs = Math.max(0, next.jumpLockMs - stepMs);
    next.coyoteMs = Math.max(0, next.coyoteMs - stepMs);
    next.invulnMs = Math.max(0, next.invulnMs - stepMs);

    const standingPlatform = getStandingPlatform(next, stage);
    const grounded = next.onGround || Boolean(standingPlatform);
    const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const targetSpeed = horizontal * config.moveSpeed;
    const accel = (grounded ? 1.25 : 0.62) * scale;
    const friction = (grounded ? 0.9 : 0.22) * scale;

    if (horizontal !== 0) {
      next.vx = approach(next.vx, targetSpeed, accel);
      next.facing = horizontal > 0 ? 1 : -1;
    } else {
      next.vx = approach(next.vx, 0, friction);
    }

    if (!input.dash) {
      next.dashReleased = true;
    } else if (next.dashReleased && next.dashCooldownMs === 0) {
      const dashDirection = horizontal !== 0 ? (horizontal > 0 ? 1 : -1) : next.facing;
      const dashProfile = getDashProfile(next.selectedCharacter);
      const dashPower = dashProfile.power;
      next.vx = dashDirection * dashPower;
      next.vy = grounded ? Math.min(next.vy, -0.5) : next.vy * 0.72;
      next.facing = dashDirection;
      next.dashCooldownMs = dashProfile.cooldownMs;
      next.dashReleased = false;
    }

    if (grounded) {
      next.coyoteMs = COYOTE_MS;
    }

    if (input.drop && grounded && standingPlatform) {
      next.dropThroughMs = 220;
      next.onGround = false;
    } else if (input.drop && !grounded) {
      next.vy = Math.min(MAX_FALL_SPEED, next.vy + 0.72 * scale);
    }

    if (input.jump && next.jumpLockMs === 0) {
      if (grounded || next.coyoteMs > 0) {
        next.vy = config.jumpVelocity;
        next.onGround = false;
        next.jumpLockMs = JUMP_LOCK_MS;
        next.coyoteMs = 0;
      } else if (next.airJumpsRemaining > 0) {
        next.vy = config.jumpVelocity * 0.96;
        next.airJumpsRemaining -= 1;
        next.jumpLockMs = JUMP_LOCK_MS;
      }
    }

    const previousBottom = next.y + PLAYER_HEIGHT / 2;
    next.vy = Math.min(MAX_FALL_SPEED, next.vy + GRAVITY * scale);
    next.x = clamp(next.x + next.vx * scale, WALL_MARGIN, WIDTH - WALL_MARGIN);
    next.y += next.vy * scale;
    next.onGround = false;

    if (next.y - PLAYER_HEIGHT / 2 < 18) {
      next.y = 18 + PLAYER_HEIGHT / 2;
      next.vy = Math.max(0, next.vy);
    }

    if (next.y + PLAYER_HEIGHT / 2 >= stage.floorY) {
      next.y = stage.floorY - PLAYER_HEIGHT / 2;
      next.vy = 0;
      next.onGround = true;
      next.airJumpsRemaining = config.airJumps;
    } else {
      const landingPlatform = stage.platforms.find(
        (platform) =>
          next.dropThroughMs === 0 &&
          previousBottom <= platform.y &&
          next.y + PLAYER_HEIGHT / 2 >= platform.y &&
          Math.abs(next.x - platform.x) <= platform.width / 2 + PLAYER_WIDTH / 2
      );

      if (landingPlatform) {
        next.y = landingPlatform.y - PLAYER_HEIGHT / 2;
        next.vy = 0;
        next.onGround = true;
        next.airJumpsRemaining = config.airJumps;
      }
    }
  }

  return next;
}

const Brawl: React.FC = () => {
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [connected, setConnected] = useState(false);
  const [roomFull, setRoomFull] = useState(false);
  const [brawlState, setBrawlState] = useState<BrawlState>(DEFAULT_STATE);
  const [vsIntro, setVsIntro] = useState<{
    leftName: string;
    leftCharacter: CharacterId;
    rightName: string;
    rightCharacter: CharacterId;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const tickRef = useRef<number | null>(null);
  const renderRef = useRef<number | null>(null);
  const stateRef = useRef<BrawlState>(DEFAULT_STATE);
  const previousStateRef = useRef<BrawlState | null>(null);
  const frozenStateRef = useRef<BrawlState | null>(null);
  const playersRef = useRef<PlayerPresence[]>([]);
  const currentUserIdRef = useRef<string | null>(null);
  const lastStateAtRef = useRef<number>(performance.now());
  const inputStatesRef = useRef<Record<string, InputState>>({});
  const lastAimBroadcastAtRef = useRef<number>(0);
  const cameraShakeRef = useRef({ intensity: 0, ttlMs: 0 });
  const hitStopUntilRef = useRef<number>(0);
  const introStartedAtRef = useRef<number>(0);
  const audioUnlockedRef = useRef(false);
  const audioPoolsRef = useRef<Record<KenneySfxKey, HTMLAudioElement[]> | null>(null);
  const particleImagesRef = useRef<Record<KenneyParticleKey, HTMLImageElement> | null>(null);
  const vsIntroTimeoutRef = useRef<number | null>(null);
  const rewardClaimedRef = useRef(false);

  const isSeated = currentUserId ? players.some((player) => player.userId === currentUserId) : false;
  const isHost = Boolean(currentUserId && players[0]?.userId === currentUserId);
  const opponent = useMemo(
    () => players.find((player) => player.userId !== currentUserId) ?? null,
    [players, currentUserId]
  );
  const everyoneSelected =
    players.length === 2 &&
    players.every((player) => Boolean(brawlState.players[player.userId]?.selectedCharacter));

  useEffect(() => {
    stateRef.current = brawlState;
  }, [brawlState]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    if (brawlState.phase === "playing" || brawlState.phase === "select") {
      rewardClaimedRef.current = false;
      return;
    }

    if (
      rewardClaimedRef.current ||
      brawlState.phase !== "gameOver" ||
      !currentUserId ||
      !players.some((player) => player.userId === currentUserId)
    ) {
      return;
    }

    rewardClaimedRef.current = true;
    const isWinner = brawlState.winnerId === currentUserId;
    void (async () => {
      try {
        await recordArcadeResult({
          goldEarned: isWinner ? 20 : 5,
          stats: isWinner ? { brawl_wins: 1 } : undefined
        });
      } catch {
        // Ignore progression failures so the match result still lands.
      }
    })();
  }, [brawlState.phase, brawlState.winnerId, currentUserId, players]);

  useEffect(() => {
    particleImagesRef.current = loadKenneyParticleImages();
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      audioPoolsRef.current = audioPoolsRef.current ?? createKenneyAudioPools();
      audioUnlockedRef.current = true;
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (brawlState.phase !== "playing") {
      previousStateRef.current = null;
      lastStateAtRef.current = performance.now();
    }

    if (currentUserId) {
      inputStatesRef.current = {
        ...inputStatesRef.current,
        [currentUserId]: DEFAULT_INPUT
      };
    }
  }, [brawlState.phase, currentUserId]);

  const applyIncomingState = (nextState: BrawlState) => {
    const currentState = stateRef.current;
    const shouldResetInterpolation =
      currentState.phase !== nextState.phase || currentState.selectedMap !== nextState.selectedMap;

    const triggerCamera = (intensity: number, ttlMs: number) => {
      cameraShakeRef.current = { intensity, ttlMs };
    };

    const triggerHitStop = (durationMs: number) => {
      frozenStateRef.current = currentState;
      hitStopUntilRef.current = performance.now() + durationMs;
    };

    const playSfx = (kind: "hit" | "hazard" | "ult" | "ready" | "win") => {
      if (!audioUnlockedRef.current) return;
      audioPoolsRef.current = audioPoolsRef.current ?? createKenneyAudioPools();
      const volume = kind === "win" ? 0.62 : kind === "ult" ? 0.52 : kind === "hazard" ? 0.46 : 0.38;
      playKenneySfx(
        audioPoolsRef.current,
        kind === "ready" ? "hit" : kind,
        volume
      );
    };

    if (currentState.phase !== nextState.phase && nextState.phase === "playing") {
      introStartedAtRef.current = performance.now();
      const matchupPlayers = playersRef.current.slice(0, 2);
      const leftPlayer = matchupPlayers[0];
      const rightPlayer = matchupPlayers[1];
      const leftCharacter = leftPlayer ? nextState.players[leftPlayer.userId]?.selectedCharacter : null;
      const rightCharacter = rightPlayer ? nextState.players[rightPlayer.userId]?.selectedCharacter : null;
      if (leftPlayer && rightPlayer && leftCharacter && rightCharacter) {
        setVsIntro({
          leftName: leftPlayer.username,
          leftCharacter,
          rightName: rightPlayer.username,
          rightCharacter
        });
        if (vsIntroTimeoutRef.current) {
          window.clearTimeout(vsIntroTimeoutRef.current);
        }
        vsIntroTimeoutRef.current = window.setTimeout(() => {
          setVsIntro(null);
          vsIntroTimeoutRef.current = null;
        }, 1900);
      }
      playSfx("ready");
    }

    if (nextState.message !== currentState.message) {
      if (
        /Projectile hit|got clipped|caught in the moonbeam|landed|carved|disciplined strike|cracked|hooked|knocked out|connected/i.test(
          nextState.message
        )
      ) {
        triggerHitStop(45);
        triggerCamera(8, 120);
        playSfx("hit");
      } else if (/Lava burst|Moonbeam sweep/i.test(nextState.message)) {
        triggerCamera(14, 240);
        playSfx("hazard");
      } else if (/unleashed|called down|whirlwind|fists of fury|inflicted weakness/i.test(nextState.message)) {
        triggerCamera(16, 220);
        playSfx("ult");
      } else if (/wins\./i.test(nextState.message)) {
        triggerCamera(12, 260);
        playSfx("win");
      }
    }

    previousStateRef.current = shouldResetInterpolation ? null : currentState;
    lastStateAtRef.current = performance.now();
    setBrawlState(nextState);
    stateRef.current = nextState;
  };

  const broadcastState = async (nextState: BrawlState) => {
    applyIncomingState(nextState);
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
        let nextState = currentState;
        if (nextPlayers.length < 2) {
          nextState = { ...DEFAULT_STATE, selectedMap: currentState.selectedMap };
        } else if (currentState.phase === "waiting") {
          nextState = createSelectState(nextPlayers, currentState.selectedMap);
        }
        stateRef.current = nextState;
        return nextState;
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
        applyIncomingState(payload as BrawlState);
      });
      channel.on("broadcast", { event: "brawl-input" }, ({ payload }) => {
        const nextPayload = payload as { userId: string; input: InputState };
        inputStatesRef.current = {
          ...inputStatesRef.current,
          [nextPayload.userId]: nextPayload.input
        };
      });
      channel.on("broadcast", { event: "brawl-select" }, ({ payload }) => {
        const nextPayload = payload as
          | { type: "character"; userId: string; character: CharacterId }
          | { type: "map"; map: MapId };

        setBrawlState((currentState) => {
          let nextState = currentState;
          if (nextPayload.type === "character") {
            nextState = {
              ...currentState,
              players: {
                ...currentState.players,
                [nextPayload.userId]: {
                  ...(currentState.players[nextPayload.userId] ??
                    createPlayerState(0, STAGES[currentState.selectedMap])),
                  selectedCharacter: nextPayload.character
                }
              }
            };
          } else if (currentState.phase === "select") {
            nextState = {
              ...currentState,
              selectedMap: nextPayload.map,
              message: `${STAGES[nextPayload.map].name} selected.`
            };
          }
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
      if (vsIntroTimeoutRef.current) {
        window.clearTimeout(vsIntroTimeoutRef.current);
        vsIntroTimeoutRef.current = null;
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

      const stage = STAGES[currentState.selectedMap];
      const currentPlayers = playersRef.current;
      const nextPlayers = Object.fromEntries(
        Object.entries(currentState.players).map(([playerId, playerState]) => [
          playerId,
          { ...playerState }
        ])
      ) as Record<string, FighterPlayer>;
      let nextProjectiles = currentState.projectiles.map((projectile) => ({ ...projectile }));
      let nextEffects = currentState.effects
        .map((effect) => ({ ...effect, ttlMs: effect.ttlMs - 33 }))
        .filter((effect) => effect.ttlMs > 0);
      let nextLavaHazard = currentState.lavaHazard
        ? { ...currentState.lavaHazard, ttlMs: currentState.lavaHazard.ttlMs - 33 }
        : null;
      let nextMoonHazard = currentState.moonHazard
        ? {
            ...currentState.moonHazard,
            ttlMs: currentState.moonHazard.ttlMs - 33,
            x:
              currentState.moonHazard.phase === "active"
                ? clamp(
                    currentState.moonHazard.x + currentState.moonHazard.vx,
                    96,
                    WIDTH - 96
                  )
                : currentState.moonHazard.x
          }
        : null;
      let nextStageEventCooldownMs = Math.max(0, currentState.stageEventCooldownMs - 33);
      let nextMessage = currentState.message;
      let winnerId: string | null = null;

      const getOtherPlayerId = (userId: string) =>
        currentPlayers.find((player) => player.userId !== userId)?.userId ?? null;

      const addCharge = (playerId: string, amount: number) => {
        const player = nextPlayers[playerId];
        if (!player || amount <= 0) return;
        player.ultimateCharge = clamp(player.ultimateCharge + amount, 0, ULTIMATE_CHARGE_MAX);
      };

      const removeProjectileById = (projectileId: string | null) => {
        if (!projectileId) return;
        nextProjectiles = nextProjectiles.filter((projectile) => projectile.id !== projectileId);
      };

      const loseStock = (playerId: string, reason: string) => {
        const state = nextPlayers[playerId];
        if (!state) return;
        const defeatedPlayer = currentPlayers.find((player) => player.userId === playerId);
        state.stocks -= 1;
        state.health = MAX_HEALTH;
        state.vx = 0;
        state.vy = 0;
        state.respawnMs = state.stocks > 0 ? 1150 : 0;
        state.invulnMs = 0;
        nextEffects.push(createEffect(state.x, state.y, "#fca5a5", 28, 240));
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
        sourceId: string | null,
        damage: number,
        knockback: number,
        lift: number,
        hitX: number,
        hitY: number,
        effectColor: string,
        hitInvulnMs = 0,
        chargeGain = 0
      ) => {
        const target = nextPlayers[targetId];
        const source = sourceId ? nextPlayers[sourceId] : null;
        if (!target || target.respawnMs > 0 || target.invulnMs > 0) return;

        const deltaX = target.x - (source?.x ?? hitX - 1);
        const deltaY = target.y - (source?.y ?? hitY);
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const normalizedX = deltaX / distance;
        const normalizedY = deltaY / distance;

        const damageMultiplier = target.weaknessMs > 0 ? 1.5 : 1;
        target.health = clamp(target.health - damage * damageMultiplier, 0, MAX_HEALTH);
        target.vx = normalizedX * knockback;
        target.vy = normalizedY * knockback - lift;
        if (target.vy > -2.4) {
          target.vy = -2.4;
        }
        target.onGround = false;
        target.coyoteMs = 0;
        if (Math.abs(target.vx) > 0.8) {
          target.facing = target.vx > 0 ? 1 : -1;
        }
        if (hitInvulnMs > 0) {
          target.invulnMs = Math.max(target.invulnMs, hitInvulnMs);
        }

        nextEffects.push(createEffect(hitX, hitY, effectColor, 18, 180));
        if (sourceId) {
          addCharge(sourceId, chargeGain);
        }

        if (target.health <= 0) {
          loseStock(targetId, "got knocked out");
        }
      };

      currentPlayers.forEach((player) => {
        const state = nextPlayers[player.userId];
        if (!state) return;

        state.attackCooldownMs = Math.max(0, state.attackCooldownMs - 33);
        state.specialCooldownMs = Math.max(0, state.specialCooldownMs - 33);
        state.dashCooldownMs = Math.max(0, state.dashCooldownMs - 33);
        state.dropThroughMs = Math.max(0, state.dropThroughMs - 33);
        state.jumpLockMs = Math.max(0, state.jumpLockMs - 33);
        state.coyoteMs = Math.max(0, state.coyoteMs - 33);
        state.attackFlashMs = Math.max(0, state.attackFlashMs - 33);
        state.invulnMs = Math.max(0, state.invulnMs - 33);
        state.weaknessMs = Math.max(0, state.weaknessMs - 33);

        if (state.respawnMs > 0) {
          state.respawnMs = Math.max(0, state.respawnMs - 33);
          if (state.respawnMs === 0) {
            const index = currentPlayers.findIndex((entry) => entry.userId === player.userId);
            const characterId = state.selectedCharacter;
            const config = characterId ? CHARACTER_CONFIGS[characterId] : null;
            const reset = createPlayerState(index, stage);
            nextPlayers[player.userId] = {
              ...state,
              ...reset,
              selectedCharacter: characterId,
              stocks: state.stocks,
              health: MAX_HEALTH,
              airJumpsRemaining: config?.airJumps ?? 1,
              invulnMs: 1200
            };
          }
          return;
        }

        const characterId = state.selectedCharacter;
        if (!characterId) return;
        const config = CHARACTER_CONFIGS[characterId];
        const input = inputStatesRef.current[player.userId] ?? DEFAULT_INPUT;
        const rawAimVector = normalizeVector(input.aimX - state.x, input.aimY - state.y);
        const aimVector =
          rawAimVector.length < 10 ? { x: state.facing, y: 0, length: 1 } : rawAimVector;
        const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const standingPlatform = getStandingPlatform(state, stage);
        const grounded = state.onGround || Boolean(standingPlatform);
        const targetSpeed = horizontal * config.moveSpeed;
        const accel = grounded ? 1.25 : 0.62;
        const friction = grounded ? 0.9 : 0.22;

        if (horizontal !== 0) {
          state.vx = approach(state.vx, targetSpeed, accel);
          state.facing = horizontal > 0 ? 1 : -1;
        } else {
          state.vx = approach(state.vx, 0, friction);
        }

        if (Math.abs(aimVector.x) > 0.22) {
          state.facing = aimVector.x > 0 ? 1 : -1;
        }

        if (!input.dash) {
          state.dashReleased = true;
        } else if (state.dashReleased && state.dashCooldownMs === 0) {
          const dashDirection = horizontal !== 0 ? (horizontal > 0 ? 1 : -1) : state.facing;
          const dashProfile = getDashProfile(characterId);
          const dashPower = dashProfile.power;
          state.vx = dashDirection * dashPower;
          state.vy = grounded ? Math.min(state.vy, -0.5) : state.vy * 0.72;
          state.facing = dashDirection;
          state.dashCooldownMs = dashProfile.cooldownMs;
          state.dashReleased = false;
          nextEffects.push(createEffect(state.x, state.y + 8, config.accent, 14, 140));
        }

        if (!input.special) {
          state.specialReleased = true;
        }

        if (grounded) {
          state.coyoteMs = COYOTE_MS;
        }

        if (input.drop && grounded && standingPlatform) {
          state.dropThroughMs = 220;
          state.onGround = false;
        } else if (input.drop && !grounded) {
          state.vy = Math.min(MAX_FALL_SPEED, state.vy + 0.72);
        }

        if (input.jump && state.jumpLockMs === 0) {
          if (grounded || state.coyoteMs > 0) {
            state.vy = config.jumpVelocity;
            state.onGround = false;
            state.jumpLockMs = JUMP_LOCK_MS;
            state.coyoteMs = 0;
          } else if (state.airJumpsRemaining > 0) {
            state.vy = config.jumpVelocity * 0.96;
            state.airJumpsRemaining -= 1;
            state.jumpLockMs = JUMP_LOCK_MS;
          }
        }

        if (input.attack && state.attackCooldownMs === 0) {
          const targetId = getOtherPlayerId(player.userId);
          const target = targetId ? nextPlayers[targetId] : null;

          if (characterId === "fighter" || characterId === "assassin" || characterId === "monk") {
            if (
              target &&
              target.respawnMs === 0 &&
              Math.hypot(target.x - state.x, target.y - state.y) <= config.meleeRange
            ) {
              const targetVector = normalizeVector(target.x - state.x, target.y - state.y);
              if (aimVector.x * targetVector.x + aimVector.y * targetVector.y > 0.2) {
              applyHit(
                targetId!,
                player.userId,
                config.meleeDamage,
                config.meleeKnockback,
                config.meleeLift,
                (state.x + target.x) / 2,
                state.y - 6,
                config.trim,
                0,
                characterId === "assassin" ? 7 : characterId === "monk" ? 8 : 8
              );
              nextMessage =
                characterId === "assassin"
                  ? `${player.username} carved in with twin daggers.`
                  : characterId === "monk"
                    ? `${player.username} landed a disciplined strike.`
                    : `${player.username} landed a heavy strike.`;
              }
            }
            state.vx += config.meleeLunge * aimVector.x;
            state.vy += config.meleeLunge * 0.35 * aimVector.y;
            state.attackCooldownMs =
              characterId === "assassin" ? 190 : characterId === "monk" ? 220 : 280;
          } else {
            nextProjectiles.push({
              id: `attack-${player.userId}-${Date.now()}-${Math.random()}`,
              ownerId: player.userId,
              x: state.x + aimVector.x * 24,
              y: state.y - 10 + aimVector.y * 10,
              vx: (characterId === "archer" ? 9.4 : 7.1) * aimVector.x,
              vy: (characterId === "archer" ? 9.4 : 7.1) * aimVector.y,
              radius: characterId === "archer" ? 5 : 9,
              damage: characterId === "archer" ? 5 : 6,
              knockback: characterId === "archer" ? 8.2 : 6.9,
              lift: characterId === "archer" ? 5.4 : 5.8,
              color: characterId === "archer" ? "#fef08a" : "#fb923c",
              kind: characterId === "archer" ? "arrow" : "fireball",
              gravity: characterId === "archer" ? 0.01 : 0.015,
              ttlMs: characterId === "archer" ? 1280 : 1350,
              isUltimate: false
            });
            nextMessage =
              characterId === "archer"
                ? `${player.username} fired a quick shot.`
                : `${player.username} cast a flame bolt.`;
            state.attackCooldownMs = characterId === "archer" ? 360 : 320;
          }
          state.attackFlashMs = 130;
        }

        if (
          input.special &&
          state.specialReleased &&
          (state.specialCooldownMs === 0 || (characterId === "assassin" && Boolean(state.assassinKnifeId)))
        ) {
          state.specialReleased = false;
          if (characterId === "fighter") {
            const targetId = getOtherPlayerId(player.userId);
            const target = targetId ? nextPlayers[targetId] : null;
            const chainStartX = state.x + aimVector.x * 18;
            const chainStartY = state.y - 4 + aimVector.y * 10;
            const chainEndX = clamp(chainStartX + aimVector.x * 132, WALL_MARGIN, WIDTH - WALL_MARGIN);
            const chainEndY = clamp(chainStartY + aimVector.y * 132, 18, stage.floorY - 12);
            state.vx += aimVector.x * 1.4;
            nextEffects.push({
              id: `chain-cast-${player.userId}-${Date.now()}-${Math.random()}`,
              x: chainStartX,
              y: chainStartY,
              x2: chainEndX,
              y2: chainEndY,
              radius: 3,
              color: config.specialColor,
              ttlMs: 120
            });
            if (
              target &&
              target.respawnMs === 0 &&
              Math.hypot(target.x - state.x, target.y - state.y) <= 150
            ) {
              const targetVector = normalizeVector(target.x - state.x, target.y - state.y);
              if (aimVector.x * targetVector.x + aimVector.y * targetVector.y > 0.15) {
                const pullDirection = normalizeVector(state.x - target.x, state.y - target.y);
                target.x = clamp(state.x - pullDirection.x * 34, WALL_MARGIN + 8, WIDTH - WALL_MARGIN - 8);
                target.y = clamp(state.y - pullDirection.y * 10, 18 + PLAYER_HEIGHT / 2, stage.floorY - PLAYER_HEIGHT / 2);
                target.vx = pullDirection.x * 7.8;
                target.vy = pullDirection.y * 3.2 - 3.8;
                applyHit(
                  targetId!,
                  player.userId,
                  config.specialDamage,
                  6.4,
                  4.2,
                  (state.x + target.x) / 2,
                  (state.y + target.y) / 2,
                  config.specialColor,
                  0,
                  config.specialChargeGain
                );
                state.vx += aimVector.x * 2.8;
                nextEffects.push(createEffect((state.x + target.x) / 2, (state.y + target.y) / 2, config.specialColor, 20, 180));
                nextEffects.push({
                  id: `chain-${player.userId}-${Date.now()}-${Math.random()}`,
                  x: chainStartX,
                  y: chainStartY,
                  x2: target.x,
                  y2: target.y,
                  radius: 4,
                  color: config.specialColor,
                  ttlMs: 180
                });
                nextMessage = `${player.username} hooked them in with a chain.`;
              }
            }
            nextEffects.push(createEffect(state.x + aimVector.x * 30, state.y - 6 + aimVector.y * 12, config.specialColor, 18, 160));
          } else if (characterId === "mage") {
            const blinkDirection = Math.abs(aimVector.x) > 0.12 ? Math.sign(aimVector.x) : state.facing;
            const startX = state.x;
            const targetX = clamp(startX + blinkDirection * 120, WALL_MARGIN + 8, WIDTH - WALL_MARGIN - 8);
            state.x = targetX;
            state.vx = 0;
            state.vy = Math.min(state.vy, 0);
            state.onGround = false;
            state.dropThroughMs = 0;
            state.invulnMs = Math.max(state.invulnMs, 220);
            state.facing = blinkDirection > 0 ? 1 : -1;
            nextEffects.push(createEffect(startX, state.y + 4, config.specialColor, 24, 180));
            nextEffects.push(createEffect(targetX, state.y + 4, config.accent, 26, 220));
            nextMessage = `${player.username} blinked through space.`;
          } else if (characterId === "archer") {
            state.vy = config.jumpVelocity * 1.05;
            state.vx = -state.facing * 3.2;
            state.onGround = false;
            nextEffects.push(createEffect(state.x, state.y + 8, config.specialColor, 18, 180));
            nextMessage = `${player.username} vaulted away.`;
          } else if (characterId === "monk") {
            const targetId = getOtherPlayerId(player.userId);
            const target = targetId ? nextPlayers[targetId] : null;
            state.vx -= aimVector.x * 8.8;
            state.vy -= Math.max(1.2, Math.abs(aimVector.y) * 2);
            state.onGround = false;
            nextEffects.push(createEffect(state.x + aimVector.x * 28, state.y + aimVector.y * 14, config.specialColor, 26, 220));
            nextEffects.push(createEffect(state.x + aimVector.x * 40, state.y + aimVector.y * 18, config.trim, 14, 160));
            if (
              target &&
              target.respawnMs === 0 &&
              Math.hypot(target.x - state.x, target.y - state.y) <= 84
            ) {
              const targetVector = normalizeVector(target.x - state.x, target.y - state.y);
              if (aimVector.x * targetVector.x + aimVector.y * targetVector.y > 0.05) {
                applyHit(
                  targetId!,
                  player.userId,
                  config.specialDamage,
                  13.6,
                  3.2,
                  (state.x + target.x) / 2,
                  (state.y + target.y) / 2,
                  config.specialColor,
                  0,
                  config.specialChargeGain
                );
                nextMessage = `${player.username} blasted them away with a kick.`;
              }
            }
          } else {
            const existingKnife = nextProjectiles.find(
              (projectile) => projectile.id === state.assassinKnifeId && projectile.ownerId === player.userId
            );

            if (existingKnife) {
              state.x = clamp(existingKnife.x, WALL_MARGIN + 8, WIDTH - WALL_MARGIN - 8);
              state.y = clamp(existingKnife.y, 18 + PLAYER_HEIGHT / 2, stage.floorY - PLAYER_HEIGHT / 2);
              state.vx = 0;
              state.vy = 0;
              state.onGround = false;
              state.invulnMs = Math.max(state.invulnMs, 180);
              nextEffects.push(createEffect(existingKnife.x, existingKnife.y, config.specialColor, 24, 180));
              removeProjectileById(existingKnife.id);
              state.assassinKnifeId = null;
              state.specialCooldownMs = config.specialCooldownMs;
              nextMessage = `${player.username} blinked to their knife.`;
            } else {
              const knifeId = `knife-${player.userId}-${Date.now()}-${Math.random()}`;
              nextProjectiles.push({
                id: knifeId,
                ownerId: player.userId,
                x: state.x + aimVector.x * 22,
                y: state.y - 8 + aimVector.y * 8,
                vx: config.specialSpeed * aimVector.x,
                vy: config.specialSpeed * aimVector.y,
                radius: config.specialRadius,
                damage: config.specialDamage,
                knockback: 6.9,
                lift: 5.4,
                color: config.specialColor,
                kind: "dagger",
                gravity: config.specialGravity,
                ttlMs: 1000,
                isUltimate: false
              });
              state.assassinKnifeId = knifeId;
              state.specialCooldownMs = 0;
              nextMessage = `${player.username} threw a shadow knife.`;
            }
          }
          if (characterId !== "assassin") {
            state.specialCooldownMs = config.specialCooldownMs;
          }
        }

        if (
          input.ultimate &&
          state.ultimateCharge >= ULTIMATE_CHARGE_MAX
        ) {
          if (characterId === "fighter") {
            const targetId = getOtherPlayerId(player.userId);
            const target = targetId ? nextPlayers[targetId] : null;
            nextEffects.push(createEffect(state.x, state.y, config.ultimateColor, 42, 260));
            nextEffects.push(createEffect(state.x, state.y, config.trim, 58, 320));
            if (
              target &&
              target.respawnMs === 0 &&
              Math.abs(target.x - state.x) <= 82 &&
              Math.abs(target.y - state.y) <= 64
            ) {
              applyHit(
                targetId!,
                player.userId,
                config.ultimateDamage,
                11.6,
                7.2,
                (state.x + target.x) / 2,
                (state.y + target.y) / 2,
                config.ultimateColor
              );
            }
            nextMessage = `${player.username} spun into a whirlwind.`;
          } else if (characterId === "monk") {
            const targetId = getOtherPlayerId(player.userId);
            const target = targetId ? nextPlayers[targetId] : null;
            nextEffects.push(createEffect(state.x, state.y, config.ultimateColor, 34, 240));
            nextEffects.push(createEffect(state.x + aimVector.x * 26, state.y + aimVector.y * 12, "#fff7ed", 20, 180));
            for (let punch = 0; punch < 6; punch += 1) {
              nextEffects.push(
                createEffect(
                  state.x + aimVector.x * (24 + punch * 12) + (punch % 2 === 0 ? -aimVector.y : aimVector.y) * 12,
                  state.y + aimVector.y * (8 + punch * 7) + (punch % 2 === 0 ? aimVector.x : -aimVector.x) * 8,
                  punch % 2 === 0 ? config.ultimateColor : "#fff7ed",
                  18 + punch * 3,
                  180 + punch * 40
                )
              );
            }
            if (
              target &&
              target.respawnMs === 0 &&
              Math.hypot(target.x - state.x, target.y - state.y) <= 104
            ) {
              const targetVector = normalizeVector(target.x - state.x, target.y - state.y);
              if (aimVector.x * targetVector.x + aimVector.y * targetVector.y > -0.05) {
                applyHit(
                  targetId!,
                  player.userId,
                  config.ultimateDamage,
                  10.8,
                  7.2,
                  (state.x + target.x) / 2,
                  (state.y + target.y) / 2,
                  config.ultimateColor
                );
                nextMessage = `${player.username} unleashed fists of fury.`;
              }
            }
          } else if (characterId === "assassin") {
            const targetId = getOtherPlayerId(player.userId);
            const target = targetId ? nextPlayers[targetId] : null;
            nextEffects.push(createEffect(state.x + aimVector.x * 24, state.y + aimVector.y * 10, config.ultimateColor, 46, 280));
            if (
              target &&
              target.respawnMs === 0 &&
              Math.hypot(target.x - state.x, target.y - state.y) <= 96
            ) {
              const targetVector = normalizeVector(target.x - state.x, target.y - state.y);
              if (aimVector.x * targetVector.x + aimVector.y * targetVector.y > -0.1) {
                applyHit(
                  targetId!,
                  player.userId,
                  config.ultimateDamage,
                  9.8,
                  6.4,
                  (state.x + target.x) / 2,
                  (state.y + target.y) / 2,
                  config.ultimateColor
                );
                target.weaknessMs = 3200;
                nextMessage = `${player.username} inflicted weakness.`;
              }
            }
          } else {
            for (let shot = 0; shot < config.ultimateShots; shot += 1) {
              if (characterId === "archer") {
                const spreadX = (shot - (config.ultimateShots - 1) / 2) * 26;
                nextProjectiles.push({
                  id: `ultimate-${player.userId}-${Date.now()}-${Math.random()}-${shot}`,
                  ownerId: player.userId,
                  x: state.x + aimVector.x * 42 + spreadX,
                  y: 68 - Math.abs(spreadX) * 0.15,
                  vx: aimVector.x * 1.1,
                  vy: 5.8 + shot * 0.12,
                  radius: config.ultimateRadius,
                  damage: config.ultimateDamage,
                  knockback: 8.6,
                  lift: 7.1,
                  color: config.ultimateColor,
                  kind: "arrow",
                  gravity: 0.08,
                  ttlMs: 900,
                  isUltimate: true
                });
              } else {
                nextProjectiles.push({
                  id: `ultimate-${player.userId}-${Date.now()}-${Math.random()}-${shot}`,
                  ownerId: player.userId,
                  x: state.x + aimVector.x * 28,
                  y: state.y - 12 + aimVector.y * 10,
                  vx: config.ultimateSpeed * aimVector.x,
                  vy: config.ultimateSpeed * aimVector.y,
                  radius: config.ultimateRadius,
                  damage: config.ultimateDamage,
                  knockback: 10.2,
                  lift: 6.8,
                  color: config.ultimateColor,
                  kind: "ultimate",
                  gravity: 0.008,
                  ttlMs: 1100,
                  isUltimate: true
                });
              }
            }
            nextMessage =
              characterId === "archer"
                ? `${player.username} called down an arrow barrage.`
                : `${player.username} unleashed an inferno orb.`;
          }
          state.ultimateCharge = 0;
          nextEffects.push(createEffect(state.x, state.y - 10, config.ultimateColor, 24, 220));
        }

        const previousBottom = state.y + PLAYER_HEIGHT / 2;
        state.vy = Math.min(MAX_FALL_SPEED, state.vy + GRAVITY);
        state.x = clamp(state.x + state.vx, WALL_MARGIN, WIDTH - WALL_MARGIN);
        state.y += state.vy;
        state.onGround = false;

        if (state.y - PLAYER_HEIGHT / 2 < 18) {
          state.y = 18 + PLAYER_HEIGHT / 2;
          state.vy = Math.max(0, state.vy);
        }

        if (state.y + PLAYER_HEIGHT / 2 >= stage.floorY) {
          state.y = stage.floorY - PLAYER_HEIGHT / 2;
          state.vy = 0;
          state.onGround = true;
          state.airJumpsRemaining = config.airJumps;
        } else {
          const landingPlatform = stage.platforms.find(
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
            state.airJumpsRemaining = config.airJumps;
          }
        }

        if (state.y > HEIGHT + FLOOR_MARGIN) {
          loseStock(player.userId, "got launched out");
        }

        if (
          nextLavaHazard?.phase === "active" &&
          Math.abs(state.x - nextLavaHazard.x) <= nextLavaHazard.width / 2 &&
          state.y + PLAYER_HEIGHT / 2 >= stage.floorY - 170
        ) {
          applyHit(
            player.userId,
            null,
            14,
            8.2,
            9.6,
            nextLavaHazard.x,
            stage.floorY - 8,
            "#fb923c",
            260
          );
          nextMessage = `${player.username} got clipped by lava.`;
        }

        if (
          nextMoonHazard?.phase === "active" &&
          Math.abs(state.x - nextMoonHazard.x) <= nextMoonHazard.width / 2 &&
          state.y + PLAYER_HEIGHT / 2 >= 48
        ) {
          applyHit(
            player.userId,
            null,
            11,
            9.4,
            8.4,
            nextMoonHazard.x,
            state.y,
            "#c4b5fd",
            320
          );
          nextMessage = `${player.username} was caught in the moonbeam.`;
        }
      });

      if (stage.id === "ember-yard") {
        if (!nextLavaHazard && nextStageEventCooldownMs === 0) {
          nextLavaHazard = {
            phase: "warning",
            x: LAVA_LANES[Math.floor(Math.random() * LAVA_LANES.length)],
            width: LAVA_WIDTH,
            ttlMs: 950
          };
          nextStageEventCooldownMs = 4200;
          nextMessage = "Lava is rumbling. Move or use it.";
        } else if (nextLavaHazard?.phase === "warning" && nextLavaHazard.ttlMs <= 0) {
          nextLavaHazard = { ...nextLavaHazard, phase: "active", ttlMs: 650 };
          nextEffects.push(createEffect(nextLavaHazard.x, stage.floorY - 12, "#fdba74", 32, 280));
          nextMessage = "Lava burst!";
        } else if (nextLavaHazard?.phase === "active" && nextLavaHazard.ttlMs <= 0) {
          nextLavaHazard = null;
        }
        nextMoonHazard = null;
      } else if (stage.id === "moon-pier") {
        nextLavaHazard = null;
        if (!nextMoonHazard && nextStageEventCooldownMs === 0) {
          nextMoonHazard = {
            phase: "warning",
            x: WIDTH * (0.24 + Math.random() * 0.52),
            width: MOON_BEAM_WIDTH,
            ttlMs: 1100,
            vx: Math.random() > 0.5 ? 2.6 : -2.6
          };
          nextStageEventCooldownMs = 4700;
          nextMessage = "Moonlight is gathering overhead.";
        } else if (nextMoonHazard?.phase === "warning" && nextMoonHazard.ttlMs <= 0) {
          nextMoonHazard = { ...nextMoonHazard, phase: "active", ttlMs: 1350 };
          nextEffects.push(createEffect(nextMoonHazard.x, 96, "#ddd6fe", 42, 320));
          nextMessage = "Moonbeam sweep!";
        } else if (nextMoonHazard?.phase === "active") {
          if (nextMoonHazard.x <= 96 || nextMoonHazard.x >= WIDTH - 96) {
            nextMoonHazard.vx *= -1;
          }
          if (nextMoonHazard.ttlMs <= 0) {
            nextMoonHazard = null;
          }
        }
      } else {
        nextLavaHazard = null;
        nextMoonHazard = null;
        nextStageEventCooldownMs = 3200;
      }

      nextProjectiles = nextProjectiles
        .map((projectile) => ({
          ...projectile,
          x: projectile.x + projectile.vx,
          y: projectile.y + projectile.vy,
          vy: projectile.vy + projectile.gravity,
          ttlMs: projectile.ttlMs - 33
        }))
        .filter(
          (projectile) =>
            projectile.ttlMs > 0 &&
            projectile.x > -100 &&
            projectile.x < WIDTH + 100 &&
            projectile.y > -100 &&
            projectile.y < HEIGHT + 100
        );

      Object.values(nextPlayers).forEach((playerState) => {
        if (
          playerState.assassinKnifeId &&
          !nextProjectiles.some((projectile) => projectile.id === playerState.assassinKnifeId)
        ) {
          if (playerState.selectedCharacter === "assassin" && playerState.specialCooldownMs === 0) {
            playerState.specialCooldownMs = CHARACTER_CONFIGS.assassin.specialCooldownMs;
          }
          playerState.assassinKnifeId = null;
        }
      });

      const survivingProjectiles: Projectile[] = [];
      nextProjectiles.forEach((projectile) => {
        const targetId = currentPlayers.find((player) => player.userId !== projectile.ownerId)?.userId;
        const target = targetId ? nextPlayers[targetId] : null;
        const owner = nextPlayers[projectile.ownerId];
        const isAssassinKnife =
          owner?.selectedCharacter === "assassin" && owner.assassinKnifeId === projectile.id;
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

        if (isAssassinKnife && projectile.spent) {
          survivingProjectiles.push(projectile);
          return;
        }

        applyHit(
          targetId!,
          projectile.ownerId,
          projectile.damage,
          projectile.knockback,
          projectile.lift,
          projectile.x,
          projectile.y,
          projectile.color,
          0,
          projectile.isUltimate ? 0 : projectile.kind === "arrow" ? 7 : 8
        );
        if (isAssassinKnife) {
          survivingProjectiles.push({
            ...projectile,
            x: target.x,
            y: target.y,
            vx: 0,
            vy: 0,
            gravity: 0,
            ttlMs: Math.min(projectile.ttlMs, 1000),
            spent: true
          });
          nextMessage = "Shadow knife stuck. Recast now.";
          return;
        }
        nextMessage = projectile.isUltimate ? "Ultimate connected." : "Projectile hit.";
      });

      const nextState: BrawlState = {
        phase: winnerId ? "gameOver" : "playing",
        selectedMap: currentState.selectedMap,
        players: nextPlayers,
        projectiles: survivingProjectiles,
        effects: nextEffects,
        lavaHazard: nextLavaHazard,
        moonHazard: nextMoonHazard,
        stageEventCooldownMs: nextStageEventCooldownMs,
        winnerId,
        message:
          winnerId
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

    const updateInput = (patch: Partial<InputState>) => {
      const current = inputStatesRef.current[currentUserIdRef.current ?? ""] ?? DEFAULT_INPUT;
      sendInput({ ...current, ...patch });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        updateInput({ left: true });
      } else if (key === "d") {
        event.preventDefault();
        updateInput({ right: true });
      } else if (key === "w") {
        event.preventDefault();
        updateInput({ jump: true });
      } else if (key === "s") {
        event.preventDefault();
        updateInput({ drop: true });
      } else if (key === "shift") {
        event.preventDefault();
        if (!event.repeat) {
          updateInput({ dash: true });
        }
      } else if (key === "e") {
        event.preventDefault();
        updateInput({ special: true });
      } else if (key === "r") {
        event.preventDefault();
        updateInput({ ultimate: true });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        updateInput({ left: false });
      } else if (key === "d") {
        event.preventDefault();
        updateInput({ right: false });
      } else if (key === "w") {
        event.preventDefault();
        updateInput({ jump: false });
      } else if (key === "s") {
        event.preventDefault();
        updateInput({ drop: false });
      } else if (key === "shift") {
        event.preventDefault();
        updateInput({ dash: false });
      } else if (key === "e") {
        event.preventDefault();
        updateInput({ special: false });
      } else if (key === "r") {
        event.preventDefault();
        updateInput({ ultimate: false });
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const nextAimX = clamp(((event.clientX - rect.left) / rect.width) * WIDTH, 0, WIDTH);
      const nextAimY = clamp(((event.clientY - rect.top) / rect.height) * HEIGHT, 0, HEIGHT);
      const current = inputStatesRef.current[currentUserIdRef.current ?? ""] ?? DEFAULT_INPUT;
      const now = performance.now();

      if (
        Math.abs(current.aimX - nextAimX) < 4 &&
        Math.abs(current.aimY - nextAimY) < 4
      ) {
        return;
      }

      if (now - lastAimBroadcastAtRef.current < 33) {
        inputStatesRef.current = {
          ...inputStatesRef.current,
          [currentUserIdRef.current ?? ""]: { ...current, aimX: nextAimX, aimY: nextAimY }
        };
        return;
      }

      lastAimBroadcastAtRef.current = now;
      updateInput({ aimX: nextAimX, aimY: nextAimY });
    };

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        stateRef.current.phase !== "playing" ||
        target?.closest("button, a, input, textarea")
      ) {
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      updateInput({ attack: true });
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (stateRef.current.phase !== "playing") {
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      updateInput({ attack: false });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [players.length, currentUserId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawStage = (
      stage: StageConfig,
      lavaHazard: LavaHazard | null,
      moonHazard: MoonHazard | null
    ) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      gradient.addColorStop(0, stage.bgTop);
      gradient.addColorStop(1, stage.bgBottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      if (stage.id === "sky-ruins") {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.arc(120, 88, 48, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(620, 126, 36, 0, Math.PI * 2);
        ctx.fill();
      } else if (stage.id === "ember-yard") {
        ctx.fillStyle = "rgba(255,220,120,0.12)";
        for (let i = 0; i < 6; i += 1) {
          ctx.beginPath();
          ctx.arc(80 + i * 118, 100 + (i % 2) * 30, 18, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.arc(610, 84, 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(196,181,253,0.18)";
        ctx.fillRect(0, 310, WIDTH, 3);
      }

      ctx.fillStyle = stage.floorColor;
      ctx.fillRect(0, stage.floorY, WIDTH, HEIGHT - stage.floorY);
      ctx.fillStyle = stage.floorEdge;
      ctx.fillRect(0, stage.floorY, WIDTH, 8);

      stage.platforms.forEach((platform) => {
        ctx.fillStyle = "rgba(2, 6, 23, 0.18)";
        ctx.fillRect(platform.x - platform.width / 2 + 4, platform.y + 6, platform.width, PLATFORM_HEIGHT);
        ctx.fillStyle = stage.platformColor;
        ctx.fillRect(platform.x - platform.width / 2, platform.y, platform.width, PLATFORM_HEIGHT);
      });

      if (stage.id === "ember-yard" && lavaHazard) {
        const warningAlpha = lavaHazard.phase === "warning" ? 0.18 + ((lavaHazard.ttlMs % 220) / 220) * 0.34 : 0.24;
        ctx.fillStyle =
          lavaHazard.phase === "warning"
            ? `rgba(254, 215, 170, ${warningAlpha})`
            : "rgba(251, 146, 60, 0.32)";
        ctx.fillRect(
          lavaHazard.x - lavaHazard.width / 2,
          stage.floorY - 18,
          lavaHazard.width,
          18
        );
        if (lavaHazard.phase === "active") {
          ctx.fillStyle = "rgba(249, 115, 22, 0.88)";
          for (let plume = 0; plume < 4; plume += 1) {
            ctx.beginPath();
            ctx.moveTo(lavaHazard.x - 30 + plume * 28, stage.floorY);
            ctx.quadraticCurveTo(
              lavaHazard.x - 20 + plume * 24,
              stage.floorY - 145 - plume * 22,
              lavaHazard.x - 8 + plume * 24,
              stage.floorY - 28
            );
            ctx.strokeStyle = "#fdba74";
            ctx.lineWidth = 10;
            ctx.stroke();
          }
          ctx.fillStyle = "rgba(255, 237, 213, 0.22)";
          ctx.fillRect(lavaHazard.x - lavaHazard.width / 2, stage.floorY - 170, lavaHazard.width, 150);
        }
      }

      if (stage.id === "moon-pier" && moonHazard) {
        const beamAlpha =
          moonHazard.phase === "warning" ? 0.16 + ((moonHazard.ttlMs % 260) / 260) * 0.24 : 0.3;
        ctx.fillStyle =
          moonHazard.phase === "warning"
            ? `rgba(196, 181, 253, ${beamAlpha})`
            : "rgba(147, 197, 253, 0.28)";
        ctx.fillRect(moonHazard.x - moonHazard.width / 2, 0, moonHazard.width, stage.floorY);
        if (moonHazard.phase === "active") {
          const beamGradient = ctx.createLinearGradient(0, 0, 0, stage.floorY);
          beamGradient.addColorStop(0, "rgba(224, 231, 255, 0.12)");
          beamGradient.addColorStop(0.2, "rgba(196, 181, 253, 0.45)");
          beamGradient.addColorStop(1, "rgba(147, 197, 253, 0.18)");
          ctx.fillStyle = beamGradient;
          ctx.fillRect(moonHazard.x - moonHazard.width / 2, 0, moonHazard.width, stage.floorY);
          ctx.strokeStyle = "rgba(255,255,255,0.68)";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(moonHazard.x, 0);
          ctx.lineTo(moonHazard.x, stage.floorY);
          ctx.stroke();
        }
      }
    };

    const drawCharacter = (playerId: string, player: FighterPlayer, username: string) => {
      if (player.respawnMs > 0 || !player.selectedCharacter) return;
      const input = inputStatesRef.current[playerId] ?? DEFAULT_INPUT;
      const introAge = performance.now() - introStartedAtRef.current;
      const introIndex = playersRef.current.findIndex((entry) => entry.userId === playerId);
      const introProgress = clamp((introAge - introIndex * 110) / 420, 0, 1);
      const introLift =
        player.selectedCharacter === "mage"
          ? (1 - introProgress) * 56
          : player.selectedCharacter === "fighter"
            ? (1 - introProgress) * 46
            : player.selectedCharacter === "archer"
              ? (1 - introProgress) * 38
              : player.selectedCharacter === "assassin"
                ? (1 - introProgress) * -26
                : (1 - introProgress) * 24;

      ctx.save();
      ctx.translate(0, -introLift);
      ctx.globalAlpha *= introProgress < 1 ? 0.28 + introProgress * 0.72 : 1;
      drawBrawlCharacter({
        ctx,
        characterId: player.selectedCharacter,
        x: player.x,
        y: player.y,
        facing: player.facing,
        aimX: input.aimX,
        aimY: input.aimY,
        attackFlashMs: player.attackFlashMs,
        invulnMs: player.invulnMs,
        username,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT
      });
      ctx.restore();
    };

    const drawHud = (state: BrawlState) => {
      playersRef.current.forEach((player, index) => {
        const fighter = state.players[player.userId];
        if (!fighter || !fighter.selectedCharacter) return;
        const config = CHARACTER_CONFIGS[fighter.selectedCharacter];
        const specialReady = fighter.specialCooldownMs === 0;
        const ultReady = fighter.ultimateCharge >= ULTIMATE_CHARGE_MAX;
        const cardWidth = 228;
        const cardHeight = 98;
        const cardX = index === 0 ? 18 : WIDTH - cardWidth - 18;
        const cardY = 16;

        ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
        ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
        ctx.fillStyle = config.color;
        ctx.fillRect(cardX, cardY, 10, cardHeight);
        ctx.fillStyle = "#f8fafc";
        ctx.font = "15px monospace";
        ctx.fillText(player.username, cardX + 18, cardY + 20);
        ctx.fillStyle = config.accent;
        ctx.fillText(config.name, cardX + 18, cardY + 40);

        const healthRatio = fighter.health / MAX_HEALTH;
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(cardX + 18, cardY + 48, 150, 10);
        ctx.fillStyle = healthRatio > 0.55 ? "#22c55e" : healthRatio > 0.28 ? "#f59e0b" : "#ef4444";
        ctx.fillRect(cardX + 18, cardY + 48, 150 * healthRatio, 10);

        ctx.fillStyle = "#1e293b";
        ctx.fillRect(cardX + 18, cardY + 63, 150, 6);
        ctx.fillStyle = config.trim;
        ctx.fillRect(cardX + 18, cardY + 63, 150 * (fighter.ultimateCharge / ULTIMATE_CHARGE_MAX), 6);

        ctx.fillStyle = "#f8fafc";
        ctx.font = "12px monospace";
        ctx.fillText(`HP ${fighter.health.toFixed(0)}`, cardX + 176, cardY + 56);
        ctx.fillText(`x${fighter.stocks}`, cardX + 176, cardY + 72);
        if (fighter.weaknessMs > 0) {
          ctx.fillStyle = "#86efac";
          ctx.fillText("WEAK", cardX + 170, cardY + 20);
        }
        ctx.fillStyle = specialReady ? "#93c5fd" : "#94a3b8";
        ctx.fillText(
          specialReady ? "E READY" : `E ${(fighter.specialCooldownMs / 1000).toFixed(1)}s`,
          cardX + 18,
          cardY + 91
        );
        ctx.fillStyle = ultReady ? "#fcd34d" : "#94a3b8";
        ctx.fillText(ultReady ? "R READY" : "R CHARGING", cardX + 118, cardY + 91);
      });
    };

    const draw = () => {
      const now = performance.now();
      const currentState =
        hitStopUntilRef.current > now && frozenStateRef.current ? frozenStateRef.current : stateRef.current;
      const previousState = previousStateRef.current;
      const stage = STAGES[currentState.selectedMap];
      const alpha = previousState
        ? Math.min((now - lastStateAtRef.current) / NETWORK_RENDER_WINDOW_MS, 1)
        : 1;
      const shakeProgress = cameraShakeRef.current.ttlMs > 0 ? cameraShakeRef.current.ttlMs / 260 : 0;
      const shakeX =
        cameraShakeRef.current.ttlMs > 0
          ? (Math.random() - 0.5) * cameraShakeRef.current.intensity * shakeProgress
          : 0;
      const shakeY =
        cameraShakeRef.current.ttlMs > 0
          ? (Math.random() - 0.5) * cameraShakeRef.current.intensity * 0.7 * shakeProgress
          : 0;
      cameraShakeRef.current.ttlMs = Math.max(0, cameraShakeRef.current.ttlMs - 16);

      const interpolatedPlayers = Object.fromEntries(
        Object.entries(currentState.players).map(([playerId, playerState]) => {
          const previous = previousState?.players[playerId];
          return [
            playerId,
            previous
              ? { ...playerState, x: lerp(previous.x, playerState.x, alpha), y: lerp(previous.y, playerState.y, alpha) }
              : playerState
          ];
        })
      ) as Record<string, FighterPlayer>;

      if (!isHost && currentUserId) {
        const authoritativePlayer = currentState.players[currentUserId];
        const localInput = inputStatesRef.current[currentUserId] ?? DEFAULT_INPUT;
        if (authoritativePlayer) {
          interpolatedPlayers[currentUserId] = predictPlayerState(
            authoritativePlayer,
            localInput,
            stage,
            performance.now() - lastStateAtRef.current
          );
        }
      }

      const interpolatedProjectiles = currentState.projectiles.map((projectile) => {
        const previous = previousState?.projectiles.find((entry) => entry.id === projectile.id);
        return previous
          ? { ...projectile, x: lerp(previous.x, projectile.x, alpha), y: lerp(previous.y, projectile.y, alpha) }
          : projectile;
      });

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.save();
      ctx.translate(shakeX, shakeY);
      drawStage(stage, currentState.lavaHazard, currentState.moonHazard);

      const currentInput = currentUserId ? inputStatesRef.current[currentUserId] : null;
      const currentFighter = currentUserId ? interpolatedPlayers[currentUserId] : null;
      if (currentInput && currentFighter && currentState.phase === "playing") {
        const aimVector = normalizeVector(currentInput.aimX - currentFighter.x, currentInput.aimY - currentFighter.y);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(currentFighter.x, currentFighter.y - 6);
        ctx.lineTo(currentInput.aimX, currentInput.aimY);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(currentInput.aimX, currentInput.aimY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.38)";
        ctx.beginPath();
        ctx.arc(currentInput.aimX, currentInput.aimY, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.arc(currentFighter.x + aimVector.x * 14, currentFighter.y - 6 + aimVector.y * 10, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      currentState.effects.forEach((effect) => {
        const effectAlpha = Math.max(effect.ttlMs / 220, 0.12);
        ctx.globalAlpha = effectAlpha;
        ctx.fillStyle = effect.color;
        if (typeof effect.x2 === "number" && typeof effect.y2 === "number") {
          ctx.strokeStyle = effect.color;
          ctx.lineWidth = effect.radius;
          ctx.beginPath();
          ctx.moveTo(effect.x, effect.y);
          ctx.lineTo(effect.x2, effect.y2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(effect.x, effect.y, effect.radius * (1.1 + (1 - effectAlpha)), 0, Math.PI * 2);
          ctx.fill();
          const particleKey = getKenneyParticleKey(effect);
          const particle = particleKey ? particleImagesRef.current?.[particleKey] : null;
          if (particle && particle.complete) {
            const size = effect.radius * 3.1;
            ctx.drawImage(particle, effect.x - size / 2, effect.y - size / 2, size, size);
          }
        }
        ctx.globalAlpha = 1;
      });

      interpolatedProjectiles.forEach((projectile) => {
        ctx.fillStyle = projectile.color;
        ctx.globalAlpha = projectile.isUltimate ? 0.95 : 0.88;
        if (projectile.kind === "dagger") {
          ctx.save();
          ctx.translate(projectile.x, projectile.y);
          ctx.rotate(Math.atan2(projectile.vy, projectile.vx || 0.001));
          ctx.fillRect(-8, -2, 16, 4);
          ctx.fillRect(6, -4, 4, 8);
          ctx.restore();
        } else if (projectile.kind === "arrow") {
          ctx.save();
          ctx.translate(projectile.x, projectile.y);
          ctx.rotate(Math.atan2(projectile.vy, projectile.vx || 0.001));
          ctx.fillRect(-12, -1.5, 18, 3);
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(4, -5);
          ctx.lineTo(4, 5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          ctx.globalAlpha = 0.28;
          ctx.beginPath();
          ctx.arc(projectile.x, projectile.y, projectile.radius + 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = projectile.isUltimate ? 0.95 : 0.88;
          ctx.beginPath();
          ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
          ctx.fill();
          if (projectile.kind === "ultimate") {
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(projectile.x, projectile.y, projectile.radius + 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
        ctx.globalAlpha = 1;
      });

      playersRef.current.forEach((player) => {
        const fighter = interpolatedPlayers[player.userId];
        if (fighter) {
          drawCharacter(player.userId, fighter, player.username);
        }
      });

      drawHud({ ...currentState, players: interpolatedPlayers, projectiles: interpolatedProjectiles });
      const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.22, WIDTH / 2, HEIGHT / 2, WIDTH * 0.7);
      vignette.addColorStop(0, "rgba(15,23,42,0)");
      vignette.addColorStop(1, "rgba(2,6,23,0.32)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
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
          ...(stateRef.current.players[currentUserId] ??
            createPlayerState(0, STAGES[stateRef.current.selectedMap])),
          selectedCharacter: character
        }
      }
    };
    setBrawlState(nextState);
    stateRef.current = nextState;

    await channelRef.current.send({
      type: "broadcast",
      event: "brawl-select",
      payload: { type: "character", userId: currentUserId, character }
    });
  };

  const selectMap = async (map: MapId) => {
    if (!isHost || !channelRef.current || stateRef.current.phase !== "select") return;

    const nextState: BrawlState = {
      ...stateRef.current,
      selectedMap: map,
      message: `${STAGES[map].name} selected.`
    };
    setBrawlState(nextState);
    stateRef.current = nextState;

    await channelRef.current.send({
      type: "broadcast",
      event: "brawl-select",
      payload: { type: "map", map }
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
    await broadcastState(createSelectState(players, stateRef.current.selectedMap));
  };

  const selectedStage = STAGES[brawlState.selectedMap];

  return (
    <div className="page">
      <NavBar />
      <div className="content card brawl-shell" style={{ maxWidth: 1080 }}>
        <h2>Focus Brawl v{BRAWL_VERSION}</h2>
        <p>Two-player platform fighter with distinct class kits, stage identity, stocks, and ult charge.</p>
        <div className="info">
          Seats filled: {Math.min(players.length, 2)}/2
          {connected && !roomFull ? ` | ${currentUsername}` : ""}
        </div>
        {roomFull && !isSeated ? (
          <div className="error">Two players are already in this room. Wait for someone to leave.</div>
        ) : (
          <>
            <div className="brawl-status-grid">
              {players.map((player) => {
                const selectedCharacter = brawlState.players[player.userId]?.selectedCharacter;
                const isCurrentUser = player.userId === currentUserId;
                return (
                  <div key={player.userId} className="brawl-player-pill">
                    <strong>
                      {player.username}
                      {isCurrentUser ? " (you)" : ""}
                    </strong>
                    <span>{selectedCharacter ? CHARACTER_CONFIGS[selectedCharacter].name : "Choosing fighter"}</span>
                  </div>
                );
              })}
            </div>

            {brawlState.phase === "select" && (
              <>
                <div className="brawl-pick-grid">
                  {(["mage", "fighter", "archer", "assassin", "monk"] as CharacterId[]).map((character) => {
                    const config = CHARACTER_CONFIGS[character];
                    const selected = brawlState.players[currentUserId ?? ""]?.selectedCharacter === character;
                    return (
                      <button
                        key={character}
                        type="button"
                        className={`brawl-pick-card${selected ? " brawl-pick-card--selected" : ""}`}
                        onClick={() => void selectCharacter(character)}
                        disabled={players.length !== 2}
                        style={{
                          borderColor: config.color,
                          color: "#0f172a",
                          background: `linear-gradient(160deg, ${config.accent}, #ffffff 72%)`
                        }}
                      >
                        <strong>{config.name}</strong>
                        <span>{config.title}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="brawl-pick-grid">
                  {(["sky-ruins", "ember-yard", "moon-pier"] as MapId[]).map((mapId) => {
                    const map = STAGES[mapId];
                    return (
                      <button
                        key={mapId}
                        type="button"
                        className={`brawl-pick-card${mapId === brawlState.selectedMap ? " brawl-pick-card--selected" : ""}`}
                        onClick={() => void selectMap(mapId)}
                        disabled={!isHost}
                        style={{
                          borderColor: map.accent,
                          background:
                            mapId === brawlState.selectedMap
                              ? `linear-gradient(160deg, ${map.accent}, #ffffff 72%)`
                              : "#ffffff"
                        }}
                      >
                        <strong>{map.name}</strong>
                        <span>{map.subtitle}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="brawl-stage-wrap">
              <canvas
                ref={canvasRef}
                width={WIDTH}
                height={HEIGHT}
                style={{
                  width: "100%",
                  maxWidth: WIDTH,
                  display: "block",
                  margin: "1rem auto",
                  borderRadius: "1rem",
                  border: "1px solid #334155",
                  background: "#020617",
                  boxShadow: "0 18px 40px rgba(15, 23, 42, 0.35)"
                }}
              />

              {vsIntro && (
                <div className="brawl-vs-overlay">
                  <div
                    className="brawl-vs-panel brawl-vs-panel--left"
                    style={{
                      "--vs-accent": CHARACTER_CONFIGS[vsIntro.leftCharacter].color,
                      "--vs-accent-soft": CHARACTER_CONFIGS[vsIntro.leftCharacter].accent
                    } as React.CSSProperties}
                  >
                    <span className="brawl-vs-role">{CHARACTER_CONFIGS[vsIntro.leftCharacter].name}</span>
                    <strong>{vsIntro.leftName}</strong>
                  </div>
                  <div className="brawl-vs-slash" />
                  <div className="brawl-vs-center">VS</div>
                  <div
                    className="brawl-vs-panel brawl-vs-panel--right"
                    style={{
                      "--vs-accent": CHARACTER_CONFIGS[vsIntro.rightCharacter].color,
                      "--vs-accent-soft": CHARACTER_CONFIGS[vsIntro.rightCharacter].accent
                    } as React.CSSProperties}
                  >
                    <span className="brawl-vs-role">{CHARACTER_CONFIGS[vsIntro.rightCharacter].name}</span>
                    <strong>{vsIntro.rightName}</strong>
                  </div>
                </div>
              )}
            </div>

            <p className="info">{brawlState.message}</p>
            <div className="brawl-stage-meta">
              <p>
                <strong>Stage:</strong> {selectedStage.name}. {selectedStage.subtitle}
              </p>
              <p>
                <strong>Roster:</strong> Mage fights with bolts and blink spacing, Fighter closes gaps with dashes and chain pulls, Archer plays spacing with shots and a barrage, Assassin chains daggers into knife teleports, Monk pressures with hands, kicks, and a punch flurry.
              </p>
              <p className="brawl-controls">
                <strong>Controls:</strong>
                <span className="input-prompt-row">
                  <span className="input-prompt-group">
                    <InputPrompt src={KENNEY_PROMPTS.w} alt="W key" />
                    <InputPrompt src={KENNEY_PROMPTS.a} alt="A key" />
                    <InputPrompt src={KENNEY_PROMPTS.d} alt="D key" label="move" />
                  </span>
                  <span className="input-prompt-group">
                    <InputPrompt src={KENNEY_PROMPTS.shift} alt="Shift key" label="dash" />
                  </span>
                  <span className="input-prompt-group">
                    <InputPrompt src={KENNEY_PROMPTS.mouseLeft} alt="Left mouse button" label="primary" />
                  </span>
                  <span className="input-prompt-group">
                    <InputPrompt src={KENNEY_PROMPTS.e} alt="E key" label="utility" />
                  </span>
                  <span className="input-prompt-group">
                    <InputPrompt src={KENNEY_PROMPTS.r} alt="R key" label="ultimate" />
                  </span>
                </span>
              </p>
            </div>

            {brawlState.phase === "select" && isHost && (
              <button
                className="primary-button"
                type="button"
                onClick={() => void startMatch()}
                disabled={!everyoneSelected}
              >
                {everyoneSelected ? "Start match" : "Waiting for both picks"}
              </button>
            )}

            {brawlState.phase === "gameOver" && isHost && (
              <button className="primary-button" type="button" onClick={() => void resetRoom()}>
                Back to character select
              </button>
            )}

            {opponent && (
              <p>
                {currentUsername} versus {opponent.username}.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Brawl;
