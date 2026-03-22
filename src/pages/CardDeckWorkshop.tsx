import React, { useEffect, useMemo, useState } from "react";
import NavBar from "../components/NavBar";
import { CARD_LIBRARY } from "../lib/card-game/cards";
import {
  DECK_PRESETS,
  countsToDeckList,
  deckListToCounts,
  getDeckSummary,
  type DeckCounts,
  type SavedDeckSlot,
  type StoredDeckState
} from "../lib/card-game/deckBuilding";
import { loadDeckStateForCurrentUser, saveDeckStateForCurrentUser } from "../lib/card-game/deckStorage";

const CardDeckWorkshop: React.FC = () => {
  const [deckState, setDeckState] = useState<StoredDeckState | null>(null);
  const [editingSlotId, setEditingSlotId] = useState<string>("slot-1");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    void (async () => {
      const loadedState = await loadDeckStateForCurrentUser();
      setDeckState(loadedState);
      setEditingSlotId(loadedState.activeSlotId);
    })();
  }, []);

  const editingSlot = deckState?.slots.find((slot) => slot.id === editingSlotId) ?? null;
  const counts = useMemo<DeckCounts>(() => (editingSlot ? deckListToCounts(editingSlot.cardIds) : {}), [editingSlot]);
  const summary = useMemo(() => getDeckSummary(counts), [counts]);

  const updateEditingSlot = (updater: (slot: SavedDeckSlot) => SavedDeckSlot) => {
    setDeckState((current) =>
      current
        ? {
            ...current,
            slots: current.slots.map((slot) => (slot.id === editingSlotId ? updater(slot) : slot))
          }
        : current
    );
  };

  const persistDeckState = async (nextState: StoredDeckState, successText: string) => {
    setDeckState(nextState);
    const result = await saveDeckStateForCurrentUser(nextState);
    setMessage(
      result.persistedToDatabase
        ? `${successText} Saved to your account.`
        : result.errorMessage
          ? `${successText} Saved locally because profile deck columns are not available yet.`
          : `${successText} Saved locally.`
    );
  };

  if (!deckState || !editingSlot) {
    return (
      <div className="page">
        <NavBar />
        <div className="content card">
          <p>Loading deck room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <NavBar />
      <div className="content" style={{ maxWidth: 1260 }}>
        <div className="card deck-workshop-shell">
          <div className="deck-workshop-head">
            <div>
              <h2>TapDeck Deck Room</h2>
              <p>Build up to 30 cards per deck, with no more than 2 copies of the same card. You have 6 saved slots plus read-only prebuilt decks.</p>
            </div>
            <div className="deck-workshop-meta">
              <strong>{summary.totalCards}/30</strong>
              <span>{summary.isValid ? "Deck legal" : "Deck needs fixes"}</span>
            </div>
          </div>

          <div className="deck-workshop-section">
            <div className="deck-workshop-section__head">
              <h3>Saved Deck Slots</h3>
              <span>These are your editable decks and should carry across sessions when account save is available.</span>
            </div>
            <div className="deck-workshop-slot-row">
              {deckState.slots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  className={slot.id === editingSlotId ? "deck-workshop-slot deck-workshop-slot--selected" : "deck-workshop-slot"}
                  onClick={() => setEditingSlotId(slot.id)}
                >
                  <strong>{slot.name}</strong>
                  <span>{slot.cardIds.length} cards</span>
                  <span>{deckState.activeSlotId === slot.id ? "Equipped" : "Stored"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="deck-workshop-toolbar">
            <label className="field" style={{ maxWidth: 320 }}>
              <span>Selected slot name</span>
              <input
                type="text"
                value={editingSlot.name}
                onChange={(event) =>
                  updateEditingSlot((slot) => ({
                    ...slot,
                    name: event.target.value.slice(0, 28)
                  }))
                }
              />
            </label>
            <div className="button-row">
              <button
                className="primary-button"
                type="button"
                onClick={() =>
                  void persistDeckState(
                    {
                      ...deckState,
                      activeSlotId: editingSlotId
                    },
                    "Equipped deck updated."
                  )
                }
                disabled={!summary.isValid}
              >
                Equip this slot
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void persistDeckState({ ...deckState }, "Deck slot saved.")}
              >
                Save slot
              </button>
            </div>
          </div>

          <div className="deck-workshop-section">
            <div className="deck-workshop-section__head">
              <h3>Prebuilt Decks</h3>
              <span>These are permanent templates. Loading one copies it into the selected save slot and does not overwrite the preset itself.</span>
            </div>
            <div className="deck-workshop-presets">
              {DECK_PRESETS.map((preset) => (
                <div key={preset.id} className="deck-workshop-preset">
                  <strong>{preset.name}</strong>
                  <span>{preset.description}</span>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      updateEditingSlot((slot) => ({
                        ...slot,
                        cardIds: [...preset.cardIds]
                      }));
                      setMessage(`Loaded preset into ${editingSlot.name}: ${preset.name}`);
                    }}
                  >
                    Copy to selected slot
                  </button>
                </div>
              ))}
            </div>
          </div>

          {message ? <div className="info">{message}</div> : null}
          {!summary.isValid ? (
            <div className="warning">
              {summary.overLimit ? "This deck is over 30 cards. " : ""}
              {summary.tooManyCopies ? "Some cards exceed the 2-copy limit." : ""}
            </div>
          ) : null}

          <div className="deck-workshop-grid">
            {CARD_LIBRARY.map((card) => {
              const count = counts[card.id] ?? 0;
              const canAdd = count < 2 && summary.totalCards < 30;

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
                    {"keywords" in card && card.keywords?.length ? <span>{card.keywords.join(", ")}</span> : null}
                    <span>{card.set}</span>
                  </div>
                  <div className="deck-workshop-card__controls">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        updateEditingSlot((slot) => {
                          const nextCounts = deckListToCounts(slot.cardIds);
                          nextCounts[card.id] = Math.max(0, (nextCounts[card.id] ?? 0) - 1);
                          return {
                            ...slot,
                            cardIds: countsToDeckList(nextCounts)
                          };
                        })
                      }
                    >
                      -
                    </button>
                    <strong>{count}</strong>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() =>
                        updateEditingSlot((slot) => {
                          const nextCounts = deckListToCounts(slot.cardIds);
                          nextCounts[card.id] = Math.min(2, (nextCounts[card.id] ?? 0) + 1);
                          return {
                            ...slot,
                            cardIds: countsToDeckList(nextCounts)
                          };
                        })
                      }
                      disabled={!canAdd}
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
