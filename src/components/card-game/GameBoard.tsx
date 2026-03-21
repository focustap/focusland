import React from "react";
import ActionLog from "./ActionLog";
import BoardRow from "./BoardRow";
import CardView from "./CardView";
import HandView from "./HandView";
import PlayerPanel from "./PlayerPanel";
import { canUnitAttack } from "../../lib/card-game/engine";
import type { GameState } from "../../lib/card-game/types";

type GameBoardProps = {
  state: GameState;
  selectedAttackerId: string | null;
  onSelectAttacker: (attackerId: string | null) => void;
  onAttackUnit: (attackerId: string, defenderId: string) => void;
  onAttackHero: (attackerId: string) => void;
  onPlayCard: (cardInstanceId: string) => void;
  onEndTurn: () => void;
  onRestart: () => void;
};

const GameBoard: React.FC<GameBoardProps> = ({
  state,
  selectedAttackerId,
  onSelectAttacker,
  onAttackUnit,
  onAttackHero,
  onPlayCard,
  onEndTurn,
  onRestart
}) => {
  const activePlayer = state.players[state.activePlayer];
  const opposingPlayer = state.players[state.activePlayer === 0 ? 1 : 0];
  const selectedAttacker =
    activePlayer.board.find((unit) => unit.instanceId === selectedAttackerId) ?? null;
  const directAttackReady =
    selectedAttacker !== null && canUnitAttack(selectedAttacker) && opposingPlayer.board.length === 0;

  return (
    <div className="card-battle-shell">
      <div className="card-battle-topbar">
        <div>
          <h2>Arcade Duel Prototype</h2>
          <p>
            1v1 hotseat. Turn 1 belongs to Player 1, who skips the opening draw. Units cannot
            attack the turn they enter.
          </p>
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={() => onSelectAttacker(null)}>
            Clear attack
          </button>
          <button className="primary-button" type="button" onClick={onEndTurn}>
            End turn
          </button>
          <button className="secondary-button" type="button" onClick={onRestart}>
            Restart duel
          </button>
        </div>
      </div>

      <div className="card-battle-status">
        <span>Active player: {activePlayer.name}</span>
        <span>Selected attacker: {selectedAttacker ? "ready" : "none"}</span>
        <span>Board limit: 5 units</span>
      </div>

      {state.winner !== null ? (
        <p className="info">{state.players[state.winner].name} wins the duel.</p>
      ) : null}

      <PlayerPanel
        player={opposingPlayer}
        isActive={false}
        hideHandDetails
        directAttackReady={directAttackReady}
        onAttackHero={selectedAttacker ? () => onAttackHero(selectedAttacker.instanceId) : undefined}
      />

      <BoardRow
        title={`${opposingPlayer.name} board`}
        hint={selectedAttacker ? "Click an enemy unit to attack it." : "Select one of your ready units first."}
      >
        {opposingPlayer.board.length === 0 ? (
          <p className="card-battle-empty">No enemy units in play.</p>
        ) : (
          opposingPlayer.board.map((unit) => (
            <CardView
              key={unit.instanceId}
              unit={unit}
              clickable={Boolean(selectedAttacker)}
              onClick={
                selectedAttacker
                  ? () => onAttackUnit(selectedAttacker.instanceId, unit.instanceId)
                  : undefined
              }
            />
          ))
        )}
      </BoardRow>

      <BoardRow title={`${opposingPlayer.name} set traps`} hint="Face-down until triggered.">
        {opposingPlayer.traps.length === 0 ? (
          <p className="card-battle-empty">No set traps.</p>
        ) : (
          opposingPlayer.traps.map((trap) => <CardView key={trap.instanceId} hidden />)
        )}
      </BoardRow>

      <PlayerPanel player={activePlayer} isActive />

      <BoardRow
        title="Your units"
        hint="Ready units can be selected as attackers."
      >
        {activePlayer.board.length === 0 ? (
          <p className="card-battle-empty">No units on your board.</p>
        ) : (
          activePlayer.board.map((unit) => (
            <CardView
              key={unit.instanceId}
              unit={unit}
              selected={selectedAttackerId === unit.instanceId}
              clickable={canUnitAttack(unit)}
              statusLabel={
                unit.summoningSick ? "Summoning sick" : unit.exhausted ? "Spent" : "Ready"
              }
              onClick={
                canUnitAttack(unit)
                  ? () => onSelectAttacker(selectedAttackerId === unit.instanceId ? null : unit.instanceId)
                  : undefined
              }
            />
          ))
        )}
      </BoardRow>

      <BoardRow title="Your set traps" hint="You can review your own trap cards on your turn.">
        {activePlayer.traps.length === 0 ? (
          <p className="card-battle-empty">No set traps.</p>
        ) : (
          activePlayer.traps.map((trap) => <CardView key={trap.instanceId} cardId={trap.cardId} />)
        )}
      </BoardRow>

      <BoardRow title="Your hand" hint="Play cards if you have enough resource.">
        <HandView
          hand={activePlayer.hand}
          currentResource={activePlayer.currentResource}
          boardIsFull={activePlayer.board.length >= 5}
          onPlayCard={onPlayCard}
        />
      </BoardRow>

      <ActionLog entries={state.log} />
    </div>
  );
};

export default GameBoard;
