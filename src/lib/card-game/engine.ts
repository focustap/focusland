import { getCardById, isTrapCard, isUnitCard } from "./cards";
import { sanitizeDeckList } from "./deckBuilding";
import { STARTER_DECK } from "./decks";
import { LOG_LIMIT, MAX_RESOURCE, MAX_UNITS_PER_SIDE, STARTING_HAND_SIZE, STARTING_HEALTH } from "./rules";
import type {
  CardDefinition,
  CardInstance,
  GameAction,
  GameState,
  PendingSpellResolution,
  PendingTrapPrompt,
  PlayerIndex,
  PlayerState,
  SpellCardDefinition,
  SpellEffect,
  TrapCardDefinition,
  TriggeredEffect,
  UnitKeyword,
  UnitOnBoard,
  UnitTargetSelector
} from "./types";

const PLAYER_NAMES: [string, string] = ["Player 1", "Player 2"];

const otherPlayer = (player: PlayerIndex): PlayerIndex => (player === 0 ? 1 : 0);

const clonePlayer = (player: PlayerState): PlayerState => ({
  ...player,
  deck: [...player.deck],
  hand: [...player.hand],
  discard: [...player.discard],
  board: player.board.map((unit) => ({ ...unit })),
  traps: player.traps.map((trap) => ({ ...trap }))
});

const cloneState = (state: GameState): GameState => ({
  ...state,
  players: [clonePlayer(state.players[0]), clonePlayer(state.players[1])],
  log: [...state.log],
  pendingTrapPrompt: state.pendingTrapPrompt ? { ...state.pendingTrapPrompt } : null,
  pendingSpellResolution: state.pendingSpellResolution
    ? {
        ...state.pendingSpellResolution,
        cardInstance: { ...state.pendingSpellResolution.cardInstance }
      }
    : null
});

const pushLog = (state: GameState, message: string) => {
  state.log.unshift(message);
  state.log = state.log.slice(0, LOG_LIMIT);
};

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const buildDeck = (player: PlayerIndex, deckList: string[]): CardInstance[] =>
  shuffle(
    sanitizeDeckList(deckList).map((cardId, index) => ({
      instanceId: `p${player}-${index}-${cardId}`,
      cardId
    }))
  );

const createPlayer = (
  player: PlayerIndex,
  playerNames: [string, string],
  deckList: string[]
): PlayerState => ({
  id: player,
  name: playerNames[player],
  health: STARTING_HEALTH,
  maxResource: 0,
  currentResource: 0,
  deck: buildDeck(player, deckList),
  hand: [],
  discard: [],
  board: [],
  traps: []
});

const drawCards = (state: GameState, playerId: PlayerIndex, amount: number) => {
  const player = state.players[playerId];
  let cardsDrawn = 0;

  for (let drawIndex = 0; drawIndex < amount; drawIndex += 1) {
    const nextCard = player.deck.shift();
    if (!nextCard) {
      pushLog(
        state,
        cardsDrawn > 0
          ? `${player.name} drew ${cardsDrawn} card${cardsDrawn === 1 ? "" : "s"} before the deck ran out.`
          : `${player.name} tried to draw, but the deck was empty.`
      );
      return;
    }

    player.hand.push(nextCard);
    cardsDrawn += 1;
  }

  if (cardsDrawn > 0) {
    pushLog(state, `${player.name} drew ${cardsDrawn} card${cardsDrawn === 1 ? "" : "s"}.`);
  }
};

const checkWinner = (state: GameState) => {
  if (state.players[0].health <= 0 && state.players[1].health <= 0) {
    state.winner = state.activePlayer;
    return;
  }

  if (state.players[0].health <= 0) {
    state.winner = 1;
  } else if (state.players[1].health <= 0) {
    state.winner = 0;
  }
};

const unitHasKeyword = (unit: UnitOnBoard | string, keyword: UnitKeyword) => {
  const card = typeof unit === "string" ? getCardById(unit) : getCardById(unit.cardId);
  return isUnitCard(card) && card.keywords?.includes(keyword);
};

