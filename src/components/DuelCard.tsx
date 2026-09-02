"use client";

import Link from "next/link";
import type { ArenaDuel } from "@/lib/duels";
import { marketLabel } from "@/lib/markets";
import { opposite } from "@/lib/tag";
import { displayName } from "@/lib/wallet";
import { Countdown, SidePill, fmtNum } from "./ui";

/**
 * One open challenge.
 *
 * The framing is deliberately a bet, not a trade: whose side, what the pot is,
 * and what it costs YOU to take the other end. The probability is shown, but it
 * is never the headline — "risk $4 to win $10" is what a person actually decides
 * on, and it is the same number the order book calls a price.
 */
export function DuelCard({
  duel,
  mine = false,
}: {
  duel: ArenaDuel;
  mine?: boolean;
}) {
  const takerSide = opposite(duel.creatorSide);
  const { stakes, market } = duel;
  const up = takerSide === "UP";

  return (
    <Link
      href={`/d/${duel.marketId}/${duel.orderId}`}
      className="card group relative block overflow-hidden p-4 transition hover:border-line-bright"
    >
      {/* A hairline in the creator's colour down the left edge. */}
      <span
        className={`absolute inset-y-0 left-0 w-1 ${duel.creatorSide === "UP" ? "bg-up" : "bg-down"}`}
      />

      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="text-sm font-bold">{marketLabel(market.asset, market.intervalSec)}</div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {mine ? "You" : displayName(duel.creator)} backed{" "}
            <span className={duel.creatorSide === "UP" ? "text-up" : "text-down"}>
              {duel.creatorSide}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
            Closes in
          </div>
          <Countdown to={market.expiry} className="text-sm font-bold" />
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 pl-2">
        <div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
            Winner takes
          </div>
          <div className="text-2xl font-black tabular text-gold">
            {fmtNum(stakes.pot)} <span className="text-sm font-bold text-muted">tUSDC</span>
          </div>
        </div>

        {mine ? (
          <div className="shimmer rounded-xl border border-line-bright px-3 py-2 text-xs font-semibold text-muted">
            Waiting for an opponent
          </div>
        ) : (
          <div
            className={`rounded-xl px-3 py-2 text-right text-xs font-bold transition group-hover:brightness-110 ${
              up ? "bg-up text-ink" : "bg-down text-white"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <SidePill side={takerSide} size="sm" className="bg-black/15 !text-current" />
            </div>
            <div className="mt-1 tabular">
              Risk {fmtNum(stakes.takerStake)} → win {fmtNum(stakes.pot)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 pl-2 text-[0.7rem] text-faint">
        <span className="tabular">
          Implied {Math.round(stakes.upProbability * 100)}% Up
        </span>
        {!mine && <span className="tabular">{fmtNum(stakes.takerMultiple, 2)}× your stake</span>}
      </div>
    </Link>
  );
}
