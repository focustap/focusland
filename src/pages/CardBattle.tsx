import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import GameBoard from "../components/card-game/GameBoard";
import { canUnitAttack, cardGameReducer, createInitialGameState } from "../lib/card-game/engine";
import { getActiveDeckList } from "../lib/card-game/deckBuilding";
import { loadDeckStateForCurrentUser } from "../lib/card-game/deckStorage";
import { recordCardDuelWin } from "../lib/progression";
import { supabase } from "../lib/supabase";
import { TAPDECK_AUDIO, createTapDeckTrack, ensureAudioPlayback, syncTrackToTimestamp } from "../lib/tapDeckAudio";
import type { GameAction, GameState, PlayerIndex } from "../lib/card-game/types";

type PlayerPresence = {
  userId: string;
  username: string;
  onlineAt: string;
  deckList?: string[];
};

type BattleMusicPayload = {
  trackIndex: number;
  startAtMs: number;
};

const ROOM_NAME = "focusland-card-duel";
const WAITING_STATE = createInitialGameState();

const getPlayersFromPresence = (
  rawPresence: Record<string, Array<{ userId: string; username: string; onlineAt: string; deckList?: string[] }>>
) => {
  const players = Object.values(rawPresence)
    .flat()
    .map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      onlineAt: entry.onlineAt,
      deckList: entry.deckList
    }));

  const deduped = new Map<string, PlayerPresence>();
  players.forEach((player) => {
    if (!deduped.has(player.userId)) {
      deduped.set(player.userId, player);
    }
  });

  return Array.from(deduped.values()).sort((a, b) => a.onlineAt.localeCompare(b.onlineAt));
};