export const getUnitTotalAttack = (unit: UnitOnBoard) => {
  const card = getCardById(unit.cardId);
  return isUnitCard(card) ? Math.max(0, card.attack + unit.attackModifier) : 0;
};

export const getUnitTotalHealth = (unit: UnitOnBoard) => {
  const card = getCardById(unit.cardId);
  return isUnitCard(card) ? Math.max(1, card.health + unit.maxHealthModifier) : 1;
};

const changeHeroHealth = (state: GameState, playerId: PlayerIndex, amount: number, mode: "damage" | "heal") => {
  const player = state.players[playerId];
  if (mode === "damage") {
    player.health -= amount;
  } else {
    player.health = Math.min(STARTING_HEALTH, player.health + amount);
  }
  checkWinner(state);
};

const adjustUnitStats = (unit: UnitOnBoard, attackDelta: number, healthDelta: number) => {
  unit.attackModifier += attackDelta;
  unit.maxHealthModifier += healthDelta;
  unit.currentHealth = Math.min(getUnitTotalHealth(unit), unit.currentHealth + healthDelta);
};

const getTargetPool = (
  state: GameState,
  ownerId: PlayerIndex,
  selector: UnitTargetSelector
): UnitOnBoard[] => {
  switch (selector) {
    case "self":
    case "lowest-health-ally":
    case "highest-attack-ally":
    case "damaged-ally":
      return state.players[ownerId].board;
    case "lowest-health-enemy":
    case "highest-attack-enemy":
      return state.players[otherPlayer(ownerId)].board;
    default:
      return [];
  }
};

const pickUnitFromPool = (
  pool: UnitOnBoard[],
  selector: UnitTargetSelector,
  sourceUnitId?: string
) => {
  if (selector === "self") {
    return pool.find((unit) => unit.instanceId === sourceUnitId) ?? null;
  }

  if (selector === "damaged-ally") {
    return (
      pool
        .filter((unit) => unit.currentHealth < getUnitTotalHealth(unit))
        .sort((left, right) => left.currentHealth - right.currentHealth)[0] ?? null
    );
  }

  if (selector === "lowest-health-ally" || selector === "lowest-health-enemy") {
    return pool.sort((left, right) => left.currentHealth - right.currentHealth)[0] ?? null;
  }

  if (selector === "highest-attack-ally" || selector === "highest-attack-enemy") {
    return pool.sort((left, right) => getUnitTotalAttack(right) - getUnitTotalAttack(left))[0] ?? null;
  }

  return null;
};

const getSelectedUnit = (
  state: GameState,
  ownerId: PlayerIndex,
  selector: UnitTargetSelector,
  sourceUnitId?: string
) => pickUnitFromPool([...getTargetPool(state, ownerId, selector)], selector, sourceUnitId);

const returnUnitToHand = (state: GameState, ownerId: PlayerIndex, unit: UnitOnBoard) => {
  const owner = state.players[ownerId];
  owner.board = owner.board.filter((entry) => entry.instanceId !== unit.instanceId);
  owner.hand.push({
    instanceId: unit.instanceId,
    cardId: unit.cardId
  });
};

