import { SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { GAS, ORDER_RESERVE_WEI } from "./config";
import { readExchange, signerExchangeFor } from "./exchange";

export const COLLATERAL = SOMNIA_TESTNET_ADDRESSES.collateral as `0x${string}`;
/** Shannon's tUSDC faucet token is 6dp. Read, never assumed, for anything priced. */
export const COLLATERAL_DECIMALS = 6;

export interface Balances {
  /** tUSDC, raw units. */
  collateral: bigint;
  /** STT for gas, wei. */
  gas: bigint;
}

export async function getBalances(address: `0x${string}`): Promise<Balances> {
  const ex = readExchange();
  const [collateral, gas] = await Promise.all([
    ex.client.getErc20Balance(COLLATERAL, address),
    ex.client.getNativeBalance(address),
  ]);
  return { collateral, gas };
}

/**
 * Mint play collateral.
 *
 * There is no faucet website for tUSDC — the testnet token mints on demand and
 * credits `msg.sender`, capped at 10,000 per call. So a new player funds
 * themselves from inside the app, in one transaction, and never leaves to go
 * find a faucet.
 */
export async function claimCollateral(
  privateKey: `0x${string}`,
  amount?: bigint,
): Promise<{ hash: string }> {
  const ex = signerExchangeFor(privateKey);
  const res = await ex.trader.faucet(
    amount ? { amount, gas: GAS.faucet } : { gas: GAS.faucet },
  );
  return { hash: res.hash };
}

/**
 * Ask the app to cover gas.
 *
 * STT cannot be minted on demand the way tUSDC can, so the app keeps one funded
 * treasury key server-side and drips a small amount to a new burner. That is the
 * only server-side secret Faceoff has, and it can only ever send gas.
 */
export async function requestGas(address: `0x${string}`): Promise<{ ok: boolean; hash?: string; error?: string }> {
  try {
    const res = await fetch("/api/gas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    return (await res.json()) as { ok: boolean; hash?: string; error?: string };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Make sure this wallet can still pay for a write, and top it up if not.
 *
 * The node refuses a transaction unless the wallet holds `gasLimit *
 * maxFeePerGas` up front, regardless of what the transaction actually costs. A
 * burner funded once at onboarding slowly drops under that line as it trades,
 * and the next order then fails with a bare "Missing or invalid parameters" —
 * on a wallet still visibly holding thousands of tUSDC, which is about as
 * misleading as an error gets.
 *
 * So every write checks first. Returns true when there is enough headroom to
 * proceed.
 */
export async function ensureGas(address: `0x${string}`): Promise<boolean> {
  const needed = ORDER_RESERVE_WEI + ORDER_RESERVE_WEI / 2n; // reserve + margin
  let { gas } = await getBalances(address);
  if (gas >= needed) return true;

  const res = await requestGas(address);
  if (!res.ok && !res.hash) return false;

  // The drip route returns on send, not on confirmation.
  for (let i = 0; i < 15 && gas < needed; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    gas = (await getBalances(address)).gas;
  }
  return gas >= needed;
}
