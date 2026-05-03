import { DEFAULT_ENABLED_PACK_IDS, getEnabledCardPools } from "./packs";

export type CampfirePhase =
  | "lobby"
  | "customCards"
  | "submitting"
  | "locked"
  | "judging"
  | "winner"
  | "gameOver";

export type CampfirePlayer = {
  userId: string;
  username: string;
  score: number;
  hand: CampfireAnswerCard[];
  redrawsLeft: number;
  customCardsSubmitted: number;
};

export type CampfireAnswerCard = {
  id: string;
  text: string;
  packId: string;
  authorId?: string;
  reported?: boolean;
};

export type CampfirePromptCard = {
  id: string;
  text: string;
  packId: string;
};

export type CampfireSubmission = {
  id: string;
  playerId: string;
  card: CampfireAnswerCard;
};

export type CampfireState = {
  version: number;
  phase: CampfirePhase;
  players: CampfirePlayer[];
  enabledPackIds: string[];
  targetScore: number;
  judgeIndex: number;
  round: number;
  promptDeck: CampfirePromptCard[];
  answerDeck: CampfireAnswerCard[];
  customAnswerDeck: CampfireAnswerCard[];
  discardPile: CampfireAnswerCard[];
  currentPrompt: CampfirePromptCard | null;
  submissions: CampfireSubmission[];
  revealedSubmissions: CampfireSubmission[];
  winningSubmissionId: string | null;
  matchWinnerId: string | null;
  customRoomCards: CampfireAnswerCard[];
  removedCustomCardIds: string[];
  message: string;
};

export type CampfirePresencePlayer = {
  userId: string;
  username: string;
  onlineAt: string;
};

export type CampfireAction =
  | { type: "sync-players"; players: CampfirePresencePlayer[] }
  | { type: "configure"; enabledPackIds: string[]; targetScore: number }
  | { type: "add-custom-cards"; playerId: string; cards: string[] }
  | { type: "start-game"; players: CampfirePresencePlayer[] }
  | { type: "submit-answer"; playerId: string; cardId: string }
  | { type: "redraw"; playerId: string; cardIds: string[] }
  | { type: "skip-prompt"; judgeId: string }
  | { type: "reveal-submissions"; judgeId: string }
  | { type: "choose-winner"; judgeId: string; submissionId: string }
  | { type: "next-round"; hostId: string }
  | { type: "remove-custom-card"; requesterId: string; cardId: string }
  | { type: "reset"; players: CampfirePresencePlayer[] };

const HAND_SIZE = 7;
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 3;
const DEFAULT_TARGET_SCORE = 7;
const STARTING_REDRAWS = 3;
const MAX_CUSTOM_CARD_LENGTH = 96;
const CUSTOM_DRAW_CHANCE = 0.25;

export const CAMPFIRE_LIMITS = {
  handSize: HAND_SIZE,
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  defaultTargetScore: DEFAULT_TARGET_SCORE,
  startingRedraws: STARTING_REDRAWS,
  maxCustomCardLength: MAX_CUSTOM_CARD_LENGTH
};

export const createEmptyCampfireState = (): CampfireState => ({
  version: 1,
  phase: "lobby",
  players: [],
  enabledPackIds: DEFAULT_ENABLED_PACK_IDS,
  targetScore: DEFAULT_TARGET_SCORE,
  judgeIndex: 0,
  round: 0,
  promptDeck: [],
  answerDeck: [],
  customAnswerDeck: [],
  discardPile: [],
  currentPrompt: null,
  submissions: [],
  revealedSubmissions: [],
  winningSubmissionId: null,
  matchWinnerId: null,
  customRoomCards: [],
  removedCustomCardIds: [],
  message: "Gather 3 to 8 players around the campfire."
});

export function sanitizeCustomCard(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_CARD_LENGTH);
}

