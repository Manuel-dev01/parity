# Parity — demo video script

**Target: 2 minutes 40 seconds.** Record during the US regular session (09:30–16:00 ET) so the
numbers move and Ondo quotes. Every figure in `[brackets]` is live — read what is on your screen,
not what is written here.

**Delivery notes.** Talk like you're showing a colleague something you found, not pitching. Slow
down on the numbers and let them land. The two moments that win this are **the hover** (Shot 2)
and **the refusal** (Shot 7) — give both a beat of silence afterwards. Don't say "as you can see."

---

## Shot 1 — Cold open · 0:00–0:14
**Screen:** Landing, scrolled to the record stats (`−479 / +34`, `$122 / $176`).
**Action:** Hold still. No cursor movement.

> When SpaceX listed, the same share traded at a hundred and twenty-two dollars on one Solana
> issuer and a hundred and seventy-six on another.
>
> *(beat)*
>
> Not two companies. The same share. Two wrappers.

---

## Shot 2 — The hero · 0:14–0:34
**Screen:** Landing, top. **Action:** Let it sit for two seconds, then **hover the wordmark** and
hold. Then pull the mouse away so it separates again.

> Here's that problem, live. Three issuers, three prices for one share, printed out of register —
> each one shifted by how far it actually is from fair value right now.
>
> *(hover)*
>
> That's what Parity does. It finds the fair price, and tells you which one to buy.

**If only two inks show:** say *"this share is issued by two of the three — Backpack lists about
forty names, so coverage differs"* and move on. It's true and it sounds like you know the market.

---

## Shot 3 — The tape · 0:34–0:42
**Screen:** Scroll slowly through the marquee to Fig. 1.

> Every one of these is the same share trading at two different prices, right now, on the same
> chain. This chart is the last few minutes of it.

---

## Shot 4 — Markets · 0:42–0:58
**Screen:** Click **Markets**. **Action:** Point at the top row's dispersion axis, then the spread.

> Ranked by how far apart the issuers are. The rule down the middle is fair value, each dot is an
> issuer, and the number on the right is the gap — `[N]` basis points on `[SYMBOL]`, about
> `[$X]` on every ten thousand dollars.
>
> One thing we deliberately don't do: Ondo trades by request-for-quote, not from a pool, so its
> last price drifts. We exclude it from this comparison rather than print a spread nobody could
> have traded.

---

## Shot 5 — The answer · 0:58–1:18
**Screen:** Click into `/s/SPCX`. **Action:** Let the headline land before speaking.

> This is the whole product in one sentence. At a thousand dollars, buy this one.
>
> Not the last traded price — what it would actually cost *you*, at *your* size, including impact.

**Action:** Click the **$25k** chip. Wait for the reorder.

> Change the size and the answer can change with it. The cheapest token for a thousand dollars is
> often not the cheapest for twenty-five.

---

## Shot 6 — Provenance · 1:18–1:34
**Screen:** Tap the dotted **fair value** figure, let the popover open. Then tap a **card price**.

> Every number here is a claim, so every number shows its source. Fair value comes from Pyth's
> on-chain account — here's the account, its age, and the confidence band. We don't set this
> price, and we don't average it with our own quotes.
>
> Same for the fill: that's a simulated trade of your full size against live liquidity.

---

## Shot 7 — The refusal · 1:34–2:00 — **the moment**
**Screen:** Order slip. **Action:** Drag the guard slider down to about **10 bps**, then press
**Review and sign**. Let the refusal panel render. **Pause for one full second.**

> Now watch what happens when I tighten the guard past what the market can fill.
>
> *(press · pause)*
>
> It refuses to build the trade. Nothing was signed, nothing was spent.
>
> And it doesn't just stop — it tells me what *would* work: another issuer that fits, a smaller
> size that fits, or exactly what widening my tolerance would cost me in dollars. All quoted live.

---

## Shot 8 — The fill · 2:00–2:20
**Screen:** Set guard back to **±50**, size to **$2**. **Action:** Sign in the wallet. Show the
success panel, then open the Solscan link in a new tab.

> Set it back, and this one goes through. Real transaction, real mainnet, real money — small,
> because this is my own wallet.
>
> Fill price, fair value at that moment, and the distance between them. Here it is on-chain.

---

## Shot 9 — The receipt · 2:20–2:34
**Screen:** Click **View receipt** (`/r/<sig>`). **Action:** Scroll to "Check it yourself."

> Every fill publishes a receipt. What was paid, what fair value was, which protection applied —
> and the other issuers' prices at that same moment, so you can see it really was the best of
> them.
>
> And these are the steps to verify it against the chain yourself. Without trusting us.

---

## Shot 10 — The honest close · 2:34–2:50
**Screen:** Methodology → scroll to **"What Parity does not know."**

> One last thing. We wrote an on-chain guard that reverts a trade if the fill lands off fair
> value. It's deployed and proven — on devnet, not mainnet, because it hasn't been audited, and
> unaudited code has no business holding real money.
>
> So mainnet trades run through Jupiter's audited programs with a pre-signature check, and the
> interface says which protection you're getting, every time.
>
> *(beat)*
>
> Parity. Every stock on Solana, one fair price.

---

## Recording checklist

- [ ] US market open, wallet connected and funded
- [ ] Browser at 1440 wide, zoom 100%, bookmarks bar hidden
- [ ] One dry run end to end — especially the refusal, so you know the market is wide enough
- [ ] Close other tabs; Phantom's popup should be the only interruption
- [ ] Record at 1080p or better; the type is fine and small

## If something fails on camera

**Say what happened.** A live product doing something real is more convincing than a clean take of
a fake one, and the honesty *is* the pitch.

- Quote won't load → *"that's a rate limit on the public endpoint"* — reload and continue.
- Ondo won't quote → *"Ondo only quotes during market hours"* — true, keep going.
- Guard refuses your $2 fill → *"the market just moved outside my tolerance — that's the feature"*
  — widen to 100 bps and retry on camera.
