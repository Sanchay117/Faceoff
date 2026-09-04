/**
 * Build the demo narration track.
 *
 * The video is recorded audio-first: you play this track, follow the cues, and
 * the narration is in sync by construction. So every segment is followed by a
 * deliberate gap sized to the action it asks for — a gap long enough to click,
 * wait for a confirmation, and breathe.
 *
 *   npm run voiceover              # default voice
 *   npm run voiceover -- Samantha  # pick another (say -v '?' to list)
 *
 * Outputs voiceover/faceoff-vo.m4a and voiceover/CUES.md.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const VOICE = process.argv[2] ?? "Daniel";
/** Words per minute. Slower than conversational, because you are following it. */
const RATE = 168;
const OUT_DIR = "voiceover";
const WORK = path.join(OUT_DIR, ".work");

interface Segment {
  /** What to be doing on screen while this line plays. */
  cue: string;
  text: string;
  /** Silence after the line, in seconds — time to perform the action. */
  pause: number;
}

const SEGMENTS: Segment[] = [
  {
    cue: "Arena open on the live site. Don't move yet.",
    text: "Every prediction market has the same problem. Not the maths — the loneliness. Your bet only happens if somebody is already there to take it.",
    pause: 1,
  },
  {
    cue: "Scroll slowly down the Arena.",
    text: "These are live event contracts on Somnia. Real markets, real oracles, real settlement. And almost every order book is empty.",
    pause: 2,
  },
  {
    cue: "Scroll to the 'Why this works without a market maker' panel.",
    text: "But DreamDEX has something almost nobody uses. Two buyers on opposite sides need no seller at all. The pool takes both stakes, mints a fresh Up-Down pair, and hands each player their side.",
    pause: 1.5,
  },
  {
    cue: "Stay on that panel.",
    text: "So the fix for an empty book isn't more liquidity. It's one person who thinks you're wrong.",
    pause: 1.5,
  },
  {
    cue: "Click 'Start a duel'. Pick the BTC window the app recommends.",
    text: "This is Faceoff. Pick a window — Bitcoin.",
    pause: 3.5,
  },
  {
    cue: "Pick the side the app allows (check CUES note below). Drag confidence to 60%.",
    text: "Pick a side. Then say how sure you are. That's the only number you touch.",
    pause: 4,
  },
  {
    cue: "Point the cursor at 'You risk' / 'They risk' / 'Winner takes'.",
    text: "The surer you are, the more of the pot you put up — and the less they have to. Winner takes the lot. That slider is the order price: the user never sees a probability, and the book gets a precise limit order.",
    pause: 1.5,
  },
  {
    cue: "Click 'Put up 6 tUSDC'. Wait for the duel page.",
    text: "One signature. No extension, no seed phrase — the wallet was created in the browser when I landed.",
    pause: 5,
  },
  {
    cue: "Click 'Copy link'. Paste into the incognito window. Press enter.",
    text: "And that's the product. It's a link.",
    pause: 5.5,
  },
  {
    cue: "Second window shows the challenge.",
    text: "My friend opens it and sees the challenge, and what it costs them to take it.",
    pause: 2.5,
  },
  {
    cue: "Click the big 'Take …' button. Wait for the scoreboard.",
    text: "So they take the other side.",
    pause: 6.5,
  },
  {
    cue: "Point the cursor at the MINT-A-PAIR badge.",
    text: "And there it is. The protocol itself is telling us how that trade settled. Mint a pair. No seller. No market maker. That contract did not exist four seconds ago.",
    pause: 1.5,
  },
  {
    cue: "Point at the live price strip, then show both windows.",
    text: "Now it's a live scoreboard anyone with the link can watch — Bitcoin's price against the exact line this window settles on, from Somnia's on-chain oracle.",
    pause: 2.5,
  },
  {
    cue: "Click through to 'My duels'.",
    text: "When the window closes, nobody has to do anything. Somnia's reactivity delivers the oracle's answer straight to the settlement contract. No keeper, no cron job. Every settled duel is claimed in a single transaction.",
    pause: 2.5,
  },
  {
    cue: "Back to the Arena.",
    text: "Most tools built on prediction markets tell you whether a market is worth trading. Very few make a trade happen. Faceoff does — every invite is a new user, and every accepted invite is on-chain volume.",
    pause: 1.5,
  },
  {
    cue: "Hold on the Arena.",
    text: "There's no database either. Every duel is a resting order that identifies itself on-chain. If our site disappears, the duels don't.",
    pause: 1.5,
  },
  {
    cue: "Final frame — logo or Arena.",
    text: "Faceoff. Bet a friend in one link.",
    pause: 1.5,
  },
];

