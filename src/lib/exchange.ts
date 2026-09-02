import {
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
  SOMNIA_TESTNET_PRICE_FEED,
} from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { FEES, NETWORK } from "./config";

/**
 * SomniaMarkets instances are isolated — "no global setup, no hidden singleton;
 * each exchange is isolated... Two exchanges never share watch state or sockets."
 * So we keep exactly two: one read-only (shared by every view that only reads)
 * and one per signer, rebuilt when the burner key changes.
 */

const base = {
  indexerUrl: NETWORK.indexerUrl,
  chain: somniaShannon,
  wsRpcUrl: NETWORK.wsRpcUrl,
  addresses: SOMNIA_TESTNET_ADDRESSES,
  // The on-chain EMA price oracle, so a duel in flight can show whether the
  // asset is currently above or below where the window opened.
  priceFeed: SOMNIA_TESTNET_PRICE_FEED,
  // Sized so a faucet-funded wallet can actually transact — see FEES.
  fees: FEES,
} as const;

let readOnly: SomniaMarkets | null = null;

/** The shared read-only exchange. No signer, so it can never write. */
export function readExchange(): SomniaMarkets {
  if (!readOnly) readOnly = new SomniaMarkets({ ...base });
  return readOnly;
}

let signerKey: string | null = null;
let signerExchange: SomniaMarkets | null = null;

/**
 * An exchange bound to a burner key. Memoized on the key so a re-render does not
 * spin up a new socket, and rebuilt the moment the key changes.
 *
 * The SDK signs locally with fixed fees and a locally-tracked nonce, then sends
 * via Somnia's `realtime_sendRawTransaction` — send and confirm in one
 * round-trip, with no gas/nonce estimation calls. That is what makes a duel feel
 * instant instead of like a blockchain transaction.
 */
export function signerExchangeFor(privateKey: `0x${string}`): SomniaMarkets {
  if (signerKey !== privateKey || !signerExchange) {
    signerKey = privateKey;
    signerExchange = new SomniaMarkets({ ...base, privateKey });
  }
  return signerExchange;
}

export function explorerTx(hash: string): string {
  return `${NETWORK.explorer}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${NETWORK.explorer}/address/${address}`;
}

export function oracleQuestion(questionId: string): string {
  return `${NETWORK.oracleExplorer}/${questionId}?view=graph`;
}
