import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import GameBoard from "../components/card-game/GameBoard";
import { canUnitAttack, cardGameReducer, createInitialGameState } from "../lib/card-game/engine";
import { getActiveDeckList } from "../lib/card-game/deckBuilding";
import { loadDeckStateForCurrentUser } from "../lib/card-game/deckStorage";
import { recordCardDuelWin } from "../lib/progression";
import { supabase } from "../lib/supabase";
import type { GameAction, GameState } from "../lib/card-game/types";

type PlayerPresence = {
  userId: string;
  username: string;
  onlineAt: string;
  deckList?: string[];
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stateRef = useRef<GameState>(WAITING_STATE);
  const startedPairKeyRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const playersRef = useRef<PlayerPresence[]>([]);
  const localDeckRef = useRef<string[]>([]);
  const recordedWinKeyRef = useRef<string | null>(null);

  const applyIncomingState = (nextState: GameState) => {
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

  useEffect(() => {
    if (currentSeatIndex === null) {
      setSelectedAttackerId(null);
      return;
    }

    const selectedUnit = gameState.players[currentSeatIndex].board.find(
      (unit) => unit.instanceId === selectedAttackerId
    );

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
    let isUnmounted = false;

    const syncPresence = () => {
      const channel = channelRef.current;

      if (!channel) {
        return;
      }

      const presentPlayers = getPlayersFromPresence(
        channel.presenceState() as Record<string, PlayerPresence[]>
      );

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

            const nextState = createInitialGameState([
              seatedPlayers[0].username,
              seatedPlayers[1].username
            ], [
              seatedPlayers[0].deckList ?? localDeckRef.current,
              seatedPlayers[1].deckList ?? localDeckRef.current
            ]);
            recordedWinKeyRef.current = null;
            applyIncomingState(nextState);
            void channelRef.current.send({
              type: "broadcast",
              event: "card-state",
              payload: nextState
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
