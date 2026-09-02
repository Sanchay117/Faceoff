"use client";

import { useEffect, useRef, useState } from "react";
import {
  useLiveStatus,
  useSomniaMarketsClient,
} from "@somnia-chain/markets-sdk/react";
import type { LiveOrder } from "@somnia-chain/markets-sdk";
import { readExchange } from "./exchange";
import { VENUE_ID } from "./config";
import { decodeTag } from "./tag";
import type { Duel } from "./duels";

/**
 * The realtime layer.
 *
 * The SDK hydrates one consistent indexer snapshot and then materializes every
 * subsequent block from chain logs into a reactive store — the resting order
 * book included. Nothing here polls on a timer: reads are driven by blocks
 * actually landing, and the synchronous store views cost zero round-trips.
 *
 * One thing the public live surface does NOT expose is "every resting order on a
 * pool, with its userData" — it offers aggregated price levels and per-user
 * orders. Faceoff needs the per-order tag to know which resting orders are
 * duels, so the Arena pairs the live tail with a targeted contract read: the
 * *trigger* is an event, never a clock.
 */

/**
 * Hold a discovery watch for the whole venue while mounted.
 *
 * `discover: true` picks up markets from their creation events too, so a window
 * that rolls mid-session appears without a refetch.
 */
export function useWatchAllMarkets(): void {
  const client = useSomniaMarketsClient();

  useEffect(() => {
    let stopped = false;
    let handle: { stop: () => void } | null = null;

    void client
      .watchMarkets({ discover: true })
      .then((h) => {
        if (stopped) h.stop();
        else handle = h;
      })
      .catch(() => {
        /* the tail retries internally; a failed open is not fatal to the page */
      });

    return () => {
      stopped = true;
      handle?.stop();
    };
  }, [client]);
}

/**
 * A monotonically increasing revision that bumps whenever the local tail
 * materializes a new block.
 *
 * This is the replacement for `setInterval`. A component that needs a contract
 * read re-runs it on this value: when the chain is quiet, nothing happens at
 * all; when a duel is taken, the read fires on the next block instead of up to
 * N seconds later.
 */
export function useChainRevision(): { block: number; connected: boolean; tailing: boolean } {
  const status = useLiveStatus();
  return {
    block: status.lastBlock,
    connected: status.wsConnected,
    tailing: status.mode === "tailing",
  };
}

/** Convert a live-store order row into a Duel, or null if it is not one of ours. */
export function liveOrderToDuel(o: LiveOrder): Duel | null {
  const tag = decodeTag(BigInt(o.userData));
  if (!tag) return null;
  const remaining = BigInt(o.quantityRemaining);
  if (remaining <= 0n) return null;
  return {
    marketId: o.market_id as `0x${string}`,
    pool: o.pool as `0x${string}`,
    orderId: BigInt(o.orderId),
    creator: o.owner,
    // Prefer the pool's own side attribution when the store has it — it comes
    // from `BinaryOrderPlaced.kind`, which the SDK calls the authoritative
    // source. Our tag is the fallback and the cross-check.
    creatorSide: o.side === "BUY_NO" ? "DOWN" : o.side === "BUY_YES" ? "UP" : tag.side,
    rawPrice: BigInt(o.price),
    rawRemaining: remaining,
    rawFull: BigInt(o.fullQuantity),
    nonce: tag.nonce,
    expireTimestampNs: BigInt(o.expireTimestampNs),
  };
}

/**
 * Re-run an async read whenever the chain advances, with a floor between runs so
 * a burst of blocks collapses into one read.
 *
 * Returns the latest value and a `stale` flag for the first load.
 */
export function useOnChainAdvance<T>(
  read: () => Promise<T>,
  deps: readonly unknown[],
  { minIntervalMs = 1500 }: { minIntervalMs?: number } = {},
): { data: T | null; error: string | null; refresh: () => void } {
  const { block } = useChainRevision();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(0);

  const lastRun = useRef(0);
  const pending = useRef(false);
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    let cancelled = false;

    const since = Date.now() - lastRun.current;
    const wait = pending.current ? 0 : Math.max(0, minIntervalMs - since);

    const timer = setTimeout(() => {
      if (cancelled) return;
      pending.current = true;
      lastRun.current = Date.now();
      readRef
        .current()
        .then((value) => {
          if (cancelled) return;
          setData(value);
          setError(null);
        })
        .catch((err) => {
          if (!cancelled) setError(String(err).slice(0, 200));
        })
        .finally(() => {
          pending.current = false;
        });
    }, wait);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block, manual, ...deps]);

  return { data, error, refresh: () => setManual((n) => n + 1) };
}

/**
 * The opening price a window settles against, and the asset's current price.
 *
 * `getOpeningPrices` is the venue's own record of where the window started; the
 * live feed is the on-chain EMA oracle. Together they answer the only question a
 * player in a live duel actually has: am I ahead right now?
 */
export async function fetchOpeningPrice(marketId: `0x${string}`): Promise<number | null> {
  try {
    const map = await readExchange().client.getOpeningPrices([marketId]);
    const raw = map?.[marketId] ?? map?.[marketId.toLowerCase()];
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Put an oracle price on the same scale as the live feed.
 *
 * The venue publishes opening prices in the oracle's own scale (1e2 today:
 * `7728110` is $77,281.10) while the price feed reports human units. Rather than
 * hardcode that factor — which would silently misreport the instant the oracle
 * changes scale — pick the power of ten that lands closest to the live price.
 * An asset does not move by 10x inside one window, so the choice is unambiguous
 * and self-correcting.
 */
export function alignToLiveScale(rawOracle: number, livePrice: number): number {
  if (!Number.isFinite(livePrice) || livePrice <= 0) return rawOracle;
  let best = rawOracle;
  let bestErr = Infinity;
  for (let p = 0; p <= 18; p++) {
    const candidate = rawOracle / 10 ** p;
    const err = Math.abs(Math.log(candidate / livePrice));
    if (err < bestErr) {
      bestErr = err;
      best = candidate;
    }
  }
  return best;
}

export { VENUE_ID };
