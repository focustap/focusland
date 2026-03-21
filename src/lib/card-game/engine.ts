import { getCardById, isTrapCard, isUnitCard } from "./cards";
import { STARTER_DECK } from "./decks";
import { LOG_LIMIT, MAX_RESOURCE, MAX_UNITS_PER_SIDE, STARTING_HAND_SIZE, STARTING_HEALTH } from "./rules";
import type {
  CardDefinition,
  CardInstance,
  GameAction,
  GameState,
  PlayerIndex,
  PlayerState,
  SpellCardDefinition,
  UnitOnBoard
} from "./types";

const PLAYER_NAMES = ["Player 1", "Player 2"] as const;

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
  log: [...state.log]
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

const createPlayer = (player: PlayerIndex): PlayerState => ({
  id: player,
  name: PLAYER_NAMES[player],
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
      state.winner = otherPlayer(playerId);
      pushLog(state, `${player.name} tried to draw from an empty deck and lost.`);
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

const triggerSpellTrap = (state: GameState, spellOwnerId: PlayerIndex) => {
  const trapOwnerId = otherPlayer(spellOwnerId);
  const trapOwner = state.players[trapOwnerId];
  const trapIndex = trapOwner.traps.findIndex((trap) => {
    const trapDefinition = getCardById(trap.cardId);
    return isTrapCard(trapDefinition) && trapDefinition.trigger === "enemy-spell";
  });

  if (trapIndex < 0) {
    return;
  }

  const trap = trapOwner.traps.splice(trapIndex, 1)[0];
  const trapDefinition = getCardById(trap.cardId);

  if (!isTrapCard(trapDefinition) || trapDefinition.effect.kind !== "damage-spell-owner") {
    return;
  }

  trapOwner.discard.push({
    instanceId: trap.instanceId,
    cardId: trap.cardId
  });
  state.players[spellOwnerId].health -= trapDefinition.effect.amount;
  pushLog(
    state,
    `${trapOwner.name}'s ${trapDefinition.name} triggered and dealt ${trapDefinition.effect.amount} damage to ${state.players[spellOwnerId].name}.`
  );
  checkWinner(state);
};

const triggerAttackTrap = (state: GameState, attackerOwnerId: PlayerIndex, attackerId: string) => {
  const trapOwnerId = otherPlayer(attackerOwnerId);
  const trapOwner = state.players[trapOwnerId];
  const trapIndex = trapOwner.traps.findIndex((trap) => {
    const trapDefinition = getCardById(trap.cardId);
    return isTrapCard(trapDefinition) && trapDefinition.trigger === "enemy-attack";
  });

  if (trapIndex < 0) {
    return false;
  }

  const trap = trapOwner.traps.splice(trapIndex, 1)[0];
  const trapDefinition = getCardById(trap.cardId);

  if (!isTrapCard(trapDefinition) || trapDefinition.effect.kind !== "destroy-attacker") {
    return false;
  }

  trapOwner.discard.push({
    instanceId: trap.instanceId,
    cardId: trap.cardId
  });

  const attackerBoard = state.players[attackerOwnerId].board;
  const attackerIndex = attackerBoard.findIndex((unit) => unit.instanceId === attackerId);

  if (attackerIndex >= 0) {
    const destroyedAttacker = attackerBoard.splice(attackerIndex, 1)[0];
    state.players[attackerOwnerId].discard.push({
      instanceId: destroyedAttacker.instanceId,
      cardId: destroyedAttacker.cardId
    });
    pushLog(
      state,
      `${trapOwner.name}'s ${trapDefinition.name} destroyed ${state.players[attackerOwnerId].name}'s ${getCardById(destroyedAttacker.cardId).name}.`
    );
  }

  return trapDefinition.effect.cancelAttack;
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

export const createInitialGameState = (): GameState => {
  const initialState: GameState = {
    players: [createPlayer(0), createPlayer(1)],
    activePlayer: 0,
    turnNumber: 0,
    winner: null,
    log: []
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
      triggerSpellTrap(state, state.activePlayer);
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

  const attackCanceled = triggerAttackTrap(state, attackerOwnerId, attackerId);
  if (attackCanceled) {
    return state;
  }

  const currentAttacker = attackerOwner.board.find((unit) => unit.instanceId === attackerId);
  const currentDefender = defenderOwner.board.find((unit) => unit.instanceId === defenderId);

  if (!currentAttacker || !currentDefender) {
    return state;
  }

  const attackerCard = getCardById(currentAttacker.cardId);
  const defenderCard = getCardById(currentDefender.cardId);

  if (!isUnitCard(attackerCard) || !isUnitCard(defenderCard)) {
    return state;
  }

  currentAttacker.exhausted = true;
  currentAttacker.currentHealth -= defenderCard.attack;
  currentDefender.currentHealth -= attackerCard.attack;
  pushLog(state, `${attackerCard.name} attacked ${defenderCard.name}.`);
  cleanupUnits(state);
  checkWinner(state);
  return state;
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

  const attackCanceled = triggerAttackTrap(state, attackerOwnerId, attackerId);
  if (attackCanceled) {
    return state;
  }

  const currentAttacker = attackerOwner.board.find((unit) => unit.instanceId === attackerId);

  if (!currentAttacker) {
    return state;
  }

  const attackerCard = getCardById(currentAttacker.cardId);

  if (!isUnitCard(attackerCard)) {
    return state;
  }

  currentAttacker.exhausted = true;
  defenderOwner.health -= attackerCard.attack;
  pushLog(
    state,
    `${attackerOwner.name}'s ${attackerCard.name} attacked ${defenderOwner.name} for ${attackerCard.attack}.`
  );
  checkWinner(state);
  return state;
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

export const cardGameReducer = (state: GameState, action: GameAction): GameState => {
  if (action.type === "restart") {
    return createInitialGameState();
  }

  if (state.winner !== null) {
    return state;
  }

  const nextState = cloneState(state);

  switch (action.type) {
    case "play-card":
      return playCard(nextState, action.cardInstanceId);
    case "attack-unit":
      return attackUnit(nextState, action.attackerId, action.defenderId);
    case "attack-hero":
      return attackHero(nextState, action.attackerId);
    case "end-turn":
      return endTurn(nextState);
    default:
      return nextState;
  }
};
