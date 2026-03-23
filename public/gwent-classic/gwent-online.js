(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  if (params.get("mode") !== "online") {
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.warn("Supabase client was not loaded for GWENT online mode.");
    return;
  }

  var supabaseUrl = params.get("supabaseUrl");
  var supabaseKey = params.get("supabaseKey");
  var userId = params.get("uid");
  var username = params.get("username") || "Player";
  var color = params.get("color") || "#f59e0b";

  if (!supabaseUrl || !supabaseKey || !userId) {
    console.warn("Missing required online params for GWENT.");
    return;
  }

  var client = window.supabase.createClient(supabaseUrl, supabaseKey);
  var originalMathRandom = Math.random;
  var originalRandomInt = randomInt;
  var seededRandom = null;
  var originalDeckInitialize = Deck.prototype.initialize;
  var originalDeckInitializeFromID = Deck.prototype.initializeFromID;
  var originalPlayCard = Player.prototype.playCard;
  var originalPlayCardToRow = Player.prototype.playCardToRow;
  var originalPlayScorch = Player.prototype.playScorch;
  var originalActivateLeader = Player.prototype.activateLeader;
  var originalPassRound = Player.prototype.passRound;
  var originalGameStartGame = Game.prototype.startGame;
  var originalInitialRedraw = Game.prototype.initialRedraw;
  var originalMusterPlaced = ability_dict.muster && ability_dict.muster.placed;
  var originalGameStartRound = Game.prototype.startRound;
  var originalGameStartTurn = Game.prototype.startTurn;
  var originalGameEndTurn = Game.prototype.endTurn;
  var originalQueueCarousel = ui.queueCarousel.bind(ui);
  var originalPopup = ui.popup.bind(ui);
  var originalSelectCard = ui.selectCard.bind(ui);
  var originalSelectRow = ui.selectRow.bind(ui);

  var online = {
    active: true,
    client: client,
    self: { userId: userId, username: username, color: color },
    roomCode: "",
    channel: null,
    players: [],
    readyDecks: {},
    isHost: false,
    localSeat: null,
    suppressBroadcast: false,
    matchStarted: false,
    pendingRemoteCarousel: null,
    pendingRemotePopup: null,
    redrawDone: {},
    redrawSeatOrder: [],
    lobby: null,
    debug: null,
    turnBadge: null
  };

  function debugLog(message) {
    console.log("[GWENT ONLINE]", message);
    if (!online.debug) {
      return;
    }
    var entry = document.createElement("div");
    entry.textContent = message;
    online.debug.appendChild(entry);
    while (online.debug.children.length > 16) {
      online.debug.removeChild(online.debug.firstChild);
    }
  }

  function updateTurnBadge() {
    if (!online.turnBadge) {
      return;
    }
    if (!online.matchStarted) {
      online.turnBadge.textContent = "Waiting for match start";
      return;
    }
    online.turnBadge.textContent = isLocalTurn() ? "Your turn" : "Opponent's turn";
  }

  function clearLeaderSlot(id) {
    var slot = document.querySelector("#" + id + " .leader-container");
    if (!slot) {
      return;
    }
    while (slot.firstChild) {
      slot.removeChild(slot.firstChild);
    }
  }

  function resetRuntimeSurface() {
    game.reset();
    document.getElementById("click-background").classList.add("noclick");
    ui.preview.classList.add("hide");
    ui.setSelectable(null, false);
    ui.previewCard = null;
    ui.lastRow = null;
    ui.enablePlayer(false);
    document.getElementById("pass-button").classList.add("noclick");
    document.getElementById("score-total-me").children[0].textContent = "0";
    document.getElementById("score-total-op").children[0].textContent = "0";
    document.getElementById("passed-me").classList.remove("passed");
    document.getElementById("passed-op").classList.remove("passed");
    document.getElementById("stats-me").classList.remove("current-turn");
    document.getElementById("stats-op").classList.remove("current-turn");
    clearLeaderSlot("leader-me");
    clearLeaderSlot("leader-op");
    Array.prototype.forEach.call(document.querySelectorAll(".row-score"), function (score) {
      score.textContent = "0";
    });
  }

  function mulberry32(seed) {
    var state = seed >>> 0;
    return function () {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function setSeed(seed) {
    seededRandom = mulberry32(seed);
    Math.random = function () {
      return seededRandom();
    };
    randomInt = function (n) {
      return Math.floor(seededRandom() * n);
    };
  }

  function restoreRandom() {
    Math.random = originalMathRandom;
    randomInt = originalRandomInt;
  }

  function cardIndexListFromDeck(deckJson, seed) {
    var parsed = typeof deckJson === "string" ? JSON.parse(deckJson) : deckJson;
    var cards = parsed.cards.reduce(function (all, entry) {
      for (var count = 0; count < entry[1]; count += 1) {
        all.push(entry[0]);
      }
      return all;
    }, []);
    var shuffleRandom = mulberry32(seed);
    for (var index = cards.length - 1; index > 0; index -= 1) {
      var swapIndex = Math.floor(shuffleRandom() * (index + 1));
      var temp = cards[index];
      cards[index] = cards[swapIndex];
      cards[swapIndex] = temp;
    }
    return cards;
  }

  function getPlayerForSeat(seat) {
    if (!online.localSeat) {
      return null;
    }
    return seat === online.localSeat ? player_me : player_op;
  }

  function getSeatForPlayer(player) {
    return player === player_me ? online.localSeat : online.localSeat === "host" ? "guest" : "host";
  }

  function getSeatTag(player) {
    if (player === player_me) {
      return "local";
    }
    if (player === player_op) {
      return "remote";
    }
    return "none";
  }

  function isLocalTurn() {
    return !online.matchStarted || game.currPlayer === player_me;
  }

  function getRowNameFromIndex(rowIndex) {
    if (rowIndex === 2 || rowIndex === 3) {
      return "close";
    }
    if (rowIndex === 1 || rowIndex === 4) {
      return "ranged";
    }
    if (rowIndex === 0 || rowIndex === 5) {
      return "siege";
    }
    return null;
  }

  function getRowDescriptor(row) {
    if (row === weather) {
      return { type: "weather" };
    }
    var rowIndex = board.row.indexOf(row);
    if (rowIndex === -1) {
      return null;
    }
    return {
      type: "board",
      side: rowIndex < 3 ? "opponent" : "self",
      name: getRowNameFromIndex(rowIndex)
    };
  }

  function getRowForDescriptor(actor, descriptor) {
    if (!descriptor) {
      return null;
    }
    if (descriptor.type === "weather") {
      return weather;
    }
    if (descriptor.type !== "board" || !descriptor.name) {
      return null;
    }
    var targetPlayer = descriptor.side === "self" ? actor : actor.opponent();
    var isMe = targetPlayer === player_me;
    if (descriptor.name === "close") {
      return board.row[isMe ? 3 : 2];
    }
    if (descriptor.name === "ranged") {
      return board.row[isMe ? 4 : 1];
    }
    if (descriptor.name === "siege") {
      return board.row[isMe ? 5 : 0];
    }
    return null;
  }

  function getCardRef(card) {
    if (!card) {
      return null;
    }
    return {
      name: card.name,
      filename: card.filename,
      deck: card.deck || "",
      faction: card.faction || "",
      strength: typeof card.strength === "number" ? card.strength : null,
      abilities: Array.isArray(card.abilities) ? card.abilities.slice() : []
    };
  }

  function sameCardRef(card, ref) {
    if (!card || !ref) {
      return false;
    }
    var cardAbilities = Array.isArray(card.abilities) ? card.abilities : [];
    var refAbilities = Array.isArray(ref.abilities) ? ref.abilities : [];
    if (card.name !== ref.name || card.filename !== ref.filename || (card.deck || "") !== ref.deck) {
      return false;
    }
    if ((card.faction || "") !== ref.faction || (typeof card.strength === "number" ? card.strength : null) !== ref.strength) {
      return false;
    }
    if (cardAbilities.length !== refAbilities.length) {
      return false;
    }
    for (var index = 0; index < cardAbilities.length; index += 1) {
      if (cardAbilities[index] !== refAbilities[index]) {
        return false;
      }
    }
    return true;
  }

  function findCardInHand(player, ref, fallbackIndex) {
    if (!player || !player.hand) {
      return null;
    }
    if (ref) {
      for (var index = 0; index < player.hand.cards.length; index += 1) {
        if (sameCardRef(player.hand.cards[index], ref)) {
          return player.hand.cards[index];
        }
      }
    }
    if (Number.isInteger(fallbackIndex) && player.hand.cards[fallbackIndex]) {
      return player.hand.cards[fallbackIndex];
    }
    return null;
  }

  function serializeLocalDeck() {
    return JSON.parse(dm.deckToJSON());
  }

  function updateLobbyStatus(message) {
    if (online.lobby && online.lobby.status) {
      online.lobby.status.textContent = message;
    }
  }

  function refreshPlayers(rawPresence) {
    var deduped = new Map();
    Object.values(rawPresence || {})
      .flat()
      .forEach(function (entry) {
        if (!deduped.has(entry.userId)) {
          deduped.set(entry.userId, entry);
        }
      });
    online.players = Array.from(deduped.values()).sort(function (left, right) {
      return left.onlineAt.localeCompare(right.onlineAt);
    });
    online.isHost = online.players[0] && online.players[0].userId === online.self.userId;
    if (online.lobby && online.lobby.players) {
      online.lobby.players.innerHTML = online.players
        .map(function (player, index) {
          return "<div><strong>" + player.username + "</strong> " + (index === 0 ? "(Host)" : "") + "</div>";
        })
        .join("");
    }
  }

  async function trackPresence() {
    if (!online.channel) return;
    debugLog("Tracking presence for " + online.self.username);
    await online.channel.track({
      userId: online.self.userId,
      username: online.self.username,
      color: online.self.color,
      onlineAt: online.joinedAt
    });
  }

  async function sendMessage(payload) {
    if (!online.channel) return;
    debugLog("SEND " + payload.type + (payload.seat ? " [" + payload.seat + "]" : ""));
    await online.channel.send({
      type: "broadcast",
      event: "gwent-online",
      payload: payload
    });
  }

  function buildDeckFromSaved(savedDeck, orderedCards) {
    return {
      faction: savedDeck.faction,
      leader: card_dict[savedDeck.leader],
      cards: savedDeck.cards.map(function (entry) {
        return { index: entry[0], count: entry[1] };
      }),
      orderedCards: orderedCards
    };
  }

  function createRoomUi() {
    var wrap = document.createElement("section");
    wrap.style.position = "absolute";
    wrap.style.top = "1vw";
    wrap.style.right = "1vw";
    wrap.style.width = "18vw";
    wrap.style.minHeight = "10vw";
    wrap.style.padding = "0.8vw";
    wrap.style.border = "0.1vw solid rgba(218,165,32,0.45)";
    wrap.style.background = "rgba(0,0,0,0.88)";
    wrap.style.color = "goldenrod";
    wrap.style.zIndex = "100";
    wrap.innerHTML =
      '<div style="font-size:1vw;font-weight:bold;margin-bottom:0.5vw;">Online GWENT</div>' +
      '<input id="gwent-online-room" placeholder="ROOM" style="width:100%;margin-bottom:0.5vw;background:#070707;color:goldenrod;border:0.1vw solid #7a5b16;padding:0.35vw;" />' +
      '<div style="display:flex;gap:0.4vw;margin-bottom:0.5vw;"><button id="gwent-online-create">Create</button><button id="gwent-online-join">Join</button><button id="gwent-online-ready">Ready</button></div>' +
      '<div id="gwent-online-status" style="font-size:0.8vw;min-height:2vw;margin-bottom:0.5vw;">Create or join a room.</div>' +
      '<div id="gwent-online-players" style="font-size:0.8vw;"></div>' +
      '<button id="gwent-online-start" style="margin-top:0.5vw;">Start Match</button>';
    document.getElementById("deck-customization").appendChild(wrap);
    document.getElementById("start-game").style.display = "none";
    var debug = document.createElement("div");
    debug.style.marginTop = "0.8vw";
    debug.style.maxHeight = "10vw";
    debug.style.overflow = "auto";
    debug.style.fontSize = "0.7vw";
    debug.style.borderTop = "0.1vw solid rgba(218,165,32,0.2)";
    debug.style.paddingTop = "0.5vw";
    wrap.appendChild(debug);
    online.debug = debug;
    var turnBadge = document.createElement("div");
    turnBadge.style.marginTop = "0.5vw";
    turnBadge.style.fontSize = "0.9vw";
    turnBadge.style.fontWeight = "bold";
    turnBadge.textContent = "Waiting for match start";
    wrap.appendChild(turnBadge);
    online.turnBadge = turnBadge;
    online.lobby = {
      wrap: wrap,
      input: wrap.querySelector("#gwent-online-room"),
      status: wrap.querySelector("#gwent-online-status"),
      players: wrap.querySelector("#gwent-online-players"),
      create: wrap.querySelector("#gwent-online-create"),
      join: wrap.querySelector("#gwent-online-join"),
      ready: wrap.querySelector("#gwent-online-ready"),
      start: wrap.querySelector("#gwent-online-start")
    };

    online.lobby.create.addEventListener("click", function () {
      var roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      online.lobby.input.value = roomCode;
      void joinRoom(roomCode);
    });
    online.lobby.join.addEventListener("click", function () {
      var roomCode = (online.lobby.input.value || "").trim().toUpperCase();
      if (!roomCode) return;
      void joinRoom(roomCode);
    });
    online.lobby.ready.addEventListener("click", function () {
      if (!online.roomCode) return;
      online.readyDecks[online.self.userId] = {
        username: online.self.username,
        deck: serializeLocalDeck()
      };
      updateLobbyStatus("Deck locked in.");
      void sendMessage({
        type: "ready",
        userId: online.self.userId,
        username: online.self.username,
        deck: online.readyDecks[online.self.userId].deck
      });
    });
    online.lobby.start.addEventListener("click", function () {
      void startOnlineMatch();
    });
  }

  DeckMaker.prototype.startNewGame = function () {
    updateLobbyStatus("Use the online room controls to start a match.");
  };

  async function joinRoom(roomCode) {
    if (online.channel) {
      await online.client.removeChannel(online.channel);
    }
    online.roomCode = roomCode;
    online.joinedAt = new Date().toISOString();
    online.readyDecks = {};
    online.channel = online.client.channel("focusland-gwent-" + roomCode.toLowerCase(), {
      config: { presence: { key: online.self.userId } }
    });

    online.channel.on("presence", { event: "sync" }, function () {
      debugLog("Presence sync");
      refreshPlayers(online.channel.presenceState());
    });

    online.channel.on("broadcast", { event: "gwent-online" }, function (event) {
      debugLog("RECV " + ((event.payload && event.payload.type) || "unknown"));
      void handleMessage(event.payload || {});
    });

    online.channel.subscribe(async function (status) {
      debugLog("Channel status: " + status);
      if (status !== "SUBSCRIBED") return;
      await trackPresence();
      updateLobbyStatus("Connected to room " + roomCode + ".");
    });
  }

  async function startOnlineMatch() {
    if (!online.isHost || online.players.length !== 2) {
      return;
    }
    var hostEntry = online.players[0];
    var guestEntry = online.players[1];
    var hostReady = online.readyDecks[hostEntry.userId];
    var guestReady = online.readyDecks[guestEntry.userId];
    if (!hostReady || !guestReady) {
      updateLobbyStatus("Both players need to press Ready.");
      return;
    }
    var setup = {
      type: "setup",
      seed: Math.floor(Date.now() % 2147483647),
      firstPlayerSeat: Math.random() < 0.5 ? "host" : "guest",
      host: { userId: hostEntry.userId, username: hostEntry.username, deck: hostReady.deck },
      guest: { userId: guestEntry.userId, username: guestEntry.username, deck: guestReady.deck }
    };
    await sendMessage(setup);
    launchMatch(setup);
  }

  function launchMatch(setup) {
    try {
      debugLog("Launching match as " + (setup.host.userId === online.self.userId ? "host" : "guest"));
      debugLog("First player seat: " + setup.firstPlayerSeat);
      debugLog("Reset runtime");
      resetRuntimeSurface();
      online.matchStarted = true;
      online.localSeat = setup.host.userId === online.self.userId ? "host" : "guest";
      online.redrawDone = { host: false, guest: false };
      online.redrawSeatOrder = ["host", "guest"];
      setSeed(setup.seed);

      debugLog("Build decks");
      var hostDeck = buildDeckFromSaved(setup.host.deck, cardIndexListFromDeck(setup.host.deck, setup.seed + 11));
      var guestDeck = buildDeckFromSaved(setup.guest.deck, cardIndexListFromDeck(setup.guest.deck, setup.seed + 29));
      var meData = online.localSeat === "host" ? setup.host : setup.guest;
      var opData = online.localSeat === "host" ? setup.guest : setup.host;
      var meDeck = online.localSeat === "host" ? hostDeck : guestDeck;
      var opDeck = online.localSeat === "host" ? guestDeck : hostDeck;

      debugLog("Create players");
      player_me = new Player(0, meData.username, meDeck);
      player_op = new Player(1, opData.username, opDeck);
      player_op.controller = new Controller();
      game.firstPlayer = setup.firstPlayerSeat === online.localSeat ? player_me : player_op;

      if (online.lobby && online.lobby.wrap) {
        online.lobby.wrap.style.opacity = "0.65";
      }

      debugLog("Hide deck maker");
      dm.elem.classList.add("hide");
      updateTurnBadge();
      debugLog("Call startGame");
      game.startGame();
    } catch (error) {
      debugLog("ERROR launchMatch: " + (error && error.message ? error.message : String(error)));
      console.error(error);
    }
  }

  async function handleMessage(message) {
    if (!message || !message.type) {
      return;
    }
    if (message.type === "ready") {
      online.readyDecks[message.userId] = {
        username: message.username,
        deck: message.deck
      };
      updateLobbyStatus("Ready players: " + Object.keys(online.readyDecks).length + "/2");
      return;
    }
    if (message.type === "setup" && message.host.userId !== online.self.userId) {
      launchMatch(message);
      return;
    }
    if (message.userId === online.self.userId) {
      return;
    }
    if (!online.matchStarted) {
      return;
    }

    online.suppressBroadcast = true;
    try {
      var actor = getPlayerForSeat(message.seat);
      debugLog("Apply " + message.type + " from " + message.seat);
      if (
        actor &&
        message.type !== "carousel-select" &&
        message.type !== "carousel-finish" &&
        message.type !== "popup-choice"
      ) {
        game.currPlayer = actor;
      }
      if (message.type === "redraw") {
        var redrawCard = findCardInHand(actor, message.card, message.index);
        if (!actor || !redrawCard) {
          debugLog("Missing redraw card " + JSON.stringify(message.card || message.index));
          return;
        }
        actor.deck.swap(actor.hand, actor.hand.removeCard(redrawCard));
      } else if (message.type === "redraw-finish") {
        online.redrawDone[message.seat] = true;
      } else if (message.type === "pass") {
        actor.passRound();
      } else if (message.type === "play-card") {
        var playCard = findCardInHand(actor, message.card, message.index);
        if (!actor || !playCard) {
          debugLog("Missing play-card hand card " + JSON.stringify(message.card || message.index));
          return;
        }
        await actor.playCard(playCard);
      } else if (message.type === "play-row") {
        var rowCard = findCardInHand(actor, message.card, message.index);
        if (!actor || !rowCard) {
          debugLog("Missing play-row hand card " + JSON.stringify(message.card || message.index));
          return;
        }
        var targetRow = getRowForDescriptor(actor, message.row);
        if (!targetRow) {
          debugLog("Missing target row for descriptor " + JSON.stringify(message.row));
          return;
        }
        await actor.playCardToRow(rowCard, targetRow);
      } else if (message.type === "play-scorch") {
        var scorchCard = findCardInHand(actor, message.card, message.index);
        if (!actor || !scorchCard) {
          debugLog("Missing scorch hand card " + JSON.stringify(message.card || message.index));
          return;
        }
        await actor.playScorch(scorchCard);
      } else if (message.type === "leader") {
        await actor.activateLeader();
      } else if (message.type === "decoy") {
        var decoyCard = findCardInHand(actor, message.card, message.index);
        if (!actor || !decoyCard) {
          debugLog("Missing decoy hand card " + JSON.stringify(message.card || message.index));
          return;
        }
        var targetRow = getRowForDescriptor(actor, message.row);
        if (!targetRow) {
          debugLog("Missing decoy row for descriptor " + JSON.stringify(message.row));
          return;
        }
        var targetCard = targetRow.cards[message.targetIndex];
        if (!targetCard) {
          debugLog("Missing decoy target at row " + message.row + " index " + message.targetIndex);
          return;
        }
        board.toHand(targetCard, targetRow);
        await board.moveTo(decoyCard, targetRow, decoyCard.holder.hand);
        decoyCard.holder.endTurn();
      } else if (message.type === "carousel-select" && online.pendingRemoteCarousel) {
        await online.pendingRemoteCarousel.action(online.pendingRemoteCarousel.container, message.index);
      } else if (message.type === "carousel-finish" && online.pendingRemoteCarousel) {
        online.pendingRemoteCarousel.resolve();
        online.pendingRemoteCarousel = null;
      } else if (message.type === "popup-choice" && online.pendingRemotePopup) {
        if (message.choice === "yes") {
          online.pendingRemotePopup.yes();
        } else {
          online.pendingRemotePopup.no();
        }
        online.pendingRemotePopup.resolve();
        online.pendingRemotePopup = null;
      }
      debugLog("Applied " + message.type + " successfully");
    } catch (error) {
      debugLog("ERROR " + message.type + ": " + (error && error.message ? error.message : String(error)));
      console.error(error);
    } finally {
      online.suppressBroadcast = false;
    }
  }

  Deck.prototype.initialize = function (cardDataList, player, preserveOrder) {
    if (!preserveOrder) {
      return originalDeckInitialize.call(this, cardDataList, player);
    }
    for (var i = 0; i < cardDataList.length; ++i) {
      var card = new Card(cardDataList[i], player);
      card.holder = player;
      this.cards.push(card);
      this.addCardElement();
    }
    this.resize();
  };

  Deck.prototype.initializeFromID = function (cardIdList, player) {
    if (player && player.deck_data && player.deck_data.orderedCards) {
      return this.initialize(
        player.deck_data.orderedCards.map(function (index) {
          return card_dict[index];
        }),
        player,
        true
      );
    }
    return originalDeckInitializeFromID.call(this, cardIdList, player);
  };

  if (originalMusterPlaced) {
    ability_dict.muster.placed = async function (card) {
      if (!online.matchStarted) {
        return originalMusterPlaced(card);
      }
      var owner = card.holder;
      var separatorIndex = card.name.indexOf("-");
      var cardName = separatorIndex === -1 ? card.name : card.name.substring(0, separatorIndex);
      var predicate = function (candidate) {
        return candidate.name.startsWith(cardName);
      };
      var units = owner.hand
        .getCards(predicate)
        .map(function (unit) {
          unit.holder = owner;
          return [owner.hand, unit];
        })
        .concat(
          owner.deck.getCards(predicate).map(function (unit) {
            unit.holder = owner;
            return [owner.deck, unit];
          })
        );
      if (units.length === 0) {
        return;
      }
      await card.animate("muster");
      await Promise.all(
        units.map(async function (entry) {
          var unit = entry[1];
          await board.addCardToRow(unit, unit.row, owner, entry[0]);
        })
      );
    };
  }

  Game.prototype.initialRedraw = async function () {
    if (!online.matchStarted) {
      return originalInitialRedraw.call(this);
    }
    for (var redrawIndex = 0; redrawIndex < online.redrawSeatOrder.length; redrawIndex += 1) {
      var seat = online.redrawSeatOrder[redrawIndex];
      if (seat === online.localSeat) {
        await originalQueueCarousel(
          player_me.hand,
          2,
          async function (container, index) {
            var redrawCard = container.cards[index];
            await sendMessage({
              type: "redraw",
              seat: online.localSeat,
              userId: online.self.userId,
              index: index,
              card: getCardRef(redrawCard)
            });
            await player_me.deck.swap(container, container.removeCard(index));
          },
          function () {
            return true;
          },
          true,
          true,
          "Choose up to 2 cards to redraw."
        );
        online.redrawDone[seat] = true;
        await sendMessage({ type: "redraw-finish", seat: online.localSeat, userId: online.self.userId });
      } else {
        await sleepUntil(function () {
          return online.redrawDone[seat];
        }, 100);
      }
    }
    ui.enablePlayer(false);
    game.startRound();
  };

  Game.prototype.startGame = async function () {
    debugLog("startGame: begin");
    try {
      var result = await originalGameStartGame.call(this);
      debugLog("startGame: returned");
      return result;
    } catch (error) {
      debugLog("ERROR startGame: " + (error && error.message ? error.message : String(error)));
      console.error(error);
      throw error;
    }
  };

  Game.prototype.startRound = async function () {
    debugLog("startRound: round " + (this.roundCount + 1) + ", first=" + getSeatTag(this.firstPlayer));
    updateTurnBadge();
    return originalGameStartRound.call(this);
  };

  Game.prototype.startTurn = async function () {
    debugLog("startTurn: curr=" + getSeatTag(this.currPlayer) + ", passed local=" + player_me.passed + ", remote=" + player_op.passed);
    var result = await originalGameStartTurn.call(this);
    updateTurnBadge();
    return result;
  };

  Game.prototype.endTurn = async function () {
    debugLog("endTurn: curr=" + getSeatTag(this.currPlayer));
    var result = await originalGameEndTurn.call(this);
    updateTurnBadge();
    return result;
  };

  Player.prototype.playCard = async function (card) {
    if (online.matchStarted && !online.suppressBroadcast && this === player_me && !isLocalTurn()) {
      debugLog("Blocked local play-card while not local turn");
      return;
    }
    if (online.matchStarted && !online.suppressBroadcast && this === player_me) {
      await sendMessage({
        type: "play-card",
        seat: online.localSeat,
        userId: online.self.userId,
        index: this.hand.cards.indexOf(card),
        card: getCardRef(card)
      });
    }
    return originalPlayCard.call(this, card);
  };

  Player.prototype.playCardToRow = async function (card, row) {
    if (online.matchStarted && !online.suppressBroadcast && this === player_me && !isLocalTurn()) {
      debugLog("Blocked local play-row while not local turn");
      return;
    }
    if (online.matchStarted && !online.suppressBroadcast && this === player_me) {
        await sendMessage({
        type: "play-row",
        seat: online.localSeat,
        userId: online.self.userId,
        index: this.hand.cards.indexOf(card),
        row: getRowDescriptor(row),
        card: getCardRef(card)
      });
    }
    return originalPlayCardToRow.call(this, card, row);
  };

  Player.prototype.playScorch = async function (card) {
    if (online.matchStarted && !online.suppressBroadcast && this === player_me && !isLocalTurn()) {
      debugLog("Blocked local scorch while not local turn");
      return;
    }
    if (online.matchStarted && !online.suppressBroadcast && this === player_me) {
      await sendMessage({
        type: "play-scorch",
        seat: online.localSeat,
        userId: online.self.userId,
        index: this.hand.cards.indexOf(card),
        card: getCardRef(card)
      });
    }
    return originalPlayScorch.call(this, card);
  };

  Player.prototype.activateLeader = async function () {
    if (online.matchStarted && !online.suppressBroadcast && this === player_me && !isLocalTurn()) {
      debugLog("Blocked local leader while not local turn");
      return;
    }
    if (online.matchStarted && !online.suppressBroadcast && this === player_me) {
      await sendMessage({ type: "leader", seat: online.localSeat, userId: online.self.userId });
    }
    return originalActivateLeader.call(this);
  };

  Player.prototype.passRound = function () {
    if (online.matchStarted && !online.suppressBroadcast && this === player_me && !isLocalTurn()) {
      debugLog("Blocked local pass while not local turn");
      return;
    }
    if (online.matchStarted && !online.suppressBroadcast && this === player_me) {
      void sendMessage({ type: "pass", seat: online.localSeat, userId: online.self.userId });
    }
    return originalPassRound.call(this);
  };

  ui.queueCarousel = async function (container, count, action, predicate, bSort, bQuit, title) {
    if (!online.matchStarted) {
      return originalQueueCarousel(container, count, action, predicate, bSort, bQuit, title);
    }
    if (game.currPlayer === player_me) {
      return originalQueueCarousel(container, count, action, predicate, bSort, bQuit, title);
    }
    return new Promise(function (resolve) {
      online.pendingRemoteCarousel = {
        container: container,
        action: action,
        resolve: resolve
      };
    });
  };

  ui.popup = async function (yesName, yes, noName, no, title, description) {
    if (!online.matchStarted) {
      return originalPopup(yesName, yes, noName, no, title, description);
    }
    if (game.currPlayer === player_me) {
      return originalPopup(yesName, yes, noName, no, title, description);
    }
    return new Promise(function (resolve) {
      online.pendingRemotePopup = { yes: yes || function () {}, no: no || function () {}, resolve: resolve };
    });
  };

  var originalCarouselSelect = Carousel.prototype.select;
  Carousel.prototype.select = async function (event) {
    if (online.matchStarted && !online.suppressBroadcast && game.currPlayer === player_me) {
      await sendMessage({
        type: "carousel-select",
        seat: online.localSeat,
        userId: online.self.userId,
        index: this.indices[this.index]
      });
    }
    return originalCarouselSelect.call(this, event);
  };

  var originalCarouselExit = Carousel.prototype.exit;
  Carousel.prototype.exit = function () {
    if (online.matchStarted && !online.suppressBroadcast && game.currPlayer === player_me) {
      void sendMessage({ type: "carousel-finish", seat: online.localSeat, userId: online.self.userId });
    }
    return originalCarouselExit.call(this);
  };

  var originalPopupYes = Popup.prototype.selectYes;
  Popup.prototype.selectYes = function () {
    if (online.matchStarted && !online.suppressBroadcast) {
      void sendMessage({ type: "popup-choice", seat: online.localSeat, userId: online.self.userId, choice: "yes" });
    }
    return originalPopupYes.call(this);
  };

  var originalPopupNo = Popup.prototype.selectNo;
  Popup.prototype.selectNo = function () {
    if (online.matchStarted && !online.suppressBroadcast) {
      void sendMessage({ type: "popup-choice", seat: online.localSeat, userId: online.self.userId, choice: "no" });
    }
    return originalPopupNo.call(this);
  };

  ui.selectCard = async function (card) {
    if (online.matchStarted && !online.suppressBroadcast && !isLocalTurn()) {
      debugLog("Ignored selectCard while not local turn");
      return;
    }
    var row = this.lastRow;
    var previewCard = this.previewCard;
    if (
      online.matchStarted &&
      !online.suppressBroadcast &&
      previewCard &&
      previewCard.name === "Decoy" &&
      card !== previewCard &&
      card.holder !== player_me &&
      game.currPlayer === player_me
    ) {
      var targetRowDescriptor = getRowDescriptor(row);
      if (!targetRowDescriptor) {
        return originalSelectCard.call(this, card);
      }
      var targetIndex = row.cards.indexOf(card);
      await sendMessage({
        type: "decoy",
        seat: online.localSeat,
        userId: online.self.userId,
        index: player_me.hand.cards.indexOf(previewCard),
        row: targetRowDescriptor,
        targetIndex: targetIndex,
        card: getCardRef(previewCard)
      });
    }
    return originalSelectCard.call(this, card);
  };

  ui.selectRow = async function (row) {
    if (online.matchStarted && !online.suppressBroadcast && !isLocalTurn()) {
      debugLog("Ignored selectRow while not local turn");
      return;
    }
    if (
      online.matchStarted &&
      !online.suppressBroadcast &&
      this.previewCard &&
      this.previewCard.holder === player_me &&
      game.currPlayer === player_me
    ) {
      if (this.previewCard.name === "Scorch") {
        await sendMessage({
          type: "play-scorch",
          seat: online.localSeat,
          userId: online.self.userId,
          index: player_me.hand.cards.indexOf(this.previewCard),
          card: getCardRef(this.previewCard)
        });
      } else if (this.previewCard.name !== "Decoy") {
        await sendMessage({
          type: "play-row",
          seat: online.localSeat,
          userId: online.self.userId,
          index: player_me.hand.cards.indexOf(this.previewCard),
          row: getRowDescriptor(row),
          card: getCardRef(this.previewCard)
        });
      }
    }
    return originalSelectRow.call(this, row);
  };

  createRoomUi();
  updateLobbyStatus("Create or join a room.");

  window.addEventListener("beforeunload", function () {
    restoreRandom();
  });
})();