const applyEffect = (
  state: GameState,
  ownerId: PlayerIndex,
  effect: SpellEffect | TriggeredEffect,
  sourceUnitId?: string
) => {
  switch (effect.kind) {
    case "damage-hero":
      changeHeroHealth(state, effect.target === "self" ? ownerId : otherPlayer(ownerId), effect.amount, "damage");
      return;
    case "heal-hero":
      changeHeroHealth(state, ownerId, effect.amount, "heal");
      return;
    case "draw":
      drawCards(state, ownerId, effect.amount);
      return;
    case "damage-units": {
      const sides: PlayerIndex[] =
        effect.side === "both"
          ? [0, 1]
          : [effect.side === "self" ? ownerId : otherPlayer(ownerId)];
      sides.forEach((playerId) => {
        state.players[playerId].board.forEach((unit) => {
          unit.currentHealth -= effect.amount;
        });
      });
      return;
    }
    case "damage-unit": {
      const target = getSelectedUnit(state, ownerId, effect.selector, sourceUnitId);
      if (target) {
        target.currentHealth -= effect.amount;
      }
      return;
    }
    case "heal-unit": {
      const target = getSelectedUnit(state, ownerId, effect.selector, sourceUnitId);
      if (target) {
        target.currentHealth = Math.min(getUnitTotalHealth(target), target.currentHealth + effect.amount);
      }
      return;
    }
    case "buff-unit": {
      const target = getSelectedUnit(state, ownerId, effect.selector, sourceUnitId);
      if (target) {
        adjustUnitStats(target, effect.attack, effect.health);
      }
      return;
    }
    case "debuff-unit": {
      const target = getSelectedUnit(state, ownerId, effect.selector, sourceUnitId);
      if (target) {
        adjustUnitStats(target, -effect.attack, -effect.health);
      }
      return;
    }
    case "bounce-unit": {
      const enemyTarget = effect.selector.endsWith("enemy");
      const targetOwnerId = enemyTarget ? otherPlayer(ownerId) : ownerId;
      const target = getSelectedUnit(state, ownerId, effect.selector, sourceUnitId);
      if (target) {
        returnUnitToHand(state, targetOwnerId, target);
      }
      return;
    }
    case "gain-resource":
      state.players[ownerId].currentResource = Math.min(
        MAX_RESOURCE,
        state.players[ownerId].currentResource + effect.amount
      );
      return;
    default:
      return;
  }
};

const cleanupUnits = (state: GameState) => {
  let removedUnit = false;

  do {
    removedUnit = false;

    state.players.forEach((player) => {
      const nextBoard: UnitOnBoard[] = [];

      player.board.forEach((unit) => {
        if (unit.currentHealth > 0) {
          nextBoard.push(unit);
          return;
        }

        removedUnit = true;
        const card = getCardById(unit.cardId);
        player.discard.push({
          instanceId: unit.instanceId,
          cardId: unit.cardId
        });
        pushLog(state, `${player.name}'s ${card.name} was destroyed.`);

        if (isUnitCard(card) && card.onDeathEffects?.length) {
          card.onDeathEffects.forEach((effect) => applyEffect(state, player.id, effect, unit.instanceId));
        }
      });

      player.board = nextBoard;
    });
  } while (removedUnit);

  checkWinner(state);
};

const resolveSpell = (state: GameState, playerId: PlayerIndex, card: SpellCardDefinition) => {
  card.effects.forEach((effect) => {
    if (state.winner !== null) {
      return;
    }
    applyEffect(state, playerId, effect);
    cleanupUnits(state);
  });
};

const finishPendingSpellResolution = (state: GameState) => {
  const pending = state.pendingSpellResolution;
  if (!pending) {
    return;
  }

  const owner = state.players[pending.spellOwner];
  owner.discard.push(pending.cardInstance);

  const card = getCardById(pending.cardInstance.cardId);
  if (card.type === "spell") {
    resolveSpell(state, pending.spellOwner, card);
  }

  state.pendingSpellResolution = null;
};

const getPendingTrapDefinition = (state: GameState) => {
  const prompt = state.pendingTrapPrompt;
  if (!prompt) {
    return null;
  }

  const trapOwner = state.players[prompt.trapOwner];
  const trap = trapOwner.traps.find((item) => item.instanceId === prompt.trapInstanceId);
  if (!trap) {
    return null;
  }

  const definition = getCardById(trap.cardId);
  return isTrapCard(definition) ? definition : null;
};

const queueTrapPrompt = (state: GameState, prompt: PendingTrapPrompt) => {
  state.pendingTrapPrompt = prompt;
  pushLog(state, `${state.players[prompt.trapOwner].name} may trigger a trap.`);
};

