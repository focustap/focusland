export type CampfireCardPack = {
  id: string;
  name: string;
  description: string;
  prompts: string[];
  answers: string[];
};

export const CAMPFIRE_CARD_PACKS: CampfireCardPack[] = [
  {
    id: "base",
    name: "Base Pack",
    description: "Warm, weird, cozy party cards for the default campfire table.",
    prompts: [
      "The campfire got quiet when someone admitted they packed ____.",
      "Our cabin's one-star review only said: ____.",
      "The racetrack announcer paused, sighed, and announced ____.",
      "Tonight's group activity is just ____ with extra blankets.",
      "The forest spirit demanded one offering: ____.",
      "The group chat exploded after someone sent ____.",
      "The real treasure in the haunted lodge was ____.",
      "Grandma's secret soup recipe was mostly ____.",
      "The indie game won an award for its bold use of ____.",
      "Nothing says friendship like ____ at 2 a.m.",
      "The town mayor banned ____ after the festival incident.",
      "The wizard's tiny apprentice could only summon ____.",
      "Our band broke up over creative differences involving ____.",
      "A sign on the trail warned hikers about ____.",
      "The victory screen simply read: ____.",
      "Everyone clapped when the talent show ended with ____.",
      "The cozy mystery was solved when detectives found ____.",
      "The new cafe's signature drink tastes like ____.",
      "At sunrise, we finally understood the prophecy: ____.",
      "The camping trip turned around once we discovered ____."
    ],
    answers: [
      "a suspiciously confident raccoon lawyer",
      "emotional support garlic bread",
      "a tiny cape for every bug",
      "three goblets of room-temperature soup",
      "a haunted friendship bracelet",
      "the world's dampest wizard hat",
      "a dramatic reading of the microwave manual",
      "one brave little cheese cube",
      "a legally distinct moon wizard",
      "grandpa's forbidden kazoo solo",
      "a backpack full of tiny spoons",
      "an apology tour for a houseplant",
      "a potato that knows everyone's secrets",
      "the group project energy of five sleepy cousins",
      "a championship-level blanket nest",
      "a cursed coupon for half a sandwich",
      "a motivational speech from a broken vending machine",
      "the elegant chaos of mismatched socks",
      "a campfire story with too many spreadsheets",
      "someone whispering 'trust the vibes' into a walkie-talkie",
      "a mystery jar labeled Wednesday",
      "a crown made from snack wrappers",
      "the cozy panic of losing the marshmallow bag",
      "a wizard duel fought entirely with compliments",
      "an extremely personal lasagna",
      "a tiny parade for one lonely crouton",
      "the haunted accordion in the attic",
      "a friendship contract written in glitter pen",
      "an overqualified frog accountant",
      "the smell of victory and burnt toast"
    ]
  },
  {
    id: "cleanish",
    name: "Clean-ish Pack",
    description: "Silly table-safe jokes with low spice and high nonsense.",
    prompts: [
      "The school assembly was saved by ____.",
      "The picnic basket contained sandwiches, lemonade, and ____.",
      "The new board game expansion adds ____.",
      "The pet talent contest was won by ____.",
      "The world's coziest superhero is powered by ____.",
      "The museum's newest exhibit is dedicated to ____.",
      "The sleepover rules specifically forbid ____.",
      "The bakery had to close early because of ____.",
      "A perfect rainy day includes tea, socks, and ____.",
      "The substitute teacher's only lesson plan was ____."
    ],
    answers: [
      "a very polite thunderstorm",
      "twelve synchronized hamsters in tiny scarves",
      "a pillow fort with municipal approval",
      "a waffle shaped like destiny",
      "the squeaky chair of leadership",
      "a parade float made of pancakes",
      "an opera about misplaced mittens",
      "one heroic paperclip",
      "the ceremonial bedtime banana",
      "a map to the good snacks",
      "competitive cloud watching",
      "a pumpkin with stage fright",
      "a friendship-powered leaf blower",
      "the world's slowest magic trick",
      "a suspiciously fancy lunchbox"
    ]
  },
  {
    id: "chaos",
    name: "Chaos Pack",
    description: "Louder, stranger, and built for the friend who always chooses violence against good taste.",
    prompts: [
      "The group knew the night was doomed after ____.",
      "The final boss entered the arena carrying ____.",
      "My villain origin story begins with ____.",
      "The emergency meeting was called because of ____.",
      "The cabin's basement contained one chair and ____.",
      "The forbidden ritual requires candles, chanting, and ____.",
      "The mayor's debate took a turn when someone asked about ____.",
      "The world's worst dating profile lists ____ as a hobby.",
      "The secret ingredient was, unfortunately, ____.",
      "Scientists now believe the moon is mostly ____."
    ],
    answers: [
      "a duffel bag full of cursed birthday candles",
      "the emotional baggage carousel",
      "a clown college thesis defense",
      "one thousand bees with unpaid invoices",
      "a deeply haunted karaoke machine",
      "the crunchy part of a nightmare",
      "a tax audit performed by puppets",
      "screaming into a decorative gourd",
      "the mayor's illegal soup tunnel",
      "a trampoline in a room with opinions",
      "a suspiciously damp wizard council",
      "the phrase 'let me explain' said too late",
      "a hot tub full of cold spaghetti",
      "a cursed group photo where everyone blinked",
      "a motivational poster that knows what you did"
    ]
  },
  {
    id: "friends",
    name: "Friend Group Pack",
    description: "Placeholder pack for your group's private jokes. Add prompts and answers later.",
    prompts: [],
    answers: []
  },
  {
    id: "future-custom",
    name: "Future Custom Packs",
    description: "Reserved slot for themed packs and seasonal experiments.",
    prompts: [],
    answers: []
  }
];

export const DEFAULT_ENABLED_PACK_IDS = ["base", "cleanish"];

export function getEnabledCardPools(enabledPackIds: string[]) {
  const enabled = CAMPFIRE_CARD_PACKS.filter((pack) => enabledPackIds.includes(pack.id));
  const fallback = CAMPFIRE_CARD_PACKS.filter((pack) => DEFAULT_ENABLED_PACK_IDS.includes(pack.id));
  const packs = enabled.length ? enabled : fallback;

  return {
    prompts: packs.flatMap((pack) => pack.prompts.map((text) => ({ packId: pack.id, text }))),
    answers: packs.flatMap((pack) => pack.answers.map((text) => ({ packId: pack.id, text })))
  };
}
