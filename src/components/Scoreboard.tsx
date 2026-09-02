"use client";

import Link from "next/link";
import { LiveStanding } from "@/components/LiveStanding";
import { Button, Countdown, TxLink, fmtNum } from "@/components/ui";
import { escrowFor } from "@/lib/units";
import { handleFor } from "@/lib/handle";
import { marketLabel, STATUS, type DuelMarket } from "@/lib/markets";
import type { Match } from "@/lib/match";
import type { Side } from "@/lib/tag";

/**
 * A matched duel, watchable by anyone with the link.
 *
 * Once both sides are in, the page stops asking for a decision and becomes a
 * scoreboard: two names, two stakes, one pot, and the live price against the
 * line the market settles on. The shared link keeps working for spectators, for
 * both players, and after the window closes.
 */
export function Scoreboard({
  market,
  match,
  viewer,
}: {
  market: DuelMarket;
  match: Match;
  /** The connected wallet, so we can say "you" instead of a handle. */
  viewer?: `0x${string}` | null;
}) {
  const pot = Number(match.quantity) / 10 ** market.grid.decimals;
  const creatorStake =
    Number(escrowFor(match.creatorSide, match.price, match.quantity, market.grid)) /
    10 ** market.grid.decimals;
  const takerStake = pot - creatorStake;

  const me = viewer?.toLowerCase();
  const iAmCreator = me === match.creator.toLowerCase();
  const iAmTaker = me === match.taker.toLowerCase();
  const mySide: Side | undefined = iAmCreator
    ? match.creatorSide
    : iAmTaker
      ? match.takerSide
      : undefined;

  const settled = market.status === STATUS.Resolved || market.status === STATUS.Voided;
  const locked = market.status === STATUS.Locked;

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-10">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="text-sm font-bold">{marketLabel(market.asset, market.intervalSec)}</span>
          {settled ? (
            <span className="text-xs font-bold text-muted">Settled</span>
          ) : locked ? (
            <span className="text-xs font-bold text-gold">Locked — awaiting the oracle</span>
          ) : (
            <span className="text-xs text-muted">
              settles in <Countdown to={market.expiry} className="font-bold" />
            </span>
          )}
        </div>

        {/* head to head */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
          <Corner
            name={iAmCreator ? "You" : handleFor(match.creator)}
            side={match.creatorSide}
            stake={creatorStake}
            highlight={iAmCreator}
          />
          <div className="flex flex-col items-center justify-center border-x border-line px-3">
            <div className="text-xs font-black text-faint">VS</div>
          </div>
          <Corner
            name={iAmTaker ? "You" : handleFor(match.taker)}
            side={match.takerSide}
            stake={takerStake}
            highlight={iAmTaker}
          />
        </div>

        <div className="border-t border-line bg-surface-2 px-5 py-4 text-center">
          <span className="text-xs text-muted">Winner takes </span>
          <span className="tabular text-xl font-black text-gold">{fmtNum(pot)} tUSDC</span>
        </div>

        {match.kind === "MINT_A_PAIR" && (
          <div className="border-t border-line px-5 py-3 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand-dim px-3 py-1 text-[0.7rem] font-bold text-brand">
              ⬥ MINT-A-PAIR
            </span>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-faint">
              No seller was involved. The pool minted both outcome tokens from these two stakes —
              this contract did not exist before they disagreed.
            </p>
          </div>
        )}
      </section>

      {!settled && (
        <LiveStanding marketId={market.marketId} asset={market.asset} side={mySide} />
      )}

      <div className="flex items-center justify-center gap-4">
        <TxLink hash={match.txHash} label="See the match on-chain" />
        {mySide && (
          <Link href="/me" className="text-xs font-medium text-brand hover:underline">
            My duels →
          </Link>
        )}
      </div>

      {!mySide && (
        <div className="card p-5 text-center">
          <p className="text-sm text-muted">
            This one&apos;s taken — but you can start your own in about ten seconds.
          </p>
          <Link href="/create">
            <Button className="mt-4 w-full">Start a duel</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function Corner({
  name,
  side,
  stake,
  highlight,
}: {
  name: string;
  side: Side;
  stake: number;
  highlight: boolean;
}) {
  const up = side === "UP";
  return (
    <div className={`px-4 py-7 text-center ${highlight ? (up ? "bg-up-dim/40" : "bg-down-dim/40") : ""}`}>
      <div className="truncate text-xs font-semibold text-muted">{name}</div>
      <div className={`mt-1.5 text-3xl font-black ${up ? "text-up" : "text-down"}`}>
        {up ? "▲ UP" : "▼ DOWN"}
      </div>
      <div className="mt-2 text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
        risked
      </div>
      <div className="tabular text-lg font-bold">{fmtNum(stake)}</div>
    </div>
  );
}
