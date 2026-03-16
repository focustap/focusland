import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { supabase } from "../lib/supabase";

type PlayerPresence = {
  userId: string;
  username: string;
  onlineAt: string;
};

type CasinoPhase = "waiting" | "betting" | "playing" | "roundOver" | "gameOver";

type RoundSummary = {
  winnerId: string | null;
  message: string;
};

type CasinoState = {
  phase: CasinoPhase;
  chips: Record<string, number>;
  bets: Record<string, number>;
  hands: Record<string, number[]>;
  stood: Record<string, boolean>;
  lastRound: RoundSummary | null;
};

const ROOM_NAME = "focusland-casino";
const STARTING_CHIPS = 100;
const DEFAULT_STATE: CasinoState = {
  phase: "waiting",
  chips: {},
  bets: {},
  hands: {},
  stood: {},
  lastRound: null
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

function drawCard() {
  const value = Math.floor(Math.random() * 13) + 1;
  if (value === 1) return 11;
  if (value >= 10) return 10;
  return value;
}

function getHandTotal(cards: number[] = []) {
  let total = cards.reduce((sum, card) => sum + card, 0);
  let aces = cards.filter((card) => card === 11).length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function formatCards(cards: number[] = []) {
  if (!cards.length) return "-";
  return cards.join(", ");
}

const Casino: React.FC = () => {
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [gameState, setGameState] = useState<CasinoState>(DEFAULT_STATE);
  const [selectedBet, setSelectedBet] = useState(10);
  const [status, setStatus] = useState("Join the room and wait for a second player.");
  const [roomFull, setRoomFull] = useState(false);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const playersRef = useRef<PlayerPresence[]>([]);
  const isHostRef = useRef(false);
  const phaseRef = useRef<CasinoPhase>("waiting");
  const resolvingRef = useRef(false);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    phaseRef.current = gameState.phase;
  }, [gameState.phase]);

  const isSeated = currentUserId ? players.some((player) => player.userId === currentUserId) : false;
  const hostId = players[0]?.userId ?? null;
  const isHost = Boolean(currentUserId && currentUserId === hostId);
  const playerCountLabel = `${Math.min(players.length, 2)}/2`;
  const myChips = currentUserId ? gameState.chips[currentUserId] ?? STARTING_CHIPS : STARTING_CHIPS;
  const myBet = currentUserId ? gameState.bets[currentUserId] ?? null : null;
  const myHand = currentUserId ? gameState.hands[currentUserId] ?? [] : [];
  const myTotal = getHandTotal(myHand);

  const opponent = useMemo(() => {
    return players.find((player) => player.userId !== currentUserId) ?? null;
  }, [players, currentUserId]);

  const opponentHand = opponent ? gameState.hands[opponent.userId] ?? [] : [];
  const opponentTotal = getHandTotal(opponentHand);

  useEffect(() => {
    playersRef.current = players;
    isHostRef.current = isHost;
  }, [players, isHost]);

  const broadcastState = async (nextState: CasinoState, nextStatus?: string) => {
    setGameState(nextState);
    if (nextStatus) {
      setStatus(nextStatus);
    }

    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "casino-state",
        payload: {
          state: nextState,
          status: nextStatus ?? null
        }
      });
    }
  };

  const maybeDealOpeningCards = async (stateToCheck: CasinoState) => {
    const currentPlayers = playersRef.current;
    if (!isHostRef.current || currentPlayers.length !== 2 || stateToCheck.phase !== "betting") {
      return;
    }

    const everyoneBet = currentPlayers.every((player) => (stateToCheck.bets[player.userId] ?? 0) > 0);
    if (!everyoneBet) {
      return;
    }

    const dealtState: CasinoState = {
      phase: "playing",
      chips: stateToCheck.chips,
      bets: stateToCheck.bets,
      hands: currentPlayers.reduce<Record<string, number[]>>((acc, player) => {
        acc[player.userId] = [drawCard()];
        return acc;
      }, {}),
      stood: {},
      lastRound: null
    };

    await broadcastState(dealtState, "Cards dealt. Hit or stand.");
  };

  const settleRound = async (stateToResolve: CasinoState) => {
    const currentPlayers = playersRef.current;
    if (currentPlayers.length !== 2) {
      return;
    }

    const [playerOne, playerTwo] = currentPlayers;
    const playerOneTotal = getHandTotal(stateToResolve.hands[playerOne.userId] ?? []);
    const playerTwoTotal = getHandTotal(stateToResolve.hands[playerTwo.userId] ?? []);
    const playerOneBust = playerOneTotal > 21;
    const playerTwoBust = playerTwoTotal > 21;
    const chips = { ...stateToResolve.chips };
    const wagerOne = stateToResolve.bets[playerOne.userId] ?? 0;
    const wagerTwo = stateToResolve.bets[playerTwo.userId] ?? 0;

    chips[playerOne.userId] -= wagerOne;
    chips[playerTwo.userId] -= wagerTwo;

    let winnerId: string | null = null;
    let message = "Push. Bets returned.";

    if (playerOneBust && !playerTwoBust) {
      winnerId = playerTwo.userId;
      chips[playerTwo.userId] += wagerOne + wagerTwo;
      message = `${playerOne.username} busted. ${playerTwo.username} wins.`;
    } else if (playerTwoBust && !playerOneBust) {
      winnerId = playerOne.userId;
      chips[playerOne.userId] += wagerOne + wagerTwo;
      message = `${playerTwo.username} busted. ${playerOne.username} wins.`;
    } else if (!playerOneBust && !playerTwoBust && playerOneTotal > playerTwoTotal) {
      winnerId = playerOne.userId;
      chips[playerOne.userId] += wagerOne + wagerTwo;
      message = `${playerOne.username} wins ${playerOneTotal} to ${playerTwoTotal}.`;
    } else if (!playerOneBust && !playerTwoBust && playerTwoTotal > playerOneTotal) {
      winnerId = playerTwo.userId;
      chips[playerTwo.userId] += wagerOne + wagerTwo;
      message = `${playerTwo.username} wins ${playerTwoTotal} to ${playerOneTotal}.`;
    } else {
      chips[playerOne.userId] += wagerOne;
      chips[playerTwo.userId] += wagerTwo;
    }

    const bustedBankroll = currentPlayers.find((player) => (chips[player.userId] ?? 0) <= 0);
    const nextState: CasinoState = {
      phase: bustedBankroll ? "gameOver" : "roundOver",
      chips,
      bets: {},
      hands: stateToResolve.hands,
      stood: {
        [playerOne.userId]: true,
        [playerTwo.userId]: true
      },
      lastRound: {
        winnerId,
        message: bustedBankroll
          ? `${message} ${bustedBankroll.username} is out of chips.`
          : message
      }
    };

    await broadcastState(nextState, nextState.lastRound.message);
  };

  const maybeSettleRound = async (stateToCheck: CasinoState) => {
    const currentPlayers = playersRef.current;
    if (
      resolvingRef.current ||
      !isHostRef.current ||
      currentPlayers.length !== 2 ||
      stateToCheck.phase !== "playing"
    ) {
      return;
    }

    const [playerOne, playerTwo] = currentPlayers;
    const handOne = stateToCheck.hands[playerOne.userId] ?? [];
    const handTwo = stateToCheck.hands[playerTwo.userId] ?? [];
    const totalOne = getHandTotal(handOne);
    const totalTwo = getHandTotal(handTwo);
    const playerOneDone = totalOne > 21 || Boolean(stateToCheck.stood[playerOne.userId]);
    const playerTwoDone = totalTwo > 21 || Boolean(stateToCheck.stood[playerTwo.userId]);

    if (totalOne > 21 || totalTwo > 21 || (playerOneDone && playerTwoDone)) {
      resolvingRef.current = true;
      try {
        await settleRound(stateToCheck);
      } finally {
        resolvingRef.current = false;
      }
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
        setStatus(
          nextPlayers.length === 1
            ? "Waiting for one more player."
            : "Join the room and wait for a second player."
        );
      } else if (phaseRef.current === "waiting") {
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

      channel.on("presence", { event: "sync" }, () => {
        syncPresence();
      });

      channel.on("broadcast", { event: "casino-state" }, ({ payload }) => {
        const nextPayload = payload as { state: CasinoState; status: string | null };
        setGameState(nextPayload.state);
        setStatus(nextPayload.status ?? "Game updated.");
        void maybeDealOpeningCards(nextPayload.state);
        void maybeSettleRound(nextPayload.state);
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

  const startGame = async () => {
    if (!isHost || players.length !== 2) {
      return;
    }

    const chips = players.reduce<Record<string, number>>((acc, player) => {
      acc[player.userId] = gameState.chips[player.userId] ?? STARTING_CHIPS;
      return acc;
    }, {});

    await broadcastState(
      {
        phase: "betting",
        chips,
        bets: {},
        hands: {},
        stood: {},
        lastRound: null
      },
      "Place your bet to start the hand."
    );
  };

  const lockBet = async () => {
    if (!currentUserId || gameState.phase !== "betting") {
      return;
    }

    if (selectedBet > myChips) {
      setStatus("You do not have enough chips for that bet.");
      return;
    }

    const nextState: CasinoState = {
      ...gameState,
      bets: {
        ...gameState.bets,
        [currentUserId]: selectedBet
      }
    };

    await broadcastState(nextState, `Bet locked at ${selectedBet}.`);
    await maybeDealOpeningCards(nextState);
  };

  const hit = async () => {
    if (!currentUserId || gameState.phase !== "playing") {
      return;
    }

    if (gameState.stood[currentUserId]) {
      return;
    }

    const nextHand = [...myHand, drawCard()];
    const nextState: CasinoState = {
      ...gameState,
      hands: {
        ...gameState.hands,
        [currentUserId]: nextHand
      }
    };

    const total = getHandTotal(nextHand);
    await broadcastState(
      nextState,
      total > 21 ? `${currentUsername} busted.` : `${currentUsername} hits.`
    );
    await maybeSettleRound(nextState);
  };

  const stand = async () => {
    if (!currentUserId || gameState.phase !== "playing") {
      return;
    }

    const nextState: CasinoState = {
      ...gameState,
      stood: {
        ...gameState.stood,
        [currentUserId]: true
      }
    };

    await broadcastState(nextState, `${currentUsername} stands.`);
    await maybeSettleRound(nextState);
  };

  const nextHand = async () => {
    if (!isHost || players.length !== 2) {
      return;
    }

    await startGame();
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card">
        <h2>Casino 21</h2>
        <p>Two players join. At 2/2, the host starts. Bet, then hit or stand to get closer to 21.</p>

        <div className="info">
          Seats filled: {playerCountLabel}
          {connected && !roomFull ? ` | ${isHost ? "You are the host." : "Waiting for the host."}` : ""}
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

            <div className="casino-board">
              <div className="casino-panel">
                <strong>{currentUsername}</strong>
                <span>Chips: {myChips}</span>
                <span>Bet: {myBet ?? "-"}</span>
                <span>Cards: {formatCards(myHand)}</span>
                <span>Total: {myHand.length ? myTotal : "-"}</span>
              </div>
              <div className="casino-panel">
                <strong>{opponent?.username ?? "Opponent"}</strong>
                <span>Chips: {opponent ? gameState.chips[opponent.userId] ?? STARTING_CHIPS : "-"}</span>
                <span>Bet: {opponent ? gameState.bets[opponent.userId] ?? "-" : "-"}</span>
                <span>Cards: {formatCards(opponentHand)}</span>
                <span>Total: {opponentHand.length ? opponentTotal : "-"}</span>
              </div>
            </div>

            <p className="info">{status}</p>

            {gameState.phase === "waiting" && isHost && (
              <button
                className="primary-button"
                type="button"
                onClick={() => void startGame()}
                disabled={players.length !== 2}
              >
                Start game
              </button>
            )}

            {gameState.phase === "betting" && (
              <>
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
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void lockBet()}
                  disabled={Boolean(myBet)}
                >
                  {myBet ? "Bet locked" : "Lock bet"}
                </button>
              </>
            )}

            {gameState.phase === "playing" && (
              <div className="button-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void hit()}
                  disabled={Boolean(gameState.stood[currentUserId ?? ""])}
                >
                  Hit
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void stand()}
                  disabled={Boolean(gameState.stood[currentUserId ?? ""])}
                >
                  Stand
                </button>
              </div>
            )}

            {(gameState.phase === "roundOver" || gameState.phase === "gameOver") && isHost && (
              <button className="primary-button" type="button" onClick={() => void nextHand()}>
                {gameState.phase === "gameOver" ? "Restart table" : "Next hand"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Casino;
