import React from "react";
import CardView from "./CardView";
import { getCard } from "../../lib/card-game/engine";
import type { CardInstance } from "../../lib/card-game/types";

type HandViewProps = {
  hand: CardInstance[];
  currentResource: number;
  boardIsFull: boolean;
  onPlayCard: (cardInstanceId: string) => void;
};

const HandView: React.FC<HandViewProps> = ({ hand, currentResource, boardIsFull, onPlayCard }) => {
  if (hand.length === 0) {
    return <p className="card-battle-empty">Your hand is empty.</p>;
  }

  return (
    <div className="card-battle-hand">
      {hand.map((card) => {
        const definition = getCard(card.cardId);
        const cannotPlayUnit = definition.type === "unit" && boardIsFull;
        const canPlay = currentResource >= definition.cost && !cannotPlayUnit;

        return (
          <div key={card.instanceId} className="card-battle-hand__item">
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
                    {definition.type === "trap" ? "Set trap" : "Play"}
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

export default HandView;
