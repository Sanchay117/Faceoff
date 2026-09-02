import { ImageResponse } from "next/og";
import { getDuel, stakesFor } from "@/lib/duels";
import { handleFor } from "@/lib/handle";
import { loadMarket, marketLabel } from "@/lib/markets";
import { opposite } from "@/lib/tag";

/**
 * The share card.
 *
 * Faceoff's whole growth argument is that the link IS the product — a duel
 * spreads by being pasted into a group chat. So the link preview has to carry
 * the actual challenge, not a generic logo: whose side, what it costs to take,
 * and what the winner walks away with.
 *
 * It reads the duel from chain rather than from the URL, so a card can never
 * advertise terms the order book doesn't actually offer. If that read is slow or
 * the duel is gone, it degrades to a branded card instead of failing the share.
 */

export const runtime = "nodejs";
export const alt = "A Faceoff duel — take the other side";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#06070a";
const SURFACE = "#0d0f15";
const LINE = "#1e2431";
const TEXT = "#eef1f6";
const MUTED = "#8b94a8";
const FAINT = "#5c6478";
const UP = "#1fe08a";
const DOWN = "#ff4d6a";
const GOLD = "#ffc857";

type Params = { marketId: string; orderId: string };

export default async function Image({ params }: { params: Promise<Params> }) {
  const { marketId, orderId } = await params;
  const duel = await loadDuelSafely(marketId as `0x${string}`, orderId);

  if (!duel) return new ImageResponse(<Fallback />, size);

  const takerSide = opposite(duel.creatorSide);
  const takerColor = takerSide === "UP" ? UP : DOWN;
  const creatorColor = duel.creatorSide === "UP" ? UP : DOWN;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: INK,
          padding: 64,
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* the two sides, as a hairline across the top */}
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, height: 8 }}>
          <div style={{ flex: 1, background: UP }} />
          <div style={{ flex: 1, background: DOWN }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 40, height: 40, borderRadius: 10, overflow: "hidden", border: `1px solid ${LINE}` }}>
            <div style={{ flex: 1, background: UP }} />
            <div style={{ flex: 1, background: DOWN }} />
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: TEXT, letterSpacing: -0.5 }}>
            FACEOFF
          </div>
          <div style={{ fontSize: 22, color: FAINT, marginLeft: 8 }}>
            {duel.marketLabel}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 48, flex: 1 }}>
          <div style={{ fontSize: 26, color: MUTED }}>
            {handleFor(duel.creator)} is backing
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 8 }}>
            <div style={{ fontSize: 92, fontWeight: 900, color: creatorColor, letterSpacing: -2 }}>
              {duel.creatorSide === "UP" ? "▲ UP" : "▼ DOWN"}
            </div>
            <div style={{ fontSize: 30, color: MUTED, paddingTop: 26 }}>
              on {duel.asset}
            </div>
          </div>

          <div style={{ display: "flex", gap: 20, marginTop: 44 }}>
            <Tile label="They put up" value={duel.creatorStake} color={creatorColor} />
            <Tile label="You put up" value={duel.takerStake} color={takerColor} />
            <Tile label="Winner takes" value={duel.pot} color={GOLD} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${LINE}`,
            paddingTop: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              background: takerColor,
              color: takerSide === "UP" ? INK : "#fff",
              fontSize: 30,
              fontWeight: 800,
              padding: "16px 30px",
              borderRadius: 16,
            }}
          >
            Take {takerSide} for {duel.takerStake} tUSDC
          </div>
          <div style={{ display: "flex", fontSize: 22, color: FAINT }}>
            No bookmaker · settled on-chain by Somnia
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: SURFACE,
        border: `1px solid ${LINE}`,
        borderRadius: 20,
        padding: "22px 30px",
        minWidth: 250,
      }}
    >
      <div style={{ fontSize: 20, color: FAINT, textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 54, fontWeight: 900, color, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Fallback() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: INK,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, height: 8 }}>
        <div style={{ flex: 1, background: UP }} />
        <div style={{ flex: 1, background: DOWN }} />
      </div>
      <div style={{ fontSize: 76, fontWeight: 900, color: TEXT, letterSpacing: -2 }}>FACEOFF</div>
      <div style={{ fontSize: 34, color: MUTED, marginTop: 16 }}>Bet a friend in one link.</div>
    </div>
  );
}

interface CardData {
  creator: string;
  creatorSide: "UP" | "DOWN";
  asset: string;
  marketLabel: string;
  pot: string;
  creatorStake: string;
  takerStake: string;
}

/**
 * Never let a slow or failed chain read block a share. Social crawlers give an
 * image a short budget; past it we serve the branded fallback rather than a
 * broken preview.
 */
async function loadDuelSafely(marketId: `0x${string}`, orderId: string): Promise<CardData | null> {
  const work = (async (): Promise<CardData | null> => {
    const market = await loadMarket(marketId);
    const duel = await getDuel(market.marketId, market.pool, BigInt(orderId));
    if (!duel) return null;
    const s = stakesFor(duel, market.grid);
    return {
      creator: duel.creator,
      creatorSide: duel.creatorSide,
      asset: market.asset,
      marketLabel: marketLabel(market.asset, market.intervalSec),
      pot: s.pot.toFixed(2),
      creatorStake: s.creatorStake.toFixed(2),
      takerStake: s.takerStake.toFixed(2),
    };
  })();

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  }
}
