import { getCardById, isTrapCard, isUnitCard } from "./cards";
import { STARTER_DECK } from "./decks";
import { LOG_LIMIT, MAX_RESOURCE, MAX_UNITS_PER_SIDE, STARTING_HAND_SIZE, STARTING_HEALTH } from "./rules";
import type {
  CardDefinition,
  CardInstance,
  GameAction,
  GameState,
  PendingTrapPrompt,
  PlayerIndex,
  PlayerState,
  SpellCardDefinition,
  TrapCardDefinition,
  UnitOnBoard
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
  pendingTrapPrompt: state.pendingTrapPrompt ? { ...state.pendingTrapPrompt } : null
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

const buildDeck = (player: PlayerIndex): CardInstance[] =>
  shuffle(
    STARTER_DECK.map((cardId, index) => ({
      instanceId: `p${player}-${index}-${cardId}`,
      cardId
    }))
  );

const createPlayer = (player: PlayerIndex, playerNames: [string, string]): PlayerState => ({
  id: player,
  name: playerNames[player],
  health: STARTING_HEALTH,
  maxResource: 0,
  currentResource: 0,
  deck: buildDeck(player),
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
      if (drawIndex === 0) {
        pushLog(state, `${player.name} tried to draw, but the deck was empty.`);
      } else {
        pushLog(state, `${player.name} drew ${cardsDrawn} card${cardsDrawn === 1 ? "" : "s"} before the deck ran out.`);
      }
      return;
    }

    player.hand.push(nextCard);
    cardsDrawn += 1;
  }

  if (cardsDrawn > 0) {
    pushLog(state, `${player.name} drew ${cardsDrawn} card${cardsDrawn === 1 ? "" : "s"}.`);
  }
};

