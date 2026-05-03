import React, { useMemo, useState } from "react";
import NavBar from "../components/NavBar";
import {
  HOUSE_GRID_COLUMNS,
  HOUSE_GRID_ROWS,
  HOUSE_LAYOUT_STORAGE_KEY,
  HOUSING_ITEM_BY_ID,
  HOUSING_ITEMS
} from "../lib/housing/items";
import type { HousingItemDefinition, HousingItemId, PlacedHousingItem } from "../lib/housing/types";

type HoveredCell = {
  x: number;
  y: number;
} | null;

const createInstanceId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `house-item-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isHousingItemId = (value: string): value is HousingItemId =>
  Object.prototype.hasOwnProperty.call(HOUSING_ITEM_BY_ID, value);

const loadStoredLayout = (): PlacedHousingItem[] => {
  try {
    const rawLayout = window.localStorage.getItem(HOUSE_LAYOUT_STORAGE_KEY);
    if (!rawLayout) {
      return [];
    }

    const parsed = JSON.parse(rawLayout) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item): PlacedHousingItem[] => {
      if (
        item &&
        typeof item === "object" &&
        "instanceId" in item &&
        "itemId" in item &&
        "x" in item &&
        "y" in item &&
        typeof item.instanceId === "string" &&
        typeof item.itemId === "string" &&
        isHousingItemId(item.itemId) &&
        Number.isInteger(item.x) &&
        Number.isInteger(item.y)
      ) {
        const definition = HOUSING_ITEM_BY_ID[item.itemId];
        const insideGrid =
          item.x >= 0 &&
          item.y >= 0 &&
          item.x + definition.footprint.width <= HOUSE_GRID_COLUMNS &&
          item.y + definition.footprint.height <= HOUSE_GRID_ROWS;

        if (insideGrid) {
          return [
            {
              instanceId: item.instanceId,
              itemId: item.itemId,
              x: item.x,
              y: item.y
            }
          ];
        }
      }

      return [];
    });
  } catch {
    return [];
  }
};

const getCellsForItem = (definition: HousingItemDefinition, x: number, y: number) => {
  const cells: string[] = [];
  for (let row = y; row < y + definition.footprint.height; row += 1) {
    for (let column = x; column < x + definition.footprint.width; column += 1) {
      cells.push(`${column}:${row}`);
    }
  }
  return cells;
};

const canPlaceItem = (
  definition: HousingItemDefinition,
  x: number,
  y: number,
  placedItems: PlacedHousingItem[]
) => {
  if (
    x < 0 ||
    y < 0 ||
    x + definition.footprint.width > HOUSE_GRID_COLUMNS ||
    y + definition.footprint.height > HOUSE_GRID_ROWS
  ) {
    return false;
  }

  const floorItem = definition.category === "floor";
  const targetCells = new Set(getCellsForItem(definition, x, y));

  return !placedItems.some((placedItem) => {
    const placedDefinition = HOUSING_ITEM_BY_ID[placedItem.itemId];
    if (floorItem !== (placedDefinition.category === "floor")) {
      return false;
    }

    return getCellsForItem(placedDefinition, placedItem.x, placedItem.y).some((cell) => targetCells.has(cell));
  });
};

const sortPlacedItems = (items: PlacedHousingItem[]) =>
  [...items].sort((left, right) => {
    const leftDefinition = HOUSING_ITEM_BY_ID[left.itemId];
    const rightDefinition = HOUSING_ITEM_BY_ID[right.itemId];
    const leftIsFloor = leftDefinition.category === "floor";
    const rightIsFloor = rightDefinition.category === "floor";

    if (leftIsFloor !== rightIsFloor) {
      return leftIsFloor ? -1 : 1;
    }

    return left.y - right.y || left.x - right.x;
  });

const House: React.FC = () => {
  const [editMode, setEditMode] = useState(false);
  const [placedItems, setPlacedItems] = useState<PlacedHousingItem[]>(() => loadStoredLayout());
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<HousingItemId>("wooden_chair");
  const [selectedPlacedItemId, setSelectedPlacedItemId] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<HoveredCell>(null);
  const [status, setStatus] = useState("Pick an item, then click a tile to place it.");

  const selectedDefinition = HOUSING_ITEM_BY_ID[selectedInventoryItemId];
  const selectedPlacedItem = placedItems.find((item) => item.instanceId === selectedPlacedItemId) ?? null;
  const usedItemIds = useMemo(() => new Set(placedItems.map((item) => item.itemId)), [placedItems]);
  const sortedItems = useMemo(() => sortPlacedItems(placedItems), [placedItems]);
  const hoveredPlacementIsValid =
    editMode && hoveredCell
      ? canPlaceItem(selectedDefinition, hoveredCell.x, hoveredCell.y, placedItems) &&
        !usedItemIds.has(selectedDefinition.id)
      : false;

  const saveLayout = (nextLayout = placedItems) => {
    // TODO: Save and load house layouts with Supabase once housing is account-backed.
    window.localStorage.setItem(HOUSE_LAYOUT_STORAGE_KEY, JSON.stringify(nextLayout));
    setStatus("Room saved.");
  };

  const handleRoomPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editMode) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const tileWidth = bounds.width / HOUSE_GRID_COLUMNS;
    const tileHeight = bounds.height / HOUSE_GRID_ROWS;
    const x = Math.floor((event.clientX - bounds.left) / tileWidth);
    const y = Math.floor((event.clientY - bounds.top) / tileHeight);

    if (x < 0 || y < 0 || x >= HOUSE_GRID_COLUMNS || y >= HOUSE_GRID_ROWS) {
      setHoveredCell(null);
      return;
    }

    setHoveredCell({ x, y });
  };

  const handlePlaceItem = () => {
    if (!editMode || !hoveredCell) {
      return;
    }

    if (usedItemIds.has(selectedDefinition.id)) {
      setStatus(`${selectedDefinition.name} is already in the room.`);
      return;
    }

    if (!canPlaceItem(selectedDefinition, hoveredCell.x, hoveredCell.y, placedItems)) {
      setStatus("That spot is blocked.");
      return;
    }

    const nextPlacedItem: PlacedHousingItem = {
      instanceId: createInstanceId(),
      itemId: selectedDefinition.id,
      x: hoveredCell.x,
      y: hoveredCell.y
    };

    setPlacedItems((currentItems) => [...currentItems, nextPlacedItem]);
    setSelectedPlacedItemId(nextPlacedItem.instanceId);
    setStatus(`${selectedDefinition.name} placed.`);
  };

  const handleRemoveSelected = () => {
    if (!selectedPlacedItem) {
      setStatus("Select placed furniture to remove it.");
      return;
    }

    const definition = HOUSING_ITEM_BY_ID[selectedPlacedItem.itemId];
    setPlacedItems((currentItems) => currentItems.filter((item) => item.instanceId !== selectedPlacedItem.instanceId));
    setSelectedPlacedItemId(null);
    setStatus(`${definition.name} removed.`);
  };

  const handleClearRoom = () => {
    if (!placedItems.length) {
      setStatus("The room is already empty.");
      return;
    }

    if (!window.confirm("Clear all furniture from your house?")) {
      return;
    }

    setPlacedItems([]);
    setSelectedPlacedItemId(null);
    setStatus("Room cleared. Save when you are ready.");
  };

  return (
    <div className="page house-page">
      <NavBar />
      <main className="house-shell">
        <header className="house-header">
          <div>
            <h1>My House</h1>
            <p>Pick an item, then click a tile to place it.</p>
          </div>
          <div className="house-actions">
            <button type="button" className="secondary-button" onClick={() => setEditMode((current) => !current)}>
              {editMode ? "Done" : "Edit Room"}
            </button>
            <button type="button" className="primary-button" onClick={() => saveLayout()}>
              Save
            </button>
            <button type="button" className="secondary-button" onClick={handleRemoveSelected}>
              Remove Selected
            </button>
            <button type="button" className="secondary-button" onClick={handleClearRoom}>
              Clear Room
            </button>
          </div>
        </header>

        <div className="house-layout">
          <section className="house-stage-wrap" aria-label="House room editor">
            <div
              className={`house-room ${editMode ? "is-editing" : ""}`}
              onPointerMove={handleRoomPointerMove}
              onPointerLeave={() => setHoveredCell(null)}
              onClick={handlePlaceItem}
            >
              <div className="house-room__wall" />
              <div className="house-room__floor" />
              {sortedItems.map((placedItem) => {
                const definition = HOUSING_ITEM_BY_ID[placedItem.itemId];
                const selected = placedItem.instanceId === selectedPlacedItemId;

                return (
                  <button
                    key={placedItem.instanceId}
                    type="button"
                    className={`house-placed-item ${selected ? "is-selected" : ""}`}
                    style={{
                      left: `calc(${placedItem.x} * var(--house-tile))`,
                      top: `calc(${placedItem.y} * var(--house-tile))`,
                      width: `calc(${definition.footprint.width} * var(--house-tile))`,
                      height: `calc(${definition.footprint.height} * var(--house-tile))`,
                      zIndex:
                        definition.category === "floor"
                          ? 5 + placedItem.y
                          : 50 + placedItem.y * HOUSE_GRID_COLUMNS + placedItem.x
                    }}
                    aria-label={`Select ${definition.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (editMode) {
                        setSelectedPlacedItemId(placedItem.instanceId);
                        setStatus(`${definition.name} selected.`);
                      }
                    }}
                  >
                    <img src={definition.imageUrl} alt="" draggable={false} />
                  </button>
                );
              })}
              {editMode && hoveredCell ? (
                <div
                  className={`house-ghost ${hoveredPlacementIsValid ? "is-valid" : "is-invalid"}`}
                  style={{
                    left: `calc(${hoveredCell.x} * var(--house-tile))`,
                    top: `calc(${hoveredCell.y} * var(--house-tile))`,
                    width: `calc(${selectedDefinition.footprint.width} * var(--house-tile))`,
                    height: `calc(${selectedDefinition.footprint.height} * var(--house-tile))`
                  }}
                >
                  <img src={selectedDefinition.imageUrl} alt="" draggable={false} />
                </div>
              ) : null}
            </div>
            <p className={`house-status ${hoveredCell && !hoveredPlacementIsValid ? "is-warning" : ""}`}>
              {hoveredCell && editMode && !hoveredPlacementIsValid
                ? usedItemIds.has(selectedDefinition.id)
                  ? `${selectedDefinition.name} is already placed.`
                  : "That spot is blocked or outside the room."
                : status}
            </p>
          </section>

          {editMode ? (
            <aside className="house-inventory" aria-label="Furniture inventory">
              <div>
                <h2>Inventory</h2>
                <p>One of each item is available for this first version.</p>
              </div>
              <div className="house-inventory__grid">
                {HOUSING_ITEMS.map((item) => {
                  const selected = item.id === selectedInventoryItemId;
                  const placed = usedItemIds.has(item.id);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`house-inventory-item ${selected ? "is-selected" : ""}`}
                      disabled={placed}
                      onClick={() => {
                        setSelectedInventoryItemId(item.id);
                        setSelectedPlacedItemId(null);
                        setStatus(`${item.name} selected.`);
                      }}
                    >
                      <img src={item.imageUrl} alt="" draggable={false} />
                      <span>{item.name}</span>
                      <small>
                        {item.footprint.width}x{item.footprint.height} · {placed ? "Placed" : item.category}
                      </small>
                    </button>
                  );
                })}
              </div>
            </aside>
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default House;
