const $ = (s) => document.querySelector(s),
  app = $("#app"),
  notice = $("#notice"),
  title = $("#title"),
  bg = (m) => chrome.runtime.sendMessage(m),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state = {
  profile: {},
  sensitiveKeys: [],
  education: { tenth: {}, twelfth: {}, graduation: {}, post_graduation: {} },
  documents: [],
  settings: {},
  history: [],
  jobs: [],
  jobPreferences: {},
  jobSearchMeta: { searched: false, fetchedCount: 0, normalizedCount: 0 },
};
const msg = (x, kind = "") =>
    (notice.innerHTML = x ? `<div class="notice ${kind}">${esc(x)}</div>` : ""),
  profileGroups = {
    profile: [
      "first_name",
      "middle_name",
      "last_name",
      "full_name",
      "email",
      "phone",
      "address",
      "city",
      "state",
      "country",
      "pin_code",
      "preferred_username",
      "alternative_usernames",
    ],
    identity: ["aadhaar", "pan", "voter_id", "passport", "password"],
    professional: [
      "skills",
      "technologies",
      "experience",
      "target_roles",
      "preferred_locations",
      "work_mode",
      "github",
      "linkedin",
      "portfolio",
      "projects",
      "frequent_answers",
    ],
  },
  statuses = [
    "applied",
    "assessment",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
  ];
const inputs = (keys) =>
  keys
    .map(
      (k) =>
        `<label>${k.replaceAll("_", " ")}<input data-key="${k}" type="${k === "password" ? "password" : "text"}" value="${esc(state.profile[k])}"></label>`,
    )
    .join("");