const cleanupUnits = (state: GameState) => {
  state.players.forEach((player) => {
    const survivingUnits: UnitOnBoard[] = [];

    player.board.forEach((unit) => {
      if (unit.currentHealth > 0) {
        survivingUnits.push(unit);
        return;
      }

      player.discard.push({
        instanceId: unit.instanceId,
        cardId: unit.cardId
      });
      pushLog(state, `${player.name}'s ${getCardById(unit.cardId).name} was destroyed.`);
    });

    player.board = survivingUnits;
  });
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

const resolveSpell = (state: GameState, playerId: PlayerIndex, card: SpellCardDefinition) => {
  card.effects.forEach((effect) => {
    if (state.winner !== null) {
      return;
    }

    switch (effect.kind) {
      case "damage-hero": {
        const targetPlayer = effect.target === "self" ? playerId : otherPlayer(playerId);
        state.players[targetPlayer].health -= effect.amount;
        pushLog(
          state,
          `${state.players[playerId].name} dealt ${effect.amount} damage to ${state.players[targetPlayer].name}.`
        );
        break;
      }
      case "draw":
        drawCards(state, playerId, effect.amount);
        break;
      case "damage-units": {
        const affectedPlayers: PlayerIndex[] =
          effect.side === "both"
            ? [0, 1]
            : [effect.side === "self" ? playerId : otherPlayer(playerId)];

        affectedPlayers.forEach((affectedPlayer) => {
          state.players[affectedPlayer].board.forEach((unit) => {
            unit.currentHealth -= effect.amount;
          });
        });
        pushLog(state, `${card.name} dealt ${effect.amount} damage to the targeted units.`);
        cleanupUnits(state);
        break;
      }
      default:
        break;
    }

    checkWinner(state);
  });
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

const maybeQueueSpellTrap = (state: GameState, spellOwnerId: PlayerIndex) => {
  const trapOwnerId = otherPlayer(spellOwnerId);
  const trap = state.players[trapOwnerId].traps.find((item) => {
    const definition = getCardById(item.cardId);
    return isTrapCard(definition) && definition.trigger === "enemy-spell";
  });

  if (!trap) {
    return false;
  }

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

  if (!isTrapCard(definition)) {
    return null;
  }

  trapOwner.discard.push({
    instanceId: trap.instanceId,
    cardId: trap.cardId
  });

  return definition;
};

const finishAttackUnit = (state: GameState, attackerId: string, defenderId: string) => {
  const attackerOwnerId = state.activePlayer;
  const defenderOwnerId = otherPlayer(attackerOwnerId);
  const attackerOwner = state.players[attackerOwnerId];
  const defenderOwner = state.players[defenderOwnerId];
  const attacker = attackerOwner.board.find((unit) => unit.instanceId === attackerId);
  const defender = defenderOwner.board.find((unit) => unit.instanceId === defenderId);

  if (!attacker || !defender || !canUnitAttack(attacker)) {
    return state;
  }

  const attackerCard = getCardById(attacker.cardId);
  const defenderCard = getCardById(defender.cardId);

  if (!isUnitCard(attackerCard) || !isUnitCard(defenderCard)) {
    return state;
  }

  attacker.exhausted = true;
  attacker.currentHealth -= defenderCard.attack;
  defender.currentHealth -= attackerCard.attack;
  pushLog(state, `${attackerCard.name} attacked ${defenderCard.name}.`);
  cleanupUnits(state);
  checkWinner(state);
  return state;
};

const finishAttackHero = (state: GameState, attackerId: string) => {
  const attackerOwnerId = state.activePlayer;
  const defenderOwnerId = otherPlayer(attackerOwnerId);
  const attackerOwner = state.players[attackerOwnerId];
  const defenderOwner = state.players[defenderOwnerId];
  const attacker = attackerOwner.board.find((unit) => unit.instanceId === attackerId);

  if (!attacker || !canUnitAttack(attacker) || defenderOwner.board.length > 0) {
    return state;
  }

  const attackerCard = getCardById(attacker.cardId);

  if (!isUnitCard(attackerCard)) {
    return state;
  }

  attacker.exhausted = true;
  defenderOwner.health -= attackerCard.attack;
  pushLog(
    state,
    `${attackerOwner.name}'s ${attackerCard.name} attacked ${defenderOwner.name} for ${attackerCard.attack}.`
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
    return state;
  }

  if (!useTrap) {
    pushLog(state, `${state.players[prompt.trapOwner].name} declined to use ${trapDefinition.name}.`);

    if (prompt.kind === "attack" && prompt.defenderId) {
      return finishAttackUnit(state, prompt.attackerId, prompt.defenderId);
    }

    if (prompt.kind === "attack") {
      return finishAttackHero(state, prompt.attackerId);
    }

    return state;
  }

  const consumedTrap = consumeTrap(state, prompt.trapOwner, prompt.trapInstanceId);

  if (!consumedTrap) {
    return state;
  }

  if (prompt.kind === "spell" && consumedTrap.effect.kind === "damage-spell-owner") {
    state.players[prompt.spellOwner].health -= consumedTrap.effect.amount;
    pushLog(
      state,
      `${state.players[prompt.trapOwner].name}'s ${consumedTrap.name} triggered and dealt ${consumedTrap.effect.amount} damage to ${state.players[prompt.spellOwner].name}.`
    );
    checkWinner(state);
    return state;
  }

  if (prompt.kind === "attack" && consumedTrap.effect.kind === "destroy-attacker") {
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
      if (prompt.defenderId) {
        return finishAttackUnit(state, prompt.attackerId, prompt.defenderId);
      }
      return finishAttackHero(state, prompt.attackerId);
    }
  }

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

export const canUnitAttack = (unit: UnitOnBoard) => !unit.exhausted && !unit.summoningSick;

export const createInitialGameState = (playerNames: [string, string] = PLAYER_NAMES): GameState => {
  const initialState: GameState = {
    players: [createPlayer(0, playerNames), createPlayer(1, playerNames)],
    activePlayer: 0,
    turnNumber: 0,
    winner: null,
    log: [],
    pendingTrapPrompt: null
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

  if (!card || activePlayer.currentResource < card.cost) {
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
      exhausted: false,
      summoningSick: true
    });
    pushLog(state, `${activePlayer.name} played ${card.name}.`);
    return state;
  }

  if (card.type === "spell") {
    activePlayer.discard.push(cardInstance);
    pushLog(state, `${activePlayer.name} cast ${card.name}.`);
    resolveSpell(state, state.activePlayer, card);
    if (state.winner === null) {
      maybeQueueSpellTrap(state, state.activePlayer);
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
  const attackerOwnerId = state.activePlayer;
  const defenderOwnerId = otherPlayer(attackerOwnerId);
  const attackerOwner = state.players[attackerOwnerId];
  const defenderOwner = state.players[defenderOwnerId];
  const attacker = attackerOwner.board.find((unit) => unit.instanceId === attackerId);
  const defender = defenderOwner.board.find((unit) => unit.instanceId === defenderId);

  if (!attacker || !defender || !canUnitAttack(attacker)) {
    return state;
  }

  if (maybeQueueAttackTrap(state, attackerOwnerId, attackerId, defenderId, "unit")) {
    return state;
  }

  return finishAttackUnit(state, attackerId, defenderId);
};

const attackHero = (state: GameState, attackerId: string) => {
  const attackerOwnerId = state.activePlayer;
  const defenderOwnerId = otherPlayer(attackerOwnerId);
  const attackerOwner = state.players[attackerOwnerId];
  const defenderOwner = state.players[defenderOwnerId];
  const attacker = attackerOwner.board.find((unit) => unit.instanceId === attackerId);

  if (!attacker || !canUnitAttack(attacker) || defenderOwner.board.length > 0) {
    return state;
  }

  if (maybeQueueAttackTrap(state, attackerOwnerId, attackerId, null, "hero")) {
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
      return (
        state.players[playerId].currentResource >= definition.cost &&
        state.players[playerId].board.length < MAX_UNITS_PER_SIDE
      );
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