const CardBattle: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(WAITING_STATE);
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [connected, setConnected] = useState(false);
  const [roomFull, setRoomFull] = useState(false);
  const [status, setStatus] = useState("Joining duel room...");
  const [animatedAttackerId, setAnimatedAttackerId] = useState<string | null>(null);
  const [impactedUnitId, setImpactedUnitId] = useState<string | null>(null);
  const [impactedHeroSide, setImpactedHeroSide] = useState<"top" | "bottom" | null>(null);
  const [drawPulseSide, setDrawPulseSide] = useState<"top" | "bottom" | null>(null);
  const [showTurnBanner, setShowTurnBanner] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stateRef = useRef<GameState>(WAITING_STATE);
  const previousStateRef = useRef<GameState | null>(null);
  const startedPairKeyRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const playersRef = useRef<PlayerPresence[]>([]);
  const localDeckRef = useRef<string[]>([]);
  const recordedWinKeyRef = useRef<string | null>(null);
  const attackTimeoutRef = useRef<number | null>(null);
  const drawTimeoutRef = useRef<number | null>(null);
  const turnBannerTimeoutRef = useRef<number | null>(null);
  const battleMusicRef = useRef<HTMLAudioElement | null>(null);
  const battleTrackIndexRef = useRef<number>(-1);
  const battleUnlockCleanupRef = useRef<(() => void) | null>(null);

  const applyIncomingState = (nextState: GameState) => {
    previousStateRef.current = stateRef.current;
    stateRef.current = nextState;
    setGameState(nextState);
  };

  const seatedPlayers = players.slice(0, 2);
  const currentSeatIndex = useMemo(() => {
    if (!currentUserId) {
      return null;
    }

    const seat = seatedPlayers.findIndex((player) => player.userId === currentUserId);
    return seat >= 0 ? (seat as 0 | 1) : null;
  }, [currentUserId, seatedPlayers]);

  const isHost = Boolean(currentUserId && seatedPlayers[0]?.userId === currentUserId);
  const hasTwoPlayers = seatedPlayers.length === 2;
  const canRespondToTrap =
    hasTwoPlayers &&
    currentSeatIndex !== null &&
    gameState.pendingTrapPrompt !== null &&
    gameState.pendingTrapPrompt.trapOwner === currentSeatIndex;
  const canAct =
    hasTwoPlayers &&
    currentSeatIndex !== null &&
    gameState.winner === null &&
    gameState.pendingTrapPrompt === null &&
    gameState.activePlayer === currentSeatIndex;

  const playSharedBattleTrack = (payload: BattleMusicPayload) => {
    const trackSrc = TAPDECK_AUDIO.battleTracks[payload.trackIndex];
    if (!trackSrc) {
      return;
    }

    const audio = battleMusicRef.current;
    if (!audio || audio.src !== trackSrc) {
      if (battleMusicRef.current) {
        battleMusicRef.current.pause();
      }

      const nextAudio = createTapDeckTrack(trackSrc, 0.28);
      nextAudio.onended = () => {
        if (currentUserIdRef.current && playersRef.current[0]?.userId === currentUserIdRef.current) {
          const nextTrackIndex = (payload.trackIndex + 1 + Math.floor(Math.random() * 2)) % TAPDECK_AUDIO.battleTracks.length;
          battleTrackIndexRef.current = nextTrackIndex;
          void channelRef.current?.send({
            type: "broadcast",
            event: "tapdeck-music",
            payload: {
              trackIndex: nextTrackIndex,
              startAtMs: Date.now() + 250
            } satisfies BattleMusicPayload
          });
        }
      };
      battleMusicRef.current = nextAudio;
    }

    battleTrackIndexRef.current = payload.trackIndex;
    syncTrackToTimestamp(battleMusicRef.current, payload.startAtMs);
    battleUnlockCleanupRef.current?.();
    battleUnlockCleanupRef.current = ensureAudioPlayback(battleMusicRef.current);
  };

  useEffect(() => {
    if (currentSeatIndex === null) {
      setSelectedAttackerId(null);
      return;
    }

    const selectedUnit = gameState.players[currentSeatIndex].board.find((unit) => unit.instanceId === selectedAttackerId);

    if (!selectedUnit || !canUnitAttack(selectedUnit) || !canAct) {
      setSelectedAttackerId(null);
    }
  }, [canAct, currentSeatIndex, gameState.players, selectedAttackerId]);

  useEffect(() => {
    if (gameState.winner === null || currentSeatIndex === null || gameState.winner !== currentSeatIndex) {
      return;
    }

    const winKey = `${players.map((player) => player.userId).join(":")}:${gameState.turnNumber}:${gameState.winner}`;
    if (recordedWinKeyRef.current === winKey) {
      return;
    }

    recordedWinKeyRef.current = winKey;
    void recordCardDuelWin();
  }, [currentSeatIndex, gameState.turnNumber, gameState.winner, players]);

  useEffect(() => {
    const previous = previousStateRef.current;
    if (!previous) {
      return;
    }

    const sides: Array<{ player: PlayerIndex; side: "top" | "bottom" }> =
      currentSeatIndex === 0
        ? [
            { player: 1, side: "top" },
            { player: 0, side: "bottom" }
          ]
        : currentSeatIndex === 1
          ? [
              { player: 0, side: "top" },
              { player: 1, side: "bottom" }
            ]
          : [
              { player: 0, side: "top" },
              { player: 1, side: "bottom" }
            ];

    for (const entry of sides) {
      const prevPlayer = previous.players[entry.player];
      const nextPlayer = gameState.players[entry.player];
      if (nextPlayer.hand.length > prevPlayer.hand.length && nextPlayer.deck.length < prevPlayer.deck.length) {
        window.clearTimeout(drawTimeoutRef.current ?? undefined);
        setDrawPulseSide(entry.side);
        drawTimeoutRef.current = window.setTimeout(() => setDrawPulseSide(null), 850);
        break;
      }
    }

    let nextAnimatedAttackerId: string | null = null;
    let nextImpactedUnitId: string | null = null;
    let nextImpactedHeroSide: "top" | "bottom" | null = null;

    for (const attackSide of sides) {
      const defenseSide = sides.find((item) => item.player !== attackSide.player);
      if (!defenseSide) {
        continue;
      }

      const prevAttackerBoard = previous.players[attackSide.player].board;
      const nextAttackerBoard = gameState.players[attackSide.player].board;
      const freshlySpent = nextAttackerBoard.find((unit) => {
        const before = prevAttackerBoard.find((entry) => entry.instanceId === unit.instanceId);
        return before && !before.exhausted && unit.exhausted;
      });

      if (!freshlySpent) {
        continue;
      }

      nextAnimatedAttackerId = freshlySpent.instanceId;
      const prevDefender = previous.players[defenseSide.player];
      const nextDefender = gameState.players[defenseSide.player];
      const impactedUnit = nextDefender.board.find((unit) => {
        const before = prevDefender.board.find((entry) => entry.instanceId === unit.instanceId);
        return before && unit.currentHealth < before.currentHealth;
      });

      if (impactedUnit) {
        nextImpactedUnitId = impactedUnit.instanceId;
      } else if (nextDefender.health < prevDefender.health) {
        nextImpactedHeroSide = defenseSide.side;
      }
      break;
    }

    if (nextAnimatedAttackerId || nextImpactedUnitId || nextImpactedHeroSide) {
      window.clearTimeout(attackTimeoutRef.current ?? undefined);
      setAnimatedAttackerId(nextAnimatedAttackerId);
      setImpactedUnitId(nextImpactedUnitId);
      setImpactedHeroSide(nextImpactedHeroSide);
      attackTimeoutRef.current = window.setTimeout(() => {
        setAnimatedAttackerId(null);
        setImpactedUnitId(null);
        setImpactedHeroSide(null);
      }, 700);
    }
  }, [currentSeatIndex, gameState]);

  useEffect(() => {
    if (!canAct) {
      return;
    }

    window.clearTimeout(turnBannerTimeoutRef.current ?? undefined);
    setShowTurnBanner(true);
    turnBannerTimeoutRef.current = window.setTimeout(() => setShowTurnBanner(false), 1600);
  }, [canAct, gameState.turnNumber]);

  useEffect(() => {
    let isUnmounted = false;

    const syncPresence = () => {
      const channel = channelRef.current;
      if (!channel) {
        return;
      }

      const presentPlayers = getPlayersFromPresence(channel.presenceState() as Record<string, PlayerPresence[]>);
      if (isUnmounted) {
        return;
      }

      playersRef.current = presentPlayers;
      setPlayers(presentPlayers);
      setRoomFull(
        presentPlayers.length > 2 &&
          !presentPlayers.slice(0, 2).some((player) => player.userId === currentUserIdRef.current)
      );

      if (presentPlayers.length < 2) {
        startedPairKeyRef.current = null;
        setStatus("Waiting for a second player...");
        battleMusicRef.current?.pause();
        applyIncomingState(createInitialGameState());
        return;
      }

      const pair = presentPlayers.slice(0, 2);
      const pairKey = pair.map((player) => player.userId).join(":");

      if (pair.some((player) => player.userId === currentUserIdRef.current)) {
        setStatus(`Live duel: ${pair[0].username} vs ${pair[1].username}`);
      } else {
        setStatus("Room full. Waiting for a seat to open.");
      }

      if (pairKey !== startedPairKeyRef.current && pair[0].userId === currentUserIdRef.current) {
        startedPairKeyRef.current = pairKey;
        const nextState = createInitialGameState(
          [pair[0].username, pair[1].username],
          [pair[0].deckList ?? localDeckRef.current, pair[1].deckList ?? localDeckRef.current]
        );
        recordedWinKeyRef.current = null;
        applyIncomingState(nextState);
        void channel.send({
          type: "broadcast",
          event: "card-state",
          payload: nextState
        });

        const openingTrackIndex = Math.floor(Math.random() * TAPDECK_AUDIO.battleTracks.length);
        battleTrackIndexRef.current = openingTrackIndex;
        void channel.send({
          type: "broadcast",
          event: "tapdeck-music",
          payload: {
            trackIndex: openingTrackIndex,
            startAtMs: Date.now() + 800
          } satisfies BattleMusicPayload
        });
      }
    };

    const setup = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session || isUnmounted) {
        return;
      }

      const loadedDeckState = await loadDeckStateForCurrentUser();
      localDeckRef.current = getActiveDeckList(loadedDeckState);

      setCurrentUserId(session.user.id);
      currentUserIdRef.current = session.user.id;

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", session.user.id)
        .maybeSingle();

      if (isUnmounted) {
        return;
      }

      const username = ((profile?.username as string | null) ?? "Player").trim() || "Player";
      setCurrentUsername(username);

      const channel = supabase.channel(ROOM_NAME, {
        config: { presence: { key: session.user.id } }
      });

      channelRef.current = channel;

      channel.on("presence", { event: "sync" }, syncPresence);
      channel.on("broadcast", { event: "card-state" }, ({ payload }) => {
        applyIncomingState(payload as GameState);
      });
      channel.on("broadcast", { event: "tapdeck-music" }, ({ payload }) => {
        playSharedBattleTrack(payload as BattleMusicPayload);
      });
      channel.on("broadcast", { event: "card-action" }, ({ payload }) => {
        const localPlayers = playersRef.current.slice(0, 2);
        const localIsHost = localPlayers[0]?.userId === currentUserIdRef.current;

        if (localPlayers.length !== 2 || !localIsHost) {
          return;
        }

        const nextState = cardGameReducer(stateRef.current, payload as GameAction);
        applyIncomingState(nextState);
        void channel.send({
          type: "broadcast",
          event: "card-state",
          payload: nextState
        });
      });

      channel.subscribe(async (subscriptionStatus) => {
        if (subscriptionStatus !== "SUBSCRIBED" || isUnmounted) {
          return;
        }

        await channel.track({
          userId: session.user.id,
          username,
          onlineAt: new Date().toISOString(),
          deckList: localDeckRef.current
        });

        setConnected(true);
        syncPresence();
      });
    };

    void setup();

    return () => {
      isUnmounted = true;
      setConnected(false);
      battleUnlockCleanupRef.current?.();
      battleMusicRef.current?.pause();
      if (attackTimeoutRef.current) {
        window.clearTimeout(attackTimeoutRef.current);
      }
      if (drawTimeoutRef.current) {
        window.clearTimeout(drawTimeoutRef.current);
      }
      if (turnBannerTimeoutRef.current) {
        window.clearTimeout(turnBannerTimeoutRef.current);
      }
      const channel = channelRef.current;
      if (channel) {
        void supabase.removeChannel(channel);
        channelRef.current = null;
      }
    };
  }, []);

  const sendAction = async (action: GameAction) => {
    if (!hasTwoPlayers || !channelRef.current) {
      return;
    }

    if (isHost) {
      const nextState = cardGameReducer(stateRef.current, action);
      applyIncomingState(nextState);
      await channelRef.current.send({
        type: "broadcast",
        event: "card-state",
        payload: nextState
      });
      return;
    }

    await channelRef.current.send({
      type: "broadcast",
      event: "card-action",
      payload: action
    });
  };

  const roomStatus = roomFull
    ? "Room full"
    : !hasTwoPlayers
      ? "Waiting for opponent"
      : currentSeatIndex === null
        ? "Spectating"
        : `${currentUsername} in seat ${currentSeatIndex + 1}`;

  return (
    <div className="page">
      <NavBar />
      <div className="content" style={{ maxWidth: 1380 }}>
        <GameBoard
          state={gameState}
          viewerIndex={currentSeatIndex}
          canAct={canAct}
          roomStatus={roomStatus}
          isConnected={connected}
          isHost={isHost}
          selectedAttackerId={selectedAttackerId}
          canRespondToTrap={canRespondToTrap}
          animatedAttackerId={animatedAttackerId}
          impactedUnitId={impactedUnitId}
          impactedHeroSide={impactedHeroSide}
          drawPulseSide={drawPulseSide}
          showTurnBanner={showTurnBanner}
          onSelectAttacker={setSelectedAttackerId}
          onAttackUnit={(attackerId, defenderId) => {
            void sendAction({
              type: "attack-unit",
              attackerId,
              defenderId
            });
          }}
          onAttackHero={(attackerId) => {
            void sendAction({
              type: "attack-hero",
              attackerId
            });
          }}
          onPlayCard={(cardInstanceId) => {
            void sendAction({
              type: "play-card",
              cardInstanceId
            });
          }}
          onEndTurn={() => {
            void sendAction({
              type: "end-turn"
            });
          }}
          onRestart={() => {
            if (!isHost || seatedPlayers.length !== 2 || !channelRef.current) {
              return;
            }

            const nextState = createInitialGameState(
              [seatedPlayers[0].username, seatedPlayers[1].username],
              [seatedPlayers[0].deckList ?? localDeckRef.current, seatedPlayers[1].deckList ?? localDeckRef.current]
            );
            recordedWinKeyRef.current = null;
            applyIncomingState(nextState);
            void channelRef.current.send({
              type: "broadcast",
              event: "card-state",
              payload: nextState
            });
            const openingTrackIndex = Math.floor(Math.random() * TAPDECK_AUDIO.battleTracks.length);
            void channelRef.current.send({
              type: "broadcast",
              event: "tapdeck-music",
              payload: {
                trackIndex: openingTrackIndex,
                startAtMs: Date.now() + 800
              } satisfies BattleMusicPayload
            });
          }}
          onRespondToTrap={(useTrap) => {
            void sendAction({
              type: "respond-trap",
              useTrap
            });
          }}
        />

        <p className="info" style={{ marginTop: "1rem" }}>
          {status}
        </p>
      </div>
    </div>
  );
};

export default CardBattle;
