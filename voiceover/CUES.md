# Demo cue sheet

Voice **Daniel** · **2:50** total · play `faceoff-vo.m4a` and follow the cues.

Record your screen with system audio muted — you're following the track, not capturing it.
Lay the same file over the footage afterwards and it lines up automatically.

| At | Do this | Narration |
|---|---|---|
| **0:00** | Arena open on the live site. Don't move yet. | Every prediction market has the same problem. Not the maths — th… |
| **0:09** | Scroll slowly down the Arena. | These are live event contracts on Somnia. Real markets, real ora… |
| **0:19** | Scroll to the 'Why this works without a market maker' panel. | But DreamDEX has something almost nobody uses. Two buyers on opp… |
| **0:32** | Stay on that panel. | So the fix for an empty book isn't more liquidity. It's one pers… |
| **0:39** | Click 'Start a duel'. Pick the BTC window the app recommends. | This is Faceoff. Pick a window — Bitcoin. |
| **0:45** | Pick the side the app allows (check CUES note below). Drag confidence to 60%. | Pick a side. Then say how sure you are. That's the only number y… |
| **0:54** | Point the cursor at 'You risk' / 'They risk' / 'Winner takes'. | Sixty percent confident means you put up six of a ten dollar pot… |
| **1:08** | Click 'Put up 6 tUSDC'. Wait for the duel page. | One signature. No extension, no seed phrase — the wallet was cre… |
| **1:20** | Click 'Copy link'. Paste into the incognito window. Press enter. | And that's the product. It's a link. |
| **1:28** | Second window shows the challenge. | My friend opens it and sees the challenge. They put up four, the… |
| **1:35** | Click the big 'Take …' button. Wait for the scoreboard. | So they take the other side. |
| **1:43** | Point the cursor at the MINT-A-PAIR badge. | And there it is. The protocol itself is telling us how that trad… |
| **1:55** | Point at the live price strip, then show both windows. | Now it's a live scoreboard anyone with the link can watch — Bitc… |
| **2:07** | Click through to 'My duels'. | When the window closes, nobody has to do anything. Somnia's reac… |
| **2:23** | Back to the Arena. | Most tools built on prediction markets tell you whether a market… |
| **2:37** | Hold on the Arena. | There's no database either. Every duel is a resting order that i… |
| **2:46** | Final frame — logo or Arena. | Faceoff. Bet a friend in one link. |

## Before you press record

1. Two browser windows side by side — left normal, right **incognito** (separate wallet).
2. Both already funded: click *Play — no wallet needed* in each and wait for a tUSDC balance.
3. `npm run pacemaker` running, so the Arena isn't empty.
4. Browser zoom ~110%.
5. One silent dry run first. The whole performance is about ninety seconds of clicking.

## Which side to back

The create screen bounds the confidence slider to odds that keep your duel
at the FRONT of its queue — otherwise the book hands your friend a
better-priced order and your challenge sits unmatched. Take whichever side
lets you sit at 60%, so the numbers match the narration (6.00 vs 4.00).

Run `npm run windows` to see which side leads on which market right now.