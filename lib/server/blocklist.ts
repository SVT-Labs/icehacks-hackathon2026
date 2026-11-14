// A deliberately short list of slurs and explicit terms that are rejected in
// nicknames, truths and own lies. It is a first filter only: the AI judges the
// truths properly, and the reveal is shown to people in the same room.
//
// An entry ending in "*" matches any word that starts with it ("fuck*" also
// catches "fucking"). Other entries match whole words only, so "ass" does not
// match "class". Matching runs on lower-case text with common digit and
// symbol swaps undone (0 -> o, 1 -> i, 3 -> e, 4 -> a, 5 -> s, @ -> a, $ -> s).

export const BLOCKLIST: readonly string[] = [
  // Explicit sexual terms
  "fuck*",
  "motherfuck*",
  "cunt*",
  "cock",
  "cocks",
  "dick",
  "dicks",
  "pussy",
  "pussies",
  "porn*",
  "blowjob*",
  "handjob*",
  "dildo*",
  "jizz*",
  "cum",
  "cumshot*",
  "orgasm*",
  "masturbat*",
  "horny",
  "nude",
  "nudes",
  "boobs",
  "tits",
  "titties",
  "anal",
  "rape*",
  "rapist*",
  "pedo*",
  "paedo*",
  "whore*",
  "slut*",
  "hentai",
  // Slurs
  "nigger*",
  "nigga*",
  "faggot*",
  "fag",
  "fags",
  "retard*",
  "tranny*",
  "kike*",
  "spic",
  "spics",
  "chink*",
  "gook*",
  "wetback*",
  "dyke*",
  // Self-harm and violence aimed at people
  "kys",
  "killyourself",
];
