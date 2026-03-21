export type PlayerIndex = 0 | 1;

export type CardType = "unit" | "spell" | "trap";

export type SpellEffect =
  | {
      kind: "damage-hero";
      amount: number;
      target: "self" | "enemy";
    }
  | {
      kind: "draw";
      amount: number;
      target: "self";
    }
  | {
      kind: "damage-units";
      amount: number;
      side: "self" | "enemy" | "both";
    };

export type TrapTrigger = "enemy-attack" | "enemy-spell";

export type TrapEffect =
  | {
      kind: "destroy-attacker";
      cancelAttack: boolean;
    }
  | {
      kind: "damage-spell-owner";
      amount: number;
    };

export type UnitCardDefinition = {
  id: string;
  name: string;
  type: "unit";
  cost: number;
  attack: number;
  health: number;
  text: string;
};

export type SpellCardDefinition = {
  id: string;
  name: string;
  type: "spell";
  cost: number;
  text: string;
  effects: SpellEffect[];
};

export type TrapCardDefinition = {
  id: string;
  name: string;
  type: "trap";
  cost: number;
  text: string;
  trigger: TrapTrigger;
  effect: TrapEffect;
};

export type CardDefinition = UnitCardDefinition | SpellCardDefinition | TrapCardDefinition;

export type CardInstance = {
  instanceId: string;
  cardId: string;
};

export type UnitOnBoard = {
  instanceId: string;
  cardId: string;
  currentHealth: number;
  exhausted: boolean;
  summoningSick: boolean;
};

export type TrapOnBoard = {
  instanceId: string;
  cardId: string;
  faceDown: boolean;
};

export type PlayerState = {
  id: PlayerIndex;
  name: string;
  health: number;
  maxResource: number;
  currentResource: number;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  board: UnitOnBoard[];
  traps: TrapOnBoard[];
};

export type GameState = {
  players: [PlayerState, PlayerState];
  activePlayer: PlayerIndex;
  turnNumber: number;
  winner: PlayerIndex | null;
  log: string[];
};

export type GameAction =
  | {
      type: "play-card";
      cardInstanceId: string;
    }
  | {
      type: "attack-unit";
      attackerId: string;
      defenderId: string;
    }
  | {
      type: "attack-hero";
      attackerId: string;
    }
  | {
      type: "end-turn";
    }
  | {
      type: "restart";
    };
