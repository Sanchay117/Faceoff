/**
 * Unit conversion for a binary pool.
 *
 * Two grids matter and both are read from the pool, never hardcoded:
 *   - tickSize — the price (probability) grid
 *   - lotSize  — the quantity (contracts) grid
 *
 * And the collateral's decimals differ per network: 6 on the Shannon tUSDC
 * faucet token, 18 on mainnet USDso. The docs are blunt about this — "a constant
 * that converts correctly on testnet misprices every order, book read and
 * balance on mainnet, and nothing reverts to tell you." So every function here
 * takes the grid it should use rather than closing over a literal.
 */

export interface Grid {
  /** Collateral decimals (6 on Shannon tUSDC, 18 on mainnet USDso). */
  decimals: number;
  /** Price grid, raw units. */
  tickSize: bigint;
  /** Quantity grid, raw units. */
  lotSize: bigint;
  /** Smallest order the pool accepts, raw units. */
  minQuantity: bigint;
}

/** 1.0 in raw collateral units. */
export function one(grid: Pick<Grid, "decimals">): bigint {
  return 10n ** BigInt(grid.decimals);
}

/**
 * A probability in (0,1) to a raw Up price, snapped DOWN to the tick grid.
 *
 * Snapping matters: below markets-sdk 0.28.0 an ordinary float landed a few wei
 * off the grid and the pool rejected it with `InvalidPrice`. We build raw params
 * for the trader tier ourselves, so we snap ourselves.
 */
export function probabilityToRawPrice(p: number, grid: Grid): bigint {
  const raw = BigInt(Math.round(p * Number(one(grid))));
  const snapped = (raw / grid.tickSize) * grid.tickSize;
  // Keep it strictly inside (0, 1): a 0 or 1 price is not a tradeable probability.
  const min = grid.tickSize;
  const max = one(grid) - grid.tickSize;
  if (snapped < min) return min;
  if (snapped > max) return max;
  return snapped;
}

export function rawPriceToProbability(raw: bigint, grid: Pick<Grid, "decimals">): number {
  return Number(raw) / Number(one(grid));
}

/**
 * Contracts to raw quantity, snapped DOWN to the lot grid.
 *
 * Returns 0n when the result is below one lot — the caller MUST check, because
 * the pool accepts an order for nothing and it simply never appears on the book.
 */
export function contractsToRawQuantity(q: number, grid: Grid): bigint {
  const raw = BigInt(Math.floor(q * Number(one(grid)) + 1e-6));
  const snapped = (raw / grid.lotSize) * grid.lotSize;
  return snapped < grid.minQuantity ? 0n : snapped;
}

export function rawToHuman(raw: bigint, grid: Pick<Grid, "decimals">): number {
  return Number(raw) / Number(one(grid));
}

export function humanToRaw(v: number, grid: Pick<Grid, "decimals">): bigint {
  return BigInt(Math.round(v * Number(one(grid))));
}

/**
 * What a buy escrows, mirroring the pool's own rounding.
 *
 * From the SDK writer: BUY_YES escrows `quantity * price / 1`, BUY_NO escrows
 * `quantity * (1 - price) / 1`, both ceil-rounded. We reproduce it exactly so
 * the number we show a player before they sign is the number that leaves their
 * wallet.
 */
export function escrowFor(
  side: "UP" | "DOWN",
  rawPrice: bigint,
  rawQuantity: bigint,
  grid: Grid,
): bigint {
  const ONE = one(grid);
  const unit = side === "UP" ? rawPrice : ONE - rawPrice;
  return (rawQuantity * unit + ONE - 1n) / ONE; // ceil
}

/** Format raw collateral as a display string, e.g. 4.20 */
export function fmtCollateral(raw: bigint, grid: Pick<Grid, "decimals">, dp = 2): string {
  return rawToHuman(raw, grid).toFixed(dp);
}
