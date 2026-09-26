// The edit decision list for the demo film.
//
// Every `shot` names a real still captured from the deployed app by ops/video/capture.mjs.
// Camera coordinates are in the captured CSS viewport space (1440 x 900): `cx`/`cy` is the
// point held at frame centre and `zoom` 1 frames the whole window.
//
// `vo` is what the narrator says. Durations are NOT written here — ops/video/plan.mjs
// synthesises each line, measures it, and fits the picture to the voice, so the two can
// never drift apart.

export const URL_BAR = "parity-manuel-dev01s-projects.vercel.app";
export const VOICE = { voice: "en-US-AndrewNeural", rate: "-4%", pitch: "-2Hz" };
export const TARGET_SECONDS = 300;

// Landing hero: wordmark centred around (696, 338); issuer legend at y ≈ 558.
// Ticker: symbol at (320, 205), fair value at (1274, 235), headline at (313, 389),
//         size chips at (1192, 456), number line at (792, 600), order slip at (1195, 810).
// Markets: headline at (436, 232), SPCX row axis at (657, 516), spread figure at (1166, 507).

export const shots = [
  {
    id: "open",
    kind: "card",
    card: { title: "One share, printed three times.", sub: "None of them line up.", regAt: 0.8 },
    vo: "One share. Printed three times. And none of them line up.",
    minHold: 1.6,
    tail: 0.9,
  },

  {
    id: "hero",
    shot: "landing-hero",
    vo: "This is one stock, right now, printed three times — once per issuer. They are out of register because their prices are out of line, and each one is offset by exactly how far it sits from fair value. Same share, same chain, same second. The only real difference is the wrapper around it.",
    camera: [
      { at: 0, cx: 700, cy: 360, zoom: 1.0 },
      { at: 8, cx: 700, cy: 470, zoom: 1.42 },
      { at: 16, cx: 740, cy: 505, zoom: 1.5 },
    ],
    captions: [{ text: "The same share, priced two ways, on the same chain.", at: 3.4, until: 9.5 }],
    tail: 0.8,
  },

  {
    id: "hero-aligned",
    shot: "landing-hero-aligned",
    vo: "That is still happening, right now, across the whole market. Every US stock on Solana exists two or three times over, and the prices disagree. What Parity does is find the one fair price underneath all of them, and then tell you which copy to actually buy.",
    camera: [
      { at: 0, cx: 740, cy: 505, zoom: 1.5 },
      { at: 3.0, cx: 700, cy: 360, zoom: 1.0, ease: "camera" },
      { at: 13, cx: 700, cy: 360, zoom: 1.02 },
    ],
    captions: [{ text: "Each print is offset by how far that issuer sits from fair value.", at: 1.0, until: 7.0 }],
    tail: 0.9,
  },

  {
    id: "headline",
    shot: "landing-headline",
    vo: "This is the spread as I am recording this. Not a backtest, and not a screenshot from a good day. It is the live gap between issuers, measured against the oracle.",
    camera: [
      { at: 0, cx: 640, cy: 420, zoom: 1.0 },
      { at: 9, cx: 600, cy: 470, zoom: 1.44 },
    ],
    tail: 0.7,
  },

  {
    id: "fig1",
    shot: "landing-fig1",
    vo: "And this chart draws itself while the page is open. Three issuers, one underlying stock, drifting apart and coming back together over a couple of minutes.",
    camera: [
      { at: 0, cx: 720, cy: 460, zoom: 1.0 },
      { at: 9, cx: 720, cy: 470, zoom: 1.4 },
    ],
    captions: [{ text: "Sampled live, in this session — not stored history.", at: 4.5, until: 10.5 }],
    tail: 0.7,
  },

  {
    id: "steps",
    shot: "landing-steps",
    vo: "The method is four steps, and none of them are clever. Read fair value from an on-chain oracle. Quote every issuer at the size you actually want. Rank them by distance from fair. Then refuse the trade if even the best one is not close enough.",
    camera: [
      { at: 0, cx: 720, cy: 400, zoom: 1.0 },
      { at: 14, cx: 700, cy: 500, zoom: 1.38 },
    ],
    tail: 0.8,
  },

  {
    id: "markets",
    shot: "markets-now",
    vo: "Here is the whole market, ranked by how far apart the issuers are. The line down the middle is fair value, each dot is one issuer, and that figure on the right is the gap, in basis points, and what it would cost you on ten thousand dollars.",
    camera: [
      { at: 0, cx: 720, cy: 420, zoom: 1.0 },
      { at: 5, cx: 436, cy: 450, zoom: 1.44 },
      { at: 11, cx: 700, cy: 516, zoom: 1.56 },
      { at: 15, cx: 1050, cy: 512, zoom: 1.68 },
    ],
    cursor: [
      { at: 0.8, x: 900, y: 700, scale: 1 },
      { at: 3.0, x: 640, y: 520, scale: 1 },
      { at: 11.5, x: 1166, y: 512, scale: 1 },
    ],
    tail: 0.8,
  },

  {
    id: "markets-ondo",
    shot: "markets-now",
    vo: "One thing we deliberately leave out. Ondo does not trade from a pool, it quotes on request, so its last price drifts around. We exclude it from this particular comparison rather than show you a spread that nobody could have actually traded.",
    camera: [
      { at: 0, cx: 1050, cy: 512, zoom: 1.68 },
      { at: 12, cx: 860, cy: 480, zoom: 1.44 },
    ],
    captions: [{ text: "Excluded on purpose, rather than counted and wrong.", at: 6.5, until: 13.0 }],
    tail: 0.8,
  },

  {
    id: "history",
    shot: "markets-history",
    vo: "There is a history tab, and I will be straight about it. This table only started collecting recently. It shows exactly what it has, and it does not pretend to have months.",
    camera: [
      { at: 0, cx: 720, cy: 420, zoom: 1.0 },
      { at: 9, cx: 700, cy: 480, zoom: 1.4 },
    ],
    tail: 0.7,
  },

  {
    id: "answer",
    shot: "ticker-1k",
    vo: "And this is really the whole product, in one line. At a thousand dollars, buy this one. Not the last price somebody happened to pay, but what it would cost you, at your size, after impact.",
    camera: [
      { at: 0, cx: 720, cy: 430, zoom: 1.0 },
      { at: 4.5, cx: 420, cy: 450, zoom: 1.46 },
      { at: 10, cx: 340, cy: 455, zoom: 1.62 },
    ],
    captions: [{ text: "Ranked by what you would actually pay.", at: 9.5, until: 14.5 }],
    tail: 0.9,
  },

  {
    id: "fair",
    shot: "ticker-1k",
    vo: "Fair value sits up here. And look at what it admits: the US market is closed right now, so this is not the equity oracle. It is the freshest reference Parity can actually verify, and the page says so in the label rather than quietly using it.",
    camera: [
      { at: 0, cx: 340, cy: 455, zoom: 1.62 },
      { at: 3.6, cx: 1230, cy: 445, zoom: 1.7 },
      { at: 9, cx: 1240, cy: 455, zoom: 1.66 },
    ],
    cursor: [
      { at: 0.5, x: 400, y: 430, scale: 1 },
      { at: 2.6, x: 1274, y: 250, scale: 1 },
    ],
    tail: 0.7,
  },

  {
    id: "size",
    shot: "ticker-25k",
    vo: "Change the size, and everything is re-quoted at that size. Twenty-five thousand dollars is a different question from a thousand. Here the ranking happens to hold, but the gaps widen, and at some sizes the order does flip, because the depth behind each token is different.",
    camera: [
      { at: 0, cx: 1192, cy: 450, zoom: 1.66 },
      { at: 3.0, cx: 1150, cy: 460, zoom: 1.5, ease: "camera" },
      { at: 9, cx: 620, cy: 470, zoom: 1.42 },
      { at: 15, cx: 700, cy: 620, zoom: 1.46 },
    ],
    cursor: [
      { at: 0.3, x: 1192, y: 456, scale: 1, click: true },
      { at: 2.6, x: 1100, y: 470, scale: 1 },
      { at: 7.5, x: 700, y: 560, scale: 1 },
    ],
    tail: 0.9,
  },

  {
    id: "source",
    shot: "ticker-source",
    vo: "Every number on this page is a claim, so every number will show you where it came from. The source, the session it was taken in, how old it is. And where there is no confidence band published, it tells you that too, instead of inventing one. Parity does not set this number, and it does not blend it with its own quotes.",
    camera: [
      { at: 0, cx: 900, cy: 450, zoom: 1.4 },
      { at: 4.5, cx: 1180, cy: 450, zoom: 1.56 },
      { at: 14, cx: 1195, cy: 465, zoom: 1.62 },
    ],
    captions: [{ text: "Source, age, confidence — and a link to verify on-chain.", at: 6.0, until: 12.5 }],
    tail: 0.9,
  },

  {
    id: "guard",
    shot: "ticker-guard-10",
    vo: "And this is the part I care most about. That slider is your tolerance: how far from fair value you are willing to fill. I am going to tighten it to ten basis points, which is tighter than this market can actually do right now.",
    camera: [
      { at: 0, cx: 900, cy: 500, zoom: 1.4 },
      { at: 5, cx: 1195, cy: 660, zoom: 1.68 },
      { at: 13, cx: 1195, cy: 680, zoom: 1.74 },
    ],
    cursor: [
      { at: 1.0, x: 900, y: 600, scale: 1 },
      { at: 4.5, x: 1120, y: 706, scale: 1 },
      { at: 6.2, x: 1120, y: 706, scale: 1, click: true },
    ],
    tail: 1.0,
  },

  {
    id: "refusal",
    shot: "ticker-guard-10",
    vo: "So I asked the live API to buy at that tolerance, and it said no. Twenty-seven basis points from fair, against a guard of ten. Nothing signed, and nothing spent. But it does not stop at no. It comes back with what would have worked, priced live.",
    camera: [
      { at: 0, cx: 1195, cy: 680, zoom: 1.74 },
      { at: 2.6, cx: 720, cy: 450, zoom: 1.0, ease: "camera" },
    ],
    evidence: { at: 2.0, over: 6 },
    tail: 1.4,
  },

  {
    id: "refusal-honesty",
    shot: "ticker-guard-10",
    vo: "I should be straight about what you are looking at. The order slip needs a connected wallet before it will build anything, so rather than stage a wallet, I asked the exact endpoint that button calls. That is a real response from the deployed app, not a recording of me clicking.",
    camera: [
      { at: 0, cx: 720, cy: 450, zoom: 1.0 },
      { at: 14, cx: 720, cy: 450, zoom: 1.03 },
    ],
    evidence: { at: -1, over: 1 },
    tail: 1.2,
  },

  {
    id: "receipts",
    shot: "receipts",
    vo: "Every fill writes a receipt, and the ledger is public.",
    camera: [
      { at: 0, cx: 720, cy: 420, zoom: 1.0 },
      { at: 5, cx: 700, cy: 470, zoom: 1.38 },
    ],
    tail: 0.7,
  },

  {
    id: "receipt",
    shot: "receipt-verify",
    vo: "What you paid, what fair value was at that moment, which protection applied, and then the steps to check every bit of it against the chain yourself.",
    camera: [
      { at: 0, cx: 720, cy: 420, zoom: 1.0 },
      { at: 9, cx: 640, cy: 480, zoom: 1.48 },
    ],
    captions: [{ text: "Verifiable without trusting us.", at: 5.5, until: 10.5 }],
    tail: 0.8,
  },

  {
    id: "devnet",
    shot: "methodology-unknown",
    vo: "Last thing, and it is the reason I would trust this over a dashboard. We wrote an on-chain program that sits inside the transaction and reverts the whole thing if the fill lands off fair value. It is deployed, it is proven, and it is on devnet. Not mainnet. Because it has not been audited, and unaudited code should not be holding anybody's money.",
    camera: [
      { at: 0, cx: 720, cy: 420, zoom: 1.0 },
      { at: 10, cx: 660, cy: 470, zoom: 1.42 },
      { at: 21, cx: 700, cy: 520, zoom: 1.5 },
    ],
    captions: [{ text: "Proven on devnet. Not shipped to mainnet unaudited.", at: 14.0, until: 21.5 }],
    tail: 1.0,
  },

  {
    id: "close-honesty",
    shot: "methodology-unknown",
    vo: "So real trades go through Jupiter's audited programs, with a fair-value check before you sign, and the app tells you which of the two you are getting, every single time. That same page lists what Parity does not know, as well.",
    camera: [
      { at: 0, cx: 700, cy: 520, zoom: 1.5 },
      { at: 13, cx: 720, cy: 440, zoom: 1.0 },
    ],
    tail: 1.2,
  },

  {
    id: "close",
    kind: "card",
    card: { title: "Parity", sub: "Every stock on Solana, one fair price.", foot: URL_BAR, regAt: 0.5 },
    vo: "Parity. Every stock on Solana, one fair price.",
    minHold: 2.2,
    tail: 2.4,
  },
];
