"use client";

import { useEffect, useState } from "react";
import { useLivePrice, useWatchPrice } from "@somnia-chain/markets-sdk/react";
import { alignToLiveScale, fetchOpeningPrice } from "@/lib/live";
import type { Side } from "@/lib/tag";

/**
 * Am I winning right now?
 *
 * These markets settle on whether the asset closes at or above the price the
 * window opened at, so the only live question a player has is which side of that
 * line the price is on. The opening price is the venue's own oracle record; the
 * current price is Somnia's on-chain EMA feed. Nothing here is our opinion — it
 * is the same two numbers the market will settle against.
 */
export function LiveStanding({
  marketId,
  asset,
  side,
}: {
  marketId: `0x${string}`;
  asset: string;
  /** The side the viewer holds; omit to show a neutral readout. */
  side?: Side;
}) {
  useWatchPrice(asset);
  const live = useLivePrice(asset);
  const [openingRaw, setOpeningRaw] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchOpeningPrice(marketId).then((v) => {
      if (!cancelled) setOpeningRaw(v);
    });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  if (!live) {
    return (
      <div className="card-2 px-4 py-3 text-center text-xs text-faint">
        Connecting to the price feed…
      </div>
    );
  }

  const current = live.price;
  const opening = openingRaw != null ? alignToLiveScale(openingRaw, current) : null;

  if (opening == null) {
    return (
      <div className="card-2 px-4 py-3 text-center">
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
          {asset} now
        </div>
        <div className="tabular text-lg font-bold">{fmtPrice(current)}</div>
      </div>
    );
  }

  const delta = current - opening;
  const pct = (delta / opening) * 100;
  const isUp = delta >= 0;
  // "Winning" means the price is on your side of the opening line right now.
  const winning = side ? (side === "UP" ? isUp : !isUp) : null;

  return (
    <div className="card-2 overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-line">
        <div className="px-4 py-3">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
            Opened at
          </div>
          <div className="tabular text-base font-bold text-muted">{fmtPrice(opening)}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
            {asset} now
          </div>
          <div className={`tabular text-base font-bold ${isUp ? "text-up" : "text-down"}`}>
            {fmtPrice(current)}
          </div>
        </div>
      </div>

      <div
        className={`flex items-center justify-center gap-2 border-t border-line px-4 py-2.5 text-xs font-bold ${
          winning === null
            ? "text-muted"
            : winning
              ? "bg-up-dim text-up"
              : "bg-down-dim text-down"
        }`}
      >
        <span className="tabular">
          {isUp ? "▲" : "▼"} {fmtPrice(Math.abs(delta))} ({pct >= 0 ? "+" : ""}
          {pct.toFixed(3)}%)
        </span>
        {winning !== null && (
          <span className="uppercase tracking-wide">
            · {winning ? "you're ahead" : "you're behind"}
          </span>
        )}
      </div>
    </div>
  );
}

function fmtPrice(v: number): string {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: v < 100 ? 4 : 2,
  });
}