function profilePage(group, heading, copy) {
  return `<div class="card"><h2>${heading}</h2><p>${copy}</p><div class="fields">${inputs(profileGroups[group])}</div><button id="saveProfile" class="primary">Save locally</button></div>`;
}
function educationPage() {
  return `<div class="card"><h2>Education & marks</h2><p>Enter subject marks as comma-separated values. Totals and percentages are calculated locally.</p>${[
    "tenth",
    "twelfth",
    "graduation",
    "post_graduation",
  ]
    .map((level) => {
      let e = state.education[level] || {};
      return `<fieldset><legend>${level.replace("_", " ")}</legend><div class="fields">${["institution", "year", "percentage", "cgpa", "marks", "max_marks"].map((k) => `<label>${k.replace("_", " ")}<input data-level="${level}" data-education="${k}" value="${esc(e[k])}"></label>`).join("")}</div></fieldset>`;
    })
    .join(
      "",
    )}<button id="saveEducation" class="primary">Save education</button></div>`;
}
function documentsPage() {
  return `<div class="card"><h2>Local document vault</h2><p>Import resumes and application documents. Plain-text resumes can also contribute keywords; other formats use local name and tag metadata.</p><label>Choose file<input id="documentFile" type="file" accept=".pdf,image/*,.doc,.docx,.txt"></label><label>Tags<input id="documentTags" placeholder="resume, sde"></label><button id="addDocument" class="primary">Import locally</button><div class="history">${state.documents.length ? state.documents.map((d, i) => `<div><b>${esc(d.name)}</b><span>${esc(d.tags || "untagged")} · ${(d.size / 1024).toFixed(1)} KB <button data-remove-document="${i}">Remove</button></span></div>`).join("") : "No local documents imported."}</div></div>`;
}
function aiPage() {
  return `<div class="card"><h2>OpenRouter AI settings</h2><p>Used for contextual form drafts and optional Job Finder matching. Sensitive identity and credentials are excluded.</p><label>OpenRouter API key<input id="apiKey" type="password" placeholder="${state.settings.apiKeyConfigured ? "Configured — paste to replace" : "Paste your OpenRouter API key"}"></label><label>Model<input id="model" value="${esc(state.settings.model || "nvidia/nemotron-3-super-120b-a12b:free")}"></label><button id="saveAi" class="primary">Save AI settings</button></div>`;
}
function fillHistoryPage() {
  return `<div class="card"><h2>Form fill history</h2><input id="historySearch" placeholder="Search website or field"><select id="historyType"><option value="">All fills</option><option value="ai">AI used</option><option value="local">Local only</option></select><button id="clearAll">Clear all</button><div id="historyRows"></div></div>`;
}
function drawFillHistory() {
  let q = ($("#historySearch")?.value || "").toLowerCase(),
    type = $("#historyType")?.value || "",
    rows = state.history.filter(
      (h) =>
        (!q ||
          `${h.domain} ${h.url} ${(h.items || []).map((i) => i.field).join(" ")}`
            .toLowerCase()
            .includes(q)) &&
        (!type || (type === "ai" ? h.aiUsed : !h.aiUsed)),
    );
  $("#historyRows").innerHTML =
    rows
      .map((h) => {
        let i = state.history.indexOf(h);
        return `<div class="history"><div><b>${esc(h.domain)}</b><span>${new Date(h.createdAt).toLocaleString()} · local ${h.local || 0} · AI ${h.ai || 0}</span></div><details><summary>View record</summary><p>${esc(h.url)}</p>${(h.items || []).map((x) => `<div>${esc(x.field)}: ${esc(x.value)}</div>`).join("")}</details><button data-delete-history="${i}">Remove</button></div>`;
      })
      .join("") || "No matching records.";
  app.querySelectorAll("[data-delete-history]").forEach(
    (b) =>
      (b.onclick = async () => {
        await bg({ type: "deleteHistory", index: +b.dataset.deleteHistory });
        state.history.splice(+b.dataset.deleteHistory, 1);
        drawFillHistory();
      }),
  );
}
function resumeOptions() {
  let resumes = state.documents.filter((d) =>
    /resume|cv/i.test(`${d.name} ${d.tags || ""}`),
  );
  return `<option value="">No resume selected</option>${resumes.map((d) => `<option value="${esc(d.name)}" ${state.jobPreferences.resume === d.name ? "selected" : ""}>${esc(d.name)}</option>`).join("")}`;
}
function jobsPage() {
  let p = state.jobPreferences || {};
  const options = (values, selected) =>
    values
      .map(
        ([value, label]) =>
          `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`,
      )
      .join("");
  const sources = p.sources || {};
  return `<div class="job-hero"><div><span>JOB FINDER</span><h2>Find opportunities that fit your profile</h2><p>Direct company careers, public ATS listings, and public job feeds ranked against your profile.</p></div></div>
  <div class="search-panel">
    <div class="primary-search"><label><span>Job title, skill or company</span><input id="jobRole" value="${esc(p.role)}" placeholder="Software engineer, React, Acme"></label><label><span>Location</span><input id="jobLocation" value="${esc(p.location)}" placeholder="India, Bengaluru, Remote"></label><button id="findJobs" class="primary">Search Jobs</button></div>
    <div class="secondary-filters">
      <label>Experience<select id="jobExperience"><option value="">Any</option>${options(
        [
          ["internship", "Internship"],
          ["fresher", "Fresher"],
          ["entry", "Entry Level"],
        ],
        p.experienceLevel,
      )}</select></label>
      <label>Job Type<select id="jobType"><option value="">Any</option>${options(
        [
          ["internship", "Internship"],
          ["full-time", "Full-time"],
          ["contract", "Contract"],
        ],
        p.jobType,
      )}</select></label>
      <label>Work Mode<select id="jobMode"><option value="">Any</option>${options(
        [
          ["remote", "Remote"],
          ["hybrid", "Hybrid"],
          ["on-site", "On-site"],
        ],
        p.workMode,
      )}</select></label>
      <label>Posted<select id="jobPosted"><option value="">Any</option>${options(
        [
          ["1", "Past 24h"],
          ["7", "Past 7 days"],
          ["30", "Past 30 days"],
        ],
        p.postedDays,
      )}</select></label>
      <label>Minimum Match<select id="jobMinScore">${options(
        [
          ["0", "Any score"],
          ["40", "40%+"],
          ["60", "60%+"],
          ["80", "80%+"],
        ],
        String(p.minScore || 0),
      )}</select></label>
      <button id="clearJobFilters" class="text-button">Clear Filters</button>
    </div>
    <div class="search-context"><label>Profile<select id="jobProfile"><option>Default profile</option></select></label><label>Resume<select id="jobResume">${resumeOptions()}</select></label><details class="source-picker"><summary>Sources</summary><div><label class="check"><input data-source="greenhouse" type="checkbox" ${sources.greenhouse !== false ? "checked" : ""}> Direct Careers · Greenhouse</label><label class="check"><input data-source="lever" type="checkbox" ${sources.lever !== false ? "checked" : ""}> Direct Careers · Lever</label><label class="check"><input data-source="jobicy" type="checkbox" ${sources.jobicy !== false ? "checked" : ""}> Jobicy Remote</label><label class="check"><input data-source="arbeitnow" type="checkbox" ${sources.arbeitnow !== false ? "checked" : ""}> Arbeitnow fallback</label></div></details><label class="check"><input id="jobAi" type="checkbox" ${p.useAi ? "checked" : ""}> Enhance top matches with AI ${state.settings.apiKeyConfigured ? "" : "(key not configured)"}</label><label class="check"><input id="refreshSources" type="checkbox"> Refresh cached sources</label><label class="check"><input id="showHidden" type="checkbox"> Show hidden</label></div>
  </div>
  <div class="results-bar"><div><b id="resultCount">Opportunities</b><small id="resultSummary"></small></div><label>Sort<select id="jobSort"><option value="match">Best Match</option><option value="newest">Newest</option><option value="company">Company</option></select></label></div>
  <div id="jobResults"></div><p class="privacy compact">Listings and application states stay in this browser. Optional AI receives only non-sensitive career context. SmartForm never submits applications.</p>`;
}
const jobUrl = (job) => job.applicationUrl || job.url || "";
const searchable = (job) =>
  `${job.title} ${job.company} ${job.location} ${job.description} ${(job.skills || job.tags || []).join(" ")}`.toLowerCase();