const maybeQueueSpellTrap = (
  state: GameState,
  spellOwnerId: PlayerIndex,
  cardInstance: CardInstance
) => {
  const trapOwnerId = otherPlayer(spellOwnerId);
  const trap = state.players[trapOwnerId].traps.find((item) => {
    const definition = getCardById(item.cardId);
    return isTrapCard(definition) && definition.trigger === "enemy-spell";
  });

  if (!trap) {
    return false;
  }

  state.pendingSpellResolution = {
    spellOwner: spellOwnerId,
    cardInstance
  };

  queueTrapPrompt(state, {
    kind: "spell",
    trapOwner: trapOwnerId,
    trapInstanceId: trap.instanceId,
    spellOwner: spellOwnerId
  });

  return true;
};

const maybeQueueAttackTrap = (
  state: GameState,
  attackerOwnerId: PlayerIndex,
  attackerId: string,
  defenderId: string | null,
  target: "unit" | "hero"
) => {
  const trapOwnerId = otherPlayer(attackerOwnerId);
  const trap = state.players[trapOwnerId].traps.find((item) => {
    const definition = getCardById(item.cardId);
    return isTrapCard(definition) && definition.trigger === "enemy-attack";
  });

  if (!trap) {
    return false;
  }

  queueTrapPrompt(state, {
    kind: "attack",
    trapOwner: trapOwnerId,
    trapInstanceId: trap.instanceId,
    attackerOwner: attackerOwnerId,
    attackerId,
    defenderId,
    target
  });

  return true;
};

const consumeTrap = (state: GameState, trapOwnerId: PlayerIndex, trapInstanceId: string) => {
  const trapOwner = state.players[trapOwnerId];
  const trapIndex = trapOwner.traps.findIndex((trap) => trap.instanceId === trapInstanceId);
  if (trapIndex < 0) {
    return null;
  }

  const trap = trapOwner.traps.splice(trapIndex, 1)[0];
  const definition = getCardById(trap.cardId);
  trapOwner.discard.push({ instanceId: trap.instanceId, cardId: trap.cardId });

  return isTrapCard(definition) ? definition : null;
};

const unitCanTargetUnit = (attacker: UnitOnBoard, defender: UnitOnBoard) => {
  if (defender.stealthed) {
    return false;
  }

  if (unitHasKeyword(defender, "flying")) {
    return unitHasKeyword(attacker, "flying") || unitHasKeyword(attacker, "ranged");
  }

  return true;
};

const unitCanBlockAttacker = (defender: UnitOnBoard, attacker: UnitOnBoard) => {
  if (defender.stealthed) {
    return false;
  }

  if (unitHasKeyword(attacker, "flying")) {
    return unitHasKeyword(defender, "flying") || unitHasKeyword(defender, "ranged");
  }

  return true;
};

const getAttackableDefenders = (attacker: UnitOnBoard, defenders: UnitOnBoard[]) =>
  defenders.filter((defender) => unitCanTargetUnit(attacker, defender));

const targetMustBeGuard = (attacker: UnitOnBoard, defenders: UnitOnBoard[]) =>
  getAttackableDefenders(attacker, defenders).some((defender) => unitHasKeyword(defender, "guard"));

export const canUnitAttack = (unit: UnitOnBoard) =>
  !unit.exhausted && (!unit.summoningSick || unitHasKeyword(unit, "swift"));

export const canUnitAttackHeroDirectly = (attacker: UnitOnBoard, defendingUnits: UnitOnBoard[]) =>
  canUnitAttack(attacker) && !defendingUnits.some((defender) => unitCanBlockAttacker(defender, attacker));

