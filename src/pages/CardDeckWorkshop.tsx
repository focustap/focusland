import React, { useEffect, useMemo, useState } from "react";
import NavBar from "../components/NavBar";
import { CARD_LIBRARY } from "../lib/card-game/cards";
import { STARTER_DECK } from "../lib/card-game/decks";

const STORAGE_KEY = "focusland-card-draft-v1";

type DeckCounts = Record<string, number>;

const buildStarterCounts = () =>
  STARTER_DECK.reduce<DeckCounts>((counts, cardId) => {
    counts[cardId] = (counts[cardId] ?? 0) + 1;
    return counts;
  }, {});

const CardDeckWorkshop: React.FC = () => {
  const [counts, setCounts] = useState<DeckCounts>(() => buildStarterCounts());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as DeckCounts;
      setCounts(parsed);
    } catch {
      // Ignore malformed local drafts and keep the starter list.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  }, [counts]);

  const totalCards = useMemo(
    () => Object.values(counts).reduce((total, count) => total + count, 0),
    [counts]
  );

  return (
    <div className="page">
      <NavBar />
      <div className="content" style={{ maxWidth: 1120 }}>
        <div className="card deck-workshop-shell">
          <div className="deck-workshop-head">
            <div>
              <h2>Deck Room</h2>
              <p>Edit a local draft here. It is saved in this browser for now and not yet wired into online matches.</p>
            </div>
            <div className="deck-workshop-meta">
              <strong>{totalCards}</strong>
              <span>cards in draft</span>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setCounts(buildStarterCounts())}
              >
                Reset to starter
              </button>
            </div>
          </div>

          <div className="deck-workshop-grid">
            {CARD_LIBRARY.map((card) => {
              const count = counts[card.id] ?? 0;

              return (
                <div key={card.id} className="deck-workshop-card">
                  <div className="deck-workshop-card__top">
                    <strong>{card.name}</strong>
                    <span>{card.type}</span>
                  </div>
                  <p>{card.text}</p>
                  <div className="deck-workshop-card__meta">
                    <span>Cost {card.cost}</span>
                    {"attack" in card ? <span>{card.attack}/{card.health}</span> : null}
                  </div>
                  <div className="deck-workshop-card__controls">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        setCounts((current) => ({
                          ...current,
                          [card.id]: Math.max(0, (current[card.id] ?? 0) - 1)
                        }))
                      }
                    >
                      -
                    </button>
                    <strong>{count}</strong>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() =>
                        setCounts((current) => ({
                          ...current,
                          [card.id]: Math.min(4, (current[card.id] ?? 0) + 1)
                        }))
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardDeckWorkshop;
