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
  winnerIds: string[];
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
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;
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
  const [status, setStatus] = useState("Join the room and wait for at least one more player.");
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
  const playerCountLabel = `${Math.min(players.length, MAX_PLAYERS)}/${MAX_PLAYERS}`;
  const myChips = currentUserId ? gameState.chips[currentUserId] ?? STARTING_CHIPS : STARTING_CHIPS;
  const myBet = currentUserId ? gameState.bets[currentUserId] ?? null : null;
  const myHand = currentUserId ? gameState.hands[currentUserId] ?? [] : [];
  const myTotal = getHandTotal(myHand);
  const playerPanels = useMemo(() => {
    return players.map((player) => {
      const hand = gameState.hands[player.userId] ?? [];
      const total = getHandTotal(hand);
      const chips = gameState.chips[player.userId] ?? STARTING_CHIPS;
      const bet = gameState.bets[player.userId] ?? null;
      const isCurrentPlayer = player.userId === currentUserId;
      const stood = Boolean(gameState.stood[player.userId]);
      const busted = hand.length > 0 && total > 21;
      const wonLastRound = Boolean(gameState.lastRound?.winnerIds.includes(player.userId));

      return {
        ...player,
        bet,
        busted,
        chips,
        hand,
        isCurrentPlayer,
        stood,
        total,
        wonLastRound
      };
    });
  }, [currentUserId, gameState.bets, gameState.chips, gameState.hands, gameState.lastRound, gameState.stood, players]);

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
    if (!isHostRef.current || currentPlayers.length < MIN_PLAYERS || stateToCheck.phase !== "betting") {
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
    if (currentPlayers.length < MIN_PLAYERS) {
      return;
    }

    const chips = { ...stateToResolve.chips };
    const results = currentPlayers.map((player) => {
      const hand = stateToResolve.hands[player.userId] ?? [];
      const total = getHandTotal(hand);
      const bet = stateToResolve.bets[player.userId] ?? 0;
      chips[player.userId] = (chips[player.userId] ?? STARTING_CHIPS) - bet;

      return {
        bet,
        player,
        total
      };
    });

    const pot = results.reduce((sum, result) => sum + result.bet, 0);
    const eligible = results.filter((result) => result.total <= 21);
    let winnerIds: string[] = [];
    let message = "Everyone busted. The house takes the pot.";

    if (eligible.length > 0) {
      const bestTotal = Math.max(...eligible.map((result) => result.total));
      const winners = eligible.filter((result) => result.total === bestTotal);
      winnerIds = winners.map((winner) => winner.player.userId);

      const share = Math.floor(pot / winners.length);
      let remainder = pot % winners.length;

      winners.forEach((winner) => {
        chips[winner.player.userId] += share;
        if (remainder > 0) {
          chips[winner.player.userId] += 1;
          remainder -= 1;
        }
      });

      if (winners.length === 1) {
        message = `${winners[0].player.username} wins with ${bestTotal}.`;
      } else {
        const names = winners.map((winner) => winner.player.username).join(", ");
        message = `${names} split the pot with ${bestTotal}.`;
      }
    }

    const bustedBankroll = currentPlayers.find((player) => (chips[player.userId] ?? 0) <= 0);
    const nextState: CasinoState = {
      phase: bustedBankroll ? "gameOver" : "roundOver",
      chips,
      bets: {},
      hands: stateToResolve.hands,
      stood: currentPlayers.reduce<Record<string, boolean>>((acc, player) => {
        acc[player.userId] = true;
        return acc;
      }, {}),
      lastRound: {
        winnerIds,
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
      currentPlayers.length < MIN_PLAYERS ||
      stateToCheck.phase !== "playing"
    ) {
      return;
    }

    const everyoneDone = currentPlayers.every((player) => {
      const hand = stateToCheck.hands[player.userId] ?? [];
      const total = getHandTotal(hand);
      return total > 21 || Boolean(stateToCheck.stood[player.userId]);
    });

    if (everyoneDone) {
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
      const nextPlayers = getPlayersFromPresence(presenceState).slice(0, MAX_PLAYERS);

      setPlayers(nextPlayers);
      setRoomFull(
        nextPlayers.length >= MAX_PLAYERS &&
          !nextPlayers.some((player) => player.userId === currentUserIdRef.current)
      );

      if (nextPlayers.length < MIN_PLAYERS) {
        setGameState(DEFAULT_STATE);
        setStatus(
          nextPlayers.length === 1
            ? "Waiting for one more player."
            : "Join the room and wait for at least one more player."
        );
      } else if (phaseRef.current === "waiting") {
        setStatus(`${nextPlayers.length}/${MAX_PLAYERS} seated. Host can start.`);
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

        if (present.length >= MAX_PLAYERS) {
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
    if (!isHost || players.length < MIN_PLAYERS) {
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
    if (!isHost || players.length < MIN_PLAYERS) {
      return;
    }

    await startGame();
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card">
        <h2>Casino 21</h2>
        <p>Two to five players can join. Once at least two are seated, the host starts. Bet, then hit or stand to get closer to 21.</p>

        <div className="info">
          Seats filled: {playerCountLabel}
          {connected && !roomFull ? ` | ${isHost ? "You are the host." : "Waiting for the host."}` : ""}
        </div>

        {roomFull && !isSeated ? (
          <div className="error">Five players are already at this table. Wait for someone to leave.</div>
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
              {playerPanels.map((player) => (
                <div key={player.userId} className="casino-panel">
                  <strong>
                    {player.username}
                    {player.isCurrentPlayer ? " (You)" : ""}
                  </strong>
                  <span>Chips: {player.chips}</span>
                  <span>Bet: {player.bet ?? "-"}</span>
                  <span>Cards: {formatCards(player.hand)}</span>
                  <span>Total: {player.hand.length ? player.total : "-"}</span>
                  <span>
                    {player.busted
                      ? "Busted"
                      : player.stood
                        ? "Stood"
                        : gameState.phase === "roundOver" || gameState.phase === "gameOver"
                          ? player.wonLastRound
                            ? "Winner"
                            : "Lost"
                          : "Active"}
                  </span>
                </div>
              ))}
            </div>

            <p className="info">{status}</p>

            {gameState.phase === "waiting" && isHost && (
              <button
                className="primary-button"
                type="button"
                onClick={() => void startGame()}
                disabled={players.length < MIN_PLAYERS}
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
