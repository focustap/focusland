import React, { useEffect, useReducer, useState } from "react";
import NavBar from "../components/NavBar";
import GameBoard from "../components/card-game/GameBoard";
import { canUnitAttack, cardGameReducer, createInitialGameState } from "../lib/card-game/engine";

const CardBattle: React.FC = () => {
  const [state, dispatch] = useReducer(cardGameReducer, undefined, createInitialGameState);
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);
  const [turnRevealOpen, setTurnRevealOpen] = useState(true);

  useEffect(() => {
    const activeBoard = state.players[state.activePlayer].board;
    const selectedUnit = activeBoard.find((unit) => unit.instanceId === selectedAttackerId);

    if (!selectedUnit || !canUnitAttack(selectedUnit)) {
      setSelectedAttackerId(null);
    }
  }, [selectedAttackerId, state.activePlayer, state.players]);

  useEffect(() => {
    if (state.winner !== null) {
      setTurnRevealOpen(false);
    }
  }, [state.winner]);

  const endTurn = () => {
    dispatch({ type: "end-turn" });
    setSelectedAttackerId(null);
    setTurnRevealOpen(true);
  };

  const restart = () => {
    dispatch({ type: "restart" });
    setSelectedAttackerId(null);
    setTurnRevealOpen(true);
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content" style={{ maxWidth: 1180 }}>
        <GameBoard
          state={state}
          selectedAttackerId={selectedAttackerId}
          onSelectAttacker={setSelectedAttackerId}
          onAttackUnit={(attackerId, defenderId) =>
            dispatch({
              type: "attack-unit",
              attackerId,
              defenderId
            })
          }
          onAttackHero={(attackerId) =>
            dispatch({
              type: "attack-hero",
              attackerId
            })
          }
          onPlayCard={(cardInstanceId) =>
            dispatch({
              type: "play-card",
              cardInstanceId
            })
          }
          onEndTurn={endTurn}
          onRestart={restart}
        />
      </div>

      {turnRevealOpen ? (
        <div className="card-battle-overlay">
          <div className="card-battle-overlay__panel">
            <strong>{state.players[state.activePlayer].name}</strong>
            <p>Take the device. Press reveal when you are ready to view your hand and board.</p>
            <button className="primary-button" type="button" onClick={() => setTurnRevealOpen(false)}>
              Reveal turn
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CardBattle;
