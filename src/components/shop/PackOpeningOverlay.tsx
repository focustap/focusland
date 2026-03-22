import React from "react";
import CardView from "../card-game/CardView";
import { CARD_INDEX } from "../../lib/card-game/cards";
import { getRarityColor, type PackRevealCard } from "../../lib/card-game/packOpening";
import type { ShopPackProduct } from "../../lib/shop";

export type PackOpeningStage = "charging" | "burst" | "reveal" | "complete";

type PackOpeningOverlayProps = {
  open: boolean;
  pack: ShopPackProduct | null;
  stage: PackOpeningStage;
  revealCards: PackRevealCard[];
  revealedCount: number;
  onRevealNext: () => void;
  onClose: () => void;
};

const rarityLabel = (rarity: PackRevealCard["rarity"]) => {
  switch (rarity) {
    case "common":
      return "Common";
    case "uncommon":
      return "Uncommon";
    case "rare":
      return "Rare";
    case "epic":
      return "Epic";
    case "legendary":
      return "Legendary";
  }
};

const PackOpeningOverlay: React.FC<PackOpeningOverlayProps> = ({
  open,
  pack,
  stage,
  revealCards,
  revealedCount,
  onRevealNext,
  onClose
}) => {
  if (!open || !pack) {
    return null;
  }

  const allRevealed = revealedCount >= revealCards.length;
  const showEnergy = stage === "charging" || stage === "burst";
  const showRevealGrid = stage === "reveal" || stage === "complete";

  return (
    <div className="pack-opening-overlay">
      <div className="pack-opening-overlay__backdrop" />
      <div className="pack-opening-shell" style={{ ["--pack-accent" as string]: pack.accent, ["--pack-soft" as string]: pack.accentSoft, ["--pack-glow" as string]: pack.glow }}>
        <button type="button" className="pack-opening-shell__close" onClick={onClose}>
          Close
        </button>
        <div className="pack-opening-hero">
          <div className={`pack-opening-sealed pack-opening-sealed--${stage}`}>
            <div className="pack-opening-sealed__foil" />
            <div className="pack-opening-sealed__logo">{pack.name}</div>
            <div className="pack-opening-sealed__subline">
              {stage === "charging" ? "Charging the hit..." : stage === "burst" ? "Crack the seal." : allRevealed ? "Full reveal complete." : "Flip through the haul."}
            </div>
          </div>
          {showEnergy ? (
            <div className="pack-opening-energy">
              {Array.from({ length: 6 }).map((_, index) => (
                <span
                  key={index}
                  className="pack-opening-energy__beam"
                  style={{ animationDelay: `${index * 0.1}s`, ["--beam-rotation" as string]: `${index * 30}deg` }}
                />
              ))}
            </div>
          ) : null}
        </div>

        {showRevealGrid ? (
          <div className="pack-opening-reveal-grid">
            {revealCards.map((card, index) => {
              const isRevealed = index < revealedCount;
              const isNext = index === revealedCount;
              const definition = CARD_INDEX[card.cardId];
              return (
                <button
                  key={`${card.cardId}-${index}`}
                  type="button"
                  className={
                    isRevealed
                      ? "pack-opening-card pack-opening-card--revealed"
                      : isNext
                        ? "pack-opening-card pack-opening-card--next"
                        : "pack-opening-card"
                  }
                  onClick={isNext && !allRevealed ? onRevealNext : undefined}
                  disabled={!isNext || allRevealed}
                  style={{ ["--rarity-color" as string]: getRarityColor(card.rarity) }}
                >
                  <div className="pack-opening-card__inner">
                    <div className="pack-opening-card__face pack-opening-card__face--back">
                      <div className="pack-opening-card__packmark">{pack.name}</div>
                      <strong>Tap to reveal</strong>
                    </div>
                    <div className="pack-opening-card__face pack-opening-card__face--front">
                      {isRevealed ? (
                        <>
                          <CardView
                            cardId={card.cardId}
                            infoTooltip={
                              definition ? (
                                <>
                                  <strong>{rarityLabel(card.rarity)}</strong>
                                  <br />
                                  Set: {definition.set}
                                  <br />
                                  Family: {definition.family}
                                  <br />
                                  Type: {definition.type}
                                  <br />
                                  {card.isFoil ? "Foil finish" : "Standard finish"}
                                </>
                              ) : null
                            }
                          />
                          <div className="pack-opening-card__meta">
                            <span>{rarityLabel(card.rarity)}</span>
                            {card.isFoil ? <strong>Foil</strong> : null}
                          </div>
                        </>
                      ) : (
                        <div className="pack-opening-card__placeholder" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="pack-opening-footer">
          <div>
            <strong>{pack.name}</strong>
            <p>
              {stage === "charging" || stage === "burst"
                ? "The pack is winding up."
                : allRevealed
                  ? "Everything is on the table."
                  : "Reveal the next card."}
            </p>
          </div>
          <button type="button" className="primary-button" onClick={allRevealed ? onClose : onRevealNext}>
            {allRevealed ? "Back to shop" : "Reveal next"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PackOpeningOverlay;
