# SmartForm Extension

SmartForm now runs as a standalone Manifest V3 browser extension. Normal use requires no Python server, FastAPI, Node process, dashboard URL, or terminal.

## Install

1. Open Chrome, Edge, Brave, or another Chromium browser's extensions page.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the `extension` folder in this repository.
4. Click the SmartForm icon, then **Open dashboard**.
5. Complete the vault and, for AI Fill, save the raw OpenRouter API key in **AI settings**. Do not paste `Bearer `, quotes, or a `.env` assignment; the extension stores and uses the key from Chrome local storage.

Visit any website form, use **Scan form**, then **Fill direct fields** or **AI fill** for a contextual response. SmartForm highlights applied fields and never submits the form.

## Data and privacy

Profile data, API configuration, and the redacted activity history live in `chrome.storage.local` inside the browser profile. Direct matching is local. OpenRouter is contacted only after an explicit AI Fill action and receives only relevant non-sensitive profile values plus limited page context. Sensitive keys are excluded from AI and direct auto-fill.

The dashboard also provides local-only identity/password, education/marks, and document vaults. Identity values and passwords are used only for an explicit local fill and are excluded from AI context. Education totals, top-five totals, and percentages are calculated locally. Imported files (resume, certificates, signatures, images, and similar) are retained locally and can be matched to file inputs by their names or tags; browser and website security rules can still reject programmatic file assignment.

AI requests are made directly by the Manifest V3 service worker to `https://openrouter.ai/api/v1/chat/completions` using `Authorization: Bearer <your OpenRouter key>` and the free NVIDIA Nemotron model by default. A `.env` file is not part of the extension runtime. If AI Fill reports a 401, replace the key in **AI settings** with an active OpenRouter API key.

## Repository contents

The `extension/` folder is the complete distributable application. No server or separately hosted dashboard is part of the extension runtime.

## Project ownership

SmartForm is a Major Project for UIT RGPV, Information Technology — 2027 Passout Batch. Team: Ritesh Kushwaha, Aman Kumar Patel, Mahek Choudhary, and Devansh Tiwari. See [LICENSE](LICENSE) for the project usage notice; third-party dependencies remain under their own licenses.
