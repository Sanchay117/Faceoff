# Demo video — script and shot list

Target: **2 min 30 s**. The judging rubric gives 15% to presentation and asks for the problem, the solution, the product, the demo, and the future vision. This script hits all five in order.

Record at **1920×1080**. Use Loom, QuickTime (⌘⇧5), or OBS.

---

## Before you hit record

1. **Two browser windows, side by side**, each ~half the screen.
   - Left = **Player A** (normal window)
   - Right = **Player B** (an **incognito/private** window — this is what gives it a separate burner wallet)
2. In each window, click **Start playing** and wait until the wallet chip shows a tUSDC balance. Do this *before* recording so you never film a faucet wait.
3. Start the Pacemaker so the Arena isn't empty: `npm run pacemaker`. Let it run a minute.
4. Have a third tab open on the **Shannon explorer** (`https://shannon-explorer.somnia.network`).
5. Pick the **15-minute** window for the duel — long enough to talk over, short enough to settle.
6. Zoom the browser to ~110% so text is readable in a compressed video.

> Do a full dry run once without recording. The whole thing takes 90 seconds to perform.

---

## Shot list

### 0:00–0:20 — The problem

**On screen:** the DreamDEX Event Contracts app or your Arena, showing markets with **0 trades**.

> "Every prediction market has the same problem. Not the maths — the loneliness. Your bet only happens if somebody's already there to take it. Here are live event contracts on Somnia right now. Real markets, real oracles, real settlement. And almost every book is empty."

---

### 0:20–0:40 — The insight

**On screen:** the "Why this works without a market maker" panel on the Faceoff landing page. Scroll to it slowly.

> "But DreamDEX has something almost nobody uses. If two people take opposite sides, they don't need a seller at all. The pool takes both stakes and mints a fresh Up/Down pair out of them. The contract is created by the disagreement.
>
> So the fix for an empty order book isn't more liquidity. It's one person who thinks you're wrong."

---

### 0:40–1:20 — The product (the money shot)

**On screen:** Left window. Click **Start a duel**.

> "This is Faceoff. Pick a window — Bitcoin, fifteen minutes."

Click **UP**. Drag the confidence slider to ~60%.

> "Pick a side. Then say how sure you are — and that's the only number you touch. Sixty percent confident means you put up six of a ten-dollar pot, and they put up four. Winner takes ten.
>
> That slider is the order price. The user never sees a probability. The order book gets a precise limit order."

Click **Put up 6.00 tUSDC**.

> "One signature. No wallet extension, no seed phrase — the wallet was made in the browser when I landed."

**Copy the link.** Paste it into the right-hand window.

> "And that's the product. It's a link."

**On screen (right window):** the duel page loads showing *"SwiftFalcon is backing UP"*.

> "My friend opens it and sees the challenge. They put up four, they win ten."

Click **Take DOWN for 4.00 tUSDC**.

---

### 1:20–1:50 — The proof

**On screen:** the scoreboard appears. Point the cursor at the **MINT-A-PAIR** badge.

> "And there it is. The protocol itself is telling us how that trade settled — mint-a-pair. No seller was involved. No market maker. Nobody was here before we were. That ten-dollar contract did not exist four seconds ago."

Point at the live price strip.

> "Now it's a live scoreboard, and anyone with the link can watch. That's Bitcoin's price against the exact line this window settles on, streaming from Somnia's on-chain oracle. Right now I'm ahead."

**Switch to the left window** so both are visible.

> "Both players see it. So does a spectator."

Optionally click the transaction link to show the explorer.

---

### 1:50–2:10 — It settles itself

**On screen:** the **My duels** page.

> "When the window closes, nobody has to do anything. Somnia's on-chain reactivity delivers the oracle's answer straight to the settlement contract — no keeper, no cron job, nobody to trust. The result lands here the moment it happens, and every settled duel gets claimed in a single transaction."

If you have a settled duel, click **Claim all** here. If not, just show the panel.

---

### 2:10–2:30 — Why it matters

**On screen:** back to the Arena with open duels visible.

> "Six of the thirteen projects in this hackathon built tools that tell you whether a market is worth trading. None of them cause a trade to happen.
>
> Faceoff does. Every invite is a new user, and every accepted invite is on-chain volume — because the invitation and the trade are the same object.
>
> No database anywhere, by the way. Every open duel is a resting order that identifies itself on-chain, so anyone can read them from a public RPC. If our site disappears, the duels don't.
>
> Faceoff. Bet a friend in one link."

---

## If you're using an AI voiceover

- Feed it the quoted blocks above, in order, as one script. Ask for a **conversational, confident, unhurried** read — not an ad voice.
- Record your screen actions **first**, silently, then lay the audio over it. Trying to perform and narrate simultaneously is where takes die.
- Leave ~1 s of silence between sections so you can stretch or trim video to fit.
- ElevenLabs, or the built-in macOS `say` command, both work. Keep total audio under 2:30.

## Things that make it look amateur — avoid these

- Don't film a loading spinner. Pre-warm both wallets.
- Don't read the README aloud. Say what's on screen.
- Don't apologise for it being a testnet.
- Don't zoom around the page hunting for buttons — rehearse the click path.
- Don't run over 3 minutes. The brief says 2–3.
