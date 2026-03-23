import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { DEFAULT_PROFILE_COLOR, normalizeProfileColor } from "../lib/profileColor";
import { supabase } from "../lib/supabase";
import {
  GWENT_PREMADE_SUMMARIES,
  applyPlayerAction,
  createMatch,
  getCardMeta,
  getFactionShieldPath,
  getPlayableRows,
  getRenderedCardPower,
  getRowTotal,
  getPlayerTotal,
  type GwentMatchState,
  type GwentPlayerAction,
  type GwentRow
} from "../lib/gwent/native";

type Mode = "online" | "classic";

type GwentPresence = {
  userId: string;
  username: string;
  color: string;
  deckIndex: number;
  onlineAt: string;
};

type BroadcastEnvelope =
  | { type: "state"; state: GwentMatchState | null }
  | { type: "action"; actorId: string; action: GwentPlayerAction }
  | { type: "sync-request" };

const roomNameForCode = (code: string) => `focusland-gwent-${code.toLowerCase()}`;

function getPlayersFromPresence(
  rawPresence: Record<string, Array<{ userId: string; username: string; color: string; deckIndex: number; onlineAt: string }>>
) {
  const deduped = new Map<string, GwentPresence>();
  Object.values(rawPresence)
    .flat()
    .forEach((entry) => {
      if (!deduped.has(entry.userId)) {
        deduped.set(entry.userId, {
          userId: entry.userId,
          username: entry.username,
          color: normalizeProfileColor(entry.color),
          deckIndex: Number.isFinite(entry.deckIndex) ? entry.deckIndex : 0,
          onlineAt: entry.onlineAt
        });
      }
    });
  return Array.from(deduped.values()).sort((left, right) =>
    left.onlineAt === right.onlineAt ? left.userId.localeCompare(right.userId) : left.onlineAt.localeCompare(right.onlineAt)
  );
}

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function BoardCard({
  cardIndex,
  power,
  selected,
  onClick
}: {
  cardIndex: number;
  power?: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  const meta = getCardMeta(cardIndex);
  return (
    <button className={`gwent-card ${selected ? "is-selected" : ""}`} onClick={onClick} type="button">
      <img alt={meta.name} src={meta.art} />
      <span className="gwent-card__name">{meta.name}</span>
      {typeof power === "number" ? <span className="gwent-card__power">{power}</span> : null}
    </button>
  );
}

const Gwent: React.FC = () => {
  const gwentUrl = `${import.meta.env.BASE_URL}gwent-classic/index.html`;
  const boardAssetUrl = `${import.meta.env.BASE_URL}gwent-classic/img/board.jpg`;
  const cursorAssetUrl = `${import.meta.env.BASE_URL}gwent-classic/img/icons/cursor.png`;
  const [mode, setMode] = useState<Mode>("online");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [joinedRoomCode, setJoinedRoomCode] = useState<string | null>(null);
  const [players, setPlayers] = useState<GwentPresence[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [currentColor, setCurrentColor] = useState(DEFAULT_PROFILE_COLOR);
  const [selectedDeckIndex, setSelectedDeckIndex] = useState(0);
  const [matchState, setMatchState] = useState<GwentMatchState | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Create a room or join one to start a GWENT table.");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<GwentRow | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const matchStateRef = useRef<GwentMatchState | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const playersRef = useRef<GwentPresence[]>([]);
  const joinedAtRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    matchStateRef.current = matchState;
  }, [matchState]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const localPresence = players.find((player) => player.userId === currentUserId) ?? null;
  const isHost = !!currentUserId && players[0]?.userId === currentUserId;
  const localPlayerIndex = matchState && currentUserId ? matchState.players.findIndex((player) => player.userId === currentUserId) : -1;
  const localPlayer = localPlayerIndex >= 0 && matchState ? matchState.players[localPlayerIndex] : null;
  const opponentPlayer = localPlayerIndex >= 0 && matchState ? matchState.players[localPlayerIndex === 0 ? 1 : 0] : null;
  const currentTurnUserId = matchState ? matchState.players[matchState.currentPlayerIndex]?.userId ?? null : null;
  const selectedHandCard = localPlayer?.hand.find((card) => card.instanceId === selectedCardId) ?? null;
  const selectedHandMeta = selectedHandCard ? getCardMeta(selectedHandCard.cardIndex) : null;
  const selectedCardRows = selectedHandCard ? getPlayableRows(selectedHandCard.cardIndex) : [];
  const roomFull = players.length >= 2 && !localPresence;

  const instruction = useMemo(() => {
    if (!matchState || !localPlayer || localPlayerIndex < 0) {
      return status;
    }
    if (matchState.phase === "redraw" && matchState.currentPlayerIndex === localPlayerIndex) {
      return `Redraw up to ${localPlayer.redrawsLeft} card${localPlayer.redrawsLeft === 1 ? "" : "s"}, then confirm.`;
    }
    if (matchState.phase === "choose-first-player" && matchState.players[localPlayerIndex].faction === "scoiatael") {
      return "Scoia'tael chooses who goes first.";
    }
    if (matchState.phase === "finished") {
      return matchState.winnerUserId === currentUserId ? "You won the match." : "Match finished.";
    }
    if (matchState.phase === "playing") {
      if (currentTurnUserId === currentUserId) {
        if (selectedHandMeta?.ability.includes("decoy")) {
          return "Select one of your non-hero units on the board, then play Decoy.";
        }
        if (selectedCardRows.length > 1 && !selectedRow) {
          return "Choose a row, then play the selected card.";
        }
        return "Your turn.";
      }
      return `${matchState.players[matchState.currentPlayerIndex]?.username ?? "Opponent"} is acting.`;
    }
    return status;
  }, [
    currentTurnUserId,
    currentUserId,
    localPlayer,
    localPlayerIndex,
    matchState,
    selectedCardRows.length,
    selectedHandMeta,
    selectedRow,
    status
  ]);

  const syncPresence = async () => {
    const channel = channelRef.current;
    if (!channel || !currentUserIdRef.current) {
      return;
    }
    const payload = {
      userId: currentUserIdRef.current,
      username: currentUsername,
      color: currentColor,
      deckIndex: selectedDeckIndex,
      onlineAt: joinedAtRef.current
    };
    await channel.track(payload);
  };

  const broadcastState = async (state: GwentMatchState | null) => {
    setMatchState(state);
    matchStateRef.current = state;
    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "gwent-message",
        payload: { type: "state", state } satisfies BroadcastEnvelope
      });
    }
  };

  const applyActionAsHost = async (actorId: string, action: GwentPlayerAction) => {
    const current = matchStateRef.current;
    if (!current) {
      return;
    }
    const next = applyPlayerAction(current, actorId, action);
    if (next !== current) {
      await broadcastState(next);
    }
  };

  useEffect(() => {
    let disposed = false;

    const setupIdentity = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session || disposed) {
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, color")
        .eq("id", session.user.id)
        .maybeSingle();

      setCurrentUserId(session.user.id);
      setCurrentUsername((profile?.username as string | null) ?? session.user.email ?? "Player");
      setCurrentColor(normalizeProfileColor((profile?.color as string | null) ?? DEFAULT_PROFILE_COLOR));
    };

    void setupIdentity();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!channelRef.current || !currentUserId) {
      return;
    }
    void syncPresence();
  }, [currentColor, currentUserId, currentUsername, selectedDeckIndex]);

  const leaveRoom = async () => {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setJoinedRoomCode(null);
    setPlayers([]);
    setMatchState(null);
    setConnected(false);
    setSelectedCardId(null);
    setSelectedRow(null);
    setSelectedTargetId(null);
    setStatus("Left the GWENT room.");
  };

  const joinRoom = async (roomCode: string) => {
    if (!currentUserId) {
      setStatus("You need to be signed in.");
      return;
    }

    await leaveRoom();

    const channel = supabase.channel(roomNameForCode(roomCode), {
      config: {
        presence: {
          key: currentUserId
        }
      }
    });

    channelRef.current = channel;
    setJoinedRoomCode(roomCode.toUpperCase());
    joinedAtRef.current = new Date().toISOString();

    channel.on("presence", { event: "sync" }, () => {
      const nextPlayers = getPlayersFromPresence(
        channel.presenceState() as Record<
          string,
          Array<{ userId: string; username: string; color: string; deckIndex: number; onlineAt: string }>
        >
      ).slice(0, 2);
      setPlayers(nextPlayers);
    });

    channel.on("broadcast", { event: "gwent-message" }, ({ payload }) => {
      const message = payload as BroadcastEnvelope;
      if (message.type === "state") {
        setMatchState(message.state);
        matchStateRef.current = message.state;
        return;
      }
      if (message.type === "sync-request") {
        if (playersRef.current[0]?.userId === currentUserIdRef.current && matchStateRef.current) {
          void broadcastState(matchStateRef.current);
        }
        return;
      }
      if (message.type === "action" && playersRef.current[0]?.userId === currentUserIdRef.current) {
        void applyActionAsHost(message.actorId, message.action);
      }
    });

    channel.subscribe(async (subscriptionStatus) => {
      if (subscriptionStatus !== "SUBSCRIBED") {
        return;
      }
      setConnected(true);
      await syncPresence();
      await channel.send({
        type: "broadcast",
        event: "gwent-message",
        payload: { type: "sync-request" } satisfies BroadcastEnvelope
      });
      setStatus(`Connected to room ${roomCode.toUpperCase()}.`);
    });
  };

  const sendAction = async (action: GwentPlayerAction) => {
    if (!currentUserId || !joinedRoomCode) {
      return;
    }
    if (isHost) {
      await applyActionAsHost(currentUserId, action);
      return;
    }
    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "gwent-message",
        payload: { type: "action", actorId: currentUserId, action } satisfies BroadcastEnvelope
      });
    }
  };

  const startMatch = async () => {
    if (!isHost || players.length !== 2) {
      return;
    }
    const nextMatch = createMatch(
      [
        {
          userId: players[0]!.userId,
          username: players[0]!.username,
          color: players[0]!.color,
          deckIndex: players[0]!.deckIndex
        },
        {
          userId: players[1]!.userId,
          username: players[1]!.username,
          color: players[1]!.color,
          deckIndex: players[1]!.deckIndex
        }
      ],
      players[0]!.userId
    );
    await broadcastState(nextMatch);
    setStatus("Match started.");
  };

  const handlePlaySelected = async () => {
    if (!selectedHandCard) {
      return;
    }
    await sendAction({
      type: "play-card",
      cardId: selectedHandCard.instanceId,
      row: selectedCardRows.length > 1 ? selectedRow ?? undefined : selectedCardRows[0],
      targetId: selectedTargetId ?? undefined
    });
    setSelectedCardId(null);
    setSelectedRow(null);
    setSelectedTargetId(null);
  };

  const canPlaySelected =
    !!selectedHandCard &&
    (!selectedHandMeta?.ability.includes("decoy") || !!selectedTargetId) &&
    (selectedCardRows.length <= 1 || !!selectedRow);

  return (
    <div className="page">
      <NavBar />
      <div
        className="content card gwent-native-page"
        style={
          {
            ["--gwent-board-url" as string]: `url(${boardAssetUrl})`,
            ["--gwent-cursor-url" as string]: `url(${cursorAssetUrl})`
          } as React.CSSProperties
        }
      >
        <div className="gwent-header">
          <div>
            <h2>GWENT</h2>
            <p>Native Focusland multiplayer for online matches, with the classic solo version still available.</p>
          </div>
          <div className="gwent-mode-tabs">
            <button className={mode === "online" ? "primary-button" : "secondary-button"} onClick={() => setMode("online")} type="button">
              Online
            </button>
            <button className={mode === "classic" ? "primary-button" : "secondary-button"} onClick={() => setMode("classic")} type="button">
              Solo Classic
            </button>
          </div>
        </div>

        {mode === "classic" ? (
          <iframe
            title="GWENT Classic"
            src={gwentUrl}
            style={{
              width: "100%",
              minHeight: "82vh",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: 18,
              background: "#0b1020"
            }}
            allowFullScreen
          />
        ) : (
          <div className="gwent-layout">
            <aside className="gwent-sidebar">
              <section className="gwent-panel">
                <h3>Room</h3>
                <p>{instruction}</p>
                <div className="gwent-room-actions">
                  <input
                    value={roomCodeInput}
                    onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                    placeholder="ROOM"
                    maxLength={8}
                  />
                  <button className="secondary-button" onClick={() => void joinRoom(roomCodeInput.trim() || createRoomCode())} type="button">
                    Join
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      const code = createRoomCode();
                      setRoomCodeInput(code);
                      void joinRoom(code);
                    }}
                    type="button"
                  >
                    Create
                  </button>
                </div>
                {joinedRoomCode ? (
                  <div className="gwent-room-meta">
                    <span>Room: {joinedRoomCode}</span>
                    <span>{connected ? "Connected" : "Connecting..."}</span>
                    <button className="secondary-button" onClick={() => void leaveRoom()} type="button">
                      Leave
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="gwent-panel">
                <h3>Deck</h3>
                <select
                  value={selectedDeckIndex}
                  onChange={(event) => setSelectedDeckIndex(Number(event.target.value))}
                  disabled={!!matchState}
                >
                  {GWENT_PREMADE_SUMMARIES.map((deck) => (
                    <option key={deck.index} value={deck.index}>
                      {deck.name} | {deck.faction} | {deck.cardCount} cards
                    </option>
                  ))}
                </select>
                <p>{GWENT_PREMADE_SUMMARIES[selectedDeckIndex]?.leaderName}</p>
              </section>

              <section className="gwent-panel">
                <h3>Players</h3>
                <div className="gwent-player-list">
                  {players.map((player, index) => (
                    <div className="gwent-player-pill" key={player.userId}>
                      <span className="gwent-player-pill__dot" style={{ background: player.color }} />
                      <strong>{player.username}</strong>
                      <span>{GWENT_PREMADE_SUMMARIES[player.deckIndex]?.name ?? "Deck"}</span>
                      {index === 0 ? <span>Host</span> : null}
                    </div>
                  ))}
                  {!players.length ? <p className="info">No one at the table yet.</p> : null}
                </div>
                <button className="primary-button" disabled={!isHost || players.length !== 2} onClick={() => void startMatch()} type="button">
                  Start Match
                </button>
                {roomFull ? <p className="info">This room already has two players.</p> : null}
              </section>

              <section className="gwent-panel">
                <h3>Log</h3>
                <div className="gwent-log">
                  {(matchState?.log ?? [status]).map((entry, index) => (
                    <div key={`${entry}-${index}`}>{entry}</div>
                  ))}
                </div>
              </section>
            </aside>

            <div className="gwent-board-wrap">
              {matchState && localPlayer && opponentPlayer ? (
                <>
                  <section className="gwent-scoreboard">
                    <div className="gwent-scoreboard__player">
                      <img alt={opponentPlayer.faction} className="gwent-faction-shield" src={getFactionShieldPath(opponentPlayer.faction)} />
                      <strong>{opponentPlayer.username}</strong>
                      <span>{opponentPlayer.deckName}</span>
                      <span>{getPlayerTotal(matchState, localPlayerIndex === 0 ? 1 : 0)} power</span>
                      <span>{opponentPlayer.roundWins} rounds</span>
                      <span>{opponentPlayer.hand.length} in hand</span>
                      {opponentPlayer.passed ? <span>Passed</span> : null}
                    </div>
                    <div className="gwent-scoreboard__center">
                      <strong>Round {matchState.roundNumber}</strong>
                      <span>{matchState.phase.replaceAll("-", " ")}</span>
                    </div>
                    <div className="gwent-scoreboard__player">
                      <img alt={localPlayer.faction} className="gwent-faction-shield" src={getFactionShieldPath(localPlayer.faction)} />
                      <strong>{localPlayer.username}</strong>
                      <span>{localPlayer.deckName}</span>
                      <span>{getPlayerTotal(matchState, localPlayerIndex)} power</span>
                      <span>{localPlayer.roundWins} rounds</span>
                      <span>{localPlayer.hand.length} in hand</span>
                      {localPlayer.passed ? <span>Passed</span> : null}
                    </div>
                  </section>

                  <section className="gwent-battlefield">
                    {[opponentPlayer, localPlayer].map((player, displayIndex) => {
                      const actualPlayerIndex = displayIndex === 0 ? (localPlayerIndex === 0 ? 1 : 0) : localPlayerIndex;
                      return (
                        <div className="gwent-side" key={player.userId}>
                          {(["close", "ranged", "siege"] as GwentRow[]).map((row) => (
                            <div className="gwent-row" key={`${player.userId}-${row}`}>
                              <div className="gwent-row__header">
                                <strong>{row}</strong>
                                <span>{getRowTotal(matchState, actualPlayerIndex, row)}</span>
                              </div>
                              <div className="gwent-row__cards">
                                {player.board[row].map((card) => (
                                  <BoardCard
                                    key={card.instanceId}
                                    cardIndex={card.cardIndex}
                                    power={getRenderedCardPower(matchState, card)}
                                    selected={selectedTargetId === card.instanceId}
                                    onClick={
                                      selectedHandMeta?.ability.includes("decoy") && actualPlayerIndex === localPlayerIndex && !getCardMeta(card.cardIndex).ability.includes("hero")
                                        ? () => setSelectedTargetId(card.instanceId)
                                        : undefined
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </section>

                  <section className="gwent-controls">
                    {matchState.phase === "redraw" && localPlayerIndex === matchState.currentPlayerIndex ? (
                      <div className="gwent-action-row">
                        <button className="secondary-button" disabled={localPlayer.redrawsLeft <= 0 || !selectedHandCard} onClick={() => void sendAction({ type: "redraw", cardId: selectedHandCard!.instanceId })} type="button">
                          Redraw Selected
                        </button>
                        <button className="primary-button" onClick={() => void sendAction({ type: "finish-redraw" })} type="button">
                          Confirm Hand
                        </button>
                      </div>
                    ) : null}

                    {matchState.phase === "choose-first-player" && localPlayerIndex === matchState.currentPlayerIndex ? (
                      <div className="gwent-action-row">
                        <button className="secondary-button" onClick={() => void sendAction({ type: "choose-first-player", firstPlayerIndex: localPlayerIndex })} type="button">
                          I Go First
                        </button>
                        <button className="secondary-button" onClick={() => void sendAction({ type: "choose-first-player", firstPlayerIndex: localPlayerIndex === 0 ? 1 : 0 })} type="button">
                          Opponent First
                        </button>
                      </div>
                    ) : null}

                    {matchState.phase === "playing" && currentTurnUserId === currentUserId ? (
                      <div className="gwent-action-row">
                        {selectedCardRows.length > 1 ? (
                          <div className="gwent-row-picker">
                            {selectedCardRows.map((row) => (
                              <button
                                key={row}
                                className={selectedRow === row ? "primary-button" : "secondary-button"}
                                onClick={() => setSelectedRow(row)}
                                type="button"
                              >
                                {row}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <button className="primary-button" disabled={!canPlaySelected} onClick={() => void handlePlaySelected()} type="button">
                          Play Selected
                        </button>
                        <button className="secondary-button" disabled={localPlayer.leaderUsed} onClick={() => void sendAction({ type: "use-leader" })} type="button">
                          Use Leader
                        </button>
                        <button className="secondary-button" onClick={() => void sendAction({ type: "pass" })} type="button">
                          Pass
                        </button>
                      </div>
                    ) : null}

                    <div className="gwent-hand">
                      {localPlayer.hand.map((card) => {
                        return (
                          <BoardCard
                            key={card.instanceId}
                            cardIndex={card.cardIndex}
                            selected={selectedCardId === card.instanceId}
                            onClick={() => {
                              setSelectedCardId(card.instanceId);
                              setSelectedRow(getPlayableRows(card.cardIndex).length === 1 ? getPlayableRows(card.cardIndex)[0]! : null);
                              setSelectedTargetId(null);
                            }}
                          />
                        );
                      })}
                    </div>
                  </section>
                </>
              ) : (
                <section className="gwent-empty-state">
                  <h3>Online Table</h3>
                  <p>Use the room controls to create a table, invite another player, and start a native multiplayer GWENT match.</p>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Gwent;
