# Faceoff

**Bet a friend in one link.**

Pick a side, name your odds, send the link. Whoever disagrees takes the other end, and the two of you are matched directly on [DreamDEX Event Contracts](https://docs.dreamdex.io/developers/event-contracts) — no bookmaker, no house, and no liquidity required.

Built for the Somnia × DreamDEX Event Contracts Hackathon. Live on Somnia Shannon testnet (chain `50312`).

---

## The idea

Every prediction market has the same cold-start problem: **your bet only happens if someone is already there to take it.** An empty order book is an empty product. Right now, most live Event Contract windows on Shannon have zero trades in them — the mechanism works, but there is nobody on the other side.

DreamDEX has a way out that almost nobody uses. From the protocol docs:

> **Mint-a-pair is the cold-start mechanism: two opposite-side buyers need no seller and no market maker.**

When a Buy Up order and a Buy Down order cross, no seller is involved at all. The pool takes both stakes, mints a **fresh Up/Down pair** out of the combined collateral, and hands each player one leg. The contract is created by the disagreement.

Everyone else treats Event Contracts as *a thing to analyze*. This is the observation that they are **a thing to match people on**.

So Faceoff never needs liquidity. It needs someone who thinks you're wrong.

> Your $6 and their $4 become a $10 contract that did not exist a second earlier.

## Why a bet, not a trade

The protocol prices in probabilities. People don't think in probabilities — they think in stakes.

Those turn out to be the same number. A Buy Up at price `p` for quantity `Q` escrows `Q × p`; the Buy Down that crosses it escrows `Q × (1 − p)`. Together they fund exactly `Q`, which is what the winner redeems.

So Faceoff's entire interface is:

|  | |
|---|---|
| **You risk** | `pot × confidence` |
| **They risk** | `pot × (1 − confidence)` |
| **Winner takes** | `pot` |

The "how sure are you?" slider *is* the order price. Move it to 60% and you're putting up 60% of the pot — and quoting a 0.60 Up probability to the order book. A user never sees a probability unless they want to, and a trader gets an exact limit order.

## There is no database

Every order on a DreamDEX pool carries a `userData` field (uint64). The pool stores it and emits it; the SDK's own comment says it is *"opaque MM bookkeeping, forwarded verbatim — the SDK never interprets it."*

That is a free, protocol-native index. Faceoff stamps every duel with a magic tag:

```
┌──────────────┬─────────┬────────┬─────────────┐
│ magic 32b    │ ver 8b  │ side 8b│ nonce 16b   │
│ 0xFACE0FF0   │ 0x01    │ 0 | 1  │ random      │
└──────────────┴─────────┴────────┴─────────────┘
```

An open duel is therefore **a resting order on a public order book that identifies itself as a duel**. The Arena is a plain contract read — `getAllOpenOrdersOffChain` filtered on the tag. Consequences:

- **No backend.** No Postgres, no Redis, no indexer of our own.
- **No trust in us.** Anyone can enumerate every open Faceoff duel from a public RPC endpoint. If this app disappears, the duels don't.
- **It's a protocol, not an app.** Another client could implement the same tag and interoperate on day one.
- **Cancel is real.** Withdrawing a challenge is an on-chain `cancelOrder` that returns the exact escrow.

The `side` byte matters: the base book only knows bid/ask, and an ask could be a Buy Down *or* a Sell Up. Recording the creator's side removes the inference entirely.

## How a duel runs

```
  CREATOR                                              TAKER
  ───────                                              ─────
  pick side, odds, pot
  │
  ├─ placeOrder(POST_ONLY, userData=0xFACE0FF0…)
  │     └─ rests on the book, escrow locked
  │
  ├─ share link  ──────────────────────────────────▶   opens /d/[marketId]/[orderId]
  │                                                    │
  │                                                    ├─ placeOrder(FILL_OR_KILL, opposite side)
  │                                                    │
  │        ┌───────────────────────────────────────────┘
  │        ▼
  │   MINT-A-PAIR — the pool mints Up+Down from both stakes
  │
  ├─ holds UP                                          holds DOWN
  │
  ▼ window expires
  Somnia's on-chain reactivity delivers the oracle answer to the
  settlement hub — no keeper, no cron, nobody to trust
  │
  ▼
  winner redeems 1:1 · every settled duel claimed in ONE redeemMany() tx
```

**POST_ONLY on create** is deliberate. A normal limit order would cross whatever happens to be resting and fill the "duel" against a stranger before the link was even sent. Post-only refuses to take liquidity, so the challenge waits for the person you sent it to — and if it *would* have crossed, the pool reverts and we route the creator to the existing offer instead.

**FILL_OR_KILL on accept**, sized to the order's *current* remaining quantity: if someone partially took the duel between the link being sent and opened, we take what is actually left rather than reverting on a stale number.

## The link is the product

A duel spreads by being pasted into a group chat, so the share surface gets treated as a real surface:

- **The link preview is the challenge.** `opengraph-image.tsx` renders a card carrying the actual terms — whose side, what it costs you, what the winner takes — read from chain rather than from the URL, so a card can never advertise odds the order book isn't offering. If that read is slow or the duel is gone, it degrades to a branded card instead of breaking the share.
- **The link never dies.** Once a duel is taken the resting order is consumed, but the fill survives and names both wallets, both sides, and the price. So the page stops being an invitation and becomes a **scoreboard** — two players, the pot, the live price against the settlement line — watchable by anyone holding the link, during the window and after it settles.
- **The protocol proves our own claim.** A binary fill carries its settlement path, and the SDK exposes it as `BinaryFillKind`. When a duel matches through `MINT_A_PAIR`, the scoreboard says so: *no seller was involved; this contract did not exist before they disagreed.* That badge is protocol data, not marketing copy.

## The Pacemaker

Faceoff does not need a market maker — but a first-time visitor who lands on an empty Arena has nothing to disagree with, which is the cold-start problem one level up. [`scripts/pacemaker.ts`](scripts/pacemaker.ts) keeps a small ladder of duels standing on the main windows.

It is a liquidity service, not a house:

- It **only rests** (post-only) and never takes a real player's duel.
- It quotes both sides symmetrically around even odds, so it holds no directional view.
- When both legs of a rung fill it holds one Up and one Down — a complete set, worth exactly the collateral that funded it. Flat.
- Its only edge is a deliberately tight spread; the goal is a non-empty Arena, not a rake.

The two legs must not cross each other: a Buy Up at *p* rests as a bid at *p* and a Buy Down at *q* rests as an ask at *q*, so every rung needs *p < q*. And because orders inherit the pool's own market expiry, a rung on a window that rolls ages off the book by itself — if the process dies, nothing is stranded.

```bash
npm run pacemaker
```

## Nothing polls

The SDK hydrates one consistent indexer snapshot and then materializes every subsequent block from chain logs into a reactive store — the resting order book included. Faceoff is built on that store rather than on a refresh timer.

- **A single discovery watch** for the whole venue is held once at the app root (`watchMarkets({ discover: true })`), so every page shares one socket and one materialized store. A window that rolls mid-session appears without a refetch.
- **`useOnChainAdvance`** replaces `setInterval`. Reads re-run when the local tail materializes a new block, debounced so a burst collapses into one. When the chain is quiet, nothing runs at all; when a duel is taken, the Arena updates on the next block instead of up to eight seconds later.
- **The live badge is honest.** It reports the tail's own `TailStatus` — `Live` only when it is actually tailing, with the last block it materialized.
- **Am I winning?** A duel in flight shows the window's opening price (the venue's own oracle record) against the asset's current price from Somnia's on-chain EMA feed. Oracle prices arrive 1e2-scaled while the feed reports human units, so rather than hardcode the factor, `alignToLiveScale` picks the power of ten closest to the live price — self-correcting if the oracle's scale ever changes.

