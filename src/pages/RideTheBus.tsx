import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { applyGoldDelta, getCurrentUserGold } from "../lib/progression";
import { DEFAULT_PROFILE_COLOR, normalizeProfileColor } from "../lib/profileColor";
import { supabase } from "../lib/supabase";

type PlayerPresence = {
  userId: string;
  username: string;
  onlineAt: string;
  color: string;
};

type Suit = "spades" | "clubs" | "diamonds" | "hearts";
type GuessStage = "idle" | "color" | "higher-lower" | "inside-outside" | "suit" | "won" | "lost";

type Card = {
  value: number;
  suit: Suit;
};

type SeatState = {
  userId: string;
  username: string;
  color: string;
  bet: number;
  stage: GuessStage;
  cards: Card[];
  multiplier: number;
  status: string;
  emote: string | null;
  emoteExpiresAt: number;
};

const ROOM_NAME = "focusland-ride-the-bus";
const MAX_PLAYERS = 5;
const MULTIPLIERS: Record<GuessStage, number> = {
  idle: 0,
  color: 1,
  "higher-lower": 2,
  "inside-outside": 3,
  suit: 5,
  won: 20,
  lost: 0
};

function getPlayersFromPresence(
  rawPresence: Record<string, Array<{ userId: string; username: string; onlineAt: string; color: string }>>
) {
  const players = Object.values(rawPresence)
    .flat()
    .map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      onlineAt: entry.onlineAt,
      color: normalizeProfileColor(entry.color)
    }));

  const deduped = new Map<string, PlayerPresence>();
  players.forEach((player) => {
    if (!deduped.has(player.userId)) {
      deduped.set(player.userId, player);
    }
  });

  return Array.from(deduped.values()).sort((a, b) => a.onlineAt.localeCompare(b.onlineAt));
}

function drawCard(): Card {
  return {
    value: Math.floor(Math.random() * 13) + 2,
    suit: ["spades", "clubs", "diamonds", "hearts"][Math.floor(Math.random() * 4)] as Suit
  };
}

function formatCard(card: Card) {
  const label =
    card.value === 11 ? "J" : card.value === 12 ? "Q" : card.value === 13 ? "K" : card.value === 14 ? "A" : String(card.value);
  const suitSymbol =
    card.suit === "spades" ? "♠" : card.suit === "clubs" ? "♣" : card.suit === "diamonds" ? "♦" : "♥";
  return `${label}${suitSymbol}`;
}

function getSeatStyle(index: number, count: number): React.CSSProperties {
  const layouts: Record<number, Array<React.CSSProperties>> = {
    1: [{ left: "50%", top: "70%", transform: "translateX(-50%)" }],
    2: [
      { left: "14%", top: "66%" },
      { right: "14%", top: "18%" }
    ],
    3: [
      { left: "12%", top: "60%" },
      { left: "50%", top: "76%", transform: "translateX(-50%)" },
      { right: "12%", top: "22%" }
    ],
    4: [
      { left: "10%", top: "58%" },
      { left: "33%", top: "14%", transform: "translateX(-50%)" },
      { right: "33%", top: "14%", transform: "translateX(50%)" },
      { right: "10%", top: "58%" }
    ],
    5: [
      { left: "8%", top: "56%" },
      { left: "25%", top: "16%", transform: "translateX(-50%)" },
      { left: "50%", top: "8%", transform: "translateX(-50%)" },
      { right: "25%", top: "16%", transform: "translateX(50%)" },
      { right: "8%", top: "56%" }
    ]
  };

  return layouts[count]?.[index] ?? layouts[1][0];
}

