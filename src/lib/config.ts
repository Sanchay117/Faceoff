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

/** How much STT the faucet route drips to a fresh burner wallet, in wei. */
export const GAS_DRIP_WEI = 100_000_000_000_000_000n; // 0.1 STT

/** Below this, a wallet gets topped up again on next request. */
export const GAS_LOW_WATER_WEI = 20_000_000_000_000_000n; // 0.02 STT
