# Deploy & run — *From Tools to Teammates*

You have **two ways** to run this. Pick based on how much control you want.

---

## Option A — Self-guided (zero backend, 5 minutes)
Everyone scans the QR and taps/swipes through on their own phone. You drive the big screen. No Azure Functions, no storage.

1. **Deploy the static files.** In the Azure Portal → *Create a resource* → **Static Web App** → choose **"Other"** (no build). Upload/drag the folder, or with the CLI:
   ```bash
   npm i -g @azure/static-web-apps-cli
   swa deploy ./ --env production
   ```
   Files needed: `index.html`, `qr.png`. (The `api/` folder is only for Option B.)
2. **Get your URL** (e.g. `https://orchestra-icu.azurestaticapps.net`).
3. **Regenerate the QR for your real URL** (the bundled `qr.png` points at a placeholder):
   ```bash
   pip install "qrcode[pil]"
   python3 -c "import qrcode; qrcode.make('https://YOUR-URL').save('qr.png')"
   ```
   *(You can also just paste your URL into any QR generator.)* Re-deploy.
4. **Show the QR live** anytime by pressing **`Q`** — the page builds a QR of its own address automatically, so phones land on the right page even if you forget to regenerate the file.

Phones default to self-guided; viewers can tap/swipe and explore freely.

---

## Option B — Presenter-controlled (phones follow you live)
You advance a slide → every phone advances within ~1 second. Uses the Static Web App's **built-in managed Azure Functions** + a tiny bit of Blob storage. ~15 minutes.

1. **Deploy with the `api/` folder included** (same `swa deploy ./` — it auto-detects `api/`).
2. **Create a Storage account** (or reuse one). Copy its **connection string**.
3. **Set the app settings** on the Static Web App (Portal → your SWA → *Settings → Environment variables*, or `az staticwebapp appsettings set`):
   - `AZURE_STORAGE_CONNECTION` = your storage connection string  *(presenter sync)*
   - `PRESENTER_TOKEN` = any secret you choose, e.g. `rounds2026`  *(presenter sync)*
   - `ANTHROPIC_API_KEY` = your Claude API key  *(only for the closing "Ask the orchestrator" Q&A — leave it out and that scene simply says it isn't switched on)*
   - `ANTHROPIC_MODEL` = optional; defaults to `claude-sonnet-4-6`. Use `claude-haiku-4-5-20251001` for cheaper/faster, or `claude-opus-4-8` for the most capable.
   *(Prefer Cosmos? You already run it — swap the Blob calls in `api/state/index.js` for a Cosmos item; the contract is just `{ scene }`.)*
4. **Run the talk:**
   - **Audience** scans the QR → opens the plain URL → phones show **"● Live · following"** and move when you move.
   - **You** open the **presenter URL** with your token:
     ```
     https://YOUR-URL/?present=rounds2026
     ```
     You'll see a red **"● Broadcasting"** badge and the timer auto-starts. Drive with arrow keys / clicker / clicks.
   - A viewer can tap **"explore on your own"** to browse ahead, then **"follow presenter ↩"** to snap back to your current scene.

**Graceful fallback:** if the API isn't configured or is unreachable, phones silently revert to self-guided — the talk never breaks.

---

## The closing "Ask the orchestrator" Q&A (optional)
The last scene lets anyone in the room type a question and get a live answer from Claude. Because everyone already has the page open from the QR, each person can ask their own question on their own phone.

- It calls **`/api/ask`**, a second Azure Function that talks to the Claude API **server-side** — your `ANTHROPIC_API_KEY` lives only in the app settings and never reaches the browser. No CORS, no exposed key.
- To enable it, set `ANTHROPIC_API_KEY` (step 3 above). That's the only thing required.
- The answer's tone/scope is set by the system prompt at the top of `api/state/../ask/index.js` — edit it to taste (it's currently framed as a concise guide for healthcare leaders, and declines medical advice).
- Costs are just normal API usage per question; pick a cheaper model via `ANTHROPIC_MODEL` if a big room worries you.

---

## Controls (presenter)
| Key | Action |
|---|---|
| `→` / `Space` / click / clicker | Next |
| `←` | Back |
| `Q` | Show/hide the scan-to-follow QR |
| `T` | Toggle the discreet timer (auto-on in presenter mode) |
| `F` | Fullscreen |
| `Home` / `End` | Jump to first / last |

On phones: swipe or tap the `‹ ›` buttons.

---

## Files
```
index.html                 the talk (self-contained)
qr.png                     QR backup (regenerate for your URL)
staticwebapp.config.json   SWA routing + node:18 api runtime
api/state/index.js         GET/POST current scene (Option B)
api/state/function.json    HTTP trigger binding
api/ask/index.js           POST a question -> Claude answer (closing Q&A)
api/ask/function.json      HTTP trigger binding
api/package.json           @azure/storage-blob
api/host.json              Functions bundle
SCRIPT.md                  your 8-minute speaker script
```
