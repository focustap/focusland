import React from "react";
import ActionLog from "./ActionLog";
import CardView from "./CardView";
import { canUnitAttack, canUnitAttackHeroDirectly, getCard, getPendingTrapCard } from "../../lib/card-game/engine";
import type { GameState, PlayerIndex, PlayerState, TrapOnBoard, UnitOnBoard } from "../../lib/card-game/types";

type GameBoardProps = {
  state: GameState;
  viewerIndex: PlayerIndex | null;
  canAct: boolean;
  roomStatus: string;
  isConnected: boolean;
  isHost: boolean;
  selectedAttackerId: string | null;
  canRespondToTrap: boolean;
  animatedAttackerId: string | null;
  impactedUnitId: string | null;
  impactedHeroSide: "top" | "bottom" | null;
  drawPulseSide: "top" | "bottom" | null;
  showTurnBanner: boolean;
  onSelectAttacker: (attackerId: string | null) => void;
  onAttackUnit: (attackerId: string, defenderId: string) => void;
  onAttackHero: (attackerId: string) => void;
  onPlayCard: (cardInstanceId: string) => void;
  onEndTurn: () => void;
  onRestart: () => void;
  onRespondToTrap: (useTrap: boolean) => void;
};

const MAX_UNITS = 5;

const ZoneSlots: React.FC<{
  units: UnitOnBoard[];
  selectedAttackerId?: string | null;
  canSelect?: boolean;
  canTarget?: boolean;
  animatedAttackerId?: string | null;
  impactedUnitId?: string | null;
  onSelectAttacker?: (attackerId: string | null) => void;
  onAttackUnit?: (defenderId: string) => void;
}> = ({
  units,
  selectedAttackerId = null,
  canSelect = false,
  canTarget = false,
  animatedAttackerId = null,
  impactedUnitId = null,
  onSelectAttacker,
  onAttackUnit
}) => {
  const slots = Array.from({ length: MAX_UNITS }, (_, index) => units[index] ?? null);

  return (
    <div className="card-battle-slot-row">
      {slots.map((unit, index) =>
        unit ? (
          <CardView
            key={unit.instanceId}
            unit={unit}
            selected={selectedAttackerId === unit.instanceId}
            clickable={(canSelect && canUnitAttack(unit)) || canTarget}
            className={`${animatedAttackerId === unit.instanceId ? " card-battle-card--attack-lunge" : ""}${impactedUnitId === unit.instanceId ? " card-battle-card--impact" : ""}`.trim()}
            statusLabel={unit.summoningSick ? "Summoning sick" : unit.exhausted ? "Spent" : "Ready"}
            onClick={
              canSelect && canUnitAttack(unit)
                ? () => onSelectAttacker?.(selectedAttackerId === unit.instanceId ? null : unit.instanceId)
                : canTarget
                  ? () => onAttackUnit?.(unit.instanceId)
                  : undefined
            }
          />
        ) : (
          <div key={`empty-unit-${index}`} className="card-battle-slot card-battle-slot--empty">
            Unit slot
          </div>
        )
      )}
    </div>
  );
};

const TrapSlots: React.FC<{
  traps: TrapOnBoard[];
  reveal: boolean;
}> = ({ traps, reveal }) => {
  const slots = Array.from({ length: MAX_UNITS }, (_, index) => traps[index] ?? null);

  return (
    <div className="card-battle-slot-row card-battle-slot-row--traps">
      {slots.map((trap, index) =>
        trap ? (
          <CardView key={trap.instanceId} cardId={reveal ? trap.cardId : undefined} hidden={!reveal} />
        ) : (
          <div key={`empty-trap-${index}`} className="card-battle-slot card-battle-slot--trap">
            Trap slot
          </div>
        )
      )}
    </div>
  );
};

const SidePiles: React.FC<{
  player: PlayerState;
  flipped?: boolean;
  drawPulse?: boolean;
}> = ({ player, flipped = false, drawPulse = false }) => {
  return (
    <div className={`card-battle-piles${flipped ? " card-battle-piles--flipped" : ""}${drawPulse ? " card-battle-piles--draw-pulse" : ""}`}>
      <div className="card-battle-pile">
        <div className="card-battle-pile__card" />
        <strong>Deck</strong>
        <span>{player.deck.length}</span>
      </div>
      <div className="card-battle-pile card-battle-pile--grave">
        <div className="card-battle-pile__grave">RIP</div>
        <strong>Grave</strong>
        <span>{player.discard.length}</span>
      </div>
    </div>
  );
};

