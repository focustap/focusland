import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { supabase } from "../lib/supabase";

type PlayerPresence = {
  userId: string;
  username: string;
  onlineAt: string;
};

type PongState = {
  phase: "waiting" | "playing" | "gameOver";
  paddles: Record<string, number>;
  scores: Record<string, number>;
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
  };
  winnerId: string | null;
};

const ROOM_NAME = "focusland-pong";
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;
const PADDLE_HEIGHT = 72;
const PADDLE_WIDTH = 12;
const BALL_SIZE = 12;
const WINNING_SCORE = 5;

const DEFAULT_STATE: PongState = {
  phase: "waiting",
  paddles: {},
  scores: {},
  ball: {
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
    vx: 0,
    vy: 0
  },
  winnerId: null
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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

function createInitialState(players: PlayerPresence[], servingLeft: boolean): PongState {
  const scores = players.reduce<Record<string, number>>((acc, player) => {
    acc[player.userId] = 0;
    return acc;
  }, {});

  const paddles = players.reduce<Record<string, number>>((acc, player) => {
    acc[player.userId] = CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    return acc;
  }, {});

  return {
    phase: "playing",
    paddles,
    scores,
    ball: {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      vx: servingLeft ? -4 : 4,
      vy: Math.random() > 0.5 ? 2.5 : -2.5
    },
    winnerId: null
  };
}

function resetBall(servingLeft: boolean) {
  return {
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
    vx: servingLeft ? -4 : 4,
    vy: Math.random() > 0.5 ? 2.5 : -2.5
  };
}

const Pong: React.FC = () => {
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [status, setStatus] = useState("Join the room and wait for a second player.");
  const [roomFull, setRoomFull] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pongState, setPongState] = useState<PongState>(DEFAULT_STATE);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const playersRef = useRef<PlayerPresence[]>([]);
  const isHostRef = useRef(false);
  const paddleTargetsRef = useRef<Record<string, number>>({});
  const stateRef = useRef<PongState>(DEFAULT_STATE);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    stateRef.current = pongState;
  }, [pongState]);

  const isSeated = currentUserId ? players.some((player) => player.userId === currentUserId) : false;
  const hostId = players[0]?.userId ?? null;
  const guestId = players[1]?.userId ?? null;
  const isHost = Boolean(currentUserId && currentUserId === hostId);
  const mySide = currentUserId && currentUserId === hostId ? "left" : "right";
  const me = players.find((player) => player.userId === currentUserId) ?? null;
  const opponent = useMemo(
    () => players.find((player) => player.userId !== currentUserId) ?? null,
    [players, currentUserId]
  );

  useEffect(() => {
    playersRef.current = players;
    isHostRef.current = isHost;

    const nextTargets = { ...paddleTargetsRef.current };
    players.forEach((player) => {
      nextTargets[player.userId] =
        nextTargets[player.userId] ?? CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    });
    paddleTargetsRef.current = nextTargets;
  }, [players, isHost]);

  const broadcastState = async (nextState: PongState, nextStatus?: string) => {
    setPongState(nextState);
    if (nextStatus) {
      setStatus(nextStatus);
    }

    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "pong-state",
        payload: {
          state: nextState,
          status: nextStatus ?? null
        }
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
        setPongState(DEFAULT_STATE);
        setStatus(
          nextPlayers.length === 1
            ? "Waiting for one more player."
            : "Join the room and wait for a second player."
        );
      } else if (stateRef.current.phase === "waiting") {
        setStatus("2/2 players. Host can start.");
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

      channel.on("broadcast", { event: "pong-state" }, ({ payload }) => {
        const nextPayload = payload as { state: PongState; status: string | null };
        setPongState(nextPayload.state);
        stateRef.current = nextPayload.state;
        setStatus(nextPayload.status ?? "Game updated.");
      });

      channel.on("broadcast", { event: "pong-input" }, ({ payload }) => {
        const nextPayload = payload as { userId: string; y: number };
        if (playersRef.current.some((player) => player.userId === nextPayload.userId)) {
          paddleTargetsRef.current = {
            ...paddleTargetsRef.current,
            [nextPayload.userId]: clamp(nextPayload.y, 0, CANVAS_HEIGHT - PADDLE_HEIGHT)
          };
        }
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
          setStatus("This room is full right now.");
          return;
        }

        const trackStatus = await channel.track({
          userId: session.user.id,
          username,
          onlineAt: new Date().toISOString()
        });

        if (trackStatus === "ok") {
          setConnected(true);
          setStatus("Waiting for one more player.");
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
      const channel = channelRef.current;
      if (channel) {
        void supabase.removeChannel(channel);
        channelRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isHost || players.length !== 2 || pongState.phase !== "playing") {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    const hostPlayerId = players[0].userId;
    const guestPlayerId = players[1].userId;
    paddleTargetsRef.current = {
      ...paddleTargetsRef.current,
      [hostPlayerId]: stateRef.current.paddles[hostPlayerId] ?? paddleTargetsRef.current[hostPlayerId] ?? CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
      [guestPlayerId]: stateRef.current.paddles[guestPlayerId] ?? paddleTargetsRef.current[guestPlayerId] ?? CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2
    };

    tickRef.current = window.setInterval(() => {
      const currentState = stateRef.current;
      if (currentState.phase !== "playing") {
        return;
      }

      const leftY = clamp(
        paddleTargetsRef.current[hostPlayerId] ?? CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
        0,
        CANVAS_HEIGHT - PADDLE_HEIGHT
      );
      const rightY = clamp(
        paddleTargetsRef.current[guestPlayerId] ?? CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
        0,
        CANVAS_HEIGHT - PADDLE_HEIGHT
      );
      let { x, y, vx, vy } = currentState.ball;
      x += vx;
      y += vy;

      if (y <= BALL_SIZE / 2 || y >= CANVAS_HEIGHT - BALL_SIZE / 2) {
        vy *= -1;
        y = clamp(y, BALL_SIZE / 2, CANVAS_HEIGHT - BALL_SIZE / 2);
      }

      const leftPaddleX = 20;
      const rightPaddleX = CANVAS_WIDTH - 20 - PADDLE_WIDTH;

      if (
        vx < 0 &&
        x - BALL_SIZE / 2 <= leftPaddleX + PADDLE_WIDTH &&
        x - BALL_SIZE / 2 >= leftPaddleX &&
        y >= leftY &&
        y <= leftY + PADDLE_HEIGHT
      ) {
        vx = Math.abs(vx) + 0.45;
        vy += (y - (leftY + PADDLE_HEIGHT / 2)) * 0.07;
        vy = clamp(vy, -7, 7);
        x = leftPaddleX + PADDLE_WIDTH + BALL_SIZE / 2;
      }

      if (
        vx > 0 &&
        x + BALL_SIZE / 2 >= rightPaddleX &&
        x + BALL_SIZE / 2 <= rightPaddleX + PADDLE_WIDTH &&
        y >= rightY &&
        y <= rightY + PADDLE_HEIGHT
      ) {
        vx = -Math.abs(vx) - 0.45;
        vy += (y - (rightY + PADDLE_HEIGHT / 2)) * 0.07;
        vy = clamp(vy, -7, 7);
        x = rightPaddleX - BALL_SIZE / 2;
      }

      const nextScores = { ...currentState.scores };
      let nextPhase: PongState["phase"] = "playing";
      let winnerId: string | null = null;
      let nextStatus = `${players[0].username} is left paddle. ${players[1].username} is right paddle.`;

      if (x < 0) {
        nextScores[guestPlayerId] = (nextScores[guestPlayerId] ?? 0) + 1;
        const scoredWin = nextScores[guestPlayerId] >= WINNING_SCORE;
        nextPhase = scoredWin ? "gameOver" : "playing";
        winnerId = scoredWin ? guestPlayerId : null;
        const reset = resetBall(false);
        x = reset.x;
        y = reset.y;
        vx = reset.vx;
        vy = reset.vy;
        nextStatus = scoredWin ? `${players[1].username} wins the match.` : `${players[1].username} scores.`;
      } else if (x > CANVAS_WIDTH) {
        nextScores[hostPlayerId] = (nextScores[hostPlayerId] ?? 0) + 1;
        const scoredWin = nextScores[hostPlayerId] >= WINNING_SCORE;
        nextPhase = scoredWin ? "gameOver" : "playing";
        winnerId = scoredWin ? hostPlayerId : null;
        const reset = resetBall(true);
        x = reset.x;
        y = reset.y;
        vx = reset.vx;
        vy = reset.vy;
        nextStatus = scoredWin ? `${players[0].username} wins the match.` : `${players[0].username} scores.`;
      }

      const nextState: PongState = {
        phase: nextPhase,
        paddles: {
          [hostPlayerId]: leftY,
          [guestPlayerId]: rightY
        },
        scores: nextScores,
        ball: { x, y, vx, vy },
        winnerId
      };

      void broadcastState(nextState, nextStatus);
    }, 33);

    return () => {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [isHost, players, pongState.phase]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!currentUserId || pongState.phase !== "playing" || players.length !== 2) {
        return;
      }

      const delta =
        event.key === "ArrowUp" || event.key.toLowerCase() === "w"
          ? -22
          : event.key === "ArrowDown" || event.key.toLowerCase() === "s"
            ? 22
            : 0;

      if (!delta) {
        return;
      }

      event.preventDefault();
      const nextY = clamp(
        (paddleTargetsRef.current[currentUserId] ?? CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2) + delta,
        0,
        CANVAS_HEIGHT - PADDLE_HEIGHT
      );

      paddleTargetsRef.current = {
        ...paddleTargetsRef.current,
        [currentUserId]: nextY
      };

      if (channelRef.current) {
        void channelRef.current.send({
          type: "broadcast",
          event: "pong-input",
          payload: {
            userId: currentUserId,
            y: nextY
          }
        });
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [currentUserId, hostId, players.length, pongState.phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    context.strokeStyle = "#334155";
    context.setLineDash([10, 10]);
    context.beginPath();
    context.moveTo(CANVAS_WIDTH / 2, 0);
    context.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
    context.stroke();
    context.setLineDash([]);

    const leftY = hostId ? pongState.paddles[hostId] ?? CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 : CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    const rightY = guestId ? pongState.paddles[guestId] ?? CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 : CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2;

    context.fillStyle = "#e2e8f0";
    context.fillRect(20, leftY, PADDLE_WIDTH, PADDLE_HEIGHT);
    context.fillRect(CANVAS_WIDTH - 20 - PADDLE_WIDTH, rightY, PADDLE_WIDTH, PADDLE_HEIGHT);

    context.fillStyle = "#38bdf8";
    context.fillRect(
      pongState.ball.x - BALL_SIZE / 2,
      pongState.ball.y - BALL_SIZE / 2,
      BALL_SIZE,
      BALL_SIZE
    );

    context.fillStyle = "#e2e8f0";
    context.font = "24px monospace";
    context.fillText(String(hostId ? pongState.scores[hostId] ?? 0 : 0), CANVAS_WIDTH / 2 - 56, 34);
    context.fillText(String(guestId ? pongState.scores[guestId] ?? 0 : 0), CANVAS_WIDTH / 2 + 36, 34);
  }, [guestId, hostId, pongState]);

  const startMatch = async () => {
    if (!isHost || players.length !== 2) {
      return;
    }

    const nextState = createInitialState(players, Math.random() > 0.5);
    paddleTargetsRef.current = {
      [players[0].userId]: nextState.paddles[players[0].userId],
      [players[1].userId]: nextState.paddles[players[1].userId]
    };
    await broadcastState(nextState, "Match started. Use W/S or Arrow keys.");
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card">
        <h2>Pong</h2>
        <p>Two-player room. Host starts at 2/2. Left paddle is the first player in, right paddle is the second.</p>
        <div className="info">
          Seats filled: {Math.min(players.length, 2)}/2
          {connected && !roomFull ? ` | You are ${mySide} paddle.` : ""}
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
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              style={{
                width: "100%",
                maxWidth: CANVAS_WIDTH,
                display: "block",
                margin: "1rem auto",
                borderRadius: "0.75rem",
                border: "1px solid #cbd5e1",
                background: "#0f172a"
              }}
            />
            <p className="info">{status}</p>
            <p>
              {me?.username ?? currentUsername}: {getPlayerScore(pongState, currentUserId)} | {opponent?.username ?? "Opponent"}:{" "}
              {opponent ? pongState.scores[opponent.userId] ?? 0 : 0}
            </p>
            <p>Controls: `W` / `S` or `Arrow Up` / `Arrow Down`.</p>
            {pongState.phase === "waiting" && isHost && (
              <button
                className="primary-button"
                type="button"
                onClick={() => void startMatch()}
                disabled={players.length !== 2}
              >
                Start match
              </button>
            )}
            {pongState.phase === "gameOver" && isHost && (
              <button className="primary-button" type="button" onClick={() => void startMatch()}>
                Restart match
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

function getPlayerScore(state: PongState, currentUserId: string | null) {
  if (!currentUserId) {
    return 0;
  }

  return state.scores[currentUserId] ?? 0;
}

export default Pong;