function duration(file: string): number {
  const out = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    file,
  ]);
  return Number(String(out).trim());
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function main() {
  mkdirSync(WORK, { recursive: true });

  const parts: string[] = [];
  const cues: string[] = [];
  const timeline: { index: number; startSec: number; spokenSec: number; pause: number; text: string }[] = [];
  let clockAt = 0;

  SEGMENTS.forEach((seg, i) => {
    const speech = path.join(WORK, `s${i}.aiff`);
    execFileSync("say", ["-v", VOICE, "-r", String(RATE), "-o", speech, seg.text]);

    const spoken = duration(speech);
    cues.push(
      `| **${clock(clockAt)}** | ${seg.cue} | ${seg.text.slice(0, 64)}${seg.text.length > 64 ? "…" : ""} |`,
    );

    // Re-encode to a common format so concat never renegotiates mid-stream.
    const wav = path.join(WORK, `s${i}.wav`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", speech, "-ar", "44100", "-ac", "1", wav]);
    parts.push(wav);

    const gap = path.join(WORK, `g${i}.wav`);
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi",
      "-i", `anullsrc=r=44100:cl=mono`,
      "-t", String(seg.pause),
      gap,
    ]);
    parts.push(gap);

    timeline.push({ index: i, startSec: clockAt, spokenSec: spoken, pause: seg.pause, text: seg.text });
    clockAt += spoken + seg.pause;
  });

  const list = path.join(WORK, "list.txt");
  writeFileSync(list, parts.map((p) => `file '${path.basename(p)}'`).join("\n"));

  const out = path.join(OUT_DIR, "faceoff-vo.m4a");
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", list,
    "-b:a", "192k",
    out,
  ]);

  const total = duration(out);
  writeFileSync(
    path.join(OUT_DIR, "CUES.md"),
    [
      `# Demo cue sheet`,
      ``,
      `Voice **${VOICE}** · **${clock(total)}** total · play \`faceoff-vo.m4a\` and follow the cues.`,
      ``,
      `Record your screen with system audio muted — you're following the track, not capturing it.`,
      `Lay the same file over the footage afterwards and it lines up automatically.`,
      ``,
      `| At | Do this | Narration |`,
      `|---|---|---|`,
      ...cues,
      ``,
      `## Before you press record`,
      ``,
      `1. Two browser windows side by side — left normal, right **incognito** (separate wallet).`,
      `2. Both already funded: click *Play — no wallet needed* in each and wait for a tUSDC balance.`,
      `3. \`npm run pacemaker\` running, so the Arena isn't empty.`,
      `4. Browser zoom ~110%.`,
      `5. One silent dry run first. The whole performance is about ninety seconds of clicking.`,
      ``,
      `## Which side to back`,
      ``,
      `The create screen bounds the confidence slider to odds that keep your duel`,
      `at the FRONT of its queue — otherwise the book hands your friend a`,
      `better-priced order and your challenge sits unmatched.`,
      ``,
      `Pick a window with NO red \`busy\` badge. On a busy one the book is already`,
      `quoting ahead of you and your friend will be matched against someone else.`,
      `The app defaults to a good window; \`npm run windows\` shows them all.`,
    ].join("\n"),
  );

  // A machine-readable copy of the timing, so a different voice can be dubbed
  // onto footage that was performed against THIS one without drifting.
  writeFileSync(path.join(OUT_DIR, "timeline.json"), JSON.stringify(timeline, null, 2));

  rmSync(WORK, { recursive: true, force: true });

  console.log(`voice   : ${VOICE} @ ${RATE} wpm`);
  console.log(`segments: ${SEGMENTS.length}`);
  console.log(`length  : ${clock(total)}`);
  console.log(`audio   : ${out}`);
  console.log(`cues    : ${path.join(OUT_DIR, "CUES.md")}`);
}

main();
