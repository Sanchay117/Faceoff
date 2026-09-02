# Deploying Faceoff

The submission needs a live testnet URL judges can open on a phone. This takes about ten minutes.

Everything is already committed locally and `.env.local` is gitignored, so your treasury key will not leave this machine.

---

## 1. Push to GitHub

Create an **empty** repo at <https://github.com/new> — name it `faceoff`, no README, no .gitignore, no licence.

Then, from the project folder:

```bash
git remote add origin https://github.com/YOUR_USERNAME/faceoff.git
```

```bash
git branch -M main && git push -u origin main
```

## 2. Import into Vercel

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Find `faceoff` and click **Import**.
3. Leave every build setting on its default — Vercel detects Next.js on its own.
4. **Before clicking Deploy**, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `TREASURY_PRIVATE_KEY` | the key from your local `.env.local` |

   Print it with:

   ```bash
   grep TREASURY_PRIVATE_KEY .env.local
   ```

   Paste the value only — not the `TREASURY_PRIVATE_KEY=` part. Leave it applied to all three environments.

5. Click **Deploy**.

You'll get a URL like `https://faceoff-xyz.vercel.app`. That is what goes in the DoraHacks submission.

**Deployed:** https://faceoff-orpin.vercel.app

## 3. Check it works

Open the URL on your **phone**, not just your laptop — judges will.

- [ ] The landing page loads and the Arena shows open duels
- [ ] The badge says **Live** with a block number that climbs
- [ ] **Start playing** creates a wallet and funds it (gas + tUSDC)
- [ ] You can open a duel and get a share link
- [ ] Pasting that link into WhatsApp or Telegram shows the **share card**, not a bare URL
- [ ] A second device (or an incognito window) can take the other side

If the wallet never funds, the treasury is out of STT — top it up and it recovers on its own.

## 4. Keep the Arena warm

The Pacemaker runs from your machine, not from Vercel (Vercel has no long-lived processes). Before judging, start it:

```bash
npm run pacemaker
```

Leave it running so anyone opening the link finds duels waiting. If you want it running permanently, deploy `scripts/pacemaker.ts` as a worker on Railway — the DreamDEX bot kit ships a Railway template for exactly this shape of process.

---

## Notes

- **Two keys, two jobs.** `TREASURY_PRIVATE_KEY` only ever sends native STT to fund new players. `PACEMAKER_PRIVATE_KEY` (local only, never deployed) is the bot's own trading wallet. Keep them separate so the server-side secret can never place an order.
- **Both are testnet keys.** Never reuse either on mainnet.
- **Share cards need the public URL.** `metadataBase` resolves from Vercel's own environment variables automatically, so no configuration is needed. If you attach a custom domain, set `NEXT_PUBLIC_SITE_URL` to it.
