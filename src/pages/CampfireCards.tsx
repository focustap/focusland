import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { createCampfireAudioController, type CampfireAudioController } from "../lib/campfire-cards/audio";
import {
  CAMPFIRE_LIMITS,
  campfireReducer,
  createEmptyCampfireState,
  sanitizeCustomCard,
  type CampfireAction,
  type CampfirePresencePlayer,
  type CampfireState
} from "../lib/campfire-cards/game";
import { CAMPFIRE_CARD_PACKS } from "../lib/campfire-cards/packs";
import { supabase } from "../lib/supabase";

const ROOM_NAME = "focusland-campfire-cards";
const STATE_EVENT = "campfire-state";
const ACTION_EVENT = "campfire-action";

type OverlayId = "packs" | "writeins" | "rules" | "settings";

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

  const deduped = new Map<string, CampfirePresencePlayer>();
  players.forEach((player) => {
    if (!deduped.has(player.userId)) {
      deduped.set(player.userId, player);
    }
  });

  return Array.from(deduped.values()).sort((a, b) => a.onlineAt.localeCompare(b.onlineAt));
}

const CampfireCards: React.FC = () => {
  const [players, setPlayers] = useState<CampfirePresencePlayer[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [connected, setConnected] = useState(false);
  const [roomFull, setRoomFull] = useState(false);
  const [state, setState] = useState<CampfireState>(() => createEmptyCampfireState());
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [redrawMode, setRedrawMode] = useState(false);
  const [redrawSelection, setRedrawSelection] = useState<string[]>([]);
  const [customTextA, setCustomTextA] = useState("");
  const [customTextB, setCustomTextB] = useState("");
  const [musicOn, setMusicOn] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<OverlayId | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stateRef = useRef<CampfireState>(createEmptyCampfireState());
  const playersRef = useRef<CampfirePresencePlayer[]>([]);
  const currentUserIdRef = useRef<string | null>(null);
  const audioRef = useRef<CampfireAudioController | null>(null);
  const previousPhaseRef = useRef<CampfireState["phase"]>("lobby");
  const previousSubmissionCountRef = useRef(0);

  const seatedPlayers = players.slice(0, CAMPFIRE_LIMITS.maxPlayers);
  const isSeated = currentUserId ? seatedPlayers.some((player) => player.userId === currentUserId) : false;
  const isHost = Boolean(currentUserId && seatedPlayers[0]?.userId === currentUserId);
  const hostName = seatedPlayers[0]?.username ?? "Host";
  const gamePlayer = currentUserId ? state.players.find((player) => player.userId === currentUserId) ?? null : null;
  const judge = state.players[state.judgeIndex] ?? null;
  const isJudge = Boolean(currentUserId && judge?.userId === currentUserId);
  const alreadySubmitted = Boolean(currentUserId && state.submissions.some((submission) => submission.playerId === currentUserId));
  const submissionsNeeded = Math.max(0, state.players.length - 1);
  const selectedCard = gamePlayer?.hand.find((card) => card.id === selectedCardId) ?? null;
  const winnerSubmission = state.revealedSubmissions.find((submission) => submission.id === state.winningSubmissionId) ?? null;
  const roundWinner = winnerSubmission
    ? state.players.find((player) => player.userId === winnerSubmission.playerId) ?? null
    : null;
  const matchWinner = state.matchWinnerId
    ? state.players.find((player) => player.userId === state.matchWinnerId) ?? null
    : null;
  const inLobby = state.phase === "lobby" || state.phase === "customCards";
  const inPlay =
    state.phase === "submitting" ||
    state.phase === "locked" ||
    state.phase === "judging" ||
    state.phase === "winner" ||
    state.phase === "gameOver";

  const selectedPackNames = useMemo(
    () =>
      CAMPFIRE_CARD_PACKS.filter((pack) => state.enabledPackIds.includes(pack.id))
        .map((pack) => pack.name)
        .join(", "),
    [state.enabledPackIds]
  );

  const displayPlayers = state.players.length
    ? state.players
    : seatedPlayers.map((player) => ({
        userId: player.userId,
        username: player.username,
        score: 0,
        hand: [],
        redrawsLeft: CAMPFIRE_LIMITS.startingRedraws,
        customCardsSubmitted: 0
      }));

  const applyIncomingState = (nextState: CampfireState) => {
    stateRef.current = nextState;
    setState(nextState);
  };

  const broadcastState = async (nextState: CampfireState) => {
    applyIncomingState(nextState);
    await channelRef.current?.send({
      type: "broadcast",
      event: STATE_EVENT,
      payload: nextState
    });
  };

  const applyHostAction = async (action: CampfireAction) => {
    const nextState = campfireReducer(stateRef.current, action);
    await broadcastState(nextState);
  };

  const sendAction = async (action: CampfireAction) => {
    if (!channelRef.current) return;
    if (isHost) {
      await applyHostAction(action);
      return;
    }
    await channelRef.current.send({
      type: "broadcast",
      event: ACTION_EVENT,
      payload: action
    });
  };

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    audioRef.current = createCampfireAudioController();
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioRef.current?.setMusicEnabled(musicOn);
  }, [musicOn]);

  useEffect(() => {
    audioRef.current?.setMuted(audioMuted);
  }, [audioMuted]);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    if (state.submissions.length > previousSubmissionCountRef.current) {
      audioRef.current?.play("submit");
    }
    if (previousPhase !== state.phase) {
      if (state.phase === "submitting") audioRef.current?.play("deal");
      if (state.phase === "judging") audioRef.current?.play("reveal");
      if (state.phase === "winner") audioRef.current?.play("pick");
      if (state.phase === "gameOver") audioRef.current?.play("win");
    }
    previousPhaseRef.current = state.phase;
    previousSubmissionCountRef.current = state.submissions.length;
  }, [state.phase, state.submissions.length]);

  useEffect(() => {
    if (!gamePlayer?.hand.some((card) => card.id === selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [gamePlayer?.hand, selectedCardId]);

  useEffect(() => {
    let isUnmounted = false;

    const syncPresence = () => {
      const channel = channelRef.current;
      if (!channel) return;
      const presentPlayers = getPlayersFromPresence(
        channel.presenceState() as Record<string, Array<{ userId: string; username: string; onlineAt: string }>>
      );
      const seated = presentPlayers.slice(0, CAMPFIRE_LIMITS.maxPlayers);
      if (isUnmounted) return;
      playersRef.current = seated;
      setPlayers(seated);
      const full = presentPlayers.length >= CAMPFIRE_LIMITS.maxPlayers && !seated.some((player) => player.userId === currentUserIdRef.current);
      setRoomFull(full);
      if (seated[0]?.userId === currentUserIdRef.current) {
        void applyHostAction({ type: "sync-players", players: seated });
      }
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

      const username = (((profile?.username as string | null) ?? session.user.email ?? "Player").trim() || "Player").slice(0, 32);
      setCurrentUserId(session.user.id);
      setCurrentUsername(username);

      const channel = supabase.channel(ROOM_NAME, {
        config: { presence: { key: session.user.id } }
      });
      channelRef.current = channel;

      channel.on("presence", { event: "sync" }, syncPresence);
      channel.on("broadcast", { event: STATE_EVENT }, ({ payload }) => {
        applyIncomingState(payload as CampfireState);
      });
      channel.on("broadcast", { event: ACTION_EVENT }, ({ payload }) => {
        if (playersRef.current[0]?.userId !== currentUserIdRef.current) return;
        void applyHostAction(payload as CampfireAction);
      });

      channel.subscribe(async (subscriptionStatus) => {
        if (subscriptionStatus !== "SUBSCRIBED" || isUnmounted) return;
        const present = getPlayersFromPresence(
          channel.presenceState() as Record<string, Array<{ userId: string; username: string; onlineAt: string }>>
        );
        if (present.length >= CAMPFIRE_LIMITS.maxPlayers && !present.some((player) => player.userId === session.user.id)) {
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
          syncPresence();
        }
      });
    };

    void setup();

    return () => {
      isUnmounted = true;
      setConnected(false);
      const channel = channelRef.current;
      if (channel) {
        void supabase.removeChannel(channel);
        channelRef.current = null;
      }
    };
  }, []);

  const togglePack = (packId: string) => {
    if (!isHost || (state.phase !== "lobby" && state.phase !== "customCards")) return;
    const enabledPackIds = state.enabledPackIds.includes(packId)
      ? state.enabledPackIds.filter((id) => id !== packId)
      : [...state.enabledPackIds, packId];
    void sendAction({ type: "configure", enabledPackIds, targetScore: state.targetScore });
  };

  const updateTargetScore = (targetScore: number) => {
    if (!isHost) return;
    void sendAction({ type: "configure", enabledPackIds: state.enabledPackIds, targetScore });
  };

  const submitCustomCards = () => {
    if (!currentUserId) return;
    const cards = [customTextA, customTextB].map(sanitizeCustomCard).filter(Boolean);
    void sendAction({ type: "add-custom-cards", playerId: currentUserId, cards });
    setCustomTextA("");
    setCustomTextB("");
  };

  const startGame = () => {
    void sendAction({ type: "start-game", players: seatedPlayers });
  };

  const submitAnswer = () => {
    if (!currentUserId || !selectedCard) return;
    void sendAction({ type: "submit-answer", playerId: currentUserId, cardId: selectedCard.id });
    setSelectedCardId(null);
  };

  const toggleRedrawCard = (cardId: string) => {
    setRedrawSelection((current) =>
      current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]
    );
  };

  const confirmRedraw = () => {
    if (!currentUserId || redrawSelection.length === 0 || redrawSelection.length >= CAMPFIRE_LIMITS.handSize) return;
    void sendAction({ type: "redraw", playerId: currentUserId, cardIds: redrawSelection });
    setRedrawSelection([]);
    setRedrawMode(false);
  };

  const statusText = roomFull && !isSeated
    ? "Room full"
    : connected
      ? `${currentUsername}${isHost ? " hosting" : ""}`
      : "Joining campfire...";

  return (
    <div className="page campfire-page">
      <NavBar />
      <div className="campfire-embers" aria-hidden="true">
        {Array.from({ length: 22 }).map((_, index) => (
          <span key={index} style={{ "--ember-index": index } as React.CSSProperties} />
        ))}
      </div>

      <main className="campfire-game-shell">
        <header className="campfire-game-hud">
          <div>
            <p className="campfire-kicker">Focusland party table</p>
            <h1>Campfire Cards</h1>
            <p>{state.message}</p>
          </div>
          <div className="campfire-game-controls">
            <button type="button" className="campfire-icon-button" onClick={() => setActiveOverlay("packs")}>Packs</button>
            <button type="button" className="campfire-icon-button" onClick={() => setActiveOverlay("writeins")}>Write-ins</button>
            <button type="button" className="campfire-icon-button" onClick={() => setActiveOverlay("rules")}>Rules</button>
            <button type="button" className="campfire-icon-button" onClick={() => setActiveOverlay("settings")}>Settings</button>
            <button type="button" className="campfire-icon-button" onClick={() => setMusicOn((value) => !value)} title="Toggle music">
              {musicOn ? "Music on" : "Music off"}
            </button>
            <button type="button" className="campfire-icon-button" onClick={() => setAudioMuted((value) => !value)} title="Toggle sound">
              {audioMuted ? "Sound off" : "Sound on"}
            </button>
          </div>
        </header>

        {roomFull && !isSeated ? (
          <section className="campfire-full-message">
            <h2>This campfire is full</h2>
            <p>Eight players are seated. You can wait here until a seat opens.</p>
          </section>
        ) : (
          <section className={`campfire-game-stage campfire-game-stage--${state.phase}`}>
            <div className="campfire-tabletop">
              <div className="campfire-room-chip campfire-room-chip--floating">
                <span>{statusText}</span>
                <strong>{Math.min(seatedPlayers.length, CAMPFIRE_LIMITS.maxPlayers)}/{CAMPFIRE_LIMITS.maxPlayers}</strong>
              </div>
              <div className="campfire-room-chip campfire-room-chip--packs">
                <span>Packs</span>
                <strong>{selectedPackNames || "None"}</strong>
              </div>

              <div className="campfire-seats" aria-label="Players around the table">
                {Array.from({ length: CAMPFIRE_LIMITS.maxPlayers }).map((_, index) => {
                  const player = displayPlayers[index] ?? null;
                  const seatStyle = { "--seat-index": index } as React.CSSProperties;
                  return player ? (
                    <div
                      key={player.userId}
                      style={seatStyle}
                      className={`campfire-player-seat${judge?.userId === player.userId ? " is-judge" : ""}${player.userId === currentUserId ? " is-you" : ""}`}
                    >
                      <div className="campfire-avatar" aria-hidden="true">{player.username.slice(0, 1).toUpperCase()}</div>
                      <div>
                        <strong>{player.username}{player.userId === currentUserId ? " (you)" : ""}</strong>
                        <span>{judge?.userId === player.userId ? "Card Czar" : `${player.score}/${state.targetScore} sparks`}</span>
                      </div>
                    </div>
                  ) : (
                    <div key={`empty-seat-${index}`} style={seatStyle} className="campfire-empty-seat">
                      <span>Open seat</span>
                    </div>
                  );
                })}
              </div>

              <div className="campfire-centerpiece">
                <div className="campfire-fire" aria-hidden="true">
                  <div className="campfire-flame campfire-flame--one" />
                  <div className="campfire-flame campfire-flame--two" />
                  <div className="campfire-flame campfire-flame--three" />
                  <div className="campfire-logs" />
                </div>
                <div className="campfire-phase-card">
                  <span>{state.phase}</span>
                  <strong>Round {state.round || 0}</strong>
                  <p>{judge ? `${judge.username} is the Card Czar.` : `Host: ${hostName}`}</p>
                </div>
                {state.currentPrompt ? (
                  <article className="campfire-prompt-card">
                    <span>Prompt</span>
                    <p>{state.currentPrompt.text}</p>
                  </article>
                ) : (
                  <article className="campfire-prompt-card">
                    <span>Waiting at the campfire</span>
                    <p>Gather 3-8 players, choose packs, and add two write-ins before the first prompt drops.</p>
                  </article>
                )}
              </div>

              {inLobby && (
                <div className="campfire-lobby-bar">
                  {isHost && (
                    <button className="campfire-primary" type="button" onClick={startGame} disabled={seatedPlayers.length < CAMPFIRE_LIMITS.minPlayers}>
                      {seatedPlayers.length < CAMPFIRE_LIMITS.minPlayers ? "Need 3 players" : "Start game"}
                    </button>
                  )}
                  <button type="button" className="campfire-secondary" onClick={() => setActiveOverlay("packs")}>Choose packs</button>
                  <button type="button" className="campfire-secondary" onClick={() => setActiveOverlay("writeins")}>Add write-ins</button>
                  <button type="button" className="campfire-secondary" onClick={() => setActiveOverlay("rules")}>How to play</button>
                </div>
              )}

              {inPlay && (
                <>
                  <div className="campfire-submission-tray">
                    <h2>Submissions</h2>
                    {state.phase === "submitting" || state.phase === "locked" ? (
                      <div className="campfire-facedown-row">
                        {Array.from({ length: submissionsNeeded }).map((_, index) => (
                          <div key={index} className={`campfire-card-back${index < state.submissions.length ? " is-filled" : ""}`}>
                            <span>{index < state.submissions.length ? "Submitted" : "Waiting"}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="campfire-reveal-grid">
                        {state.revealedSubmissions.map((submission) => (
                          <button
                            key={submission.id}
                            type="button"
                            className={`campfire-answer-card campfire-answer-card--reveal${submission.id === state.winningSubmissionId ? " is-winner" : ""}`}
                            onClick={() => currentUserId && void sendAction({ type: "choose-winner", judgeId: currentUserId, submissionId: submission.id })}
                            disabled={!isJudge || state.phase !== "judging"}
                          >
                            <span>Anonymous answer</span>
                            <strong>{submission.card.text}</strong>
                          </button>
                        ))}
                      </div>
                    )}
                    {state.phase === "locked" && isJudge && (
                      <button className="campfire-primary" type="button" onClick={() => currentUserId && void sendAction({ type: "reveal-submissions", judgeId: currentUserId })}>
                        Reveal answers
                      </button>
                    )}
                    {state.phase === "winner" && (
                      <div className="campfire-winner-banner">
                        <strong>{roundWinner?.username ?? "Someone"} wins the round</strong>
                        <span>{winnerSubmission?.card.text}</span>
                        {isHost && (
                          <button className="campfire-primary" type="button" onClick={() => currentUserId && void sendAction({ type: "next-round", hostId: currentUserId })}>
                            Next round
                          </button>
                        )}
                      </div>
                    )}
                    {state.phase === "gameOver" && (
                      <div className="campfire-winner-banner">
                        <strong>{matchWinner?.username ?? "Winner"} wins the match</strong>
                        <span>Final spark count reached.</span>
                        {isHost && (
                          <button className="campfire-primary" type="button" onClick={() => void sendAction({ type: "reset", players: seatedPlayers })}>
                            New lobby
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="campfire-hand-dock">
                    <div className="campfire-hand-header">
                      <div>
                        <h2>Your Hand</h2>
                        <p>{isJudge ? "You are judging. Enjoy the power." : alreadySubmitted ? "Submitted. Waiting for the reveal." : "Pick your strongest nonsense."}</p>
                      </div>
                      <strong>Redraws left: {gamePlayer?.redrawsLeft ?? 0}</strong>
                    </div>
                    <div className="campfire-hand">
                      {gamePlayer?.hand.map((card) => {
                        const selectedForRedraw = redrawSelection.includes(card.id);
                        return (
                          <button
                            key={card.id}
                            type="button"
                            className={`campfire-answer-card${selectedCardId === card.id ? " is-selected" : ""}${selectedForRedraw ? " is-redraw" : ""}`}
                            onClick={() => redrawMode ? toggleRedrawCard(card.id) : setSelectedCardId(card.id)}
                            disabled={isJudge || alreadySubmitted || state.phase !== "submitting"}
                          >
                            <span>{card.packId === "custom" ? "Write-in" : card.packId}</span>
                            <strong>{card.text}</strong>
                          </button>
                        );
                      })}
                    </div>
                    <div className="campfire-actions">
                      <button className="campfire-primary" type="button" onClick={submitAnswer} disabled={!selectedCard || isJudge || alreadySubmitted || state.phase !== "submitting" || redrawMode}>
                        Submit answer
                      </button>
                      <button className="campfire-secondary" type="button" onClick={() => setRedrawMode((value) => !value)} disabled={isJudge || alreadySubmitted || state.phase !== "submitting" || !gamePlayer?.redrawsLeft}>
                        {redrawMode ? "Cancel redraw" : "Redraw cards"}
                      </button>
                      {redrawMode && (
                        <button className="campfire-secondary" type="button" onClick={confirmRedraw} disabled={redrawSelection.length < 1 || redrawSelection.length >= CAMPFIRE_LIMITS.handSize}>
                          Redraw {redrawSelection.length}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {activeOverlay && (
          <div className="campfire-overlay" role="dialog" aria-modal="true">
            <div className="campfire-overlay-card">
              <div className="campfire-overlay-header">
                <div>
                  <span>{activeOverlay}</span>
                  <h2>
                    {activeOverlay === "packs" && "Pack Selection"}
                    {activeOverlay === "writeins" && "Custom Write-ins"}
                    {activeOverlay === "rules" && "How to Play"}
                    {activeOverlay === "settings" && "Room Settings"}
                  </h2>
                </div>
                <button type="button" className="campfire-icon-button" onClick={() => setActiveOverlay(null)}>Close</button>
              </div>

              {activeOverlay === "packs" && (
                <>
                  <p className="campfire-overlay-copy">Host chooses which original packs are shuffled into this room.</p>
                  <div className="campfire-pack-grid">
                    {CAMPFIRE_CARD_PACKS.map((pack) => (
                      <button
                        key={pack.id}
                        type="button"
                        className={`campfire-pack${state.enabledPackIds.includes(pack.id) ? " is-enabled" : ""}`}
                        onClick={() => togglePack(pack.id)}
                        disabled={!isHost || !inLobby}
                      >
                        <strong>{pack.name}</strong>
                        <span>{pack.description}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {activeOverlay === "writeins" && (
                <>
                  <p className="campfire-overlay-copy">Add up to 2 room cards. Empty cards are ignored and cards are capped at {CAMPFIRE_LIMITS.maxCustomCardLength} characters.</p>
                  <label className="campfire-field">
                    <span>Custom card 1</span>
                    <input value={customTextA} maxLength={CAMPFIRE_LIMITS.maxCustomCardLength} onChange={(event) => setCustomTextA(event.target.value)} />
                  </label>
                  <label className="campfire-field">
                    <span>Custom card 2</span>
                    <input value={customTextB} maxLength={CAMPFIRE_LIMITS.maxCustomCardLength} onChange={(event) => setCustomTextB(event.target.value)} />
                  </label>
                  <button className="campfire-primary" type="button" onClick={submitCustomCards} disabled={!currentUserId || gamePlayer?.customCardsSubmitted === 2 || !inLobby}>
                    Add write-ins
                  </button>
                  <div className="campfire-custom-list">
                    {state.customRoomCards.filter((card) => !card.reported).map((card) => (
                      <span key={card.id}>
                        {card.text}
                        {(isHost || card.authorId === currentUserId) && (
                          <button type="button" onClick={() => currentUserId && void sendAction({ type: "remove-custom-card", requesterId: currentUserId, cardId: card.id })}>
                            remove
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {activeOverlay === "rules" && (
                <div className="campfire-rules-list">
                  <p>3 to 8 players sit at the campfire. One player is the Card Czar each round.</p>
                  <p>Everyone except the judge secretly submits one answer. Submitted cards immediately refill back to 7.</p>
                  <p>When all answers are in, the judge reveals the anonymous pile and chooses the funniest answer.</p>
                  <p>The round winner gets 1 spark. Judge rotates. First to {state.targetScore} sparks wins.</p>
                  <p>Each player has 3 redraws. Redraw 1-6 cards before submitting, never during judging.</p>
                </div>
              )}

              {activeOverlay === "settings" && (
                <>
                  <p className="campfire-overlay-copy">Host: {hostName}. Start is locked until 3 seated players are present.</p>
                  <label className="campfire-field">
                    <span>Score to win</span>
                    <input
                      type="number"
                      min={3}
                      max={15}
                      value={state.targetScore}
                      disabled={!isHost || !inLobby}
                      onChange={(event) => updateTargetScore(Number(event.target.value))}
                    />
                  </label>
                  {isHost && (
                    <button className="campfire-primary" type="button" onClick={startGame} disabled={seatedPlayers.length < CAMPFIRE_LIMITS.minPlayers || !inLobby}>
                      {seatedPlayers.length < CAMPFIRE_LIMITS.minPlayers ? "Need 3 players" : "Start game"}
                    </button>
                  )}
                  <div className="campfire-room-chip">
                    <span>Room</span>
                    <strong>{Math.min(seatedPlayers.length, CAMPFIRE_LIMITS.maxPlayers)}/{CAMPFIRE_LIMITS.maxPlayers} seated</strong>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CampfireCards;