const indiaLocationTerms =
  /\b(india|bengaluru|bangalore|hyderabad|pune|mumbai|navi mumbai|delhi|new delhi|delhi ncr|gurugram|gurgaon|noida|chennai|kolkata|ahmedabad|bhopal|indore|jaipur|kochi|cochin|coimbatore|chandigarh|mysuru|mysore|lucknow|nagpur|surat|vadodara|kerala|karnataka|telangana|maharashtra|tamil nadu|west bengal|gujarat|rajasthan|madhya pradesh|uttar pradesh|andhra pradesh|odisha|punjab|haryana)\b/i;
const foreignOnlyLocation =
  /\b(germany|berlin|munich|united kingdom|london|uk only|europe only|eu only|france|paris|united states|usa|us only|new york|san francisco|canada only|canada|australia only|japan only|singapore only)\b/i;
function strictLocationMatch(job, requested) {
  if (!requested) return true;
  const target = requested
      .toLowerCase()
      .replace(/bangalore/g, "bengaluru")
      .replace(/gurgaon/g, "gurugram"),
    location = `${job.location || ""} ${job.country || ""}`
      .toLowerCase()
      .replace(/bangalore/g, "bengaluru")
      .replace(/gurgaon/g, "gurugram"),
    description = String(job.description || "").toLowerCase(),
    indiaRequest = target === "india" || indiaLocationTerms.test(target);
  if (indiaRequest) {
    if (
      foreignOnlyLocation.test(location) ||
      /remote[ ,/-]+(us|usa|uk|eu|europe)|us residents? only/.test(
        `${location} ${description}`,
      )
    )
      return false;
    if (target !== "india" && location.includes(target)) return true;
    if (target !== "india") return false;
    if (indiaLocationTerms.test(location)) return true;
    if (
      /\b(worldwide|anywhere|global remote|apac|asia[ -]?pacific)\b/.test(
        location,
      )
    )
      return true;
    return /applicants? from india|remote (within|in) india|india eligible|india based|based in india/.test(
      description,
    );
  }
  return (
    location.includes(target) || (!location && description.includes(target))
  );
}
function tolerantMatch(job, p) {
  const hay = searchable(job),
    queryWords = String(p.role || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1);
  if (queryWords.length && !queryWords.some((word) => hay.includes(word)))
    return false;
  if (!strictLocationMatch(job, p.location || "")) return false;
  const actualExperience = job.experienceLevel || "";
  if (p.experienceLevel && actualExperience) {
    const acceptable =
      p.experienceLevel === "entry"
        ? ["entry", "fresher", "internship"]
        : p.experienceLevel === "fresher"
          ? ["fresher", "entry", "internship"]
          : [p.experienceLevel];
    if (!acceptable.includes(actualExperience)) return false;
  }
  const type = String(job.employmentType || job.jobType || "").toLowerCase();
  if (p.jobType && type && !type.includes(p.jobType)) return false;
  if (p.workMode && job.workMode && job.workMode !== p.workMode) return false;
  if (p.postedDays && (job.publishedAt || job.postedAt)) {
    const age =
      Date.now() - new Date(job.publishedAt || job.postedAt).getTime();
    if (Number.isFinite(age) && age > Number(p.postedDays) * 86400000)
      return false;
  }
  return Number(job.matchScore || 0) >= Number(p.minScore || 0);
}
function shownJobs() {
  const showHidden = $("#showHidden")?.checked;
  let jobs = state.jobs.filter(
    (job) =>
      (showHidden || (!job.hidden && job.status !== "irrelevant")) &&
      tolerantMatch(job, state.jobPreferences || {}),
  );
  let sort = $("#jobSort")?.value || "match";
  return jobs.sort((a, b) =>
    sort === "newest"
      ? new Date(b.publishedAt || b.postedAt || b.discoveredAt) -
        new Date(a.publishedAt || a.postedAt || a.discoveredAt)
      : sort === "company"
        ? a.company.localeCompare(b.company)
        : (b.finalRanking ?? b.matchScore ?? -1) -
          (a.finalRanking ?? a.matchScore ?? -1),
  );
}
function relativeDate(value) {
  if (!value) return "Date unavailable";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86400000),
  );
  return days === 0
    ? "Posted today"
    : `Posted ${days} day${days === 1 ? "" : "s"} ago`;
}
function matchLabel(score) {
  return score >= 80
    ? "Excellent"
    : score >= 60
      ? "Good"
      : score >= 40
        ? "Fair"
        : "Low";
}
function emptyState() {
  const meta = state.jobSearchMeta || {};
  if (!meta.searched)
    return `<div class="empty-state"><span>⌕</span><h3>Start your opportunity search</h3><p>Search by role, skill, company, or location using your local profile and resume.</p></div>`;
  if (!meta.fetchedCount)
    return `<div class="empty-state"><h3>No jobs were returned by the provider</h3><p>Try again later or broaden your search.</p><button data-retry class="primary">Retry</button></div>`;
  return `<div class="empty-state"><h3>${meta.uniqueCount || meta.locationCompatibleCount || 0} eligible jobs found, but none match your current filters</h3><p>Clear secondary filters or broaden the role query. India eligibility remains strict when India is selected.</p><button data-clear-empty class="primary">Clear Filters</button></div>`;
}
function drawJobs() {
  let root = $("#jobResults");
  if (!root) return;
  let jobs = shownJobs();
  $("#resultCount").textContent =
    `${jobs.length} opportunit${jobs.length === 1 ? "y" : "ies"}`;
  const counts = state.jobSearchMeta.providerCounts || {},
    directCount = (counts.greenhouse || 0) + (counts.lever || 0);
  $("#resultSummary").textContent = state.jobSearchMeta.searched
    ? `${state.jobSearchMeta.uniqueCount || 0} compatible unique jobs · Direct/ATS ${directCount} · Jobicy ${counts.jobicy || 0} · Arbeitnow ${counts.arbeitnow || 0}`
    : "Search public sources to begin";
  root.innerHTML =
    jobs
      .map((j) => {
        const score = Number(j.matchScore || 0),
          skills = j.skills || j.tags || [],
          url = jobUrl(j),
          mode = j.workMode || (j.remote ? "remote" : "");
        let destination = "External listing";
        try {
          destination = new URL(url).hostname.replace(/^www\./, "");
        } catch {}
        return `<article class="job"><div class="job-top"><div><div class="eyebrow">${relativeDate(j.publishedAt || j.postedAt)}</div><h3>${esc(j.title)}</h3><b>${esc(j.company)}</b><p class="job-locale">${esc(j.location || "Location not listed")} ${j.country && !String(j.location).toLowerCase().includes(String(j.country).toLowerCase()) ? `· ${esc(j.country)}` : ""} ${mode ? `· <span>${esc(mode)}</span>` : ""} ${j.employmentType || j.jobType ? `· ${esc(j.employmentType || j.jobType)}` : ""} ${j.experienceLevel ? `· ${esc(j.experienceLevel)}` : ""}</p></div><div class="score ${matchLabel(score).toLowerCase()}">${score}%<small>${matchLabel(score)} match</small></div></div><p class="job-description">${esc(j.description || "Description unavailable. Open the original listing for details.")}</p><div class="skill-row">${skills
          .slice(0, 8)
          .map((skill) => `<span>${esc(skill)}</span>`)
          .join("")}</div><div class="match-reasons">${(
          j.matchReasons || [j.matchExplanation]
        )
          .filter(Boolean)
          .map((reason) => `<span>✓ ${esc(reason)}</span>`)
          .join(
            "",
          )}</div><div class="job-source">Source: ${esc(j.provider || j.source || "Public source")} · Opens ${esc(destination)}${j.directApplication ? " · Direct application" : ""}</div><details class="job-details"><summary>View Details</summary><div><h4>Responsibilities & requirements</h4><p>${esc(j.fullDescription || j.description)}</p><h4>Required / key skills</h4><p>${skills.length ? esc(skills.join(", ")) : "Not provided by the source."}</p><h4>Matched skills</h4><p>${j.matchedSkills?.length ? esc(j.matchedSkills.join(", ")) : "No explicit skill matches found."}</p><h4>Skills to review</h4><p>${j.missingSkills?.length ? esc(j.missingSkills.join(", ")) : "No missing profile skills identified."}</p><h4>Original listing</h4><a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(url)}</a></div></details><div class="job-actions"><button class="primary" data-job-action="open" data-url="${esc(url)}">Open & Autofill</button><button data-job-action="save" data-url="${esc(url)}">${j.status === "saved" ? "Saved ✓" : "Save"}</button><button data-job-action="applied" data-url="${esc(url)}">Mark Applied</button><button data-job-action="hide" data-url="${esc(url)}">${j.hidden ? "Restore" : "Hide"}</button><button data-job-action="irrelevant" data-url="${esc(url)}">${j.status === "irrelevant" ? "Restore relevance" : "Irrelevant"}</button></div></article>`;
      })
      .join("") || emptyState();
  root
    .querySelectorAll("[data-job-action]")
    .forEach(
      (b) => (b.onclick = () => jobAction(b.dataset.jobAction, b.dataset.url)),
    );
  root
    .querySelector("[data-clear-empty]")
    ?.addEventListener("click", clearJobFilters);
  root
    .querySelector("[data-retry]")
    ?.addEventListener("click", () => $("#findJobs").click());
}
async function jobAction(action, url) {
  let job = state.jobs.find((j) => jobUrl(j) === url),
    now = new Date().toISOString(),
    patch =
      action === "open"
        ? {
            status: job.status === "saved" ? "saved" : "application_started",
            openedAt: now,
          }
        : action === "save"
          ? { status: job.status === "saved" ? "discovered" : "saved" }
          : action === "irrelevant"
            ? job.status === "irrelevant"
              ? { status: "discovered", hidden: false }
              : { status: "irrelevant", hidden: true }
            : action === "hide"
              ? { hidden: !job.hidden }
              : action === "restore"
                ? { status: "discovered", hidden: false }
                : action === "applied"
                  ? {
                      status: "applied",
                      appliedAt: job.appliedAt || now,
                      openedAt: job.openedAt || now,
                    }
                  : {};
  let r = await bg({ type: "updateJob", url, patch, open: action === "open" });
  if (r.ok) {
    Object.assign(job, patch);
    drawJobs();
    msg(
      action === "open"
        ? "Application page opened. Use SmartForm to scan and autofill, then review and submit manually."
        : "Job status updated locally.",
    );
  } else msg(r.error || "Could not update this job.", "error");
}
function savedJobsPage() {
  const jobs = state.jobs.filter(
    (job) => job.status === "saved" && !job.hidden,
  );
  return `<div class="page-intro"><span>SAVED JOBS</span><h2>Opportunities saved for later</h2><p>These listings are stored only in this browser.</p></div><div class="saved-grid">${jobs.map((job) => `<article class="saved-card"><span>${esc(job.company)}</span><h3>${esc(job.title)}</h3><p>${esc(job.location)} · ${esc(job.workMode || "Mode not listed")}</p><div><button class="primary" data-saved-open="${esc(jobUrl(job))}">Open & Autofill</button><button data-saved-remove="${esc(jobUrl(job))}">Remove</button></div></article>`).join("") || `<div class="empty-state"><h3>No saved jobs yet</h3><p>Save opportunities from Job Finder to review them here.</p></div>`}</div>`;
}
function bindSavedJobs() {
  app
    .querySelectorAll("[data-saved-open]")
    .forEach((b) => (b.onclick = () => jobAction("open", b.dataset.savedOpen)));
  app.querySelectorAll("[data-saved-remove]").forEach(
    (b) =>
      (b.onclick = async () => {
        await jobAction("save", b.dataset.savedRemove);
        render("saved");
      }),
  );
}
function applicationsPage() {
  let jobs = state.jobs.filter((j) => statuses.includes(j.status));
  return `<div class="page-intro"><span>APPLICATION HISTORY</span><h2>Track every application</h2><p>Only jobs explicitly marked as applied appear here. Update each outcome as it changes.</p></div><div class="application-list">${
    jobs
      .map((j) => {
        const url = jobUrl(j);
        return `<article class="application"><div><span class="status-badge">${esc(j.status)}</span><h3>${esc(j.title)}</h3><b>${esc(j.company)}</b><p>${esc(j.location)}</p></div><div><small>Applied date</small><b>${j.appliedAt ? new Date(j.appliedAt).toLocaleDateString() : "Not recorded"}</b><small>${esc(j.profile || "Default profile")} · ${esc(j.resume || "No resume")}</small></div><select data-app-status="${esc(url)}">${statuses.map((v) => `<option value="${v}" ${j.status === v ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select><textarea data-app-notes="${esc(url)}" placeholder="Notes">${esc(j.notes)}</textarea><div class="application-actions"><a href="${esc(url)}" target="_blank" rel="noreferrer">Open application</a><button data-save-app="${esc(url)}" class="primary">Save update</button></div></article>`;
      })
      .join("") ||
    `<div class="empty-state"><h3>No applications yet</h3><p>Use “Mark Applied” after you manually submit an application.</p></div>`
  }</div>`;
}
function bindApplications() {
  app.querySelectorAll("[data-save-app]").forEach(
    (b) =>
      (b.onclick = async () => {
        let url = b.dataset.saveApp,
          status = app.querySelector(
            `[data-app-status="${CSS.escape(url)}"]`,
          ).value,
          notes = app.querySelector(
            `[data-app-notes="${CSS.escape(url)}"]`,
          ).value,
          r = await bg({
            type: "updateJob",
            url,
            patch: {
              status,
              notes,
              appliedAt:
                state.jobs.find((j) => jobUrl(j) === url)?.appliedAt ||
                new Date().toISOString(),
            },
          });
        if (r.ok) {
          Object.assign(
            state.jobs.find((j) => jobUrl(j) === url),
            { status, notes },
          );
          msg("Application updated locally.");
        }
      }),
  );
}
function aboutPage() {
  return `<div class="card"><h2>SmartForm</h2><p>A Major Project for UIT RGPV<br>Information Technology — 2027 Passout Batch</p><h3>Team</h3><p>Ritesh Kushwaha<br>Aman Kumar Patel<br>Mahek Choudhary<br>Devansh Tiwari</p></div>`;
}
function privacyPage() {
  return `<div class="card privacy-page"><span>PRIVACY</span><h2>Your application data stays with you</h2><p>Profiles, resumes, job results, saved jobs, hidden jobs, and application history are stored in <code>chrome.storage.local</code> in this browser profile.</p><h3>AI matching is optional</h3><p>When explicitly enabled, only non-sensitive career context is sent to OpenRouter. Passwords, OTPs, Aadhaar, PAN, passport details, identity documents, and private credentials are excluded.</p><h3>You stay in control</h3><p>SmartForm may open an external application page and help fill fields after you ask it to. It never submits an application. Always review the employer page and every filled value before manually submitting.</p></div>`;
}
function render(page) {
  msg("");
  document
    .querySelectorAll("aside button")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  title.textContent = page.replaceAll("_", " ");
  let views = {
    overview: () =>
      `<div class="hero"><span>SMARTFORM CONTROL CENTER</span><h1>Your data stays in the extension.</h1><p>Local profile, form filling, job discovery, and application tracking. SmartForm never submits forms.</p></div>`,
    jobs: jobsPage,
    saved: savedJobsPage,
    applications: applicationsPage,
    profile: () =>
      profilePage(
        "profile",
        "Personal, contact & account",
        "Preferred username is used before alternatives.",
      ),
    identity: () =>
      profilePage(
        "identity",
        "Identity & password vault",
        "Sensitive values are local-only and excluded from AI requests.",
      ),
    education: educationPage,
    documents: documentsPage,
    professional: () =>
      profilePage(
        "professional",
        "Projects & profiles",
        "Add career context for form filling and job matching.",
      ),
    ai: aiPage,
    history: fillHistoryPage,
    privacy: privacyPage,
    about: aboutPage,
  };
  app.innerHTML = (views[page] || views.overview)();
  bind(page);
}
function bind(page) {
  if (page === "history") {
    $("#historySearch").oninput = drawFillHistory;
    $("#historyType").onchange = drawFillHistory;
    $("#clearAll").onclick = async () => {
      await bg({ type: "clearHistory" });
      state.history = [];
      drawFillHistory();
    };
    drawFillHistory();
    return;
  }
  if (page === "applications") {
    bindApplications();
    return;
  }
  if (page === "saved") {
    bindSavedJobs();
    return;
  }
  if (page === "jobs") {
    $("#jobSort").onchange = drawJobs;
    $("#showHidden").onchange = drawJobs;
    [
      "jobRole",
      "jobLocation",
      "jobExperience",
      "jobType",
      "jobMode",
      "jobPosted",
      "jobMinScore",
    ].forEach((id) => {
      $("#" + id).onchange = () => {
        readJobFilters();
        drawJobs();
      };
    });
    $("#clearJobFilters").onclick = clearJobFilters;
    $("#findJobs").onclick = async () => {
      let button = $("#findJobs"),
        sources = {};
      app
        .querySelectorAll("[data-source]")
        .forEach((input) => (sources[input.dataset.source] = input.checked));
      let preferences = {
        role: $("#jobRole").value,
        location: $("#jobLocation").value,
        workMode: $("#jobMode").value,
        experienceLevel: $("#jobExperience").value,
        jobType: $("#jobType").value,
        postedDays: $("#jobPosted").value,
        minScore: Number($("#jobMinScore").value || 0),
        resume: $("#jobResume").value,
        useAi: $("#jobAi").checked,
        refresh: $("#refreshSources").checked,
        sources,
      };
      button.disabled = true;
      button.textContent = "Finding opportunities…";
      msg("Finding opportunities…");
      let r = await bg({ type: "findJobs", preferences });
      button.disabled = false;
      button.textContent = "Search Jobs";
      if (!r.ok) {
        msg(r.error, "error");
        $("#jobResults").innerHTML =
          `<div class="empty-state"><h3>Unable to reach enabled job sources</h3><p>${esc(r.error || "The source requests failed.")}</p><button data-retry class="primary">Retry</button></div>`;
        $("#jobResults [data-retry]").onclick = () => $("#findJobs").click();
        return;
      }
      let all = await bg({ type: "getJobs" });
      state.jobs = all.jobs;
      state.jobPreferences = all.preferences;
      state.jobSearchMeta = all.searchMeta;
      drawJobs();
      const unavailable = r.providerErrors?.length
        ? ` Some sources were unavailable: ${r.providerErrors.join(", ")}.`
        : r.staleProviders?.length
          ? ` Using cached data for: ${r.staleProviders.join(", ")}.`
          : "";
      msg(
        `${r.uniqueCount} location-compatible opportunities found from ${r.sourceCount} sources.${unavailable}`,
        unavailable ? "warning" : "",
      );
      if (preferences.useAi) {
        if (!r.aiConfigured) {
          msg(
            `${r.uniqueCount} opportunities found. AI matching unavailable — using local matching.`,
            "warning",
          );
        } else {
          bg({ type: "enhanceJobs" }).then(async (ai) => {
            if (location.hash.slice(1) !== "jobs") return;
            if (ai.ok) {
              const refreshed = await bg({ type: "getJobs" });
              state.jobs = refreshed.jobs;
              drawJobs();
            } else {
              msg("AI matching unavailable — using local matching.", "warning");
            }
          });
        }
      }
    };
    drawJobs();
    return;
  }
  if (page === "profile" || page === "identity" || page === "professional")
    $("#saveProfile").onclick = async () => {
      app
        .querySelectorAll("[data-key]")
        .forEach((e) => (state.profile[e.dataset.key] = e.value));
      state.sensitiveKeys = [
        ...new Set(["aadhaar", "pan", "voter_id", "passport", "password"]),
      ];
      await bg({
        type: "saveProfile",
        profile: state.profile,
        sensitiveKeys: state.sensitiveKeys,
      });
      msg("Saved locally in the extension.");
    };
  if (page === "education")
    $("#saveEducation").onclick = async () => {
      app.querySelectorAll("[data-education]").forEach((e) => {
        state.education[e.dataset.level] ??= {};
        state.education[e.dataset.level][e.dataset.education] = e.value;
      });
      await bg({ type: "saveEducation", education: state.education });
      msg("Education saved locally.");
    };
  if (page === "documents") {
    $("#addDocument").onclick = async () => {
      let f = $("#documentFile").files[0];
      if (!f) {
        msg("Choose a file first.");
        return;
      }
      let dataUrl = await new Promise((resolve, reject) => {
        let r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      state.documents.push({
        name: f.name,
        type: f.type,
        size: f.size,
        tags: $("#documentTags").value,
        dataUrl,
      });
      let r = await bg({ type: "saveDocuments", documents: state.documents });
      if (!r.ok) {
        state.documents.pop();
        msg(r.error, "error");
        return;
      }
      render("documents");
      msg("Document stored locally.");
    };
    app.querySelectorAll("[data-remove-document]").forEach(
      (b) =>
        (b.onclick = async () => {
          state.documents.splice(+b.dataset.removeDocument, 1);
          await bg({ type: "saveDocuments", documents: state.documents });
          render("documents");
        }),
    );
  }
  if (page === "ai")
    $("#saveAi").onclick = async () => {
      let r = await bg({
        type: "saveSettings",
        settings: { apiKey: $("#apiKey").value, model: $("#model").value },
      });
      if (r.ok) {
        state.settings.apiKeyConfigured = r.apiKeyConfigured;
        $("#apiKey").value = "";
        msg("AI settings saved.");
      } else msg(r.error, "error");
    };
}
function readJobFilters() {
  state.jobPreferences = {
    ...state.jobPreferences,
    role: $("#jobRole")?.value || "",
    location: $("#jobLocation")?.value || "",
    workMode: $("#jobMode")?.value || "",
    experienceLevel: $("#jobExperience")?.value || "",
    jobType: $("#jobType")?.value || "",
    postedDays: $("#jobPosted")?.value || "",
    minScore: Number($("#jobMinScore")?.value || 0),
  };
}
function clearJobFilters() {
  [
    "jobRole",
    "jobLocation",
    "jobExperience",
    "jobType",
    "jobMode",
    "jobPosted",
  ].forEach((id) => {
    if ($("#" + id)) $("#" + id).value = "";
  });
  if ($("#jobMinScore")) $("#jobMinScore").value = "0";
  if ($("#showHidden")) $("#showHidden").checked = false;
  readJobFilters();
  drawJobs();
}
(async () => {
  state = await bg({ type: "getData" });
  let jobs = await bg({ type: "getJobs" });
  if (jobs.ok) {
    state.jobs = jobs.jobs;
    state.jobPreferences = jobs.preferences;
    state.jobSearchMeta = jobs.searchMeta;
  }
  document.querySelectorAll("aside button").forEach(
    (b) =>
      (b.onclick = () => {
        location.hash = b.dataset.page;
        render(b.dataset.page);
      }),
  );
  render(location.hash.slice(1) || "overview");
})();
