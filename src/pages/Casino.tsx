import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { supabase } from "../lib/supabase";

type PlayerPresence = {
  userId: string;
  username: string;
  onlineAt: string;
};

type RoundSummary = {
  winnerId: string | null;
  winnerName: string | null;
  cards: Record<string, number>;
  wagers: Record<string, number>;
  message: string;
};

type CasinoState = {
  started: boolean;
  chips: Record<string, number>;
  bets: Record<string, number>;
  lastRound: RoundSummary | null;
  gameOver: boolean;
};

const ROOM_NAME = "focusland-casino";
const STARTING_CHIPS = 100;
const DEFAULT_GAME_STATE: CasinoState = {
  started: false,
  chips: {},
  bets: {},
  lastRound: null,
  gameOver: false
};

function buildInitialState(players: PlayerPresence[]): CasinoState {
  const chips = players.reduce<Record<string, number>>((acc, player) => {
    acc[player.userId] = STARTING_CHIPS;
    return acc;
  }, {});

  return {
    started: true,
    chips,
    bets: {},
    lastRound: null,
    gameOver: false
  };
}

function getPlayersFromPresence(rawPresence: Record<string, Array<{ userId: string; username: string; onlineAt: string }>>) {
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

function formatCardLabel(value: number | undefined) {
  if (!value) return "-";
  if (value === 1) return "A";
  if (value === 11) return "J";
  if (value === 12) return "Q";
  if (value === 13) return "K";
  return String(value);
}

const Casino: React.FC = () => {
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [gameState, setGameState] = useState<CasinoState>(DEFAULT_GAME_STATE);
  const [selectedBet, setSelectedBet] = useState(10);
  const [status, setStatus] = useState("Join the room and wait for a second player.");
  const [roomFull, setRoomFull] = useState(false);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const gameStateRef = useRef<CasinoState>(DEFAULT_GAME_STATE);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

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
        setGameState(DEFAULT_GAME_STATE);
        setStatus(nextPlayers.length === 1 ? "Waiting for one more player." : "Join the room and wait for a second player.");
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

      channel.on("presence", { event: "sync" }, () => {
        syncPresence();
      });

      channel.on("broadcast", { event: "casino-state" }, ({ payload }) => {
        const nextState = payload as CasinoState;
        setGameState(nextState);

        if (nextState.gameOver) {
          setStatus(nextState.lastRound?.message ?? "Game over.");
        } else if (nextState.started) {
          setStatus(nextState.lastRound?.message ?? "Place your wager for the next hand.");
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
      const channel = channelRef.current;
      if (channel) {
        void supabase.removeChannel(channel);
        channelRef.current = null;
      }
    };
  }, []);

  const isSeated = currentUserId ? players.some((player) => player.userId === currentUserId) : false;
  const hostId = players[0]?.userId ?? null;
  const isHost = Boolean(currentUserId && hostId === currentUserId);
  const playerCountLabel = `${Math.min(players.length, 2)}/2`;
  const canStart = isHost && players.length === 2 && !gameState.started;
  const myChips = currentUserId ? gameState.chips[currentUserId] ?? STARTING_CHIPS : STARTING_CHIPS;
  const myBet = currentUserId ? gameState.bets[currentUserId] ?? null : null;

  const opponent = useMemo(() => {
    return players.find((player) => player.userId !== currentUserId) ?? null;
  }, [players, currentUserId]);

  const broadcastState = async (nextState: CasinoState) => {
    setGameState(nextState);

    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "casino-state",
        payload: nextState
      });
    }
  };

  const startGame = async () => {
    if (!canStart) {
      return;
    }

    const nextState = buildInitialState(players);
    setStatus("Game started. Place your wager.");
    await broadcastState(nextState);
  };

  const placeBet = async (amount: number) => {
    if (!currentUserId || !gameState.started || gameState.gameOver) {
      return;
    }

    const chipsLeft = gameStateRef.current.chips[currentUserId] ?? STARTING_CHIPS;
    if (amount > chipsLeft) {
      setStatus("You do not have enough chips for that wager.");
      return;
    }

    const nextState: CasinoState = {
      ...gameStateRef.current,
      bets: {
        ...gameStateRef.current.bets,
        [currentUserId]: amount
      }
    };

    setStatus(`Wager locked at ${amount} chips.`);
    await broadcastState(nextState);

    const bothBet = players.every((player) => nextState.bets[player.userId] && nextState.bets[player.userId] > 0);
    if (isHost && bothBet) {
      await resolveRound(nextState);
    }
  };

  const resolveRound = async (stateToResolve: CasinoState) => {
    const cards: Record<string, number> = {};
    players.forEach((player) => {
      cards[player.userId] = Math.floor(Math.random() * 13) + 1;
    });

    const [playerOne, playerTwo] = players;
    const wagerOne = stateToResolve.bets[playerOne.userId] ?? 0;
    const wagerTwo = stateToResolve.bets[playerTwo.userId] ?? 0;
    const chips = { ...stateToResolve.chips };

    chips[playerOne.userId] -= wagerOne;
    chips[playerTwo.userId] -= wagerTwo;

    let winnerId: string | null = null;
    let winnerName: string | null = null;
    let message = "Tie hand. Bets returned.";

    if (cards[playerOne.userId] > cards[playerTwo.userId]) {
      winnerId = playerOne.userId;
      winnerName = playerOne.username;
      chips[playerOne.userId] += wagerOne + wagerTwo;
      message = `${playerOne.username} wins the hand with ${formatCardLabel(cards[playerOne.userId])}.`;
    } else if (cards[playerTwo.userId] > cards[playerOne.userId]) {
      winnerId = playerTwo.userId;
      winnerName = playerTwo.username;
      chips[playerTwo.userId] += wagerOne + wagerTwo;
      message = `${playerTwo.username} wins the hand with ${formatCardLabel(cards[playerTwo.userId])}.`;
    } else {
      chips[playerOne.userId] += wagerOne;
      chips[playerTwo.userId] += wagerTwo;
    }

    const someoneBroke = players.find((player) => (chips[player.userId] ?? 0) <= 0);
    const nextState: CasinoState = {
      started: !someoneBroke,
      chips,
      bets: {},
      lastRound: {
        winnerId,
        winnerName,
        cards,
        wagers: stateToResolve.bets,
        message
      },
      gameOver: Boolean(someoneBroke)
    };

    if (someoneBroke) {
      nextState.lastRound = {
        winnerId,
        winnerName,
        cards,
        wagers: stateToResolve.bets,
        message: `${message} ${someoneBroke.username} is out of chips.`
      };
    }

    setStatus(nextState.lastRound.message);
    await broadcastState(nextState);
  };

  const resetGame = async () => {
    if (!isHost || players.length < 2) {
      return;
    }

    setStatus("Table reset. Waiting to start.");
    await broadcastState(DEFAULT_GAME_STATE);
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card">
        <h2>Casino</h2>
        <p>Two-player high-card table. The room opens only when two players are seated.</p>

        <div className="info">
          Seats filled: {playerCountLabel}
          {connected && !roomFull ? ` | ${isHost ? "You are the host." : "Waiting for the host to start."}` : ""}
        </div>

        {roomFull && !isSeated ? (
          <div className="error">Two players are already at this table. Wait for someone to leave.</div>
        ) : (
          <>
            <div className="button-row">
              {players.map((player) => (
                <span key={player.userId} className="secondary-button">
                  {player.username}
                </span>
              ))}
            </div>

            {!gameState.started ? (
              <>
                <p className="info">{status}</p>
                {isHost ? (
                  <button className="primary-button" type="button" disabled={!canStart} onClick={startGame}>
                    Start game
                  </button>
                ) : (
                  <p>{players.length < 2 ? "Waiting for 2/2 players." : "Waiting for host to start."}</p>
                )}
              </>
            ) : (
              <>
                <div className="casino-board">
                  <div className="casino-panel">
                    <strong>{currentUsername}</strong>
                    <span>Chips: {myChips}</span>
                    <span>Your wager: {myBet ?? "-"}</span>
                    <span>Your last card: {formatCardLabel(currentUserId ? gameState.lastRound?.cards[currentUserId] : undefined)}</span>
                  </div>
                  <div className="casino-panel">
                    <strong>{opponent?.username ?? "Opponent"}</strong>
                    <span>Chips: {opponent ? gameState.chips[opponent.userId] ?? STARTING_CHIPS : "-"}</span>
                    <span>
                      Opponent wager: {opponent ? gameState.lastRound?.wagers[opponent.userId] ?? gameState.bets[opponent.userId] ?? "-" : "-"}
                    </span>
                    <span>
                      Opponent card: {formatCardLabel(opponent ? gameState.lastRound?.cards[opponent.userId] : undefined)}
                    </span>
                  </div>
                </div>

                <div className="button-row">
                  {[10, 25, 50].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className={selectedBet === amount ? "primary-button" : "secondary-button"}
                      onClick={() => setSelectedBet(amount)}
                      disabled={amount > myChips}
                    >
                      Bet {amount}
                    </button>
                  ))}
                </div>

                <div className="button-row">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void placeBet(selectedBet)}
                    disabled={Boolean(myBet) || myChips <= 0}
                  >
                    {myBet ? "Wager locked" : "Lock wager"}
                  </button>
                  {isHost && (
                    <button className="secondary-button" type="button" onClick={() => void resetGame()}>
                      Reset table
                    </button>
                  )}
                </div>

                <p className="info">{status}</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Casino;
