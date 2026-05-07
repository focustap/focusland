import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import { createBeachBumpBashGame } from "../game/beach-bump-bash/createBeachBumpBashGame";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  canStartVolleyballMatch,
  configureVolleyballPlayers,
  createInitialVolleyballState,
  getMaxPlayers,
  sanitizeTargetScore,
  startVolleyballMatch,
  stepVolleyballState,
  type RoomSummary,
  type VolleyballInput,
  type VolleyballInputs,
  type VolleyballMatchState,
  type VolleyballMode,
  type VolleyballPresencePlayer
} from "../lib/volleyball/logic";
import {
  ROOM_AD_EVENT,
  ROOM_CONFIG_EVENT,
  ROOM_INPUT_EVENT,
  ROOM_START_EVENT,
  ROOM_STATE_EVENT,
  canUseVolleyballRealtime,
  createVolleyballLobbyChannel,
  createVolleyballRoomChannel,
  createVolleyballRoomSummary,
  getPlayersFromVolleyballPresence,
  isRoomJoinable,
  normalizeRoomCode,
  pruneStaleRooms,
  reassignRoomHost,
  removeVolleyballChannel,
  type VolleyballRealtimeInputPayload,
  type VolleyballRoomConfig,
  type VolleyballStateMessage
} from "../lib/volleyball/realtime";

type OverlayId = "help" | "settings" | "room";
type RoomPhase = "menu" | "waiting" | "playing";

const LOCAL_BOT_ID = "focusland-volleyball-local-bot";
const emptyInput: VolleyballInput = {};
const ACTION_LATCH_MS = 180;