const finishAttackUnit = (state: GameState, attackerId: string, defenderId: string) => {
  const attackerOwnerId = state.activePlayer;
  const defenderOwnerId = otherPlayer(attackerOwnerId);
  const attacker = state.players[attackerOwnerId].board.find((unit) => unit.instanceId === attackerId);
  const defender = state.players[defenderOwnerId].board.find((unit) => unit.instanceId === defenderId);

  if (!attacker || !defender || !canUnitAttack(attacker)) {
    return state;
  }

  const legalTargets = getAttackableDefenders(attacker, state.players[defenderOwnerId].board);
  if (!legalTargets.some((unit) => unit.instanceId === defenderId)) {
    return state;
  }

  if (targetMustBeGuard(attacker, state.players[defenderOwnerId].board) && !unitHasKeyword(defender, "guard")) {
    return state;
  }

  attacker.exhausted = true;
  attacker.stealthed = false;
  defender.currentHealth -= getUnitTotalAttack(attacker);

  if (unitCanTargetUnit(defender, attacker)) {
    attacker.currentHealth -= getUnitTotalAttack(defender);
  }

  pushLog(state, `${getCardById(attacker.cardId).name} attacked ${getCardById(defender.cardId).name}.`);
  cleanupUnits(state);
  return state;
};

const finishAttackHero = (state: GameState, attackerId: string) => {
  const attackerOwnerId = state.activePlayer;
  const defenderOwnerId = otherPlayer(attackerOwnerId);
  const attacker = state.players[attackerOwnerId].board.find((unit) => unit.instanceId === attackerId);

  if (!attacker || !canUnitAttackHeroDirectly(attacker, state.players[defenderOwnerId].board)) {
    return state;
  }

  attacker.exhausted = true;
  attacker.stealthed = false;
  state.players[defenderOwnerId].health -= getUnitTotalAttack(attacker);
  pushLog(
    state,
    `${state.players[attackerOwnerId].name}'s ${getCardById(attacker.cardId).name} attacked ${state.players[defenderOwnerId].name} for ${getUnitTotalAttack(attacker)}.`
  );
  checkWinner(state);
  return state;
};

const resolveTrapPrompt = (state: GameState, useTrap: boolean) => {
  const prompt = state.pendingTrapPrompt;
  if (!prompt) {
    return state;
  }

  const trapDefinition = getPendingTrapDefinition(state);
  state.pendingTrapPrompt = null;

  if (!trapDefinition) {
    if (prompt.kind === "spell") {
      finishPendingSpellResolution(state);
    }
    return state;
  }

  if (!useTrap) {
    pushLog(state, `${state.players[prompt.trapOwner].name} declined to use ${trapDefinition.name}.`);
    if (prompt.kind === "spell") {
      finishPendingSpellResolution(state);
      return state;
    }
    return prompt.defenderId ? finishAttackUnit(state, prompt.attackerId, prompt.defenderId) : finishAttackHero(state, prompt.attackerId);
  }

  const consumedTrap = consumeTrap(state, prompt.trapOwner, prompt.trapInstanceId);
  if (!consumedTrap) {
    if (prompt.kind === "spell") {
      finishPendingSpellResolution(state);
    }
    return state;
  }

  if (prompt.kind === "spell") {
    if (consumedTrap.effect.kind === "damage-spell-owner") {
      changeHeroHealth(state, prompt.spellOwner, consumedTrap.effect.amount, "damage");
      pushLog(
        state,
        `${state.players[prompt.trapOwner].name}'s ${consumedTrap.name} dealt ${consumedTrap.effect.amount} damage to ${state.players[prompt.spellOwner].name}.`
      );
      finishPendingSpellResolution(state);
      return state;
    }

    if (consumedTrap.effect.kind === "spell-tax") {
      const caster = state.players[prompt.spellOwner];
      if (caster.currentResource >= consumedTrap.effect.taxAmount) {
        caster.currentResource -= consumedTrap.effect.taxAmount;
        pushLog(
          state,
          `${caster.name} paid ${consumedTrap.effect.taxAmount} extra resource through ${consumedTrap.name}.`
        );
        finishPendingSpellResolution(state);
      } else if (state.pendingSpellResolution) {
        caster.discard.push(state.pendingSpellResolution.cardInstance);
        pushLog(state, `${consumedTrap.name} countered ${getCardById(state.pendingSpellResolution.cardInstance.cardId).name}.`);
        state.pendingSpellResolution = null;
      }
      return state;
    }

    finishPendingSpellResolution(state);
    return state;
  }

  if (consumedTrap.effect.kind === "destroy-attacker") {
    const attackerBoard = state.players[prompt.attackerOwner].board;
    const attackerIndex = attackerBoard.findIndex((unit) => unit.instanceId === prompt.attackerId);
    if (attackerIndex >= 0) {
      const destroyedAttacker = attackerBoard.splice(attackerIndex, 1)[0];
      state.players[prompt.attackerOwner].discard.push({
        instanceId: destroyedAttacker.instanceId,
        cardId: destroyedAttacker.cardId
      });
      pushLog(
        state,
        `${state.players[prompt.trapOwner].name}'s ${consumedTrap.name} destroyed ${state.players[prompt.attackerOwner].name}'s ${getCardById(destroyedAttacker.cardId).name}.`
      );
    }

    if (!consumedTrap.effect.cancelAttack) {
      return prompt.defenderId ? finishAttackUnit(state, prompt.attackerId, prompt.defenderId) : finishAttackHero(state, prompt.attackerId);
    }
  }

  cleanupUnits(state);
  return state;
};

