import React from "react";
import type { PlayerState } from "../../lib/card-game/types";

type PlayerPanelProps = {
  player: PlayerState;
  isActive: boolean;
  hideHandDetails?: boolean;
  directAttackReady?: boolean;
  onAttackHero?: () => void;
};

const PlayerPanel: React.FC<PlayerPanelProps> = ({
  player,
  isActive,
  hideHandDetails = false,
  directAttackReady = false,
  onAttackHero
}) => {
  return (
    <div className={`card-battle-player${isActive ? " card-battle-player--active" : ""}`}>
      <div>
        <strong>{player.name}</strong>
        <span>
          Health {player.health} | Resource {player.currentResource}/{player.maxResource}
        </span>
      </div>
      <div className="card-battle-player__meta">
        <span>Deck {player.deck.length}</span>
        <span>Hand {hideHandDetails ? player.hand.length : `${player.hand.length} cards`}</span>
        <span>Discard {player.discard.length}</span>
        {onAttackHero ? (
          <button
            className="secondary-button"
            type="button"
            onClick={onAttackHero}
            disabled={!directAttackReady}
          >
            Attack hero
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default PlayerPanel;
