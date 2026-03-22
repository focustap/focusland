export type PlayerIndex = 0 | 1;

export type CardType = "unit" | "spell" | "trap";

export type CardSet =
  | "starter"
  | "skybreak"
  | "ironroot"
  | "wildgrove"
  | "emberwake"
  | "tideveil"
  | "moonwire";

export type CardFamily = "starter" | "sky" | "iron" | "wild" | "ember" | "tide" | "lunar";

export type CardVisualTheme =
  | "spark"
  | "iron"
  | "dusk"
  | "river"
  | "stone"
  | "ember"
  | "tactics"
  | "storm"
  | "vine"
  | "lunar"
  | "snare"
  | "wire";

export type UnitKeyword = "flying" | "swift" | "ranged" | "guard" | "stealth";

export type UnitTargetSelector =
  | "self"
  | "lowest-health-ally"
  | "highest-attack-ally"
  | "damaged-ally"
  | "lowest-health-enemy"
  | "highest-attack-enemy";

export type SpellEffect =
  | {
      kind: "damage-hero";
      amount: number;
      target: "self" | "enemy";
    }
  | {
      kind: "heal-hero";
      amount: number;
      target: "self";
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
    }
  | {
      kind: "damage-unit";
      amount: number;
      selector: UnitTargetSelector;
    }
  | {
      kind: "heal-unit";
      amount: number;
      selector: UnitTargetSelector;
    }
  | {
      kind: "buff-unit";
      selector: UnitTargetSelector;
      attack: number;
      health: number;
    }
  | {
      kind: "debuff-unit";
      selector: UnitTargetSelector;
      attack: number;
      health: number;
    }
  | {
      kind: "bounce-unit";
      selector: UnitTargetSelector;
    }
  | {
      kind: "gain-resource";
      amount: number;
      target: "self";
    };

export type TriggeredEffect =
  | {
      kind: "damage-hero";
      amount: number;
      target: "self" | "enemy";
    }
  | {
      kind: "heal-hero";
      amount: number;
      target: "self";
    }
  | {
      kind: "draw";
      amount: number;
      target: "self";
    }
  | {
      kind: "damage-unit";
      amount: number;
      selector: UnitTargetSelector;
    }
  | {
      kind: "heal-unit";
      amount: number;
      selector: UnitTargetSelector;
    }
  | {
      kind: "buff-unit";
      selector: UnitTargetSelector;
      attack: number;
      health: number;
    }
  | {
      kind: "debuff-unit";
      selector: UnitTargetSelector;
      attack: number;
      health: number;
    }
  | {
      kind: "bounce-unit";
      selector: UnitTargetSelector;
    }
  | {
      kind: "gain-resource";
      amount: number;
      target: "self";
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
    }
  | {
      kind: "spell-tax";
      taxAmount: number;
    };

export type UnitCardDefinition = {
  id: string;
  name: string;
  type: "unit";
  set: CardSet;
  family: CardFamily;
  cost: number;
  attack: number;
  health: number;
  text: string;
  artLabel: string;
  visualTheme: CardVisualTheme;
  keywords?: UnitKeyword[];
  onPlayEffects?: TriggeredEffect[];
  onDeathEffects?: TriggeredEffect[];
};

export type SpellCardDefinition = {
  id: string;
  name: string;
  type: "spell";
  set: CardSet;
  family: CardFamily;
  cost: number;
  text: string;
  effects: SpellEffect[];
  artLabel: string;
  visualTheme: CardVisualTheme;
};

export type TrapCardDefinition = {
  id: string;
  name: string;
  type: "trap";
  set: CardSet;
  family: CardFamily;
  cost: number;
  text: string;
  trigger: TrapTrigger;
  effect: TrapEffect;
  artLabel: string;
  visualTheme: CardVisualTheme;
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
  attackModifier: number;
  maxHealthModifier: number;
  exhausted: boolean;
  summoningSick: boolean;
  stealthed: boolean;
};

export type TrapOnBoard = {
  instanceId: string;
  cardId: string;
  faceDown: boolean;
};

export type PendingTrapPrompt =
  | {
      kind: "attack";
      trapOwner: PlayerIndex;
      trapInstanceId: string;
      attackerOwner: PlayerIndex;
      attackerId: string;
      defenderId: string | null;
      target: "unit" | "hero";
    }
  | {
      kind: "spell";
      trapOwner: PlayerIndex;
      trapInstanceId: string;
      spellOwner: PlayerIndex;
    };

export type PendingSpellResolution = {
  spellOwner: PlayerIndex;
  cardInstance: CardInstance;
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
  pendingTrapPrompt: PendingTrapPrompt | null;
  pendingSpellResolution: PendingSpellResolution | null;
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
    }
  | {
      type: "respond-trap";
      useTrap: boolean;
    };
