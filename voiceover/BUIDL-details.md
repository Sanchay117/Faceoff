# Faceoff — bet a friend in one link

**Live:** https://faceoff-orpin.vercel.app · **Code:** https://github.com/Sanchay117/Faceoff · **Network:** Somnia Shannon (chain 50312)

Pick a side, name your odds, send the link. Whoever disagrees takes the other end, and the two of you are matched directly on DreamDEX Event Contracts — no bookmaker, no house, no market maker in between.

---

## Two minutes, as a judge

No wallet, no extension, no faucet hunt.

1. **Open the Arena.** Every card is a real resting order on a DreamDEX binary pool, read from the pool contract. The badge reports the local tail's own state and the last block it materialized — when it says *Live*, the page is being driven by chain events, not a refresh timer.
2. **Tap "Play — no wallet needed."** A wallet is generated in the browser, gas is dripped to it, and play collateral is minted from the tUSDC token's own `faucet()`. You are trading in about ten seconds.
3. **Start a duel.** Pick a window, a side, and drag the confidence slider. That slider *is* the order price. Sign once.
4. **Open the link in a second window** (incognito, so it gets its own wallet) and take the other side.
5. **Watch the scoreboard.** When the badge reads **MINT-A-PAIR**, that is the protocol reporting that *no seller was involved* — the pool minted both outcome tokens out of the two stakes. Beneath it, the asset's live price against the exact line the window settles on.

`npm run lifecycle` proves the same thing headless, asserting every step against chain state.

---

## The idea

Every prediction market has the same cold-start problem: your bet only happens if somebody is already there to take it. An empty order book is an empty product — and most live Event Contract windows on Shannon have almost no trades in them.

DreamDEX has a way out that almost nobody uses. From the protocol docs:

> **Mint-a-pair is the cold-start mechanism: two opposite-side buyers need no seller and no market maker.**

When a Buy Up and a Buy Down cross, no seller is involved at all. The pool takes both stakes, mints a **fresh Up/Down pair**, and hands each player one leg. The contract is created by the disagreement.

Everyone else treats Event Contracts as *a thing to analyse*. This is the observation that they are **a thing to match people on**. So Faceoff never needs liquidity. It needs someone who thinks you're wrong.

## Why a bet, not a trade

The protocol prices in probabilities. People think in stakes. They turn out to be the same number: a Buy Up at price `p` for quantity `Q` escrows `Q × p`; the Buy Down that crosses it escrows `Q × (1 − p)`. Together they fund exactly `Q`, which is what the winner redeems.

So the whole interface is **"you put in $6, they put in $4, winner takes $10."** The confidence slider *is* the order price — move it to 60% and you're quoting a 0.60 Up limit order. A user never sees a probability; the order book gets a precise limit order.

## There is no database

Every order carries a `userData` field the pool stores and emits but never interprets. Faceoff stamps every duel with a magic tag, so **an open duel is a resting order that identifies itself as a duel**.

The Arena is therefore a plain contract read. No Postgres, no Redis, no indexer of our own. Anyone can enumerate every open Faceoff duel from a public RPC endpoint, and any client could implement the same protocol. If our site disappears, the duels don't.

## Verified on-chain

A real `npm run lifecycle` run against live Shannon books:

```
▸ Alice opens a duel — pot of 10
▸ Discoverable on-chain from the Faceoff tag alone — no database anywhere
▸ Bob takes the other side · filled 10.0000 · matchedFromAlicesDuel: 10.0000

  alice  UP 10.0000   DOWN  0.0000
  bob    UP  0.0000   DOWN 10.0000

  ✓ bob matched ALICE, not the book     ✓ duel fully consumed
  ✓ alice paid 3.48  ✓ bob paid 6.52    ✓ stakes sum to the pot

✓ PASS — two buyers, no seller, no market maker. The pool minted the pair.
```

Open tx: `0x5f6361d4559cd625e3e5301856a49077d3f17e4a7e7190578e540319c47cccdc`
Match tx: `0xe24f232d760973e8d8e9bc6207ebdc4baf84ce665145fc5acd2e407e1761e091`

## How this maps to the criteria

