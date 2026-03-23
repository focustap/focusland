import { GWENT_CARDS, GWENT_PREMADE_DECKS, type GwentDataCard } from "./generatedData";

export const GWENT_ROWS = ["close", "ranged", "siege"] as const;
export const GWENT_FACTIONS = ["realms", "nilfgaard", "monsters", "scoiatael", "skellige"] as const;

export type GwentRow = (typeof GWENT_ROWS)[number];
export type GwentFaction = (typeof GWENT_FACTIONS)[number];

export type GwentPlayerConfig = {
  userId: string;
  username: string;
  color: string;
  deckIndex: number;
};

export type GwentCardInstance = {
  instanceId: string;
  cardIndex: number;
};

export type GwentBoardCard = GwentCardInstance & {
  ownerIndex: number;
  sideIndex: number;
  placedRow: GwentRow;
};

export type GwentSpecialInPlay = GwentCardInstance & {
  ownerIndex: number;
  kind: "weather" | "horn" | "mardroeme" | "decoy";
  row: GwentRow | null;
};

export type GwentRowEffects = Record<GwentRow, { horn: boolean; leaderHorn: boolean; mardroeme: boolean }>;

export type GwentPlayerState = {
  userId: string;
  username: string;
  color: string;
  faction: GwentFaction;
  deckName: string;
  leaderCardIndex: number;
  leaderUsed: boolean;
  deck: GwentCardInstance[];
  hand: GwentCardInstance[];
  graveyard: GwentCardInstance[];
  board: Record<GwentRow, GwentBoardCard[]>;
  rowEffects: GwentRowEffects;
  redrawsLeft: number;
  roundWins: number;
  passed: boolean;
};

export type GwentMatchPhase = "redraw" | "choose-first-player" | "playing" | "finished";

export type GwentMatchState = {
  id: string;
  hostUserId: string;
  players: [GwentPlayerState, GwentPlayerState];
  phase: GwentMatchPhase;
  currentPlayerIndex: number;
  roundNumber: number;
  startingPlayerIndex: number;
  lastRoundWinnerIndex: number | null;
  weather: Record<GwentRow, boolean>;
  specialsInPlay: GwentSpecialInPlay[];
  log: string[];
  winnerUserId: string | null;
  doubleSpyPower: boolean;
  randomRespawn: boolean;
  cancelledLeaderPlayerIndex: number | null;
};

export type GwentPlayerAction =
  | { type: "redraw"; cardId: string }
  | { type: "finish-redraw" }
  | { type: "choose-first-player"; firstPlayerIndex: number }
  | { type: "play-card"; cardId: string; row?: GwentRow; targetId?: string }
  | { type: "use-leader" }
  | { type: "pass" };

const CARD_BY_INDEX = GWENT_CARDS.reduce<Record<number, GwentDataCard>>((acc, card) => {
  acc[card.index] = card;
  return acc;
}, {});

const FACTION_NAMES: Record<GwentFaction, string> = {
  realms: "Northern Realms",
  nilfgaard: "Nilfgaard",
  monsters: "Monsters",
  scoiatael: "Scoia'tael",
  skellige: "Skellige"
};

