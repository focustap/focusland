import React from "react";
import { getCard, getUnitCard, getUnitTotalAttack, getUnitTotalHealth } from "../../lib/card-game/engine";
import type { UnitOnBoard } from "../../lib/card-game/types";

type CardViewProps = {
  cardId?: string;
  unit?: UnitOnBoard;
  hidden?: boolean;
  selected?: boolean;
  clickable?: boolean;
  statusLabel?: string;
  footer?: React.ReactNode;
  onClick?: () => void;
};

const CardView: React.FC<CardViewProps> = ({
  cardId,
  unit,
  hidden = false,
  selected = false,
  clickable = false,
  statusLabel,
  footer,
  onClick
}) => {
  if (hidden) {
    const hiddenClasses = `card-battle-card card-battle-card--hidden${selected ? " card-battle-card--selected" : ""}${clickable ? " card-battle-card--clickable" : ""}`;

    if (onClick) {
      return (
        <button className={hiddenClasses} type="button" onClick={onClick}>
          <span className="card-battle-card__type">Trap</span>
          <strong>Face-down</strong>
          <span className="card-battle-card__text">Reveals when its condition is met.</span>
        </button>
      );
    }

    return (
      <div className={hiddenClasses}>
        <span className="card-battle-card__type">Trap</span>
        <strong>Face-down</strong>
        <span className="card-battle-card__text">Reveals when its condition is met.</span>
      </div>
    );
  }

  const definition = cardId ? getCard(cardId) : unit ? getCard(unit.cardId) : null;
  const unitCard = unit ? getUnitCard(unit.cardId) : null;

  if (!definition) {
    return null;
  }

  const classes = `card-battle-card card-battle-card--${definition.type}${selected ? " card-battle-card--selected" : ""}${clickable ? " card-battle-card--clickable" : ""}`;
  const content = (
    <>
      <div className="card-battle-card__topline">
        <span className="card-battle-card__cost">{definition.cost}</span>
        <span className="card-battle-card__type">{definition.type}</span>
      </div>
      <div className={`card-battle-card__art card-battle-card__art--${definition.visualTheme}`}>
        <span>{definition.artLabel}</span>
      </div>
      <strong>{definition.name}</strong>
      {"keywords" in definition && definition.keywords?.length ? (
        <div className="card-battle-card__keywords">
          {definition.keywords.map((keyword) => (
            <span key={keyword}>{keyword}</span>
          ))}
        </div>
      ) : null}
      <span className="card-battle-card__text">{definition.text}</span>
      {unit && unitCard ? (
        <div className="card-battle-card__stats">
          <span>ATK {getUnitTotalAttack(unit)}</span>
          <span>HP {unit.currentHealth}/{getUnitTotalHealth(unit)}</span>
        </div>
      ) : definition.type === "unit" ? (
        <div className="card-battle-card__stats">
          <span>ATK {definition.attack}</span>
          <span>HP {definition.health}</span>
        </div>
      ) : null}
      {statusLabel ? <span className="card-battle-card__status">{statusLabel}</span> : null}
      {footer}
    </>
  );

  if (onClick) {
    return (
      <button className={classes} type="button" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
};

export default CardView;