### The settlement watcher

Resolution needs no keeper. Each market's settlement question is scheduled on the oracle hub at creation with its future gas reserved, and **Somnia's on-chain reactivity delivers the answer straight to the hub's callback** — no cron, no operator, nobody to trust.

Faceoff listens to that. `applyLiveStatus` overlays the chain-current market state from the live store onto the indexer's portfolio rows, so a result appears the instant the oracle answer lands rather than on the next indexer pass. `useJustSettled` watches for the in-play → settled transition and announces it, so a duel settles itself in front of the player instead of appearing already-decided on a later visit.

## The gotchas, handled

The docs ship a [Gotchas](https://docs.dreamdex.io/developers/event-contracts/gotchas.md) page of things that bite people. Faceoff handles them explicitly rather than hoping:

| # | The trap | What Faceoff does |
|---|---|---|
| 1 | The indexer lags; orders on a just-locked market revert | Every write re-reads `getMarketOnchain` and gates on status `Trading` ([`markets.ts`](src/lib/markets.ts)) |
| 3 | A float price lands off the tick grid and reverts `InvalidPrice` | Prices snapped to the pool's own `tickSize`, sizes to `lotSize`, both read per market ([`units.ts`](src/lib/units.ts)) |
| 5 | Order expiry is mandatory and capped at market expiry | Left to the SDK default — the pool's own expiry, which is exactly a duel's semantic |
| 6 | Below one lot floors to **zero** with nothing thrown | `contractsToRawQuantity` returns `0n` and the caller refuses to send |
| 8 | A deployment hosts several venues side by side | Scoped to the production venue; the `Pricefeed test` venue is filtered out ([`config.ts`](src/lib/config.ts)) |
| 9 | A window minutes from close locks mid-flight | Windows under 90s of runway never appear |
| 10 | `loadMarkets()` **cannot see** settled markets, so winnings look like zero | Claims read the wallet's portfolio, never the live market list ([`settlement.ts`](src/lib/settlement.ts)) |
| 11 | Redeeming a loser succeeds and pays nothing; a void pays 0.5 to **both** sides | Payout computed per position; voided markets claim both legs |
| 12 | Pools are recycled, so pool-keyed state attaches to the wrong market | Everything keys on `marketId`; the pool is read per market, never remembered |
| — | Intent is not position | Accepts reconcile against `fills` from the receipt, not the requested size |

## Run it

```bash
npm install
```

Create `.env.local` with a Shannon-testnet key that holds STT. It is used **only** to drip gas to new burner wallets — it never touches a player's collateral or positions.

```bash
cp .env.example .env.local
# generate a key:
node -e "console.log(require('viem/accounts').generatePrivateKey())"
# fund its address at https://testnet.somnia.network
```

```bash
npm run dev
```

Players need nothing. A burner wallet is generated in the browser, gas is dripped from the treasury, and play collateral comes from the tUSDC token's own on-demand `faucet()` — there is no faucet website to visit and no wallet extension to install.

### Prove it end to end, headless

```bash
npm run lifecycle
```

Funds two fresh wallets, opens a duel from one, discovers it on-chain by its tag alone, takes it from the other, and asserts against chain state that the pool minted a pair — Alice holds only Up, Bob holds only Down, and their two stakes sum exactly to the pot.

## Architecture

```
src/
  lib/
    config.ts       network + venue constants (venue scoping, cadences)
    units.ts        tick/lot snapping; escrow math mirroring the pool's rounding
    tag.ts          the on-chain duel tag — encode/decode userData
    exchange.ts     SomniaMarkets factories (read-only + per-signer, memoized)
    markets.ts      discovery, on-chain gating, per-market grid
    duels.ts        create / accept / list / cancel — the core
    live.ts         the realtime layer: discovery watch, block-driven reads
    settlement.ts   portfolio, payouts, live status overlay, batched redeemMany
    account.ts      balances, tUSDC faucet, gas request
    wallet.ts       burner wallet (browser-local)
  app/
    page.tsx                     Arena — open duels, read from chain
    create/                      the create flow
    d/[marketId]/[orderId]/      the share link — accept or share
    me/                          positions and one-tap claim
    api/gas/                     the only server-side secret: a gas drip
```

**Tiers used.** Reads go through `exchange.client` (on-chain truth: market status, resting orders, outcome balances, portfolio). Writes go through `exchange.trader` with raw, hand-quantized units — the tier that gives exact control over price, size, order type and `userData`. The SDK signs locally with fixed fees and sends via Somnia's `realtime_sendRawTransaction`, so a duel confirms in one round-trip. That is why it feels like tapping a button and not like sending a transaction.

## Security notes

- **Burner keys are a testnet pattern.** A key in `localStorage` is the right trade-off for play money on Shannon and the wrong one for real funds. A mainnet build swaps this module for a connected wallet or a session key scoped to the pool — which the venue already supports.
- **The treasury key can only send gas.** It signs native STT transfers in one API route. It cannot place orders, move collateral, or touch positions.
- **No custody.** Faceoff never holds a player's funds. Stakes are escrowed by the pool contract; payouts settle to the player's own wallet.

## Feedback on the SDK and docs

Collected while building, offered in the spirit of the optional feedback report.

1. **`getOutcomeBalance` is documented with the wrong signature.** [Recipes → Check your positions](https://docs.dreamdex.io/developers/event-contracts/recipes.md) shows `client.getOutcomeBalance(outcomeToken, me, yesId)`, but the client method takes a single params object: `getOutcomeBalance({ outcomeToken, account, id })`. Copying the snippet fails to compile.
2. **`getAllOpenOrdersOnchain` returns a page, not an array.** It resolves to `{ orders, hasMore, nextCursor }`. The README's one-line description reads like a list, and `.length` on the result silently yields `undefined` rather than erroring.
3. **The `BUY_NO` price convention is the single most load-bearing detail and the easiest to get wrong.** `price` is *always* the Up price, for both sides — a Buy Down at Up-price `p` escrows `quantity × (1 − p)`. The Recipes note ("a NO price is `ONE - ticks(p)`") reads as though you should invert it yourself, which produces orders that never cross. The escrow switch in `writer.ts` is the clearest statement of the rule and deserves to be in the docs.
4. **`userData` is an underrated feature.** It is documented as MM bookkeeping, but it is really a permissionless application-level index on a shared order book. Faceoff's entire "no database" property comes from it. Worth a recipe.
5. **The two-venue situation costs everyone an hour.** Shannon serves a production venue and a `Pricefeed test` venue side by side, and `listLiveBinaryMarkets()` returns both. Gotcha #8 warns about it, but neither the starter template nor the quick start scopes by venue, so the obvious first build quotes test windows by accident. A named export for the current venue id would remove the whole class of mistake.
6. **What's excellent:** the Gotchas page is the most useful document in the whole set — it is written from real failures and every item earned its place. Shipping `src/` inside the npm package made the ambiguities above answerable in seconds rather than guesswork.

## License

MIT.