const PREMADE_DECK_NAMES: Record<number, string> = {
  0: "Northern Realms Starter",
  1: "Northern Realms Siege",
  2: "Nilfgaard Spies",
  3: "Nilfgaard Pressure",
  4: "Monsters Muster",
  5: "Monsters Rush",
  6: "Scoia'tael Flexible",
  7: "Scoia'tael Tempo",
  8: "Skellige Warriors",
  9: "Skellige Raid"
};

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneState(state: GwentMatchState) {
  return structuredClone(state);
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function drawCards(player: GwentPlayerState, count: number) {
  for (let drawIndex = 0; drawIndex < count; drawIndex += 1) {
    const nextCard = player.deck.shift();
    if (!nextCard) {
      return;
    }
    player.hand.push(nextCard);
  }
}

function getCard(cardIndex: number) {
  return CARD_BY_INDEX[cardIndex];
}

function expandDeck(deckIndex: number) {
  const premade = GWENT_PREMADE_DECKS[deckIndex];
  return premade.cards.flatMap(([cardIndex, count]) =>
    Array.from({ length: count }, () => ({
      instanceId: randomId("gcard"),
      cardIndex
    }))
  );
}

function createPlayer(config: GwentPlayerConfig): GwentPlayerState {
  const premade = GWENT_PREMADE_DECKS[config.deckIndex];
  const leaderCardIndex = premade.leader;
  const faction = premade.faction as GwentFaction;
  const deck = shuffle(expandDeck(config.deckIndex));
  const player: GwentPlayerState = {
    userId: config.userId,
    username: config.username,
    color: config.color,
    faction,
    deckName: PREMADE_DECK_NAMES[config.deckIndex] ?? `${FACTION_NAMES[faction]} Deck`,
    leaderCardIndex,
    leaderUsed: false,
    deck,
    hand: [],
    graveyard: [],
    board: {
      close: [],
      ranged: [],
      siege: []
    },
    rowEffects: {
      close: { horn: false, leaderHorn: false, mardroeme: false },
      ranged: { horn: false, leaderHorn: false, mardroeme: false },
      siege: { horn: false, leaderHorn: false, mardroeme: false }
    },
    redrawsLeft: 2,
    roundWins: 0,
    passed: false
  };
  drawCards(player, 10);
  return player;
}

function log(state: GwentMatchState, message: string) {
  state.log = [...state.log.slice(-11), message];
}

function getPlayerIndex(state: GwentMatchState, userId: string) {
  return state.players.findIndex((player) => player.userId === userId);
}

function getOpponentIndex(playerIndex: number) {
  return playerIndex === 0 ? 1 : 0;
}

function cardHas(cardIndex: number, ability: string) {
  return getCard(cardIndex).ability.includes(ability);
}

function isHero(cardIndex: number) {
  return cardHas(cardIndex, "hero");
}

function isUnit(cardIndex: number) {
  const row = getCard(cardIndex).row;
  return row === "close" || row === "ranged" || row === "siege" || row === "agile";
}

function removeHandCard(player: GwentPlayerState, cardId: string) {
  const index = player.hand.findIndex((card) => card.instanceId === cardId);
  if (index < 0) {
    return null;
  }
  return player.hand.splice(index, 1)[0] ?? null;
}

function findBoardCard(state: GwentMatchState, targetId: string) {
  for (let playerIndex = 0; playerIndex < state.players.length; playerIndex += 1) {
    const player = state.players[playerIndex]!;
    for (const row of GWENT_ROWS) {
      const card = player.board[row].find((entry) => entry.instanceId === targetId);
      if (card) {
        return { playerIndex, row, card };
      }
    }
  }
  return null;
}

function getCardArtPath(cardIndex: number) {
  const card = getCard(cardIndex);
  return `/gwent-classic/img/lg/${card.deck}_${card.filename}.jpg`;
}

function getLeaderPowerOverride(state: GwentMatchState, playerIndex: number, row: GwentRow, basePower: number) {
  const leaderCard = getCard(state.players[playerIndex]!.leaderCardIndex);
  if (leaderCard.ability.includes("king_bran") && state.weather[row]) {
    return Math.max(1, Math.ceil(basePower / 2));
  }
  return null;
}

function getRowCards(state: GwentMatchState, sideIndex: number, row: GwentRow) {
  return state.players[sideIndex]!.board[row];
}

function getCardPower(state: GwentMatchState, rowCard: GwentBoardCard) {
  const data = getCard(rowCard.cardIndex);
  const baseStrength = data.strength ?? 0;
  if (!isUnit(rowCard.cardIndex)) {
    return 0;
  }
  if (isHero(rowCard.cardIndex)) {
    return baseStrength;
  }

  const rowCards = getRowCards(state, rowCard.sideIndex, rowCard.placedRow);
  const doubledSpyBase = state.doubleSpyPower && cardHas(rowCard.cardIndex, "spy") ? baseStrength * 2 : baseStrength;
  let power = doubledSpyBase;
  const rowEffect = state.players[rowCard.sideIndex]!.rowEffects[rowCard.placedRow];
  const weatherActive = state.weather[rowCard.placedRow];

  if (weatherActive) {
    power = getLeaderPowerOverride(state, rowCard.sideIndex, rowCard.placedRow, power) ?? 1;
  }

  if (cardHas(rowCard.cardIndex, "bond")) {
    const copies = rowCards.filter((card) => getCard(card.cardIndex).name === data.name).length;
    if (copies > 1) {
      power *= copies;
    }
  }

  const moraleUnits = rowCards.filter((card) => cardHas(card.cardIndex, "morale")).length;
  if (moraleUnits > 0) {
    const selfPenalty = cardHas(rowCard.cardIndex, "morale") ? 1 : 0;
    power += moraleUnits - selfPenalty;
  }

  const rowHasHorn =
    rowEffect.horn ||
    rowEffect.leaderHorn ||
    rowCards.some((card) => cardHas(card.cardIndex, "horn"));

  if (rowHasHorn) {
    power *= 2;
  }

  return power;
}

export function getRowTotal(state: GwentMatchState, sideIndex: number, row: GwentRow) {
  return state.players[sideIndex]!.board[row].reduce((sum, card) => sum + getCardPower(state, card), 0);
}

export function getPlayerTotal(state: GwentMatchState, sideIndex: number) {
  return GWENT_ROWS.reduce((sum, row) => sum + getRowTotal(state, sideIndex, row), 0);
}

export function getRenderedCardPower(state: GwentMatchState, rowCard: GwentBoardCard) {
  return getCardPower(state, rowCard);
}

function addBoardCard(state: GwentMatchState, card: GwentCardInstance, ownerIndex: number, sideIndex: number, row: GwentRow) {
  const boardCard: GwentBoardCard = {
    ...card,
    ownerIndex,
    sideIndex,
    placedRow: row
  };
  state.players[sideIndex]!.board[row].push(boardCard);
  return boardCard;
}

function moveToGrave(state: GwentMatchState, card: GwentCardInstance, ownerIndex: number) {
  state.players[ownerIndex]!.graveyard.push(card);
}

function clearBoardForNextRound(state: GwentMatchState) {
  const retainedByPlayer = new Map<number, string>();
  state.players.forEach((player, playerIndex) => {
    if (player.faction !== "monsters") {
      return;
    }
    const boardUnits = GWENT_ROWS.flatMap((row) => player.board[row].filter((entry) => isUnit(entry.cardIndex)));
    if (boardUnits.length === 0) {
      return;
    }
    const retained = boardUnits[Math.floor(Math.random() * boardUnits.length)]!;
    retainedByPlayer.set(playerIndex, retained.instanceId);
  });

  state.players.forEach((player, playerIndex) => {
    for (const row of GWENT_ROWS) {
      const kept: GwentBoardCard[] = [];
      for (const boardCard of player.board[row]) {
        if (retainedByPlayer.get(playerIndex) === boardCard.instanceId) {
          kept.push(boardCard);
        } else {
          moveToGrave(state, { instanceId: boardCard.instanceId, cardIndex: boardCard.cardIndex }, boardCard.ownerIndex);
        }
      }
      player.board[row] = kept;
      player.rowEffects[row] = { horn: false, leaderHorn: false, mardroeme: false };
    }
    player.passed = false;
  });

  state.specialsInPlay.forEach((special) => {
    moveToGrave(state, { instanceId: special.instanceId, cardIndex: special.cardIndex }, special.ownerIndex);
  });
  state.specialsInPlay = [];
  state.weather = { close: false, ranged: false, siege: false };
}

function removeBoardCard(state: GwentMatchState, targetId: string) {
  const found = findBoardCard(state, targetId);
  if (!found) {
    return null;
  }
  const rowCards = state.players[found.playerIndex]!.board[found.row];
  const index = rowCards.findIndex((card) => card.instanceId === targetId);
  if (index < 0) {
    return null;
  }
  const [removed] = rowCards.splice(index, 1);
  if (!removed) {
    return null;
  }

  if (cardHas(removed.cardIndex, "avenger")) {
    const nextCardIndex = removed.cardIndex === 20 ? 21 : removed.cardIndex === 194 ? 196 : null;
    if (nextCardIndex !== null) {
      addBoardCard(
        state,
        { instanceId: randomId("gcard"), cardIndex: nextCardIndex },
        removed.ownerIndex,
        removed.sideIndex,
        "close"
      );
    }
  }

  moveToGrave(state, { instanceId: removed.instanceId, cardIndex: removed.cardIndex }, removed.ownerIndex);
  return removed;
}

function destroyStrongest(state: GwentMatchState, rows: GwentRow[], sideIndex?: number) {
  const pool = (sideIndex === undefined ? [0, 1] : [sideIndex]).flatMap((index) =>
    rows.flatMap((row) =>
      state.players[index]!.board[row]
        .filter((card) => isUnit(card.cardIndex) && !isHero(card.cardIndex))
        .map((card) => ({ card, power: getCardPower(state, card) }))
    )
  );

  const maxPower = pool.reduce((max, entry) => Math.max(max, entry.power), 0);
  if (maxPower <= 0) {
    return;
  }

  pool
    .filter((entry) => entry.power === maxPower)
    .forEach((entry) => {
      removeBoardCard(state, entry.card.instanceId);
      log(state, `${getCard(entry.card.cardIndex).name} was scorched.`);
    });
}

function applyMuster(state: GwentMatchState, playerIndex: number, source: GwentBoardCard) {
  const sourceName = getCard(source.cardIndex).name;
  const prefix = sourceName.includes("-") ? sourceName.split("-")[0]!.trim() : sourceName;
  const player = state.players[playerIndex]!;
  const fromHand = player.hand.filter((card) => getCard(card.cardIndex).name.startsWith(prefix));
  const fromDeck = player.deck.filter((card) => getCard(card.cardIndex).name.startsWith(prefix));
  [...fromHand, ...fromDeck].forEach((candidate) => {
    player.hand = player.hand.filter((card) => card.instanceId !== candidate.instanceId);
    player.deck = player.deck.filter((card) => card.instanceId !== candidate.instanceId);
    addBoardCard(state, candidate, playerIndex, playerIndex, source.placedRow);
  });
}

function transformBerserkers(state: GwentMatchState, sideIndex: number, row: GwentRow) {
  const transformed = state.players[sideIndex]!.board[row].map((card) => {
    if (!cardHas(card.cardIndex, "berserker")) {
      return card;
    }
    const nextCardIndex = getCard(card.cardIndex).name.startsWith("Young") ? 207 : 206;
    return {
      ...card,
      cardIndex: nextCardIndex
    };
  });
  state.players[sideIndex]!.board[row] = transformed;
}

function getBestUnit(graveyard: GwentCardInstance[]) {
  const units = graveyard.filter((card) => isUnit(card.cardIndex) && !isHero(card.cardIndex));
  const sorted = [...units].sort((left, right) => (getCard(right.cardIndex).strength ?? 0) - (getCard(left.cardIndex).strength ?? 0));
  return sorted[0] ?? null;
}

function resolvePlayableRow(cardIndex: number, preferredRow?: GwentRow): GwentRow {
  const data = getCard(cardIndex);
  if (preferredRow) {
    return preferredRow;
  }
  if (data.row === "agile") {
    return "close";
  }
  if (data.row === "close" || data.row === "ranged" || data.row === "siege") {
    return data.row;
  }
  return "close";
}

function applyBoardAbility(state: GwentMatchState, boardCard: GwentBoardCard) {
  const owner = state.players[boardCard.ownerIndex]!;
  const opponentIndex = getOpponentIndex(boardCard.ownerIndex);

  if (cardHas(boardCard.cardIndex, "spy")) {
    drawCards(owner, 2);
  }

  if (cardHas(boardCard.cardIndex, "muster")) {
    applyMuster(state, boardCard.ownerIndex, boardCard);
  }

  if (cardHas(boardCard.cardIndex, "medic")) {
    const sourcePlayer = state.players[boardCard.ownerIndex]!;
    const chosen =
      state.randomRespawn
        ? shuffle(sourcePlayer.graveyard.filter((card) => isUnit(card.cardIndex) && !isHero(card.cardIndex)))[0] ?? null
        : getBestUnit(sourcePlayer.graveyard);

    if (chosen) {
      sourcePlayer.graveyard = sourcePlayer.graveyard.filter((card) => card.instanceId !== chosen.instanceId);
      const row = resolvePlayableRow(chosen.cardIndex);
      const revived = addBoardCard(state, chosen, boardCard.ownerIndex, boardCard.ownerIndex, row);
      applyBoardAbility(state, revived);
      log(state, `${owner.username} revived ${getCard(chosen.cardIndex).name}.`);
    }
  }

  if (cardHas(boardCard.cardIndex, "scorch_c")) {
    if (getRowTotal(state, opponentIndex, "close") >= 10) {
      destroyStrongest(state, ["close"], opponentIndex);
    }
  }

  if (cardHas(boardCard.cardIndex, "scorch_r")) {
    if (getRowTotal(state, opponentIndex, "ranged") >= 10) {
      destroyStrongest(state, ["ranged"], opponentIndex);
    }
  }

  if (cardHas(boardCard.cardIndex, "scorch_s")) {
    if (getRowTotal(state, opponentIndex, "siege") >= 10) {
      destroyStrongest(state, ["siege"], opponentIndex);
    }
  }

  if (state.players[boardCard.sideIndex]!.rowEffects[boardCard.placedRow].mardroeme) {
    transformBerserkers(state, boardCard.sideIndex, boardCard.placedRow);
  }
}

function addSpecial(state: GwentMatchState, ownerIndex: number, card: GwentCardInstance, kind: GwentSpecialInPlay["kind"], row: GwentRow | null) {
  state.specialsInPlay.push({
    ...card,
    ownerIndex,
    kind,
    row
  });
}

function autoPlayWeatherFromDeck(state: GwentMatchState, playerIndex: number, weatherAbilities: string[]) {
  const player = state.players[playerIndex]!;
  const candidate = player.deck.find((card) => {
    const ability = getCard(card.cardIndex).ability;
    return weatherAbilities.some((item) => ability.includes(item));
  });
  if (!candidate) {
    return;
  }
  player.deck = player.deck.filter((card) => card.instanceId !== candidate.instanceId);
  playCardEffect(state, playerIndex, candidate, undefined, undefined);
}

function useLeader(state: GwentMatchState, playerIndex: number) {
  const player = state.players[playerIndex]!;
  if (player.leaderUsed || state.cancelledLeaderPlayerIndex === playerIndex) {
    return;
  }
  player.leaderUsed = true;
  const leader = getCard(player.leaderCardIndex);
  const abilities = leader.ability;
  const opponentIndex = getOpponentIndex(playerIndex);

  if (abilities.includes("emhyr_whiteflame")) {
    state.cancelledLeaderPlayerIndex = opponentIndex;
    log(state, `${player.username} disabled the opposing leader ability.`);
  }

  if (abilities.includes("foltest_king")) autoPlayWeatherFromDeck(state, playerIndex, ["fog"]);
  if (abilities.includes("foltest_lord")) {
    state.weather = { close: false, ranged: false, siege: false };
    log(state, `${player.username} cleared the weather.`);
  }
  if (abilities.includes("foltest_siegemaster")) player.rowEffects.siege.leaderHorn = true;
  if (abilities.includes("foltest_steelforged")) destroyStrongest(state, ["siege"], opponentIndex);
  if (abilities.includes("foltest_son")) destroyStrongest(state, ["ranged"], opponentIndex);
  if (abilities.includes("emhyr_imperial")) autoPlayWeatherFromDeck(state, playerIndex, ["rain"]);
  if (abilities.includes("emhyr_emperor")) {
    const preview = shuffle(state.players[opponentIndex]!.hand).slice(0, 3).map((card) => getCard(card.cardIndex).name);
    log(state, `${player.username} inspected: ${preview.join(", ") || "no cards"}.`);
  }
  if (abilities.includes("emhyr_relentless")) {
    const target = getBestUnit(state.players[opponentIndex]!.graveyard);
    if (target) {
      state.players[opponentIndex]!.graveyard = state.players[opponentIndex]!.graveyard.filter((card) => card.instanceId !== target.instanceId);
      player.hand.push(target);
      log(state, `${player.username} took ${getCard(target.cardIndex).name} from the opponent graveyard.`);
    }
  }
  if (abilities.includes("emhyr_invader")) state.randomRespawn = true;
  if (abilities.includes("eredin_commander")) player.rowEffects.close.leaderHorn = true;
  if (abilities.includes("eredin_bringer_of_death")) {
    const best = getBestUnit(player.graveyard);
    if (best) {
      player.graveyard = player.graveyard.filter((card) => card.instanceId !== best.instanceId);
      player.hand.push(best);
    }
  }
  if (abilities.includes("eredin_destroyer")) {
    const discards = [...player.hand]
      .sort((left, right) => (getCard(left.cardIndex).strength ?? 0) - (getCard(right.cardIndex).strength ?? 0))
      .slice(0, 2);
    discards.forEach((card) => {
      player.hand = player.hand.filter((entry) => entry.instanceId !== card.instanceId);
      player.graveyard.push(card);
    });
    drawCards(player, 1);
  }
  if (abilities.includes("eredin_king")) autoPlayWeatherFromDeck(state, playerIndex, ["frost", "fog", "rain", "storm"]);
  if (abilities.includes("eredin_treacherous")) state.doubleSpyPower = true;
  if (abilities.includes("francesca_queen")) destroyStrongest(state, ["close"], opponentIndex);
  if (abilities.includes("francesca_beautiful")) player.rowEffects.ranged.leaderHorn = true;
  if (abilities.includes("francesca_pureblood")) autoPlayWeatherFromDeck(state, playerIndex, ["frost"]);
  if (abilities.includes("francesca_hope")) {
    for (const row of ["close", "ranged"] as const) {
      const agileCards = player.board[row].filter((card) => getCard(card.cardIndex).row === "agile");
      agileCards.forEach((card) => {
        const nextRow = row === "close" ? "ranged" : "close";
        state.players[playerIndex]!.board[row] = state.players[playerIndex]!.board[row].filter((entry) => entry.instanceId !== card.instanceId);
        state.players[playerIndex]!.board[nextRow].push({ ...card, placedRow: nextRow });
      });
    }
  }
  if (abilities.includes("crach_an_craite")) {
    state.players.forEach((targetPlayer) => {
      targetPlayer.deck = shuffle([...targetPlayer.deck, ...targetPlayer.graveyard]);
      targetPlayer.graveyard = [];
    });
  }
  log(state, `${player.username} used ${leader.name}.`);
}

function playCardEffect(
  state: GwentMatchState,
  playerIndex: number,
  handCard: GwentCardInstance,
  chosenRow?: GwentRow,
  targetId?: string
) {
  const player = state.players[playerIndex]!;
  const data = getCard(handCard.cardIndex);
  const opponentIndex = getOpponentIndex(playerIndex);

  if (data.deck === "weather") {
    if (data.ability.includes("clear")) {
      state.weather = { close: false, ranged: false, siege: false };
    } else {
      if (data.ability.includes("frost")) state.weather.close = true;
      if (data.ability.includes("fog")) state.weather.ranged = true;
      if (data.ability.includes("rain")) state.weather.siege = true;
      if (data.ability.includes("storm")) {
        state.weather.ranged = true;
        state.weather.siege = true;
      }
      addSpecial(state, playerIndex, handCard, "weather", null);
    }
    log(state, `${player.username} played ${data.name}.`);
    return;
  }

  if (data.deck === "special") {
    if (data.ability.includes("scorch")) {
      destroyStrongest(state, ["close", "ranged", "siege"]);
      moveToGrave(state, handCard, playerIndex);
      log(state, `${player.username} played Scorch.`);
      return;
    }

    if (data.ability.includes("horn")) {
      const targetRow = chosenRow ?? "close";
      player.rowEffects[targetRow].horn = true;
      addSpecial(state, playerIndex, handCard, "horn", targetRow);
      log(state, `${player.username} played Commander's Horn on ${targetRow}.`);
      return;
    }

    if (data.ability.includes("mardroeme")) {
      const targetRow = chosenRow ?? "close";
      player.rowEffects[targetRow].mardroeme = true;
      addSpecial(state, playerIndex, handCard, "mardroeme", targetRow);
      transformBerserkers(state, playerIndex, targetRow);
      log(state, `${player.username} played Mardroeme on ${targetRow}.`);
      return;
    }

    if (data.ability.includes("decoy")) {
      if (!targetId) {
        player.hand.push(handCard);
        return;
      }
      const found = findBoardCard(state, targetId);
      if (!found || found.card.sideIndex !== playerIndex || isHero(found.card.cardIndex)) {
        player.hand.push(handCard);
        return;
      }
      state.players[found.playerIndex]!.board[found.row] = state.players[found.playerIndex]!.board[found.row].filter(
        (entry) => entry.instanceId !== targetId
      );
      player.hand.push({ instanceId: found.card.instanceId, cardIndex: found.card.cardIndex });
      addSpecial(state, playerIndex, handCard, "decoy", found.row);
      log(state, `${player.username} decoyed ${getCard(found.card.cardIndex).name}.`);
      return;
    }
  }

  const sideIndex = data.ability.includes("spy") ? opponentIndex : playerIndex;
  const row = resolvePlayableRow(handCard.cardIndex, chosenRow);
  const boardCard = addBoardCard(state, handCard, playerIndex, sideIndex, row);
  log(state, `${player.username} played ${data.name}.`);
  applyBoardAbility(state, boardCard);
}

function resolveRound(state: GwentMatchState) {
  const totalA = getPlayerTotal(state, 0);
  const totalB = getPlayerTotal(state, 1);
  const playerA = state.players[0];
  const playerB = state.players[1];
  let winnerIndex: number | null = null;

  if (totalA === totalB) {
    if (playerA.faction === "nilfgaard" && playerB.faction !== "nilfgaard") {
      winnerIndex = 0;
    } else if (playerB.faction === "nilfgaard" && playerA.faction !== "nilfgaard") {
      winnerIndex = 1;
    }
  } else {
    winnerIndex = totalA > totalB ? 0 : 1;
  }

  if (winnerIndex !== null) {
    state.players[winnerIndex]!.roundWins += 1;
    state.lastRoundWinnerIndex = winnerIndex;
    state.startingPlayerIndex = winnerIndex;
    log(state, `${state.players[winnerIndex]!.username} won round ${state.roundNumber}.`);
  } else {
    state.lastRoundWinnerIndex = null;
    log(state, `Round ${state.roundNumber} ended in a draw.`);
  }

  const roundWinner = winnerIndex;
  clearBoardForNextRound(state);

  if (roundWinner !== null && state.players[roundWinner]!.faction === "realms") {
    drawCards(state.players[roundWinner]!, 1);
  }

  state.roundNumber += 1;
  state.currentPlayerIndex = state.startingPlayerIndex;

  if (state.roundNumber === 3) {
    state.players.forEach((player, playerIndex) => {
      if (player.faction !== "skellige") {
        return;
      }
      const candidates = shuffle(player.graveyard.filter((card) => isUnit(card.cardIndex))).slice(0, 2);
      candidates.forEach((card) => {
        player.graveyard = player.graveyard.filter((entry) => entry.instanceId !== card.instanceId);
        addBoardCard(state, card, playerIndex, playerIndex, resolvePlayableRow(card.cardIndex));
      });
    });
  }

  const champion = state.players.find((player) => player.roundWins >= 2) ?? null;
  if (champion) {
    state.phase = "finished";
    state.winnerUserId = champion.userId;
    log(state, `${champion.username} won the match.`);
  }
}

function advanceTurn(state: GwentMatchState) {
  if (state.players.every((player) => player.passed)) {
    resolveRound(state);
    return;
  }

  const opponentIndex = getOpponentIndex(state.currentPlayerIndex);
  if (!state.players[opponentIndex]!.passed) {
    state.currentPlayerIndex = opponentIndex;
  }
}

function canAct(state: GwentMatchState, playerIndex: number) {
  if (state.phase === "finished") {
    return false;
  }
  if (state.phase === "choose-first-player") {
    return state.players[playerIndex]!.faction === "scoiatael";
  }
  return state.currentPlayerIndex === playerIndex;
}

function finalizeRedraws(state: GwentMatchState) {
  const scoiataelIndex = state.players.findIndex((player) => player.faction === "scoiatael");
  if (scoiataelIndex >= 0) {
    state.phase = "choose-first-player";
    state.currentPlayerIndex = scoiataelIndex;
    return;
  }
  state.phase = "playing";
  state.currentPlayerIndex = state.startingPlayerIndex;
}

function applyGameStartPassives(state: GwentMatchState) {
  state.players.forEach((player) => {
    const leader = getCard(player.leaderCardIndex);
    if (leader.ability.includes("francesca_daisy")) {
      drawCards(player, 1);
    }
    if (leader.ability.includes("emhyr_whiteflame")) {
      state.cancelledLeaderPlayerIndex = getOpponentIndex(state.players.indexOf(player));
    }
    if (leader.ability.includes("eredin_treacherous")) {
      state.doubleSpyPower = true;
    }
    if (leader.ability.includes("emhyr_invader")) {
      state.randomRespawn = true;
    }
  });
}

export function createMatch(configs: [GwentPlayerConfig, GwentPlayerConfig], hostUserId: string): GwentMatchState {
  const players: [GwentPlayerState, GwentPlayerState] = [createPlayer(configs[0]), createPlayer(configs[1])];
  const state: GwentMatchState = {
    id: randomId("gmatch"),
    hostUserId,
    players,
    phase: "redraw",
    currentPlayerIndex: 0,
    roundNumber: 1,
    startingPlayerIndex: Math.random() < 0.5 ? 0 : 1,
    lastRoundWinnerIndex: null,
    weather: { close: false, ranged: false, siege: false },
    specialsInPlay: [],
    log: ["Match created."],
    winnerUserId: null,
    doubleSpyPower: false,
    randomRespawn: false,
    cancelledLeaderPlayerIndex: null
  };

  applyGameStartPassives(state);
  return state;
}

export function applyPlayerAction(state: GwentMatchState, userId: string, action: GwentPlayerAction) {
  const playerIndex = getPlayerIndex(state, userId);
  if (playerIndex < 0 || !canAct(state, playerIndex)) {
    return state;
  }

  const next = cloneState(state);
  const player = next.players[playerIndex]!;

  if (action.type === "redraw" && next.phase === "redraw" && player.redrawsLeft > 0) {
    const handCard = removeHandCard(player, action.cardId);
    if (!handCard) {
      return state;
    }
    player.deck.push(handCard);
    player.deck = shuffle(player.deck);
    drawCards(player, 1);
    player.redrawsLeft -= 1;
    log(next, `${player.username} redrew a card.`);
    return next;
  }

  if (action.type === "finish-redraw" && next.phase === "redraw") {
    if (playerIndex === 0) {
      next.currentPlayerIndex = 1;
      return next;
    }
    finalizeRedraws(next);
    return next;
  }

  if (action.type === "choose-first-player" && next.phase === "choose-first-player") {
    next.startingPlayerIndex = action.firstPlayerIndex === 1 ? 1 : 0;
    next.currentPlayerIndex = next.startingPlayerIndex;
    next.phase = "playing";
    log(next, `${player.username} chose who goes first.`);
    return next;
  }

  if (action.type === "use-leader" && next.phase === "playing") {
    useLeader(next, playerIndex);
    advanceTurn(next);
    return next;
  }

  if (action.type === "pass" && next.phase === "playing") {
    player.passed = true;
    log(next, `${player.username} passed.`);
    advanceTurn(next);
    return next;
  }

  if (action.type === "play-card" && next.phase === "playing") {
    const handCard = removeHandCard(player, action.cardId);
    if (!handCard) {
      return state;
    }
    playCardEffect(next, playerIndex, handCard, action.row, action.targetId);
    advanceTurn(next);
    return next;
  }

  return state;
}

export function getPlayableRows(cardIndex: number): GwentRow[] {
  const card = getCard(cardIndex);
  if (card.deck === "special" && (card.ability.includes("horn") || card.ability.includes("mardroeme"))) {
    return ["close", "ranged", "siege"];
  }
  if (card.row === "agile") {
    return ["close", "ranged"];
  }
  if (card.row === "close" || card.row === "ranged" || card.row === "siege") {
    return [card.row];
  }
  return [];
}

export function getCardMeta(cardIndex: number) {
  const card = getCard(cardIndex);
  return {
    ...card,
    art: getCardArtPath(cardIndex)
  };
}

export function getDeckSummary(deckIndex: number) {
  const premade = GWENT_PREMADE_DECKS[deckIndex];
  const leader = getCard(premade.leader);
  return {
    index: deckIndex,
    name: PREMADE_DECK_NAMES[deckIndex] ?? `Deck ${deckIndex + 1}`,
    faction: premade.faction as GwentFaction,
    leaderName: leader.name,
    cardCount: premade.cards.reduce((sum, [, count]) => sum + count, 0)
  };
}

export const GWENT_PREMADE_SUMMARIES = GWENT_PREMADE_DECKS.map((_, index) => getDeckSummary(index));
