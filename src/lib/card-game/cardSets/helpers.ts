import type {
  SpellCardDefinition,
  TrapCardDefinition,
  TriggeredEffect,
  UnitCardDefinition
} from "../types";

export const unit = (definition: Omit<UnitCardDefinition, "type">): UnitCardDefinition => ({
  ...definition,
  type: "unit"
});

export const spell = (definition: Omit<SpellCardDefinition, "type">): SpellCardDefinition => ({
  ...definition,
  type: "spell"
});

export const trap = (definition: Omit<TrapCardDefinition, "type">): TrapCardDefinition => ({
  ...definition,
  type: "trap"
});

export const drawOne: TriggeredEffect = {
  kind: "draw",
  amount: 1,
  target: "self"
};