const BeachBumpBash: React.FC = () => {
  const navigate = useNavigate();
  const assetBase = import.meta.env.BASE_URL;
  const gameContainerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const stateRef = useRef<VolleyballMatchState>(createInitialVolleyballState());
  const inputsRef = useRef<VolleyballInputs>({});
  const remoteActionLatchRef = useRef<Record<string, Partial<Record<"jump" | "bump" | "set" | "spike" | "dive", number>>>>({});
  const currentUserIdRef = useRef<string>("local-player");
  const playersRef = useRef<VolleyballPresencePlayer[]>([]);
  const hostIdRef = useRef<string | null>(null);
  const roomSummaryRef = useRef<RoomSummary | null>(null);
  const lastBroadcastRef = useRef(0);
  const lastInputBroadcastRef = useRef(0);
  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lobbyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [currentUserId, setCurrentUserId] = useState("local-player");
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [phase, setPhase] = useState<RoomPhase>("menu");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomSummary, setRoomSummary] = useState<RoomSummary | null>(null);
  const [availableRooms, setAvailableRooms] = useState<RoomSummary[]>([]);
  const [players, setPlayers] = useState<VolleyballPresencePlayer[]>([]);
  const [mode, setMode] = useState<VolleyballMode>("1v1");
  const [targetScore, setTargetScore] = useState(7);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(isSupabaseConfigured ? "Choose a room." : "Realtime is unavailable without Supabase env vars.");
  const [activeOverlay, setActiveOverlay] = useState<OverlayId | null>(null);
  const [stateVersion, setStateVersion] = useState(0);

  const state = stateRef.current;
  const isHost = Boolean(currentUserId && hostIdRef.current === currentUserId);
  const roomIsReady = canStartVolleyballMatch(players, mode);
  const realtimeReady = canUseVolleyballRealtime();

  const publishState = useCallback((nextState: VolleyballMatchState) => {
    stateRef.current = nextState;
    setStateVersion((value) => value + 1);
  }, []);

  const broadcastState = useCallback(async (nextState: VolleyballMatchState) => {
    publishState(nextState);
    await roomChannelRef.current?.send({
      type: "broadcast",
      event: ROOM_STATE_EVENT,
      payload: { state: nextState, sentAt: Date.now() } satisfies VolleyballStateMessage
    });
  }, [publishState]);

  const advertiseRoom = useCallback(async (override?: Partial<RoomSummary>) => {
    const summary = roomSummaryRef.current ?? (override?.code ? override as RoomSummary : null);
    if (!summary || !lobbyChannelRef.current) return;
    const nextSummary: RoomSummary = {
      ...summary,
      ...override,
      playerCount: override?.playerCount ?? (playersRef.current.length || summary.playerCount),
      maxPlayers: getMaxPlayers((override?.mode as VolleyballMode | undefined) ?? summary.mode),
      updatedAt: Date.now()
    };
    roomSummaryRef.current = nextSummary;
    setRoomSummary(nextSummary);
    await lobbyChannelRef.current.send({
      type: "broadcast",
      event: ROOM_AD_EVENT,
      payload: nextSummary
    });
  }, []);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    roomSummaryRef.current = roomSummary;
  }, [roomSummary]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    let cancelled = false;
    const setupIdentity = async () => {
      if (!isSupabaseConfigured) {
        setCurrentUserId("local-player");
        setCurrentUsername("Local Player");
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        setStatus("Sign in to use multiplayer rooms.");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", session.user.id)
        .maybeSingle();
      const username = (((profile?.username as string | null) ?? session.user.email ?? "Player").trim() || "Player").slice(0, 32);
      setCurrentUserId(session.user.id);
      setCurrentUsername(username);
    };

    void setupIdentity();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!realtimeReady) return;
    const channel = createVolleyballLobbyChannel();
    if (!channel) return;
    lobbyChannelRef.current = channel;
    channel.on("broadcast", { event: ROOM_AD_EVENT }, ({ payload }) => {
      const summary = payload as RoomSummary;
      setAvailableRooms((rooms) => {
        const byCode = new Map(rooms.map((room) => [room.code, room]));
        byCode.set(summary.code, summary);
        return pruneStaleRooms(Array.from(byCode.values()));
      });
    });
    channel.subscribe();
    const pruneTimer = window.setInterval(() => {
      setAvailableRooms((rooms) => pruneStaleRooms(rooms));
    }, 3500);
    return () => {
      window.clearInterval(pruneTimer);
      void removeVolleyballChannel(channel);
      if (lobbyChannelRef.current === channel) {
        lobbyChannelRef.current = null;
      }
    };
  }, [realtimeReady]);

  useEffect(() => {
    if (!roomSummary || !isHost) return;
    const timer = window.setInterval(() => {
      void advertiseRoom({ status: stateRef.current.phase === "playing" ? "playing" : "open" });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [advertiseRoom, isHost, roomSummary]);

  const leaveRoom = useCallback(() => {
    const channel = roomChannelRef.current;
    roomChannelRef.current = null;
    void removeVolleyballChannel(channel);
    hostIdRef.current = null;
    inputsRef.current = {};
    remoteActionLatchRef.current = {};
    setPlayers([]);
    setConnected(false);
    setRoomCode("");
    setRoomSummary(null);
    setPhase("menu");
    publishState(createInitialVolleyballState());
    setStatus(realtimeReady ? "Choose a room." : "Realtime is unavailable without Supabase env vars.");
  }, [publishState, realtimeReady]);

  const setupRoomChannel = useCallback(async (summary: RoomSummary) => {
    const normalizedCode = normalizeRoomCode(summary.code);
    const channel = createVolleyballRoomChannel(normalizedCode, currentUserId);
    if (!channel) {
      setStatus("Supabase realtime is not configured. Use local practice instead.");
      return;
    }

    await removeVolleyballChannel(roomChannelRef.current);
    roomChannelRef.current = channel;
    hostIdRef.current = summary.hostId;
    setRoomCode(normalizedCode);
    setRoomSummary(summary);
    setMode(summary.mode);
    setTargetScore(summary.targetScore);
    setPhase("waiting");
    setConnected(false);
    setStatus("Joining room...");

    const syncPresence = () => {
      const presentPlayers = getPlayersFromVolleyballPresence(
        channel.presenceState() as Record<string, Array<{ userId: string; username: string; onlineAt: string }>>
      ).slice(0, getMaxPlayers(summary.mode));
      playersRef.current = presentPlayers;
      setPlayers(presentPlayers);
      const hostId = presentPlayers[0]?.userId ?? summary.hostId;
      hostIdRef.current = hostId;
      inputsRef.current = Object.fromEntries(
        Object.entries(inputsRef.current).filter(([userId]) => presentPlayers.some((player) => player.userId === userId))
      );
      remoteActionLatchRef.current = Object.fromEntries(
        Object.entries(remoteActionLatchRef.current).filter(([userId]) => presentPlayers.some((player) => player.userId === userId))
      );
      const reassigned = reassignRoomHost(roomSummaryRef.current ?? summary, presentPlayers);
      if (reassigned) {
        roomSummaryRef.current = reassigned;
        setRoomSummary(reassigned);
      }
      if (hostId === currentUserIdRef.current && stateRef.current.phase === "lobby") {
        const nextState = configureVolleyballPlayers(stateRef.current, presentPlayers, summary.mode, summary.targetScore);
        void broadcastState(nextState);
      }
    };

    channel.on("presence", { event: "sync" }, syncPresence);
    channel.on("broadcast", { event: ROOM_STATE_EVENT }, ({ payload }) => {
      const incoming = payload as VolleyballStateMessage;
      if (incoming.state.sequence >= stateRef.current.sequence || currentUserIdRef.current !== hostIdRef.current) {
        publishState(incoming.state);
        if (incoming.state.phase !== "lobby") setPhase("playing");
      }
    });
    channel.on("broadcast", { event: ROOM_INPUT_EVENT }, ({ payload }) => {
      if (currentUserIdRef.current !== hostIdRef.current) return;
      const incoming = payload as VolleyballRealtimeInputPayload;
      inputsRef.current[incoming.userId] = incoming.input;
      const now = performance.now();
      const latches = remoteActionLatchRef.current[incoming.userId] ?? {};
      (["jump", "bump", "set", "spike", "dive"] as const).forEach((action) => {
        if (incoming.input[action]) {
          latches[action] = now + ACTION_LATCH_MS;
        }
      });
      remoteActionLatchRef.current[incoming.userId] = latches;
    });
    channel.on("broadcast", { event: ROOM_CONFIG_EVENT }, ({ payload }) => {
      const config = payload as VolleyballRoomConfig;
      setMode(config.mode);
      setTargetScore(config.targetScore);
      const nextSummary = { ...summary, mode: config.mode, targetScore: config.targetScore, maxPlayers: getMaxPlayers(config.mode), updatedAt: Date.now() };
      setRoomSummary(nextSummary);
      roomSummaryRef.current = nextSummary;
      if (currentUserIdRef.current === hostIdRef.current) {
        const nextState = configureVolleyballPlayers(stateRef.current, playersRef.current, config.mode, config.targetScore);
        void broadcastState(nextState);
      }
    });
    channel.on("broadcast", { event: ROOM_START_EVENT }, ({ payload }) => {
      const nextState = payload as VolleyballMatchState;
      publishState(nextState);
      setPhase("playing");
    });

    channel.subscribe(async (subscriptionStatus) => {
      if (subscriptionStatus !== "SUBSCRIBED") return;
      setConnected(true);
      const presentPlayers = getPlayersFromVolleyballPresence(
        channel.presenceState() as Record<string, Array<{ userId: string; username: string; onlineAt: string }>>
      );
      if (presentPlayers.length >= getMaxPlayers(summary.mode) && !presentPlayers.some((player) => player.userId === currentUserId)) {
        setStatus("Room is full.");
        await removeVolleyballChannel(channel);
        if (roomChannelRef.current === channel) {
          roomChannelRef.current = null;
        }
        setPhase("menu");
        return;
      }
      await channel.track({
        userId: currentUserId,
        username: currentUsername,
        onlineAt: new Date().toISOString()
      });
      setStatus("Room ready.");
      syncPresence();
      if (summary.hostId === currentUserId) {
        void advertiseRoom({ playerCount: presentPlayers.length + 1 });
      }
    });
  }, [advertiseRoom, broadcastState, currentUserId, currentUsername, publishState]);

  const createRoom = () => {
    if (!realtimeReady) {
      setStatus("Supabase realtime is not configured. Use local practice instead.");
      return;
    }
    const summary = createVolleyballRoomSummary({
      hostId: currentUserId,
      hostName: currentUsername,
      mode,
      targetScore
    });
    roomSummaryRef.current = summary;
    setRoomSummary(summary);
    void setupRoomChannel(summary);
    void advertiseRoom(summary);
  };

  const joinRoom = (summary: RoomSummary) => {
    if (!isRoomJoinable(summary)) {
      setStatus("That room is no longer joinable.");
      return;
    }
    void setupRoomChannel(summary);
  };

  const joinRoomByCode = () => {
    const code = normalizeRoomCode(joinCode);
    if (code.length < 5) {
      setStatus("Enter a 5 character room code.");
      return;
    }
    const summary = availableRooms.find((room) => room.code === code);
    if (!summary) {
      setStatus("No active room is advertising that code.");
      return;
    }
    void setupRoomChannel(summary);
  };

  const updateRoomConfig = (nextMode: VolleyballMode, nextTargetScore = targetScore) => {
    setMode(nextMode);
    setTargetScore(sanitizeTargetScore(nextTargetScore));
    const config = { mode: nextMode, targetScore: sanitizeTargetScore(nextTargetScore) };
    if (!isHost || !roomChannelRef.current) return;
    void roomChannelRef.current.send({ type: "broadcast", event: ROOM_CONFIG_EVENT, payload: config });
    void advertiseRoom(config);
    const nextState = configureVolleyballPlayers(stateRef.current, playersRef.current, config.mode, config.targetScore);
    void broadcastState(nextState);
  };

  const startRoomGame = () => {
    if (!isHost || !canStartVolleyballMatch(playersRef.current, mode)) return;
    const nextState = startVolleyballMatch(playersRef.current, mode, targetScore);
    void broadcastState(nextState);
    void roomChannelRef.current?.send({ type: "broadcast", event: ROOM_START_EVENT, payload: nextState });
    void advertiseRoom({ status: "playing" });
    setPhase("playing");
  };

  const startLocalPractice = () => {
    const practicePlayers: VolleyballPresencePlayer[] = [
      { userId: currentUserId, username: currentUsername, onlineAt: "1" },
      { userId: LOCAL_BOT_ID, username: "Tide Bot", onlineAt: "2" }
    ];
    hostIdRef.current = currentUserId;
    inputsRef.current = {};
    setRoomSummary(null);
    setRoomCode("LOCAL");
    setPlayers(practicePlayers);
    setMode("1v1");
    setTargetScore(7);
    publishState(startVolleyballMatch(practicePlayers, "1v1", 7));
    setPhase("playing");
    setStatus("Local practice.");
  };

  useEffect(() => {
    if (!gameContainerRef.current || gameRef.current || phase !== "playing") return;
    const game = createBeachBumpBashGame(gameContainerRef.current, assetBase, {
      getState: () => stateRef.current,
      onTick: (localInput, deltaMs) => {
        inputsRef.current[currentUserIdRef.current] = localInput;
        if (roomChannelRef.current && currentUserIdRef.current !== hostIdRef.current) {
          const now = performance.now();
          const hasAction = Boolean(localInput.jump || localInput.bump || localInput.set || localInput.spike || localInput.dive);
          if (hasAction || now - lastInputBroadcastRef.current > 42) {
            lastInputBroadcastRef.current = now;
            void roomChannelRef.current.send({
              type: "broadcast",
              event: ROOM_INPUT_EVENT,
              payload: { userId: currentUserIdRef.current, input: localInput, sentAt: Date.now() } satisfies VolleyballRealtimeInputPayload
            });
          }
          return;
        }

        const now = performance.now();
        const hostInputs: VolleyballInputs = { ...inputsRef.current };
        Object.entries(remoteActionLatchRef.current).forEach(([userId, latches]) => {
          const input = hostInputs[userId] ?? {};
          hostInputs[userId] = {
            ...input,
            jump: input.jump || Boolean(latches.jump && latches.jump > now),
            bump: input.bump || Boolean(latches.bump && latches.bump > now),
            set: input.set || Boolean(latches.set && latches.set > now),
            spike: input.spike || Boolean(latches.spike && latches.spike > now),
            dive: input.dive || Boolean(latches.dive && latches.dive > now)
          };
        });

        if (stateRef.current.players.some((player) => player.id === LOCAL_BOT_ID)) {
          hostInputs[LOCAL_BOT_ID] = getPracticeBotInput(stateRef.current);
        }

        const nextState = stepVolleyballState(stateRef.current, hostInputs, deltaMs);
        if (nextState !== stateRef.current) {
          publishState(nextState);
          const now = performance.now();
          if (roomChannelRef.current && now - lastBroadcastRef.current > 50) {
            lastBroadcastRef.current = now;
            void roomChannelRef.current.send({
              type: "broadcast",
              event: ROOM_STATE_EVENT,
              payload: { state: nextState, sentAt: Date.now() } satisfies VolleyballStateMessage
            });
          }
        }
      }
    });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [assetBase, phase, publishState]);

  useEffect(() => {
    return () => {
      void removeVolleyballChannel(roomChannelRef.current);
      void removeVolleyballChannel(lobbyChannelRef.current);
    };
  }, []);

  const modalTitle = activeOverlay === "help" ? "How to Play" : activeOverlay === "settings" ? "Settings" : "Room Info";
  const playerCountLabel = `${players.length}/${getMaxPlayers(mode)}`;

  return (
    <div className="page beach-bump-page">
      <NavBar />
      <main className="beach-bump-shell">
        <header className="beach-bump-topbar">
          <div>
            <p className="beach-bump-kicker">Focusland Arcade</p>
            <h1>Beach Bump Bash</h1>
            <span>{phase === "playing" ? `${state.score.sun}-${state.score.tide} to ${state.targetScore}` : status}</span>
          </div>
          <div className="beach-bump-actions">
            <button type="button" onClick={() => setActiveOverlay("help")}>Help</button>
            <button type="button" onClick={() => setActiveOverlay("settings")}>Settings</button>
            <button type="button" onClick={() => setActiveOverlay("room")}>Room Info</button>
            <button type="button" onClick={() => phase === "menu" ? navigate("/arcade") : leaveRoom()}>Leave</button>
          </div>
        </header>

        {phase === "menu" ? (
          <section className="beach-bump-menu">
            <div className="beach-bump-panel">
              <h2>Create a room</h2>
              <div className="beach-bump-field-row">
                <button type="button" className={mode === "1v1" ? "is-active" : ""} onClick={() => setMode("1v1")}>1v1</button>
                <button type="button" className={mode === "2v2" ? "is-active" : ""} onClick={() => setMode("2v2")}>2v2</button>
              </div>
              <label className="beach-bump-field">
                <span>Score to win</span>
                <input type="number" min={3} max={21} value={targetScore} onChange={(event) => setTargetScore(sanitizeTargetScore(Number(event.target.value)))} />
              </label>
              <button type="button" className="beach-bump-primary" onClick={createRoom} disabled={!realtimeReady}>Create room</button>
              <button type="button" onClick={startLocalPractice}>Local practice</button>
            </div>

            <div className="beach-bump-panel">
              <h2>Join a room</h2>
              <label className="beach-bump-field">
                <span>Room code</span>
                <input value={joinCode} maxLength={5} onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))} placeholder="ABCDE" />
              </label>
              <button type="button" className="beach-bump-primary" onClick={joinRoomByCode} disabled={!realtimeReady}>Join by code</button>
              <div className="beach-bump-room-list">
                {availableRooms.length ? availableRooms.map((room) => (
                  <button key={room.code} type="button" onClick={() => joinRoom(room)} disabled={!isRoomJoinable(room)}>
                    <strong>{room.code}</strong>
                    <span>{room.mode} by {room.hostName} · {room.playerCount}/{room.maxPlayers}</span>
                  </button>
                )) : <p>{realtimeReady ? "No open rooms broadcasting right now." : "Realtime rooms need Supabase env vars."}</p>}
              </div>
            </div>
          </section>
        ) : phase === "waiting" ? (
          <section className="beach-bump-waiting">
            <div className="beach-bump-panel beach-bump-panel--wide">
              <span className="beach-bump-room-code">{roomCode}</span>
              <h2>Waiting Room</h2>
              <p>{connected ? `${playerCountLabel} players connected` : "Connecting..."}</p>
              <div className="beach-bump-roster">
                {Array.from({ length: getMaxPlayers(mode) }).map((_, index) => {
                  const player = players[index];
                  return <span key={player?.userId ?? index}>{player ? `${player.username}${player.userId === currentUserId ? " (you)" : ""}` : "Open slot"}</span>;
                })}
              </div>
              {isHost ? (
                <button className="beach-bump-primary" type="button" onClick={startRoomGame} disabled={!roomIsReady}>
                  {roomIsReady ? "Start match" : `Need ${getMaxPlayers(mode) - players.length} more`}
                </button>
              ) : <p>Host starts when the room is full.</p>}
            </div>
          </section>
        ) : (
          <section className="beach-bump-stage-wrap">
            <div className="beach-bump-stage" ref={gameContainerRef} />
          </section>
        )}

        {activeOverlay && (
          <div className="beach-bump-modal" role="dialog" aria-modal="true">
            <div className="beach-bump-modal-card">
              <div className="beach-bump-modal-head">
                <h2>{modalTitle}</h2>
                <button type="button" onClick={() => setActiveOverlay(null)}>Close</button>
              </div>
              {activeOverlay === "help" && (
                <div className="beach-bump-copy-grid">
                  <p>A/D or arrows move. W, Up, or Space jumps. J bumps, K sets, L spikes, and Shift or I dives.</p>
                  <p>Bump is a controlled save, set makes a taller setup, spike attacks forward/downward while airborne, and dive reaches farther with recovery.</p>
                </div>
              )}
              {activeOverlay === "settings" && (
                <div className="beach-bump-copy-grid">
                  <label className="beach-bump-field">
                    <span>Mode</span>
                    <select value={mode} disabled={!isHost || phase === "playing"} onChange={(event) => updateRoomConfig(event.target.value as VolleyballMode)}>
                      <option value="1v1">1v1</option>
                      <option value="2v2">2v2</option>
                    </select>
                  </label>
                  <label className="beach-bump-field">
                    <span>Score to win</span>
                    <input type="number" min={3} max={21} value={targetScore} disabled={!isHost || phase === "playing"} onChange={(event) => updateRoomConfig(mode, Number(event.target.value))} />
                  </label>
                </div>
              )}
              {activeOverlay === "room" && (
                <div className="beach-bump-copy-grid">
                  <p>Room: {roomCode || "Not in a room"}</p>
                  <p>Host: {roomSummary?.hostName ?? (isHost ? currentUsername : "Unknown")}</p>
                  <p>Players: {playerCountLabel}</p>
                  <p>Status: {status}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

function getPracticeBotInput(state: VolleyballMatchState): VolleyballInput {
  const bot = state.players.find((player) => player.id === LOCAL_BOT_ID);
  if (!bot || state.phase !== "playing") return emptyInput;
  const ball = state.ball;
  const targetX = ball.x > 480 ? ball.x : 676;
  const nearBall = Math.abs(ball.x - bot.x) < 58 && Math.abs(ball.y - bot.y) < 90;
  return {
    left: bot.x > targetX + 16,
    right: bot.x < targetX - 16,
    jump: nearBall && ball.y < 250 && bot.grounded,
    bump: nearBall && ball.y > 280,
    set: nearBall && ball.y <= 280 && ball.y > 190,
    spike: nearBall && !bot.grounded && ball.y < 285,
    dive: Math.abs(ball.x - bot.x) < 92 && ball.y > 350
  };
}

export default BeachBumpBash;