| Criterion | | Where to look |
|---|---|---|
| **Innovation** — 20% | Mint-a-pair reframed as a *social* primitive rather than a microstructure footnote. Duels are self-identifying on-chain orders, so the app has no database and anyone can read every open challenge from a public RPC. |
| **Technical** — 25% | Write-heavy, not read-only: post-only creation, aggressive IOC matching, hand-quantized units on the raw trader tier, batched `redeemMany`, and the SDK's reactive tail instead of polling. Every documented gotcha handled explicitly. Verified end-to-end on testnet. |
| **UX & Design** — 20% | Two taps and a link. No wallet install, no seed phrase, no signature popups. Confidence, not probability. Phone-first. |
| **Ecosystem** — 20% | Every invite is a new user and every accepted invite is on-chain volume, because the invitation and the trade are the same object. Faceoff solves cold-start rather than describing it. |
| **Presentation** — 15% | Live URL, the two-minute path above, a headless proof anyone can rerun, and a feedback report on eight concrete SDK/doc findings. |

## The gotchas, handled

| The trap | What Faceoff does |
|---|---|
| The indexer lags; orders on a just-locked market revert | Every write re-reads `getMarketOnchain` and gates on status `Trading` |
| A float price lands off the tick grid and reverts | Prices snapped to the pool's own `tickSize`, sizes to `lotSize`, read per market |
| Below one lot floors to **zero** with nothing thrown | Size returns `0n` and the caller refuses to send |
| A deployment hosts several venues side by side | Scoped to the production venue; the `Pricefeed test` venue is filtered out |
| `loadMarkets()` **cannot see** settled markets, so winnings look like zero | Claims read the wallet's portfolio, never the live market list |
| Redeeming a loser pays nothing; a void pays 0.5 to **both** sides | Payout computed per position; voided markets claim both legs |
| Pools are recycled, so pool-keyed state attaches to the wrong market | Everything keys on `marketId` |
| Intent is not position | Accepts reconcile against `fills` from the receipt, not the requested size |

## Nothing polls

One discovery watch is held for the whole venue, and reads re-run when the local tail materializes a new block — debounced, so a burst collapses into one. When the chain is quiet nothing runs at all.

**Settlement needs no keeper.** Each market's question is scheduled on the oracle hub at creation with its future gas reserved, and Somnia's on-chain reactivity delivers the answer straight to the hub's callback. Faceoff listens to that: chain-current market state is overlaid on the indexer's portfolio, so a result appears the instant the oracle answers, and every settled duel is claimed in a **single** `redeemMany` transaction.

## Feedback on the SDK and docs

Collected while building, offered in the spirit of the optional feedback report. Highlights:

1. **The default fee ceiling makes a faucet-funded wallet unusable.** The SDK signs with a fixed 60 gwei and a 10,000,000 gas ceiling, and the node checks `balance >= gasLimit * maxFeePerGas` before accepting a transaction — demanding **0.6 STT of headroom per write**, more than a Shannon faucet dispenses in a day, for calls costing a fraction of a cent. The result is `insufficient balance` on a wallet that visibly holds funds. Most likely thing to stop someone on day one.
2. **Somnia meters gas 20–27× higher than Ethereum for the same work.** Measured: a plain STT transfer is **421,000** gas (not 21,000), the collateral faucet **1,379,707**, opening a duel **486,320**, accepting one **1,044,910**, withdrawing one **3,270,528**. Order gas also scales with book depth. Ethereum instincts under-provision and revert with no reason attached.
3. **`getOutcomeBalance` is documented with the wrong signature** — the client method takes a single params object, so the Recipes snippet doesn't compile.
4. **`getAllOpenOrdersOnchain` returns a page, not an array** (`{ orders, hasMore, nextCursor }`); `.length` silently yields `undefined`.
5. **The `BUY_NO` price convention is the most load-bearing detail and the easiest to get wrong.** `price` is *always* the Up price for both sides. The escrow switch in `writer.ts` states this far more clearly than the docs do.
6. **`getOpeningPrices` returns a map keyed by marketId, and its values are 1e2-scaled** while the price feed reports human units — comparing them naively is off by a hundred.
7. **`userData` is an underrated feature** — documented as MM bookkeeping, but really a permissionless application-level index on a shared order book. Faceoff's entire "no database" property comes from it.
8. **What's excellent:** the Gotchas page is the most useful document in the set, written from real failures. Shipping `src/` inside the npm package made every ambiguity answerable in seconds.

## Stack

TypeScript · Next.js 16 · React 19 · Tailwind 4 · `@somnia-chain/markets-sdk` · viem · Somnia Shannon testnet · deployed on Vercel

## What's next

Group duels (many-vs-many on the same window), a rematch flow on settled duels, and a Telegram/Farcaster mini-app so the link never has to leave the chat it was sent in. On mainnet the browser burner is replaced by a connected wallet or a pool-scoped session key, which the venue already supports.

MIT licensed.