const startTurn = (state: GameState, playerId: PlayerIndex) => {
  state.activePlayer = playerId;
  state.turnNumber += 1;

  const player = state.players[playerId];
  player.maxResource = Math.min(MAX_RESOURCE, player.maxResource + 1);
  player.currentResource = player.maxResource;
  player.board = player.board.map((unit) => ({
    ...unit,
    exhausted: false,
    summoningSick: false
  }));

  const isOpeningTurn = state.turnNumber === 1 && playerId === 0;
  if (!isOpeningTurn) {
    drawCards(state, playerId, 1);
  }

  if (state.winner === null) {
    pushLog(state, `${player.name} started turn ${state.turnNumber}.`);
  }
};

export const createInitialGameState = (
  playerNames: [string, string] = PLAYER_NAMES,
  deckLists: [string[], string[]] = [STARTER_DECK, STARTER_DECK]
): GameState => {
  const initialState: GameState = {
    players: [
      createPlayer(0, playerNames, deckLists[0]),
      createPlayer(1, playerNames, deckLists[1])
    ],
    activePlayer: 0,
    turnNumber: 0,
    winner: null,
    log: [],
    pendingTrapPrompt: null,
    pendingSpellResolution: null
  };

  drawCards(initialState, 0, STARTING_HAND_SIZE);
  drawCards(initialState, 1, STARTING_HAND_SIZE);
  startTurn(initialState, 0);
  pushLog(initialState, "Player 1 goes first and skips the first turn draw.");
  return initialState;
};

const playCard = (state: GameState, cardInstanceId: string) => {
  const activePlayer = state.players[state.activePlayer];
  const handIndex = activePlayer.hand.findIndex((card) => card.instanceId === cardInstanceId);
  if (handIndex < 0) {
    return state;
  }

  const cardInstance = activePlayer.hand[handIndex];
  const card = getCardById(cardInstance.cardId);

  if (activePlayer.currentResource < card.cost) {
    return state;
  }

  if (card.type === "unit" && activePlayer.board.length >= MAX_UNITS_PER_SIDE) {
    return state;
  }

  activePlayer.currentResource -= card.cost;
  activePlayer.hand.splice(handIndex, 1);

  if (card.type === "unit") {
    activePlayer.board.push({
      instanceId: cardInstance.instanceId,
      cardId: cardInstance.cardId,
      currentHealth: card.health,
      attackModifier: 0,
      maxHealthModifier: 0,
      exhausted: false,
      summoningSick: !(card.keywords?.includes("swift") ?? false),
      stealthed: card.keywords?.includes("stealth") ?? false
    });
    pushLog(state, `${activePlayer.name} played ${card.name}.`);
    card.onPlayEffects?.forEach((effect) => applyEffect(state, state.activePlayer, effect, cardInstance.instanceId));
    cleanupUnits(state);
    return state;
  }

  if (card.type === "spell") {
    pushLog(state, `${activePlayer.name} cast ${card.name}.`);
    if (!maybeQueueSpellTrap(state, state.activePlayer, cardInstance)) {
      activePlayer.discard.push(cardInstance);
      resolveSpell(state, state.activePlayer, card);
    }
    return state;
  }

  activePlayer.traps.push({
    instanceId: cardInstance.instanceId,
    cardId: cardInstance.cardId,
    faceDown: true
  });
  pushLog(state, `${activePlayer.name} set a trap.`);
  return state;
};

