import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Faceoff — bet a friend in one link";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#06070a";
const LINE = "#1e2431";
const TEXT = "#eef1f6";
const MUTED = "#8b94a8";
const FAINT = "#5c6478";
const UP = "#1fe08a";
const DOWN = "#ff4d6a";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: INK,
          padding: 80,
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, height: 10 }}>
          <div style={{ flex: 1, background: UP }} />
          <div style={{ flex: 1, background: DOWN }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 48,
              height: 48,
              borderRadius: 12,
              overflow: "hidden",
              border: `1px solid ${LINE}`,
            }}
          >
            <div style={{ flex: 1, background: UP }} />
            <div style={{ flex: 1, background: DOWN }} />
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: TEXT, letterSpacing: -0.5 }}>
            FACEOFF
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 900,
            color: TEXT,
            letterSpacing: -3,
            lineHeight: 1.05,
            marginTop: 40,
          }}
        >
          Bet a friend in one link.
        </div>

        <div style={{ display: "flex", fontSize: 32, color: MUTED, marginTop: 28, maxWidth: 920 }}>
          Pick a side, name your odds, send the link. Two people who disagree are matched
          directly — no bookmaker, no house, no liquidity required.
        </div>

        <div style={{ display: "flex", fontSize: 24, color: FAINT, marginTop: 44 }}>
          Prediction duels on DreamDEX Event Contracts · Somnia
        </div>
      </div>
    ),
    size,
  );
}