const HandFan: React.FC<{
  player: PlayerState | null;
  canAct: boolean;
  drawPulse?: boolean;
  onPlayCard: (cardInstanceId: string) => void;
}> = ({ player, canAct, drawPulse = false, onPlayCard }) => {
  if (!player) {
    return (
      <div className="card-battle-hand-fan">
        <div className="card-battle-slot card-battle-slot--empty">Join the duel to see your hand.</div>
      </div>
    );
  }

  if (player.hand.length === 0) {
    return (
      <div className="card-battle-hand-fan">
        <div className="card-battle-slot card-battle-slot--empty">Your hand is empty.</div>
      </div>
    );
  }

  return (
    <div className={`card-battle-hand-fan${drawPulse ? " card-battle-hand-fan--draw-pulse" : ""}`}>
      {player.hand.map((card, index) => {
        const rotation = (index - (player.hand.length - 1) / 2) * 4;
        const definition = getCard(card.cardId);
        const canPlay =
          canAct &&
          player.currentResource >= definition.cost &&
          !(definition.type === "unit" && player.board.length >= MAX_UNITS);

        return (
          <div
            key={card.instanceId}
            className="card-battle-hand-fan__card"
            style={{ transform: `translateY(${Math.abs(rotation) * 0.8}px) rotate(${rotation}deg)` }}
          >
            <CardView
              cardId={card.cardId}
              footer={
                <div className="card-battle-card__footer">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => onPlayCard(card.instanceId)}
                    disabled={!canPlay}
                  >
                    {definition.type === "trap" ? "Set" : "Play"}
                  </button>
                </div>
              }
            />
          </div>
        );
      })}
    </div>
  );
};

const HandBacks: React.FC<{ count: number; drawPulse?: boolean }> = ({ count, drawPulse = false }) => {
  const visibleCount = Math.min(6, count);

  return (
    <div className={`card-battle-backs${drawPulse ? " card-battle-backs--draw-pulse" : ""}`}>
      {Array.from({ length: visibleCount }, (_, index) => (
        <div key={`back-${index}`} className="card-battle-back" />
      ))}
      <span>{count} in hand</span>
    </div>
  );
};

const PlayerBadge: React.FC<{
  player: PlayerState;
  isActive: boolean;
  isViewer: boolean;
}> = ({ player, isActive, isViewer }) => {
  return (
    <div className={`card-battle-badge${isActive ? " card-battle-badge--active" : ""}`}>
      <div>
        <strong>{player.name}</strong>
        <span>{isViewer ? "You" : "Opponent"}</span>
      </div>
      <div className="card-battle-badge__stats">
        <span>Health {player.health}</span>
        <span>Resource {player.currentResource}/{player.maxResource}</span>
        <span>Deck {player.deck.length}</span>
      </div>
    </div>
  );
};