export function canUseCustomCard(text: string) {
  const sanitized = sanitizeCustomCard(text);
  return sanitized.length >= 2 && sanitized.length <= MAX_CUSTOM_CARD_LENGTH;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function dedupeCardsByText<T extends { text: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.text.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createDecks(enabledPackIds: string[]) {
  const pools = getEnabledCardPools(enabledPackIds);
  const prompts = dedupeCardsByText(
    pools.prompts.map((prompt, index) => ({
      id: `prompt-${prompt.packId}-${index}`,
      text: prompt.text,
      packId: prompt.packId
    }))
  );
  const answers = dedupeCardsByText(
    pools.answers.map((answer, index) => ({
      id: `answer-${answer.packId}-${index}`,
      text: answer.text,
      packId: answer.packId
    }))
  );

  return {
    promptDeck: shuffle(prompts),
    answerDeck: shuffle(answers)
  };
}

function drawCustomAnswer(customAnswerDeck: CampfireAnswerCard[], currentHand: CampfireAnswerCard[]) {
  const handTexts = new Set(currentHand.map((card) => card.text.toLowerCase()));
  const available = customAnswerDeck
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !card.reported && !handTexts.has(card.text.toLowerCase()));
  if (!available.length) {
    return { card: null, customAnswerDeck };
  }
  const { card: source, index } = available[Math.floor(Math.random() * available.length)];
  return {
    card: {
      ...source,
      id: makeId("custom-draw")
    },
    customAnswerDeck: customAnswerDeck.filter((_, cardIndex) => cardIndex !== index)
  };
}

function drawBaseAnswer(deck: CampfireAnswerCard[], discardPile: CampfireAnswerCard[]) {
  let nextDeck = [...deck];
  let nextDiscard = [...discardPile];
  if (nextDeck.length === 0 && nextDiscard.length > 0) {
    nextDeck = shuffle(nextDiscard.map((card) => ({ ...card, id: makeId(card.packId === "custom" ? "custom-copy" : "answer-copy") })));
    nextDiscard = [];
  }

  const card = nextDeck.shift();
  return { card: card ?? null, answerDeck: nextDeck, discardPile: nextDiscard };
}

function drawAnswer(
  deck: CampfireAnswerCard[],
  discardPile: CampfireAnswerCard[],
  customAnswerDeck: CampfireAnswerCard[],
  currentHand: CampfireAnswerCard[]
) {
  if (customAnswerDeck.some((card) => !card.reported) && Math.random() < CUSTOM_DRAW_CHANCE) {
    const customResult = drawCustomAnswer(customAnswerDeck, currentHand);
    if (customResult.card) {
      return { card: customResult.card, answerDeck: deck, customAnswerDeck: customResult.customAnswerDeck, discardPile };
    }
  }

  const baseResult = drawBaseAnswer(deck, discardPile);
  if (baseResult.card) {
    return { ...baseResult, customAnswerDeck };
  }

  const fallbackCustom = drawCustomAnswer(customAnswerDeck, currentHand);
  return {
    card: fallbackCustom.card,
    answerDeck: baseResult.answerDeck,
    customAnswerDeck: fallbackCustom.customAnswerDeck,
    discardPile: baseResult.discardPile
  };
}

function drawPrompt(deck: CampfirePromptCard[], enabledPackIds: string[]) {
  let nextDeck = [...deck];
  if (nextDeck.length === 0) {
    nextDeck = createDecks(enabledPackIds).promptDeck;
  }
  return {
    prompt: nextDeck.shift() ?? null,
    promptDeck: nextDeck
  };
}

function fillHand(
  player: CampfirePlayer,
  answerDeck: CampfireAnswerCard[],
  discardPile: CampfireAnswerCard[],
  customAnswerDeck: CampfireAnswerCard[]
) {
  let nextPlayer = { ...player, hand: [...player.hand] };
  let nextDeck = [...answerDeck];
  let nextDiscard = [...discardPile];
  let nextCustomDeck = [...customAnswerDeck];

  while (nextPlayer.hand.length < HAND_SIZE) {
    const result = drawAnswer(nextDeck, nextDiscard, nextCustomDeck, nextPlayer.hand);
    if (!result.card) break;
    nextDeck = result.answerDeck;
    nextDiscard = result.discardPile;
    nextCustomDeck = result.customAnswerDeck;
    nextPlayer = {
      ...nextPlayer,
      hand: [...nextPlayer.hand, result.card]
    };
  }

  return { player: nextPlayer, answerDeck: nextDeck, customAnswerDeck: nextCustomDeck, discardPile: nextDiscard };
}

function syncPlayers(state: CampfireState, presencePlayers: CampfirePresencePlayer[]) {
  const seated = presencePlayers.slice(0, MAX_PLAYERS);
  const existing = new Map(state.players.map((player) => [player.userId, player]));
  return {
    ...state,
    players: seated.map((presence) => {
      const current = existing.get(presence.userId);
      return current
        ? { ...current, username: presence.username }
        : {
            userId: presence.userId,
            username: presence.username,
            score: 0,
            hand: [],
            redrawsLeft: STARTING_REDRAWS,
            customCardsSubmitted: 0
          };
    })
  };
}

function startRound(state: CampfireState, judgeIndex: number) {
  const promptResult = drawPrompt(state.promptDeck, state.enabledPackIds);
  let answerDeck = state.answerDeck;
  let customAnswerDeck = state.customAnswerDeck ?? [];
  let discardPile = state.discardPile;
  const players = state.players.map((player) => {
    const result = fillHand(player, answerDeck, discardPile, customAnswerDeck);
    answerDeck = result.answerDeck;
    customAnswerDeck = result.customAnswerDeck;
    discardPile = result.discardPile;
    return result.player;
  });

  return {
    ...state,
    phase: "submitting" as CampfirePhase,
    players,
    answerDeck,
    customAnswerDeck,
    discardPile,
    promptDeck: promptResult.promptDeck,
    currentPrompt: promptResult.prompt,
    submissions: [],
    revealedSubmissions: [],
    winningSubmissionId: null,
    judgeIndex,
    round: state.round + 1,
    message: `${players[judgeIndex]?.username ?? "The judge"} is judging this round.`
  };
}

function maybeAdvanceToJudging(state: CampfireState) {
  const judge = state.players[state.judgeIndex];
  const expected = state.players.filter((player) => player.userId !== judge?.userId).length;
  if (state.phase === "submitting" && expected > 0 && state.submissions.length >= expected) {
    return {
      ...state,
      phase: "locked" as CampfirePhase,
      message: "All answers are in. The judge can reveal the pile."
    };
  }
  return state;
}

export function campfireReducer(state: CampfireState, action: CampfireAction): CampfireState {
  if (action.type === "sync-players") {
    if (state.phase !== "lobby" && state.phase !== "customCards") {
      return state;
    }
    return syncPlayers(state, action.players);
  }

  if (action.type === "configure") {
    if (state.phase !== "lobby" && state.phase !== "customCards") return state;
    const enabledPackIds = action.enabledPackIds.length ? action.enabledPackIds : DEFAULT_ENABLED_PACK_IDS;
    return {
      ...state,
      enabledPackIds,
      targetScore: Math.min(Math.max(Math.round(action.targetScore), 3), 15),
      message: "Room settings updated."
    };
  }

  if (action.type === "add-custom-cards") {
    if (state.phase !== "lobby" && state.phase !== "customCards") return state;
    const player = state.players.find((entry) => entry.userId === action.playerId);
    if (!player || player.customCardsSubmitted >= 2) return state;

    const availableSlots = 2 - player.customCardsSubmitted;
    const cards = action.cards
      .map(sanitizeCustomCard)
      .filter((text) => canUseCustomCard(text))
      .slice(0, availableSlots)
      .map((text) => ({
        id: makeId("custom"),
        text,
        packId: "custom",
        authorId: action.playerId
      }));

    if (!cards.length) return state;

    return {
      ...state,
      phase: "customCards",
      players: state.players.map((entry) =>
        entry.userId === action.playerId
          ? { ...entry, customCardsSubmitted: entry.customCardsSubmitted + cards.length }
          : entry
      ),
      customRoomCards: [...state.customRoomCards, ...cards],
      message: `${player.username} added ${cards.length === 1 ? "a custom card" : "custom cards"} to the room.`
    };
  }

  if (action.type === "start-game") {
    const synced = syncPlayers(state, action.players);
    if (synced.players.length < MIN_PLAYERS || synced.players.length > MAX_PLAYERS) {
      return { ...synced, message: "You need 3 to 8 seated players to start." };
    }
    const decks = createDecks(synced.enabledPackIds);
    if (decks.promptDeck.length < 1 || decks.answerDeck.length < HAND_SIZE * synced.players.length) {
      return { ...synced, message: "Enable packs with enough prompts and answer cards before starting." };
    }
    const fresh: CampfireState = {
      ...synced,
      phase: "submitting",
      players: synced.players.map((player) => ({
        ...player,
        score: 0,
        hand: [],
        redrawsLeft: STARTING_REDRAWS
      })),
      promptDeck: decks.promptDeck,
      answerDeck: decks.answerDeck,
      customAnswerDeck: shuffle(synced.customRoomCards.filter((card) => !card.reported)),
      discardPile: [],
      round: 0,
      judgeIndex: 0,
      currentPrompt: null,
      submissions: [],
      revealedSubmissions: [],
      winningSubmissionId: null,
      matchWinnerId: null
    };
    return startRound(fresh, 0);
  }

  if (action.type === "submit-answer") {
    if (state.phase !== "submitting") return state;
    const judge = state.players[state.judgeIndex];
    if (judge?.userId === action.playerId) return state;
    if (state.submissions.some((submission) => submission.playerId === action.playerId)) return state;

    const player = state.players.find((entry) => entry.userId === action.playerId);
    const card = player?.hand.find((entry) => entry.id === action.cardId);
    if (!player || !card) return state;

    const nextHand = player.hand.filter((handCard) => handCard.id !== action.cardId);
    const drawResult = drawAnswer(state.answerDeck, state.discardPile, state.customAnswerDeck ?? [], nextHand);
    const players = state.players.map((entry) => {
      if (entry.userId !== action.playerId) return entry;
      return {
        ...entry,
        hand: drawResult.card ? [...nextHand, drawResult.card] : nextHand
      };
    });

    return maybeAdvanceToJudging({
      ...state,
      players,
      answerDeck: drawResult.answerDeck,
      customAnswerDeck: drawResult.customAnswerDeck,
      discardPile: drawResult.discardPile,
      submissions: [
        ...state.submissions,
        {
          id: makeId("submission"),
          playerId: action.playerId,
          card
        }
      ],
      message: `${state.submissions.length + 1} answer${state.submissions.length + 1 === 1 ? "" : "s"} submitted.`
    });
  }

  if (action.type === "redraw") {
    if (state.phase !== "submitting") return state;
    const judge = state.players[state.judgeIndex];
    if (judge?.userId === action.playerId) return state;
    if (state.submissions.some((submission) => submission.playerId === action.playerId)) return state;

    const player = state.players.find((entry) => entry.userId === action.playerId);
    if (!player || player.redrawsLeft <= 0) return state;
    const uniqueIds = Array.from(new Set(action.cardIds));
    if (uniqueIds.length < 1 || uniqueIds.length >= HAND_SIZE) return state;
    const selected = player.hand.filter((card) => uniqueIds.includes(card.id));
    if (selected.length !== uniqueIds.length) return state;

    let answerDeck = state.answerDeck;
    let customAnswerDeck = state.customAnswerDeck ?? [];
    let discardPile = [...state.discardPile, ...selected];
    let nextHand = player.hand.filter((card) => !uniqueIds.includes(card.id));
    while (nextHand.length < HAND_SIZE) {
      const result = drawAnswer(answerDeck, discardPile, customAnswerDeck, nextHand);
      if (!result.card) break;
      answerDeck = result.answerDeck;
      customAnswerDeck = result.customAnswerDeck;
      discardPile = result.discardPile;
      nextHand = [...nextHand, result.card];
    }

    return {
      ...state,
      answerDeck,
      customAnswerDeck,
      discardPile,
      players: state.players.map((entry) =>
        entry.userId === action.playerId
          ? { ...entry, hand: nextHand, redrawsLeft: entry.redrawsLeft - 1 }
          : entry
      ),
      message: `${player.username} redrew ${selected.length} card${selected.length === 1 ? "" : "s"}.`
    };
  }

  if (action.type === "skip-prompt") {
    const judge = state.players[state.judgeIndex];
    if (state.phase !== "submitting" || judge?.userId !== action.judgeId) return state;
    if (state.submissions.length > 0) {
      return {
        ...state,
        message: "The prompt can only be skipped before answers are submitted."
      };
    }
    const promptResult = drawPrompt(state.promptDeck, state.enabledPackIds);
    if (!promptResult.prompt) return state;
    return {
      ...state,
      promptDeck: promptResult.promptDeck,
      currentPrompt: promptResult.prompt,
      message: `${judge.username} skipped the prompt. A new one is on the table.`
    };
  }

  if (action.type === "reveal-submissions") {
    const judge = state.players[state.judgeIndex];
    if (state.phase !== "locked" || judge?.userId !== action.judgeId) return state;
    return {
      ...state,
      phase: "judging",
      revealedSubmissions: shuffle(state.submissions),
      message: "The answers are revealed anonymously. Judge, choose the spark."
    };
  }

  if (action.type === "choose-winner") {
    const judge = state.players[state.judgeIndex];
    if (state.phase !== "judging" || judge?.userId !== action.judgeId) return state;
    const winningSubmission = state.revealedSubmissions.find((submission) => submission.id === action.submissionId);
    if (!winningSubmission) return state;
    const winner = state.players.find((player) => player.userId === winningSubmission.playerId);
    if (!winner) return state;

    const players = state.players.map((player) =>
      player.userId === winner.userId ? { ...player, score: player.score + 1 } : player
    );
    const updatedWinner = players.find((player) => player.userId === winner.userId);
    const isGameOver = Boolean(updatedWinner && updatedWinner.score >= state.targetScore);

    return {
      ...state,
      phase: isGameOver ? "gameOver" : "winner",
      players,
      discardPile: [...state.discardPile, ...state.submissions.map((submission) => submission.card)],
      winningSubmissionId: action.submissionId,
      matchWinnerId: isGameOver ? winner.userId : null,
      message: isGameOver
        ? `${winner.username} wins the match by the fire.`
        : `${winner.username} wins the round.`
    };
  }

  if (action.type === "next-round") {
    if (state.phase !== "winner") return state;
    const host = state.players[0];
    if (host?.userId !== action.hostId) return state;
    return startRound(state, (state.judgeIndex + 1) % state.players.length);
  }

  if (action.type === "remove-custom-card") {
    const target = state.customRoomCards.find((card) => card.id === action.cardId);
    if (!target) return state;
    const requester = state.players.find((player) => player.userId === action.requesterId);
    const isHost = state.players[0]?.userId === action.requesterId;
    const isAuthor = target.authorId === action.requesterId;
    if (!requester || (!isHost && !isAuthor)) return state;
    return {
      ...state,
      customRoomCards: state.customRoomCards.map((card) =>
        card.id === action.cardId ? { ...card, reported: true } : card
      ),
      removedCustomCardIds: [...state.removedCustomCardIds, action.cardId],
      answerDeck: state.answerDeck.filter((card) => card.id !== action.cardId),
      customAnswerDeck: (state.customAnswerDeck ?? []).filter((card) => card.id !== action.cardId && card.text !== target.text),
      discardPile: state.discardPile.filter((card) => card.id !== action.cardId && card.text !== target.text),
      submissions: state.submissions.filter((submission) => submission.card.text !== target.text),
      revealedSubmissions: state.revealedSubmissions.filter((submission) => submission.card.text !== target.text),
      players: state.players.map((player) => ({
        ...player,
        hand: player.hand.filter((card) => card.id !== action.cardId && card.text !== target.text)
      })),
      message: "A custom card was removed from this room."
    };
  }

  if (action.type === "reset") {
    return syncPlayers(createEmptyCampfireState(), action.players);
  }

  return state;
}
