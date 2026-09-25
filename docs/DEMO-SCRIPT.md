# Parity — demo video script

**Target: 2 minutes 40 seconds.** Record during the US regular session (09:30–16:00 ET) so the
numbers move and Ondo actually quotes. Anything in `[brackets]` is live — say what's on your
screen, not what's written here.

**On delivery.** The lines are written the way you'd explain this to someone sitting next to you,
so don't perform them. If a sentence feels stiff in your mouth, change it — it should sound like
you. Stumbling slightly over a real number is fine; it beats sounding polished about something
you're inventing, which you aren't. The `(beat)` marks are where to stop talking and let the
screen carry it.

---

## Shot 1 — Cold open · 0:00–0:14

**Screen:** Landing page, scrolled to the big record numbers (`−479 / +34`, `$122 / $176`).
**Action:** Hold still. Don't move the mouse.

> So when SpaceX listed, you could buy the same share for a hundred and twenty-two dollars on one
> Solana issuer, or a hundred and seventy-six on another.
>
> *(beat)*
>
> Same share. Same day. Just a different wrapper around it.

---

## Shot 2 — The hero · 0:14–0:34

**Screen:** Landing, scrolled to the top.
**Action:** Let it sit for about two seconds. Then **hover the wordmark** and hold it. Then pull
the mouse away so the colours separate again.

> And that's still happening. This is one stock, right now, printed three times — once per issuer.
> They're out of line because their prices are out of line. Each one's shifted by however far it
> actually is from fair value.
>
> *(hover — let the snap land)*
>
> That's the whole idea. Find the fair price, then tell you which one to actually buy.

**If only two colours show:** *"this one's only issued by two of the three — Backpack lists about
forty names, so coverage isn't even."* True, and it sounds like you know the market.

---

## Shot 3 — The tape · 0:34–0:42

**Screen:** Landing.
**Action:** Scroll slowly through the scrolling ticker tape, down to the chart.

> Every one of these is the same share trading at two different prices. Same chain, same moment.
>
> And this is the last few minutes of it.

---

## Shot 4 — Markets · 0:42–0:58

**Screen:** Click **Markets**.
**Action:** Point at the top row's dispersion axis, then at the spread number on the right.

> Here's everything, ranked by how far apart the issuers are. The line down the middle is fair
> value, each dot is one issuer, and that number's the gap — `[N]` basis points on `[SYMBOL]`.
> Call it `[$X]` on every ten grand.
>
> One thing we deliberately don't do, by the way. Ondo doesn't trade from a pool, it quotes on
> request — so its last price drifts around. We leave it out of this comparison instead of showing
> you a spread nobody could've actually traded.

---

## Shot 5 — The answer · 0:58–1:18

**Screen:** Click into `/s/SPCX`.
**Action:** Let the headline finish rendering before you say anything.

> And this is really the whole product, in one line. At a thousand dollars, buy this one.
>
> Not the last price someone paid — what it'd cost you, at your size, after impact.

**Action:** Click the **$25k** chip. Wait for the cards to reorder.

> Change the size and the answer can change with it. The cheapest token at a thousand dollars
> often isn't the cheapest at twenty-five.

---

## Shot 6 — Where the numbers come from · 1:18–1:34

**Screen:** Ticker.
**Action:** Tap the dotted **fair value** figure, let the popover open. Then close it and tap one
of the **card prices**.

> Every number on this page is a claim, so every number will show you where it came from.
>
> Fair value's from Pyth's on-chain account — there's the account, how old it is, the confidence
> band. We don't set that price, and we don't blend it with our own quotes.
>
> Same for the fill. That's a simulated trade of your actual size against live liquidity.

---

## Shot 7 — The refusal · 1:34–2:00 — **the moment**

**Screen:** Order slip.
**Action:** Drag the guard slider down to about **10 bps**. Press **Review and sign**. Let the
refusal panel render. **Stop talking for a full second.**

> Now — watch what happens if I tighten this past what the market can actually fill.
>
> *(press · beat)*
>
> It won't build the trade. Nothing signed, nothing spent.
>
> And it doesn't just stop there. It tells me what would've worked: another issuer that fits, a
> smaller size that fits, or exactly what it'd cost me to widen my tolerance. All of that quoted
> live.

---

## Shot 8 — The fill · 2:00–2:20

**Screen:** Order slip.
**Action:** Set the guard back to **±50**, size to **$2**. Sign in the wallet. Show the success
panel, then open the **Solscan** link in a new tab.

> Put it back where it was, and this one goes through. Real transaction, mainnet, real money —
> small, because it's my own wallet.
>
> There's the fill, fair value at that moment, and the distance between them.
>
> *(open Solscan)*
>
> And here it is on-chain.

---

## Shot 9 — The receipt · 2:20–2:34

**Screen:** Click **View receipt** (`/r/<sig>`).
**Action:** Scroll down to **"Check it yourself."**

> Every fill writes a receipt. What you paid, what fair value was, which protection applied — and
> what the other issuers were quoting at that exact moment, so you can see it really was the best
> of them.
>
> And these are the steps to check all of that against the chain. Without taking our word for it.

---

## Shot 10 — The close · 2:34–2:50

**Screen:** **Methodology**, scrolled to **"What Parity does not know."**

> Last thing, and it matters. We wrote a program that sits inside the transaction and reverts the
> whole thing if the fill lands off fair value. It's deployed, it works, we've got the proof —
> on devnet.
>
> Not mainnet. Because it hasn't been audited, and unaudited code shouldn't be holding anyone's
> money.
>
> So real trades go through Jupiter's audited programs with a check before you sign, and the app
> tells you which one you're getting, every single time.
>
> *(beat)*
>
> Parity. Every stock on Solana, one fair price.

---

## Before you record

- [ ] US market open, wallet connected and funded
- [ ] Browser at 1440 wide, zoom at 100%, bookmarks bar hidden
- [ ] One full dry run — especially Shot 7, so you know the spread's wide enough to trigger it
- [ ] Close everything else; the only popup should be your wallet
- [ ] 1080p minimum — the type is fine and small

## If something breaks mid-take

Say what happened and keep going. A real product doing something real beats a clean take of
something fake, and the honesty is the pitch anyway.

- **Quote won't load** → *"that's the rate limit on the public endpoint"* — reload, carry on.
- **Ondo won't quote** → *"Ondo only quotes during market hours."* True.
- **The guard refuses your actual $2 fill** → *"and there it is — the market just moved outside my
  tolerance. That's the feature."* Widen it to 100 and go again, on camera.