const GameBoard: React.FC<GameBoardProps> = ({
  state,
  viewerIndex,
  canAct,
  roomStatus,
  isConnected,
  isHost,
  selectedAttackerId,
  canRespondToTrap,
  animatedAttackerId,
  impactedUnitId,
  impactedHeroSide,
  drawPulseSide,
  showTurnBanner,
  onSelectAttacker,
  onAttackUnit,
  onAttackHero,
  onPlayCard,
  onEndTurn,
  onRestart,
  onRespondToTrap
}) => {
  const viewer = viewerIndex !== null ? state.players[viewerIndex] : null;
  const opponent = viewerIndex !== null ? state.players[viewerIndex === 0 ? 1 : 0] : state.players[1];
  const selectedAttacker = viewer?.board.find((unit) => unit.instanceId === selectedAttackerId) ?? null;
  const canAttackHeroDirectly =
    canAct &&
    selectedAttacker !== null &&
    canUnitAttackHeroDirectly(selectedAttacker, opponent.board);
  const pendingTrapCard = getPendingTrapCard(state);
  const trapPromptText = state.pendingTrapPrompt
    ? canRespondToTrap && pendingTrapCard
      ? `${state.players[state.pendingTrapPrompt.trapOwner].name}, use ${pendingTrapCard.name}?`
      : "Waiting for trap response."
    : null;

  return (
    <div className="card-battle-table-wrap">
      {showTurnBanner ? <div className="card-battle-turn-banner">YOUR TURN</div> : null}

      <div className="card-battle-rail">
        <div className="card-battle-rail__group">
          <strong>TapDeck Online Duel</strong>
          <span>{roomStatus}</span>
          <span>{isConnected ? "Realtime connected" : "Connecting..."}</span>
        </div>
        <div className="card-battle-rail__group">
          <span>Turn {state.turnNumber}</span>
          <span>Active: {state.players[state.activePlayer].name}</span>
          <button className="secondary-button" type="button" onClick={() => onSelectAttacker(null)}>
            Clear
          </button>
          <button className="primary-button" type="button" onClick={onEndTurn} disabled={!canAct}>
            End turn
          </button>
          {isHost ? (
            <button className="secondary-button" type="button" onClick={onRestart}>
              New duel
            </button>
          ) : null}
        </div>
      </div>

      {trapPromptText ? (
        <div className="warning" style={{ marginTop: 0 }}>
          {trapPromptText}
          <span style={{ marginLeft: "0.75rem" }}>
            {canRespondToTrap ? (
              <>
                <button className="primary-button" type="button" onClick={() => onRespondToTrap(true)}>
                  Use trap
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onRespondToTrap(false)}
                  style={{ marginLeft: "0.5rem" }}
                >
                  Skip
                </button>
              </>
            ) : (
              "Waiting for trap response."
            )}
          </span>
        </div>
      ) : null}

      <div className="card-battle-table">
        <section className="card-battle-side card-battle-side--top">
          <PlayerBadge player={opponent} isActive={state.activePlayer !== viewerIndex} isViewer={false} />
          <div className="card-battle-arena-half card-battle-arena-half--top">
            <SidePiles player={opponent} flipped drawPulse={drawPulseSide === "top"} />
            <div className="card-battle-lanes">
              <button
                className={`card-battle-hero-slot${canAttackHeroDirectly ? " card-battle-hero-slot--targetable" : ""}${impactedHeroSide === "top" ? " card-battle-hero-slot--impact" : ""}`}
                type="button"
                onClick={selectedAttacker ? () => onAttackHero(selectedAttacker.instanceId) : undefined}
                disabled={!canAttackHeroDirectly}
              >
                <span>{opponent.name}</span>
                <strong>{opponent.health}</strong>
                <small>Health</small>
              </button>
              <TrapSlots traps={opponent.traps} reveal={false} />
              <ZoneSlots
                units={opponent.board}
                canTarget={Boolean(selectedAttacker && canAct)}
                animatedAttackerId={animatedAttackerId}
                impactedUnitId={impactedUnitId}
                onAttackUnit={(defenderId) =>
                  selectedAttacker ? onAttackUnit(selectedAttacker.instanceId, defenderId) : undefined
                }
              />
              <HandBacks count={opponent.hand.length} drawPulse={drawPulseSide === "top"} />
            </div>
          </div>
        </section>

        <section className="card-battle-center">
          <div className="card-battle-center__token">
            <span>{viewer ? `Seat ${viewer.id + 1}` : "Spectator"}</span>
            {state.winner !== null ? (
              <strong>{state.players[state.winner].name} wins</strong>
            ) : (
              <strong>{canAct ? "Your turn" : "Waiting"}</strong>
            )}
          </div>
          <ActionLog entries={state.log} />
        </section>

        <section className="card-battle-side card-battle-side--bottom">
          {viewer ? (
            <>
              <PlayerBadge player={viewer} isActive={state.activePlayer === viewerIndex} isViewer />
              <div className="card-battle-arena-half">
                <SidePiles player={viewer} drawPulse={drawPulseSide === "bottom"} />
                <div className="card-battle-lanes">
                  <ZoneSlots
                    units={viewer.board}
                    selectedAttackerId={selectedAttackerId}
                    canSelect={canAct}
                    animatedAttackerId={animatedAttackerId}
                    impactedUnitId={impactedUnitId}
                    onSelectAttacker={onSelectAttacker}
                  />
                  <TrapSlots traps={viewer.traps} reveal />
                  <div className={`card-battle-hero-slot card-battle-hero-slot--self${impactedHeroSide === "bottom" ? " card-battle-hero-slot--impact" : ""}`}>
                    <span>{viewer.name}</span>
                    <strong>{viewer.health}</strong>
                    <small>Health</small>
                  </div>
                  <HandFan player={viewer} canAct={canAct} drawPulse={drawPulseSide === "bottom"} onPlayCard={onPlayCard} />
                </div>
              </div>
            </>
          ) : (
            <div className="card-battle-seat-empty">
              <strong>Room full</strong>
              <span>Two players are already seated in this duel.</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default GameBoard;
