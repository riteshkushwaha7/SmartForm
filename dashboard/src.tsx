import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { links } from "./site.config";

const features = [
  "Detects common form fields",
  "Keeps profile data in the extension",
  "Stores education and identity details locally",
  "Calculates totals, top-five marks and percentages",
  "Keeps resumes and documents ready for matching",
  "Discovers and ranks jobs from public sources",
  "Tracks saved jobs and application history",
  "Leaves final review and submission to the user",
];

const steps = [
  "Open the website with a form.",
  "Scan the form from the FormPilot AI popup.",
  "FormPilot AI checks your locally saved profile.",
  "Known fields and calculations are filled locally.",
  "Use AI Fill only for a contextual field that needs it.",
  "Review the highlighted values and submit yourself.",
];

function S(p: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={p.id}>
      <span className="eyebrow">{p.id.replaceAll("-", " / ")}</span>
      <h2>{p.title}</h2>
      {p.children}
    </section>
  );
}

function App() {
  return (
    <>
      <header>
        <a className="logo" href="#home">FormPilot AI</a>
        <nav>
          {[["about", "About"], ["features", "Features"], ["how-it-works", "How it works"], ["architecture", "Architecture"], ["how-to-use", "Use"], ["team", "Team"]].map(([id, name]) => (
            <a key={id} href={`#${id}`}>{name}</a>
          ))}
        </nav>
        <a className="github" href={links.github}>GitHub ↗</a>
      </header>
      <main>
        <section id="home" className="hero">
          <div>
            <span className="eyebrow">MAJOR PROJECT · UIT RGPV · IT · 2027</span>
            <h1>Forms are repetitive.<br />Your profile should not be.</h1>
            <p className="lede">FormPilot AI — Your intelligent form-filling assistant for filling everyday web forms from information you save locally.</p>
            <div className="actions">
              <a className="button" href={links.download}>Download extension</a>
              <a className="textlink" href={links.github}>View source on GitHub →</a>
            </div>
          </div>
          <figure className="heroImage">
            <img src="/assets/extension_view.png" alt="FormPilot AI extension popup" />
            <figcaption>FormPilot AI popup — scan, fill and review.</figcaption>
          </figure>
        </section>
        <S id="about" title="Built for the forms we all fill repeatedly">
          <p>Job, internship, college, scholarship and registration forms often ask for the same personal and academic details. FormPilot AI reduces that repeat work with local profile matching, simple calculations and document assistance.</p>
          <p>It remains a standalone Manifest V3 extension. There is no backend server, and FormPilot AI never submits a form automatically.</p>
        </S>
        <S id="features" title="What FormPilot AI does">
          <div className="features">{features.map((item, i) => (
            <article key={item}><b>{String(i + 1).padStart(2, "0")}</b><span>{item}</span></article>
          ))}</div>
        </S>
        <S id="how-it-works" title="A straightforward flow">
          <ol className="flow">{["Open form", "Detect fields", "Check local profile", "Match or calculate", "AI when needed", "Fill form", "Review", "Submit"].map(item => <li key={item}>{item}</li>)}</ol>
          <p className="callout">FormPilot AI never automatically submits the form.</p>
        </S>
        <S id="architecture" title="How the extension is organised">
          <div className="architecture">
            <div>Browser webpage</div><i>↓</i><div>Content script</div><i>↓</i><div>Background service worker</div><i>↓</i><div>Chrome local storage</div><i>↓</i><div>Local matching / calculation</div><i>↓</i><div>OpenRouter AI · fallback only</div>
          </div>
          <p>The popup starts the scan. The dashboard manages profile details, documents and history. The content script reads and fills supported form fields. The service worker performs local matching and optional AI calls.</p>
        </S>
        <S id="how-to-use" title="Install and use">
          <ol className="steps">{steps.map((item, i) => <li key={item}><b>{i + 1}</b><span>{item}</span></li>)}</ol>
          <p>Download the package, extract it, open <code>chrome://extensions</code>, enable Developer Mode, choose <b>Load unpacked</b>, and select the extracted extension folder.</p>
        </S>
        <S id="configuration" title="Configure once, use when needed">
          <p>Use the extension dashboard to save personal and contact information, education details, preferred usernames and documents. An OpenRouter API key is optional; it is used only when you explicitly request AI Fill for a contextual question. Profile data stays in Chrome extension storage.</p>
        </S>
        <S id="screenshots" title="Inside FormPilot AI">
          <div className="gallery">
            <figure><img src="/assets/overview.png" alt="FormPilot AI dashboard overview" /><figcaption>Dashboard overview</figcaption></figure>
            <figure><img src="/assets/profile.png" alt="Profile configuration" /><figcaption>Profile configuration</figcaption></figure>
            <figure><img src="/assets/documents.png" alt="Document vault" /><figcaption>Document vault</figcaption></figure>
          </div>
        </S>
        <S id="team" title="Project team">
          <div className="team">
            {["Ritesh Kushwaha", "Aman Kumar Patel", "Mahek Choudhary", "Devansh Tiwari"].map(name => <div key={name}><b>{name}</b><span>Team member</span></div>)}
          </div>
          <p>Major Project — Information Technology<br />UIT RGPV — 2027 Passout Batch</p>
        </S>
        <S id="download" title="Get the extension">
          <p>Download FormPilot AI, extract it, then load the extracted folder through your Chromium browser's extension page.</p>
          <div className="actions">
            <a className="button" href={links.download}>Download FormPilot AI</a>
            <a className="textlink" href={links.github}>GitHub repository →</a>
          </div>
        </S>
        <S id="privacy" title="Privacy and review">
          <ul>
            <li>Profile information is stored locally in the browser extension.</li>
            <li>Sensitive values are excluded from AI context.</li>
            <li>AI is an optional fallback, not the default path.</li>
            <li>Every website submission remains the user's action.</li>
          </ul>
        </S>
      </main>
      <footer>
        <b>FormPilot AI</b>
        <span>Major Project · UIT RGPV · Information Technology · 2027 Batch</span>
        <a href={links.github}>GitHub</a>
        <a href={links.download}>Download</a>
        <small>© 2026 FormPilot AI Team. Developed as an academic major project.</small>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
