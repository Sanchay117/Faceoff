/**
 * Network + venue configuration for Faceoff.
 *
 * Everything here is Shannon testnet (chain 50312). Contract addresses are NOT
 * listed: the SDK's SOMNIA_TESTNET_ADDRESSES carries the protocol core, and
 * per-market addresses (market + pool) are read from the registry at runtime,
 * because pools are recycled across windows.
 */

export const NETWORK = {
  chainId: 50312,
  name: "Somnia Shannon",
  indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
  wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
  httpRpcUrl: "https://dream-rpc.somnia.network",
  explorer: "https://shannon-explorer.somnia.network",
  /** Deep-link a market's oracle resolution: `${oracleExplorer}/${questionId}?view=graph` */
  oracleExplorer: "https://prd.oracle.somnia.host/questions",
} as const;

/**
 * The production event-contract venue on Shannon.
 *
 * Gotcha #8 in the DreamDEX docs: a deployment hosts more than one venue and the
 * indexer returns markets from all of them side by side. Shannon currently runs
 * two — this one (questions read "BTC closes at or above its opening price",
 * cadences 5m/15m/1h/4h/1d) and `0x1a1e6821…`, a "Pricefeed test" venue whose
 * markets expire on a 1m cadence and carry a fixed strike.
 *
 * Faceoff scopes to the production venue so a duel is never opened against a
 * throwaway test window. Override with NEXT_PUBLIC_VENUE_ID if the venue rolls.
 */
export const VENUE_ID = (process.env.NEXT_PUBLIC_VENUE_ID ??
  "0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c") as `0x${string}`;

/**
 * Windows we let people duel on. A duel needs enough runway that both players
 * can actually accept before the market locks (gotcha #9), so anything under
 * MIN_SECONDS_LEFT is hidden from the create screen.
 */
export const MIN_SECONDS_LEFT = 90;

/** Cadences we surface, in seconds, shortest first. */
export const CADENCES = [300, 900, 3600, 14400, 86400] as const;

export const CADENCE_LABELS: Record<number, string> = {
  300: "5 min",
  900: "15 min",
  3600: "1 hour",
  14400: "4 hours",
  86400: "1 day",
};

/**
 * How much STT the faucet route drips to a fresh burner wallet, in wei.
 *
 * Sized against measured cost, not guesswork. On Shannon a duel costs ~486k gas
 * to open and ~1.04M to accept (0.003 and 0.006 STT). The binding constraint is
 * not the spend but the RESERVE — see FEES — so a drip needs to clear the
 * largest `gasLimit * maxFeePerGas` with room for a session's worth of trades.
 */
export const GAS_DRIP_WEI = 35_000_000_000_000_000n; // 0.035 STT — reserve + ~8 duels

/**
 * Below this, a wallet gets topped up again on next request. Deliberately kept
 * ABOVE the per-write reserve so a player is never left holding a balance too
 * small to transact but too large to trigger a refill.
 */
export const GAS_LOW_WATER_WEI = 25_000_000_000_000_000n; // 0.025 STT

/**
 * Fee ceiling for SDK-signed writes.
 *
 * The SDK never estimates fees — it signs with a fixed `maxFeePerGas` and a
 * fixed gas limit, and the node checks `balance >= gasLimit * maxFeePerGas`
 * BEFORE it will accept the transaction. The SDK's defaults are 60 gwei and a
 * 10,000,000 gas ceiling, which demands **0.6 STT of headroom per write** even
 * though the transaction actually costs a fraction of a cent and the unused
 * margin is refunded.
 *
 * That is more than a Shannon faucet dispenses in a day, so every write from a
 * freshly funded wallet fails with a bare "insufficient balance" while the
 * wallet visibly holds funds. Shannon's base fee is 6 gwei, so 12 gwei is a 2x
 * ceiling with room to spare, and the per-call limits below are sized to the
 * work each write actually does.
 */
export const FEES = {
  // Sampled across ~1,200 Shannon blocks: the base fee sat at exactly 6 gwei
  // every time. Somnia's flat gas market means a huge ceiling buys nothing but
  // a bigger reserve, so 9 gwei is 1.5x headroom on a fee that does not move.
  maxFeePerGas: 9_000_000_000n,
  maxPriorityFeePerGas: 0n,
} as const;

/** What a single order must have spare before the node will accept it. */
export const ORDER_RESERVE_WEI = 2_500_000n * 9_000_000_000n; // 0.0225 STT

/**
 * Per-write gas ceilings. Generous for the work involved, but small enough that
 * a wallet holding a fraction of an STT can transact — which is the whole point
 * of an app that funds its own players.
 */
/**
 * Per-write gas ceilings, set from measurement rather than from Ethereum habits.
 *
 * Somnia meters gas far higher than Ethereum for the same work — roughly 20-27x.
 * Measured on Shannon:
 *
 *   plain STT transfer      421,000     (Ethereum: 21,000)
 *   collateral faucet()   1,379,707     (Ethereum ERC-20 mint: ~50,000)
 *   open a duel             486,320     post-only, rests
 *   accept a duel         1,044,910     fill-or-kill, crosses and mints a pair
 *
 * This is why the SDK defaults to a 10,000,000 ceiling — it is not being lazy.
 * The costly default is the 60 gwei FEE, not the limit. Each value below carries
 * roughly 2x headroom over the heaviest observed call; anyone reusing Ethereum's
 * numbers here will under-provision, burn the whole allowance, and get a revert
 * with no useful reason attached.
 */
export const GAS = {
  order: 2_500_000n,
  cancel: 1_500_000n,
  faucet: 3_000_000n,
  /** Batched redemption grows with the number of entries. */
  redeem: 4_000_000n,
} as const;
