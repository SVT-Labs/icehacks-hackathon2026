// This file holds the answers to the bot cards. Only the game engine may import
// it: a component that did would ship the answers to the browser.

import type { Avatar } from "../types";

export type BotCard = {
  truths: [string, string];
  lie: string;
  starter: string;
};

export type BotCharacter = {
  id: string;
  name: string;
  avatar: Avatar;
  cards: BotCard[];
};

export const BOTS: BotCharacter[] = [
  {
    id: "bot_pip",
    name: "Pip",
    avatar: "sun",
    cards: [
      {
        truths: [
          "I once slid forty metres on my belly and could not stop.",
          "I have never caught a fish on my first dive.",
        ],
        lie: "I can hold my breath for a whole hour.",
        starter: "Ask Pip where that forty-metre belly slide ended.",
      },
      {
        truths: [
          "I followed the wrong colony home in a snowstorm.",
          "I keep a collection of 212 smooth grey pebbles.",
        ],
        lie: "I won a staring contest against a walrus.",
        starter: "Ask Pip how long it took to notice it was the wrong colony.",
      },
      {
        truths: [
          "My own reflection in clear ice still makes me jump.",
          "I ate so much krill once that I could not waddle.",
        ],
        lie: "I have swum under an iceberg from one end to the other.",
        starter: "Ask Pip how much krill is too much krill.",
      },
      {
        truths: [
          "I sleep standing up, even when the wind is howling.",
          "I named every one of my pebbles and forgot most of the names.",
        ],
        lie: "I taught a seagull to count to ten.",
        starter: "Ask Pip which pebble names are still remembered.",
      },
    ],
  },
  {
    id: "bot_frost",
    name: "Captain Frost",
    avatar: "navy",
    cards: [
      {
        truths: [
          "I steered an icebreaker for thirty winters.",
          "I get seasick on anything smaller than a ferry.",
        ],
        lie: "I have never once been cold.",
        starter: "Ask Captain Frost how a seasick captain lasts thirty winters.",
      },
      {
        truths: [
          "I lost my lucky compass and found it two years later in a boot.",
          "I can tie eleven kinds of knot with my eyes closed.",
        ],
        lie: "I once sailed around the world without a map.",
        starter: "Ask Captain Frost whose boot the compass was in.",
      },
      {
        truths: [
          "A seal stole my hat and wore it for a week.",
          "I write a letter to the sea every New Year.",
        ],
        lie: "I can predict a storm three days ahead by smell.",
        starter: "Ask Captain Frost what goes in a letter to the sea.",
      },
      {
        truths: [
          "I learned to swim after I became a captain.",
          "My ship's horn is tuned to the first note of my favourite song.",
        ],
        lie: "I have a tattoo of every port I ever visited.",
        starter: "Ask Captain Frost which song the ship's horn starts.",
      },
    ],
  },
  {
    id: "bot_nori",
    name: "Nori",
    avatar: "plum",
    cards: [
      {
        truths: [
          "I rate every fish I eat out of ten in a small notebook.",
          "I have never given a fish a ten.",
        ],
        lie: "I only eat fish that I caught myself.",
        starter: "Ask Nori which fish came closest to a ten.",
      },
      {
        truths: [
          "I burned soup once, and nobody knows how that is possible.",
          "I can tell two kinds of krill apart by smell alone.",
        ],
        lie: "I have cooked dinner for a hundred guests on my own.",
        starter: "Ask Nori how you burn soup.",
      },
      {
        truths: [
          "My secret ingredient is a pinch of snow from the north side.",
          "I refuse to eat anything that is still moving.",
        ],
        lie: "I trained as a chef for ten years in the south.",
        starter: "Ask Nori why the snow has to come from the north side.",
      },
      {
        truths: [
          "I dropped a whole feast into the sea on the way to a party.",
          "I hum while I cook, and it is always the same four notes.",
        ],
        lie: "I have never followed a recipe in my life.",
        starter: "Ask Nori what happened at the party with no feast.",
      },
    ],
  },
  {
    id: "bot_bolt",
    name: "Bolt",
    avatar: "teal",
    cards: [
      {
        truths: [
          "I hold the colony record for the longest belly slide.",
          "I trip over my own feet at least once a day.",
        ],
        lie: "I have never lost a race.",
        starter: "Ask Bolt how far the record belly slide went.",
      },
      {
        truths: [
          "I race my own shadow every morning and it is two wins each.",
          "I pulled a muscle sneezing.",
        ],
        lie: "I swam ten kilometres without stopping for air.",
        starter: "Ask Bolt how you pull a muscle sneezing.",
      },
      {
        truths: [
          "I do forty flipper push-ups before breakfast.",
          "I am afraid of jumping into water I cannot see the bottom of.",
        ],
        lie: "I can jump clean over a sleeping sea lion.",
        starter: "Ask Bolt how a diver copes with a fear of deep water.",
      },
      {
        truths: [
          "I came last in my first ever race and cried on the ice.",
          "I count my steps everywhere and lose count around ninety.",
        ],
        lie: "I was offered a place on a dolphin relay team.",
        starter: "Ask Bolt what changed after that first race.",
      },
    ],
  },
];