const attackUnit = (state: GameState, attackerId: string, defenderId: string) => {
  const attacker = state.players[state.activePlayer].board.find((unit) => unit.instanceId === attackerId);
  const defenderOwnerId = otherPlayer(state.activePlayer);
  const defender = state.players[defenderOwnerId].board.find((unit) => unit.instanceId === defenderId);

  if (!attacker || !defender || !canUnitAttack(attacker)) {
    return state;
  }

  const legalTargets = getAttackableDefenders(attacker, state.players[defenderOwnerId].board);
  if (!legalTargets.some((unit) => unit.instanceId === defenderId)) {
    return state;
  }

  if (targetMustBeGuard(attacker, state.players[defenderOwnerId].board) && !unitHasKeyword(defender, "guard")) {
    return state;
  }

  if (maybeQueueAttackTrap(state, state.activePlayer, attackerId, defenderId, "unit")) {
    return state;
  }

  return finishAttackUnit(state, attackerId, defenderId);
};

const attackHero = (state: GameState, attackerId: string) => {
  const attacker = state.players[state.activePlayer].board.find((unit) => unit.instanceId === attackerId);
  if (!attacker || !canUnitAttackHeroDirectly(attacker, state.players[otherPlayer(state.activePlayer)].board)) {
    return state;
  }

  if (maybeQueueAttackTrap(state, state.activePlayer, attackerId, null, "hero")) {
    return state;
  }

  return finishAttackHero(state, attackerId);
};

const endTurn = (state: GameState) => {
  startTurn(state, otherPlayer(state.activePlayer));
  return state;
};

export const getPlayableCards = (state: GameState, playerId: PlayerIndex) =>
  state.players[playerId].hand.filter((card) => {
    const definition = getCardById(card.cardId);
    if (definition.type === "unit") {
      return state.players[playerId].currentResource >= definition.cost && state.players[playerId].board.length < MAX_UNITS_PER_SIDE;
    }
    return state.players[playerId].currentResource >= definition.cost;
  });

export const getCard = (cardId: string): CardDefinition => getCardById(cardId);

export const getUnitCard = (cardId: string) => {
  const card = getCardById(cardId);
  return isUnitCard(card) ? card : null;
};

export const getTrapCard = (cardId: string) => {
  const card = getCardById(cardId);
  return isTrapCard(card) ? card : null;
};

export const getPendingTrapCard = (state: GameState): TrapCardDefinition | null => getPendingTrapDefinition(state);

export const cardGameReducer = (state: GameState, action: GameAction): GameState => {
  if (action.type === "restart") {
    return createInitialGameState();
  }

  if (state.winner !== null) {
    return state;
  }

  const nextState = cloneState(state);

  if (nextState.pendingTrapPrompt !== null && action.type !== "respond-trap") {
    return nextState;
  }

  switch (action.type) {
    case "play-card":
      return playCard(nextState, action.cardInstanceId);
    case "attack-unit":
      return attackUnit(nextState, action.attackerId, action.defenderId);
    case "attack-hero":
      return attackHero(nextState, action.attackerId);
    case "end-turn":
      return endTurn(nextState);
    case "respond-trap":
      return resolveTrapPrompt(nextState, action.useTrap);
    default:
      return nextState;
  }
};
