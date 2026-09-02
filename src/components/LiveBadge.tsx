"use client";

import { useChainRevision } from "@/lib/live";

/**
 * The tail's own state, surfaced honestly.
 *
 * When it says LIVE, the page is being driven by chain events rather than a
 * refresh timer — the block number is the last one the local store materialized.
 */
export function LiveBadge({ className = "" }: { className?: string }) {
  const { block, connected, tailing } = useChainRevision();

  const label = tailing ? "Live" : connected ? "Syncing" : "Reconnecting";
  const tone = tailing ? "bg-up" : connected ? "bg-gold" : "bg-down";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[0.68rem] font-semibold text-muted ${className}`}
      title={`Local tail at block ${block}`}
    >
      <span className={`size-1.5 rounded-full ${tone} ${tailing ? "pulse-dot" : ""}`} />
      {label}
      {block > 0 && <span className="tabular text-faint">#{block.toLocaleString()}</span>}
    </span>
  );
}
