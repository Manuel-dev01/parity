# Parity — demo video script

Roughly two and a half minutes. Record during the US regular session so the numbers move and Ondo
actually quotes. Anything in `[brackets]` is live — say what's on your screen, not what's written
here.

**How to read this.** The lines below are how you'd explain this to someone sitting next to you.
Don't perform them. If a sentence feels stiff in your mouth, change it — the point is that it
sounds like you, not like a script. Stumbling slightly on a real number is fine. It's better than
sounding polished about something you're making up, which you aren't.

---

### Cold open

*Landing page, scrolled to the big numbers. Don't move the mouse.*

> So when SpaceX listed, you could buy the same share for a hundred and twenty-two dollars on one
> Solana issuer, or a hundred and seventy-six on another.
>
> Same share. Same day. Just a different wrapper around it.

---

### The hero

*Scroll to the top. Let it sit a moment, then hover the wordmark and hold. Pull away so it
separates again.*

> And that's still happening. This is one stock, right now, printed three times — once per issuer.
> They're out of line because their prices are out of line, and each one's shifted by however far
> it actually is from fair value.
>
> Hover it, and they snap together.
>
> That's the whole idea. Find the fair price, then tell you which one to actually buy.

*If only two colours show: "this one's only issued by two of the three — Backpack lists about
forty names, so coverage isn't even." True, and it sounds like you know the market.*

---

### The tape

*Scroll slowly through the ticker tape down to the chart.*

> Every one of these is the same share trading at two different prices. Same chain, same moment.
>
> And this is the last few minutes of it.

---

### Markets

*Click Markets. Point at the top row, then the number on the right.*

> Here's everything, ranked by how far apart the issuers are. The line down the middle is fair
> value, each dot is one issuer, and that number's the gap — `[N]` basis points on `[SYMBOL]`.
> Call it `[$X]` on every ten grand.
>
> One thing we deliberately don't do, by the way. Ondo doesn't trade from a pool, it quotes on
> request — so its last price drifts around. We leave it out of this comparison instead of showing
> you a spread nobody could've actually traded.

---

### The answer

*Click into a ticker. Let the headline land before you say anything.*

> And this is really the whole product, in one line. At a thousand dollars, buy this one.
>
> Not the last price someone paid — what it'd cost you, at your size, after impact.

*Click the $25k chip. Wait for it to reorder.*

> Change the size and the answer can change with it. The cheapest token at a thousand dollars
> often isn't the cheapest at twenty-five.

---

### Where the numbers come from

*Tap the dotted fair value figure. Let the popover open. Then tap one of the card prices.*

> Every number on this page is a claim, so every number will show you where it came from.
>
> Fair value's from Pyth's on-chain account — there's the account, how old it is, the confidence
> band. We don't set that price and we don't blend it with our own quotes.
>
> Same for the fill. That's a simulated trade of your actual size against live liquidity.

---

### The refusal

*Drag the guard slider down to around 10 bps. Press Review and sign. Let it render. Stop talking
for a second.*

> Now — watch what happens if I tighten this past what the market can actually fill.
>
> It won't build the trade. Nothing signed, nothing spent.
>
> And it doesn't just stop there. It tells me what would've worked: another issuer that fits, a
> smaller size that fits, or exactly what it'd cost me to widen my tolerance. All of that quoted
> live.

---

### The fill

*Set the guard back to ±50, size to $2. Sign in the wallet. Show the result, then open the
Solscan link.*

> Put it back where it was, and this one goes through. Real transaction, mainnet, real money —
> small, because it's my own wallet.
>
> There's the fill, fair value at that moment, and the distance between them. And here it is
> on-chain.

---

### The receipt

*Click through to the receipt. Scroll to "Check it yourself."*

> Every fill writes a receipt. What you paid, what fair value was, which protection applied — and
> what the other issuers were quoting at that exact moment, so you can see it really was the best
> of them.
>
> And these are the steps to check all of that against the chain. Without taking our word for it.

---

### The close

*Methodology, scrolled to "What Parity does not know."*

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
> Parity. Every stock on Solana, one fair price.

---

## Before you record

- US market open, wallet connected and funded
- Browser at 1440, zoom at 100%, bookmarks bar hidden
- Do one full dry run — especially the refusal, so you know the spread's wide enough to trigger it
- Close everything else; the only popup should be your wallet
- 1080p minimum, the type is fine

## If something breaks mid-take

Say what happened and keep going. A real product doing something real beats a clean take of
something fake, and the honesty is the pitch anyway.

- Quote won't load → *"that's the rate limit on the public endpoint"*, reload, carry on.
- Ondo won't quote → *"Ondo only quotes during market hours"*. True.
- The guard refuses your actual $2 fill → *"and there it is — the market just moved outside my
  tolerance. That's the feature."* Widen it to 100 and go again, on camera.