const RideTheBus: React.FC = () => {
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [currentColor, setCurrentColor] = useState(DEFAULT_PROFILE_COLOR);
  const [currentGold, setCurrentGold] = useState(0);
  const [selectedBet, setSelectedBet] = useState(25);
  const [status, setStatus] = useState("Join the table, place a bet, and start climbing the bus.");
  const [roomFull, setRoomFull] = useState(false);
  const [connected, setConnected] = useState(false);
  const [seatStates, setSeatStates] = useState<Record<string, SeatState>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeatStates((current) =>
        Object.fromEntries(
          Object.entries(current).map(([userId, seat]) => [
            userId,
            {
              ...seat,
              emote: seat.emoteExpiresAt > Date.now() ? seat.emote : null
            }
          ])
        )
      );
    }, 300);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const localSeat = currentUserId ? seatStates[currentUserId] : null;
  const currentMultiplier = localSeat ? localSeat.multiplier : 0;
  const potentialCashout = localSeat ? localSeat.bet * localSeat.multiplier : 0;

  const tableSeats = useMemo(() => {
    return players.map((player) => {
      const seat = seatStates[player.userId];
      return {
        ...player,
        seat
      };
    });
  }, [players, seatStates]);

  const broadcastSeat = async (seat: SeatState) => {
    setSeatStates((current) => ({
      ...current,
      [seat.userId]: seat
    }));

    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "bus-seat",
        payload: seat
      });
    }
  };

  const updateEmote = async (emote: string) => {
    if (!currentUserId) {
      return;
    }

    const nextSeat: SeatState = {
      ...(seatStates[currentUserId] ?? {
        userId: currentUserId,
        username: currentUsername,
        color: currentColor,
        bet: 0,
        stage: "idle",
        cards: [],
        multiplier: 0,
        status: "Watching the table.",
        emote: null,
        emoteExpiresAt: 0
      }),
      emote,
      emoteExpiresAt: Date.now() + 2000
    };

    await broadcastSeat(nextSeat);
  };

  useEffect(() => {
    let isUnmounted = false;

    const syncPresence = () => {
      const channel = channelRef.current;
      if (!channel) return;

      const nextPlayers = getPlayersFromPresence(
        channel.presenceState() as Record<
          string,
          Array<{ userId: string; username: string; onlineAt: string; color: string }>
        >
      ).slice(0, MAX_PLAYERS);

      setPlayers(nextPlayers);
      setRoomFull(
        nextPlayers.length >= MAX_PLAYERS &&
          !nextPlayers.some((player) => player.userId === currentUserIdRef.current)
      );
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
        .select("username, color")
        .eq("id", session.user.id)
        .maybeSingle();

      const username = (profile?.username as string | null) ?? session.user.email ?? "Player";
      const color = normalizeProfileColor((profile?.color as string | null) ?? DEFAULT_PROFILE_COLOR);

      setCurrentUserId(session.user.id);
      setCurrentUsername(username);
      setCurrentColor(color);

      try {
        setCurrentGold(await getCurrentUserGold());
      } catch {
        setStatus("Could not load your gold.");
      }

      const channel = supabase.channel(ROOM_NAME, {
        config: {
          presence: {
            key: session.user.id
          }
        }
      });

      channelRef.current = channel;
      channel.on("presence", { event: "sync" }, syncPresence);
      channel.on("broadcast", { event: "bus-seat" }, ({ payload }) => {
        const seat = payload as SeatState;
        setSeatStates((current) => ({
          ...current,
          [seat.userId]: seat
        }));
      });

      channel.subscribe(async (subscriptionStatus) => {
        if (subscriptionStatus !== "SUBSCRIBED" || isUnmounted) {
          return;
        }

        const present = getPlayersFromPresence(
          channel.presenceState() as Record<
            string,
            Array<{ userId: string; username: string; onlineAt: string; color: string }>
          >
        );

        if (present.length >= MAX_PLAYERS) {
          setRoomFull(true);
          return;
        }

        const trackStatus = await channel.track({
          userId: session.user.id,
          username,
          color,
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
      const channel = channelRef.current;
      if (channel) {
        void supabase.removeChannel(channel);
        channelRef.current = null;
      }
    };
  }, []);

  const startRun = async () => {
    if (!currentUserId) {
      return;
    }
    if (selectedBet > currentGold) {
      setStatus("You do not have enough gold for that bet.");
      return;
    }

    try {
      const nextGold = await applyGoldDelta(-selectedBet);
      setCurrentGold(nextGold);
    } catch {
      setStatus("Could not lock your gold.");
      return;
    }

    const nextSeat: SeatState = {
      userId: currentUserId,
      username: currentUsername,
      color: currentColor,
      bet: selectedBet,
      stage: "color",
      cards: [],
      multiplier: 1,
      status: "Round 1: Red or black?",
      emote: localSeat?.emote ?? null,
      emoteExpiresAt: localSeat?.emoteExpiresAt ?? 0
    };

    await broadcastSeat(nextSeat);
    setStatus("Round 1: Guess the color.");
  };

  const loseRun = async (seat: SeatState, message: string) => {
    const nextSeat: SeatState = {
      ...seat,
      stage: "lost",
      multiplier: 0,
      status: message
    };
    await broadcastSeat(nextSeat);
    setStatus(message);
  };

  const cashOut = async () => {
    if (!localSeat || !currentUserId || localSeat.multiplier <= 1) {
      return;
    }

    const payout = localSeat.bet * localSeat.multiplier;
    try {
      const nextGold = await applyGoldDelta(payout);
      setCurrentGold(nextGold);
    } catch {
      setStatus("Could not cash out your gold.");
      return;
    }

    const nextSeat: SeatState = {
      ...localSeat,
      stage: "won",
      status: `Cashed out for ${payout} gold.`
    };
    await broadcastSeat(nextSeat);
    setStatus(`Cashed out for ${payout} gold.`);
  };

  const handleGuess = async (guess: string) => {
    if (!localSeat || !currentUserId) {
      return;
    }

    const nextCard = drawCard();
    const nextCards = [...localSeat.cards, nextCard];

    if (localSeat.stage === "color") {
      const isRed = nextCard.suit === "hearts" || nextCard.suit === "diamonds";
      const correct = (guess === "red" && isRed) || (guess === "black" && !isRed);
      if (!correct) {
        await loseRun({ ...localSeat, cards: nextCards }, `${formatCard(nextCard)}. Wrong color. Bus ride over.`);
        return;
      }

      await broadcastSeat({
        ...localSeat,
        cards: nextCards,
        stage: "higher-lower",
        multiplier: MULTIPLIERS["higher-lower"],
        status: `${formatCard(nextCard)}. Nice hit. Round 2: higher or lower?`
      });
      return;
    }

    if (localSeat.stage === "higher-lower") {
      const first = localSeat.cards[0];
      const correct =
        (guess === "higher" && nextCard.value >= first.value) ||
        (guess === "lower" && nextCard.value <= first.value);

      if (!correct) {
        await loseRun({ ...localSeat, cards: nextCards }, `${formatCard(nextCard)}. Missed the line.`);
        return;
      }

      await broadcastSeat({
        ...localSeat,
        cards: nextCards,
        stage: "inside-outside",
        multiplier: MULTIPLIERS["inside-outside"],
        status: `${formatCard(nextCard)}. Round 3: inside or outside?`
      });
      return;
    }

    if (localSeat.stage === "inside-outside") {
      const values = localSeat.cards.map((card) => card.value);
      const low = Math.min(...values);
      const high = Math.max(...values);
      const isInside = nextCard.value >= low && nextCard.value <= high;
      const correct = (guess === "inside" && isInside) || (guess === "outside" && !isInside);

      if (!correct) {
        await loseRun({ ...localSeat, cards: nextCards }, `${formatCard(nextCard)}. The bus threw you off.`);
        return;
      }

      await broadcastSeat({
        ...localSeat,
        cards: nextCards,
        stage: "suit",
        multiplier: MULTIPLIERS.suit,
        status: `${formatCard(nextCard)}. Final stop: pick the suit.`
      });
      return;
    }

    if (localSeat.stage === "suit") {
      const correct = nextCard.suit === guess;
      if (!correct) {
        await loseRun({ ...localSeat, cards: nextCards }, `${formatCard(nextCard)}. Wrong suit. Brutal finish.`);
        return;
      }

      const payout = localSeat.bet * MULTIPLIERS.won;
      try {
        const nextGold = await applyGoldDelta(payout);
        setCurrentGold(nextGold);
      } catch {
        setStatus("Could not settle your payout.");
        return;
      }

      const nextSeat: SeatState = {
        ...localSeat,
        cards: nextCards,
        stage: "won",
        multiplier: MULTIPLIERS.won,
        status: `${formatCard(nextCard)}. Clean sweep for ${payout} gold.`
      };
      await broadcastSeat(nextSeat);
      setStatus(`You rode the whole bus and won ${payout} gold.`);
    }
  };

  const resetSeat = async () => {
    if (!currentUserId) {
      return;
    }

    await broadcastSeat({
      userId: currentUserId,
      username: currentUsername,
      color: currentColor,
      bet: 0,
      stage: "idle",
      cards: [],
      multiplier: 0,
      status: "Watching the table.",
      emote: localSeat?.emote ?? null,
      emoteExpiresAt: localSeat?.emoteExpiresAt ?? 0
    });
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 1080 }}>
        <h2>Ride the Bus</h2>
        <p>Color, higher or lower, inside or outside, then the suit. Cash out anytime after a hit, or risk it all for the 20x finish.</p>

        <div className="info">
          Seats filled: {Math.min(players.length, MAX_PLAYERS)}/{MAX_PLAYERS} | Gold: {currentGold}
          {connected && !roomFull ? ` | ${currentUsername}` : ""}
        </div>

        {roomFull ? (
          <div className="error">This bus table is full right now.</div>
        ) : null}

        <div className="ride-bus-table">
          <div className="ride-bus-felt">
            <div className="ride-bus-center">
              <strong>Ride the Bus</strong>
              <span>Cash out whenever the odds feel right.</span>
            </div>
          </div>
          {tableSeats.map((player, index) => (
            <div
              key={player.userId}
              className="casino-panel casino-seat ride-bus-seat"
              style={getSeatStyle(index, tableSeats.length)}
            >
              <div className="ride-bus-seat-head">
                <div className="ride-bus-avatar" style={{ backgroundColor: player.color }} />
                <strong>
                  {player.username}
                  {player.userId === currentUserId ? " (You)" : ""}
                </strong>
              </div>
              <span>{player.seat?.status ?? "Watching the table."}</span>
              <span>Bet: {player.seat?.bet ?? "-"}</span>
              <span>Current x: {player.seat?.multiplier ?? "-"}</span>
              <div className="ride-bus-card-row">
                {(player.seat?.cards ?? []).map((card, cardIndex) => (
                  <div key={`${player.userId}-${cardIndex}-${card.suit}`} className="ride-bus-card">
                    {formatCard(card)}
                  </div>
                ))}
              </div>
              {player.seat?.emote ? <div className="ride-bus-emote">{player.seat.emote}</div> : null}
            </div>
          ))}
        </div>

        <p className="info">{status}</p>

        <div className="button-row">
          {[10, 25, 50, 100].map((amount) => (
            <button
              key={amount}
              type="button"
              className={selectedBet === amount ? "primary-button" : "secondary-button"}
              onClick={() => setSelectedBet(amount)}
              disabled={Boolean(localSeat && localSeat.stage !== "idle")}
            >
              Bet {amount}
            </button>
          ))}
        </div>

        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={() => void startRun()}
            disabled={Boolean(localSeat && localSeat.stage !== "idle")}
          >
            Start ride
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void cashOut()}
            disabled={!localSeat || localSeat.multiplier <= 1 || localSeat.stage === "won" || localSeat.stage === "lost"}
          >
            Cash out {potentialCashout > 0 ? `(${potentialCashout})` : ""}
          </button>
          <button className="secondary-button" type="button" onClick={() => void resetSeat()}>
            Reset seat
          </button>
        </div>

        <div className="button-row">
          {localSeat?.stage === "color" ? (
            <>
              <button className="primary-button" type="button" onClick={() => void handleGuess("red")}>Red</button>
              <button className="secondary-button" type="button" onClick={() => void handleGuess("black")}>Black</button>
            </>
          ) : null}
          {localSeat?.stage === "higher-lower" ? (
            <>
              <button className="primary-button" type="button" onClick={() => void handleGuess("higher")}>Higher</button>
              <button className="secondary-button" type="button" onClick={() => void handleGuess("lower")}>Lower</button>
            </>
          ) : null}
          {localSeat?.stage === "inside-outside" ? (
            <>
              <button className="primary-button" type="button" onClick={() => void handleGuess("inside")}>Inside</button>
              <button className="secondary-button" type="button" onClick={() => void handleGuess("outside")}>Outside</button>
            </>
          ) : null}
          {localSeat?.stage === "suit" ? (
            <>
              <button className="primary-button" type="button" onClick={() => void handleGuess("spades")}>Spades</button>
              <button className="secondary-button" type="button" onClick={() => void handleGuess("clubs")}>Clubs</button>
              <button className="secondary-button" type="button" onClick={() => void handleGuess("diamonds")}>Diamonds</button>
              <button className="secondary-button" type="button" onClick={() => void handleGuess("hearts")}>Hearts</button>
            </>
          ) : null}
        </div>

        <div className="button-row">
          <button className="secondary-button" type="button" onClick={() => void updateEmote("👍")}>👍</button>
          <button className="secondary-button" type="button" onClick={() => void updateEmote("👎")}>👎</button>
          <button className="secondary-button" type="button" onClick={() => void updateEmote("🔥")}>🔥</button>
        </div>
      </div>
    </div>
  );
};

export default RideTheBus;
