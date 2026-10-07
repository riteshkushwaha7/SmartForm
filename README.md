# SmartForm Extension

SmartForm now runs as a standalone Manifest V3 browser extension. Normal use requires no Python server, FastAPI, Node process, dashboard URL, or terminal.

## Install

1. Open Chrome, Edge, Brave, or another Chromium browser's extensions page.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the `extension` folder in this repository.
4. Click the SmartForm icon, then **Open dashboard**.
5. Complete the vault and, for AI Fill, save the raw OpenRouter API key in **AI settings**. Do not paste `Bearer `, quotes, or a `.env` assignment; the extension stores and uses the key from Chrome local storage.

Visit any website form, use **Scan form**, then **Fill direct fields** or **AI fill** for a contextual response. SmartForm highlights applied fields and never submits the form.

## Job Finder

Open **Job Finder** from the popup or dashboard to search legitimate public sources using a role, skill or company, location, work mode, experience level, job type, posting age, and minimum match score. Select the existing local profile and an imported resume; SmartForm uses non-sensitive profile fields plus resume name/tags (and text for `.txt` resumes) to rank results. Duplicate listings are consolidated using normalized application URLs plus company, title, location, and description similarity. Direct employer/ATS application destinations are retained when duplicates exist.

The serverless provider pipeline uses curated public Greenhouse and Lever company boards first, Jobicy's documented public remote-jobs API next, and Arbeitnow as the lowest-priority fallback. Sources can be disabled from Job Finder. Successful responses are cached per provider, query, and location; normal searches respect cache lifetimes and **Refresh cached sources** explicitly revalidates them. Each provider fails independently. No provider requires an API key, and no scraper, login automation, CAPTCHA bypass, server, or database is used.

Selecting India enables strict country eligibility. Explicit Indian locations, India-qualified remote roles, worldwide remote roles, and APAC roles are eligible; foreign-only, US-only, Europe-only, and unknown-region remote roles are excluded. Bangalore/Bengaluru, Gurgaon/Gurugram, Delhi NCR, and other common Indian city/state forms are normalized.

The workflow has three parts: **Job Finder** discovers and ranks listings, **Saved Jobs** holds opportunities for later, and **Application History** contains only jobs explicitly marked as applied. **Open & Autofill** opens the real external listing in a new tab and leaves the existing SmartForm scan/fill tools available. After manually submitting, use **Mark Applied**; the application can then move through Applied, Assessment, Interview, Offer, Rejected, or Withdrawn. SmartForm never clicks the final submit button—the user must review the listing and submit every application manually.

Local deterministic scoring is always available and reports matched skills, missing skills, and match reasons. Optional OpenRouter scoring runs only after locally ranked jobs are displayed and enhances at most the top candidates. Fenced JSON, surrounding prose, arrays/objects, and string scores are validated and normalized. A missing key, invalid key, timeout, rate limit, truncated response, or unusable AI output never prevents locally scored jobs from appearing.

## Data and privacy

Profile data, API configuration, and the redacted activity history live in `chrome.storage.local` inside the browser profile. Direct matching is local. OpenRouter is contacted only after an explicit AI Fill action and receives only relevant non-sensitive profile values plus limited page context. Sensitive keys are excluded from AI and direct auto-fill.

Job results, preferences, hidden/irrelevant decisions, notes, and application history also remain in `chrome.storage.local`. When optional AI job matching is selected, only non-sensitive career, education, preference, and resume keyword context is sent to OpenRouter. Identity values, government IDs, passwords, OTPs, private credentials, and document contents other than explicitly selected plain-text resume context are excluded. Public-feed availability, completeness, freshness, and geographic coverage depend on the configured provider.

The dashboard also provides local-only identity/password, education/marks, and document vaults. Identity values and passwords are used only for an explicit local fill and are excluded from AI context. Education totals, top-five totals, and percentages are calculated locally. Imported files (resume, certificates, signatures, images, and similar) are retained locally and can be matched to file inputs by their names or tags; browser and website security rules can still reject programmatic file assignment.

AI requests are made directly by the Manifest V3 service worker to `https://openrouter.ai/api/v1/chat/completions` using `Authorization: Bearer <your OpenRouter key>` and the free NVIDIA Nemotron model by default. A `.env` file is not part of the extension runtime. If AI Fill reports a 401, replace the key in **AI settings** with an active OpenRouter API key.

## Repository contents

The `extension/` folder is the complete distributable application. No server or separately hosted dashboard is part of the extension runtime.

## Project ownership

SmartForm is a Major Project for UIT RGPV, Information Technology — 2027 Passout Batch. Team: Ritesh Kushwaha, Aman Kumar Patel, Mahek Choudhary, and Devansh Tiwari. See [LICENSE](LICENSE) for the project usage notice; third-party dependencies remain under their own licenses.
