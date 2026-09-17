# SmartForm Extension

SmartForm now runs as a standalone Manifest V3 browser extension. Normal use requires no Python server, FastAPI, Node process, dashboard URL, or terminal.

## Install

1. Open Chrome, Edge, Brave, or another Chromium browser's extensions page.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the `extension` folder in this repository.
4. Click the SmartForm icon, then **Open dashboard**.
5. Complete the vault and, optionally, save an NVIDIA API key in **AI settings**.

Visit any website form, use **Scan form**, then **Fill direct fields** or **AI fill** for a contextual response. SmartForm highlights applied fields and never submits the form.

## Data and privacy

Profile data, API configuration, and the redacted activity history live in `chrome.storage.local` inside the browser profile. Direct matching is local. NVIDIA is contacted only after an explicit AI Fill action and receives only relevant non-sensitive profile values plus limited page context. Sensitive keys are excluded from AI and direct auto-fill.

## Repository contents

The `extension/` folder is the complete distributable application. No server or separately hosted dashboard is part of the extension runtime.
