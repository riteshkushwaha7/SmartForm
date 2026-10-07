const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1",
  NVIDIA_BASE_URL = OPENROUTER_BASE_URL,
  DEFAULT_SETTINGS = {
    provider: "openrouter",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    baseUrl: OPENROUTER_BASE_URL,
    apiKey: "",
  };
const SENSITIVE =
  /aadhaar|aadhar|passport|pan\b|voter|government.?id|password|card/i;
const ALIASES = {
  first_name: ["first name", "given name", "forename"],
  middle_name: ["middle name"],
  last_name: ["last name", "family name", "surname"],
  full_name: ["full name", "candidate name", "applicant name"],
  email: ["email", "email address"],
  phone: ["phone", "mobile", "contact number", "telephone"],
  address: ["address", "street"],
  city: ["city"],
  state: ["state"],
  country: ["country"],
  pin_code: ["pin code", "postal code", "zipcode"],
  aadhaar: ["aadhaar", "aadhar"],
  pan: ["pan number", "permanent account number"],
  voter_id: ["voter id", "epic number"],
  passport: ["passport number"],
  preferred_username: [
    "preferred username",
    "username",
    "user name",
    "login id",
  ],
  password: ["password", "confirm password"],
  institution: ["college", "university", "institution", "institute"],
  degree: ["degree", "qualification"],
  branch: ["branch", "specialization", "major"],
  cgpa: ["cgpa", "gpa"],
  roll_number: ["roll number", "student id"],
  enrollment_number: ["enrollment", "registration number", "university id"],
  passing_year: ["passing year", "graduation year"],
  linkedin: ["linkedin"],
  github: ["github"],
  portfolio: ["portfolio", "personal website"],
};
const get = (k) => chrome.storage.local.get(k),
  set = (x) => chrome.storage.local.set(x),
  norm = (x) =>
    String(x || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
function cleanApiKey(v) {
  let k = String(v || "").trim();
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  )
    k = k.slice(1, -1).trim();
  return k.replace(/^Bearer\s+/i, "").trim();
}
function cleanSettings(s = {}) {
  let legacy = s.provider !== "openrouter";
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    provider: "openrouter",
    apiKey: legacy ? "" : cleanApiKey(s.apiKey),
    model: String(s.model || DEFAULT_SETTINGS.model).trim(),
    baseUrl: OPENROUTER_BASE_URL,
  };
}
async function data() {
  let x = await get({
      profile: {},
      sensitiveKeys: [],
      education: {
        tenth: {},
        twelfth: {},
        graduation: {},
        post_graduation: {},
      },
      documents: [],
      settings: DEFAULT_SETTINGS,
      history: [],
      jobs: [],
      jobPreferences: {},
      jobSearchMeta: { searched: false, fetchedCount: 0, normalizedCount: 0 },
      jobProvider: { id: "arbeitnow" },
      jobProviderCache: {},
    }),
    settings = cleanSettings(x.settings);
  if (JSON.stringify(settings) !== JSON.stringify(x.settings)) {
    x.settings = settings;
    await set({ settings });
  }
  return x;
}
async function dashboardData() {
  let x = await data();
  return {
    ...x,
    settings: {
      ...x.settings,
      apiKey: "",
      apiKeyConfigured: Boolean(x.settings.apiKey),
    },
  };
}
function educationValue(ed, text) {
  let level = /\b(10th|tenth|secondary)\b/.test(text)
      ? "tenth"
      : /\b(12th|twelfth|higher secondary)\b/.test(text)
        ? "twelfth"
        : /\b(post.?graduation|masters|master)\b/.test(text)
          ? "post_graduation"
          : "graduation",
    e = ed[level] || {},
    marks = String(e.marks || "")
      .split(/[,\s]+/)
      .map(Number)
      .filter(Number.isFinite);
  if (/top.?5|best.?5/.test(text) && marks.length)
    return String(
      marks
        .sort((a, b) => b - a)
        .slice(0, 5)
        .reduce((a, b) => a + b, 0),
    );
  if (/total marks|marks obtained/.test(text) && marks.length)
    return String(marks.reduce((a, b) => a + b, 0));
  if (/percentage/.test(text)) {
    if (e.percentage) return e.percentage;
    if (marks.length && Number(e.max_marks))
      return String(
        Math.round(
          (marks.reduce((a, b) => a + b, 0) / Number(e.max_marks)) * 10000,
        ) / 100,
      );
  }
  if (/subject marks|marks/.test(text) && e.marks) return e.marks;
  if (/institution|school|college|university/.test(text))
    return e.institution || "";
  if (/year|passing/.test(text)) return e.year || "";
  if (/cgpa|gpa/.test(text)) return e.cgpa || "";
  return "";
}
function localValue(profile, ed, text) {
  for (let [key, words] of Object.entries(ALIASES))
    if (words.some((w) => text.includes(w)) && profile[key])
      return [key, String(profile[key])];
  if (/username/.test(text)) {
    let a = String(profile.alternative_usernames || "")
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (a[0]) return ["alternative_usernames", a[0]];
  }
  let value = educationValue(ed, text);
  return value ? ["education", value] : null;
}
function documentFor(docs, text) {
  return (
    docs.find(
      (d) =>
        d.name &&
        text
          .split(" ")
          .some(
            (t) =>
              t.length > 2 && norm(d.name + " " + (d.tags || "")).includes(t),
          ),
    ) || null
  );
}
async function match(fields) {
  let x = await data(),
    out = [];
  for (let f of fields) {
    let text = norm(f.text);
    if (f.type === "file") {
      let d = documentFor(x.documents, text);
      if (d)
        out.push({
          id: f.id,
          key: "document",
          file: { name: d.name, type: d.type, dataUrl: d.dataUrl },
        });
      continue;
    }
    let found = localValue(x.profile, x.education, text);
    if (found)
      out.push({
        id: f.id,
        key: found[0],
        value: found[1],
        sensitive:
          x.sensitiveKeys.includes(found[0]) || SENSITIVE.test(found[0]),
      });
  }
  return out;
}
async function generate(question, pageContext) {
  let x = await data(),
    key = cleanApiKey(x.settings.apiKey),
    safe = Object.entries(x.profile).filter(
      ([k, v]) => v && !x.sensitiveKeys.includes(k) && !SENSITIVE.test(k),
    ),
    tokens = norm(question).split(/\s+/),
    context = safe
      .sort(
        (a, b) =>
          tokens.filter((t) => norm(a[0] + " " + a[1]).includes(t)).length -
          tokens.filter((t) => norm(b[0] + " " + b[1]).includes(t)).length,
      )
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${String(v).slice(0, 700)}`)
      .join("\n");
  if (!context)
    throw Error(
      "No relevant non-sensitive local context is available for this question. Add profile details or use direct local fill.",
    );
  if (!key)
    throw Error(
      "OpenRouter API key is not configured. Open SmartForm dashboard → AI settings and save your OpenRouter API key.",
    );
  let endpoint = `${OPENROUTER_BASE_URL}/chat/completions`,
    prompt = `Answer this application-form question in at most 150 words. Use only supplied non-sensitive profile context. Never invent facts. Return only the value to place in this field.\nQuestion: ${question}\nPage: ${String(pageContext || "").slice(0, 1500)}\nProfile:\n${context}`;
  console.debug("SmartForm OpenRouter request", {
    hasKey: true,
    keyLength: key.length,
    endpoint,
    contextEntries: context.split("\n").length,
  });
  let r;
  try {
    r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: x.settings.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
        stream: false,
      }),
    });
  } catch {
    throw Error(
      "Unable to contact OpenRouter. Check your connection and extension permissions.",
    );
  }
  if (!r.ok) {
    let detail = (await r.text()).slice(0, 180);
    console.error("SmartForm OpenRouter error", {
      status: r.status,
      endpoint,
      detail,
    });
    if (r.status === 401)
      throw Error(
        "OpenRouter rejected the API key (401). Check AI settings and save a raw active OpenRouter API key.",
      );
    throw Error(
      `OpenRouter endpoint error (${r.status}): ${detail || r.statusText}`,
    );
  }
  let j;
  try {
    j = await r.json();
  } catch {
    throw Error("OpenRouter returned an invalid JSON response.");
  }
  let answer = j.choices?.[0]?.message?.content?.trim();
  if (!answer)
    throw Error("OpenRouter returned no usable answer for this field.");
  return { answer, source: "openrouter", sent_to_ai: true };
}
function historyItem(item) {
  let clean = (item.items || []).map((x) => ({
    field: String(x.field || "").slice(0, 120),
    key: x.key || "",
    value: x.sensitive ? "••••" : String(x.value || x.file || "").slice(0, 160),
    sensitive: Boolean(x.sensitive),
    file: x.file || "",
  }));
  return {
    url: String(item.url || "").slice(0, 1000),
    domain: String(item.domain || ""),
    createdAt: new Date().toISOString(),
    local: clean.filter((x) => !x.ai).length,
    calculated: clean.filter((x) => x.key === "education").length,
    ai: clean.filter((x) => x.ai).length,
    aiUsed: Boolean(item.aiUsed),
    success: item.success !== false,
    error: item.error ? String(item.error).slice(0, 180) : "",
    items: clean,
  };
}
function normalizedJobUrl(value) {
  try {
    let u = new URL(value);
    u.hash = "";
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "source",
    ].forEach((k) => u.searchParams.delete(k));
    u.pathname = u.pathname.replace(/\/$/, "");
    return u.toString().toLowerCase();
  } catch {
    return String(value || "")
      .trim()
      .toLowerCase();
  }
}
function plain(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}
function safeContext(x, prefs = {}) {
  let p = x.profile || {},
    e = x.education || {},
    grad = e.graduation || {},
    resume = (x.documents || []).find((d) => d.name === prefs.resume),
    text = "";
  if (resume?.type === "text/plain" && resume.dataUrl) {
    try {
      text = decodeURIComponent(
        escape(atob(resume.dataUrl.split(",")[1] || "")),
      );
    } catch {}
  }
  return {
    roles: String(prefs.role || p.target_roles || ""),
    skills: String(p.skills || ""),
    education: [grad.institution, grad.percentage || grad.cgpa]
      .filter(Boolean)
      .join(", "),
    graduationYear: String(grad.year || ""),
    experience: String(p.experience || p.projects || ""),
    locations: String(prefs.location || p.preferred_locations || p.city || ""),
    workMode: String(prefs.workMode || p.work_mode || ""),
    technologies: String(p.technologies || p.skills || ""),
    resumeKeywords: [resume?.name, resume?.tags, text.slice(0, 3000)]
      .filter(Boolean)
      .join(" "),
  };
}
const STOP_WORDS = new Set([
  "and",
  "the",
  "with",
  "for",
  "from",
  "that",
  "this",
  "your",
  "you",
  "our",
  "are",
  "will",
  "job",
  "work",
  "years",
  "year",
  "using",
  "into",
]);
function words(value) {
  return [
    ...new Set(
      norm(value)
        .split(" ")
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
    ),
  ];
}
function inferWorkMode(raw, text) {
  if (raw.remote || /\b(remote|work from home|wfh)\b/i.test(text))
    return "remote";
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\b(on[ -]?site|in office|office based)\b/i.test(text)) return "on-site";
  return "";
}
function inferExperience(text) {
  if (/\b(intern(ship)?|trainee)\b/i.test(text)) return "internship";
  if (/\b(sde|software engineer|developer|engineer)\s*(iii|3)\b/i.test(text))
    return "senior";
  if (/\b(sde|software engineer|developer|engineer)\s*(ii|2)\b/i.test(text))
    return "mid";
  if (/\b(sde|software engineer|developer|engineer)\s*(i|1)\b/i.test(text))
    return "entry";
  if (/\b(fresher|graduate|no experience|0[–-]?[12] years?)\b/i.test(text))
    return "fresher";
  if (/\b(entry[ -]?level|junior|associate)\b/i.test(text)) return "entry";
  if (/\b(senior|lead|principal|staff|[5-9]\+? years?)\b/i.test(text))
    return "senior";
  if (/\b(mid[ -]?level|[2-4]\+? years?)\b/i.test(text)) return "mid";
  return "";
}
function inferEmployment(raw, text) {
  let supplied = Array.isArray(raw.job_types)
    ? raw.job_types.join(", ")
    : raw.job_types || "";
  if (supplied) return plain(supplied);
  if (/\bintern(ship)?\b/i.test(text)) return "Internship";
  if (/\bcontract(or)?|freelance\b/i.test(text)) return "Contract";
  if (/\bpart[ -]?time\b/i.test(text)) return "Part-time";
  if (/\bfull[ -]?time\b/i.test(text)) return "Full-time";
  return "";
}
function publishedAt(value) {
  if (!value) return "";
  let date = new Date(
    typeof value === "number"
      ? value > 100000000000
        ? value
        : value * 1000
      : value,
  );
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
const INDIA_TERMS = [
  "india",
  "bharat",
  "bengaluru",
  "bangalore",
  "hyderabad",
  "pune",
  "mumbai",
  "navi mumbai",
  "delhi",
  "new delhi",
  "delhi ncr",
  "gurugram",
  "gurgaon",
  "noida",
  "greater noida",
  "chennai",
  "kolkata",
  "ahmedabad",
  "bhopal",
  "indore",
  "jaipur",
  "kochi",
  "cochin",
  "coimbatore",
  "chandigarh",
  "mysuru",
  "mysore",
  "lucknow",
  "nagpur",
  "surat",
  "vadodara",
  "thiruvananthapuram",
  "trivandrum",
  "visakhapatnam",
  "vijayawada",
  "bhubaneswar",
  "patna",
  "ranchi",
  "raipur",
  "dehradun",
  "guwahati",
  "jammu",
  "srinagar",
  "thane",
  "nashik",
  "rajkot",
  "mangaluru",
  "mangalore",
  "madurai",
  "tiruchirappalli",
  "salem",
  "hubballi",
  "kanpur",
  "meerut",
  "faridabad",
  "ghaziabad",
  "mohali",
  "goa",
  "kerala",
  "karnataka",
  "telangana",
  "maharashtra",
  "tamil nadu",
  "west bengal",
  "gujarat",
  "rajasthan",
  "madhya pradesh",
  "uttar pradesh",
  "andhra pradesh",
  "odisha",
  "punjab",
  "haryana",
  "uttarakhand",
  "jharkhand",
  "assam",
  "bihar",
  "chhattisgarh",
  "arunachal pradesh",
  "himachal pradesh",
  "jammu and kashmir",
  "ladakh",
  "manipur",
  "meghalaya",
  "mizoram",
  "nagaland",
  "sikkim",
  "tripura",
];
const FOREIGN_ONLY =
  /\b(germany|berlin|munich|united kingdom|london|uk only|europe only|eu only|france|paris|united states|usa|us only|new york|san francisco|canada only|canada|australia only|japan only|singapore only)\b/i;
function normalizeLocation(value) {
  return plain(value)
    .toLowerCase()
    .replace(/bangalore/g, "bengaluru")
    .replace(/gurgaon/g, "gurugram")
    .replace(/delhi ncr|new delhi/g, "delhi")
    .replace(/bombay/g, "mumbai")
    .replace(/\s+/g, " ")
    .trim();
}
function isIndiaRequest(value) {
  const requested = normalizeLocation(value);
  return (
    requested === "india" ||
    INDIA_TERMS.some((term) => normalizeLocation(term) === requested)
  );
}
function locationEligibility(job, requestedLocation = "") {
  const location = normalizeLocation(job.location || job.country),
    description = normalizeLocation(
      `${job.title || ""} ${job.description || ""}`,
    ),
    requested = normalizeLocation(requestedLocation),
    locationHasIndia = INDIA_TERMS.some((term) =>
      location.includes(normalizeLocation(term)),
    ),
    descriptionAllowsIndia =
      /\b(applicants? from india|remote (within|in) india|india eligible|india based|based in india)\b/i.test(
        description,
      ),
    worldwide = /\b(worldwide|anywhere|global remote|remote global)\b/i.test(
      location,
    ),
    apac = /\b(apac|asia[ -]?pacific)\b/i.test(location),
    foreignOnly =
      FOREIGN_ONLY.test(location) ||
      /\b(remote[ ,/-]+(us|usa|uk|eu|europe)|us residents? only|european union only)\b/i.test(
        `${location} ${description}`,
      );
  if (!requested)
    return {
      eligible: true,
      confidence: location ? 65 : 35,
      country: locationHasIndia ? "India" : job.country || "",
    };
  if (isIndiaRequest(requested)) {
    if (foreignOnly)
      return { eligible: false, confidence: 100, country: job.country || "" };
    if (requested !== "india") {
      if (location.includes(requested))
        return { eligible: true, confidence: 100, country: "India" };
      return {
        eligible: false,
        confidence: location ? 90 : 20,
        country: job.country || "",
      };
    }
    if (locationHasIndia || descriptionAllowsIndia)
      return {
        eligible: true,
        confidence: locationHasIndia ? 100 : 85,
        country: "India",
      };
    if (worldwide)
      return { eligible: true, confidence: 80, country: "Worldwide" };
    if (apac) return { eligible: true, confidence: 65, country: "APAC" };
    return {
      eligible: false,
      confidence: location ? 85 : 20,
      country: job.country || "",
    };
  }
  const normalizedRequested = normalizeLocation(requested);
  if (location.includes(normalizedRequested))
    return { eligible: true, confidence: 100, country: job.country || "" };
  if (!location && description.includes(normalizedRequested))
    return { eligible: true, confidence: 65, country: job.country || "" };
  return {
    eligible: false,
    confidence: location ? 85 : 20,
    country: job.country || "",
  };
}
function freshnessScore(value) {
  if (!value) return 0;
  const days = Math.max(0, (Date.now() - new Date(value).getTime()) / 86400000);
  return days <= 1 ? 8 : days <= 7 ? 6 : days <= 30 ? 3 : 0;
}
function addRanking(job) {
  const providerBoost = Math.min(5, Number(job.providerQuality || 0) / 20),
    locationBoost = Math.min(5, Number(job.locationConfidence || 0) / 20),
    directBoost = job.directApplication ? 3 : 0;
  return {
    ...job,
    finalRanking:
      Number(job.matchScore || 0) +
      freshnessScore(job.publishedAt) +
      providerBoost +
      locationBoost +
      directBoost,
  };
}
function localJobScore(job, context, preferences = {}) {
  const roleWords = words(context.roles || preferences.role),
    skillWords = words(`${context.skills} ${context.technologies}`),
    projectWords = words(`${context.experience} ${context.resumeKeywords}`),
    hay = norm(
      `${job.title} ${job.description} ${job.skills.join(" ")} ${job.company}`,
    ),
    title = norm(job.title),
    matchedSkills = skillWords.filter((w) => hay.includes(w)),
    missingSkills = skillWords.filter((w) => !hay.includes(w)).slice(0, 8),
    roleHits = roleWords.filter((w) => title.includes(w)),
    projectHits = projectWords.filter((w) => hay.includes(w)),
    reasons = [];
  let score = 20;
  if (roleWords.length)
    score += Math.min(
      35,
      Math.round((35 * roleHits.length) / roleWords.length),
    );
  if (skillWords.length)
    score += Math.min(
      30,
      Math.round((30 * matchedSkills.length) / skillWords.length),
    );
  if (projectHits.length) score += Math.min(10, projectHits.length * 2);
  if (
    preferences.location &&
    (job.remote || norm(job.location).includes(norm(preferences.location)))
  )
    score += 3;
  if (preferences.workMode && job.workMode === preferences.workMode) score += 2;
  if (preferences.experienceLevel === "internship") {
    if (job.experienceLevel === "internship") score += 15;
    if (["mid", "senior"].includes(job.experienceLevel)) score -= 30;
  }
  if (["fresher", "entry"].includes(preferences.experienceLevel)) {
    if (["internship", "fresher", "entry"].includes(job.experienceLevel))
      score += 12;
    if (job.experienceLevel === "mid") score -= 15;
    if (job.experienceLevel === "senior") score -= 35;
  }
  if (roleHits.length)
    reasons.push(`Role aligns with ${roleHits.slice(0, 3).join(", ")}.`);
  if (matchedSkills.length)
    reasons.push(`Skills overlap: ${matchedSkills.slice(0, 5).join(", ")}.`);
  if (job.remote && preferences.workMode === "remote")
    reasons.push("Matches your remote preference.");
  if (!reasons.length)
    reasons.push("Limited keyword overlap; review the full description.");
  return {
    score: Math.max(0, Math.min(100, score)),
    matchedSkills: matchedSkills.slice(0, 10),
    missingSkills,
    matchReasons: reasons,
    explanation: reasons.join(" "),
  };
}
function parseArbeitnow(raw, previous, context, preferences, now) {
  const applicationUrl = String(raw.url || raw.application_url || "").trim(),
    title = plain(raw.title),
    company = plain(raw.company_name || raw.company),
    fullDescription = plain(raw.description),
    rawTags = Array.isArray(raw.tags) ? raw.tags : raw.tags ? [raw.tags] : [],
    combined = `${title} ${fullDescription} ${rawTags.join(" ")}`;
  if (!applicationUrl || !title) return null;
  const id = normalizedJobUrl(applicationUrl),
    skills = [...new Set(rawTags.map(plain).filter(Boolean))],
    workMode = inferWorkMode(raw, `${raw.location || ""} ${combined}`),
    employmentType = inferEmployment(raw, combined),
    experienceLevel = inferExperience(combined),
    job = {
      id,
      provider: "Arbeitnow",
      providerId: "arbeitnow",
      sourceCategory: "other_public",
      providerQuality: 10,
      title,
      company: company || "Company not listed",
      location:
        plain(raw.location) ||
        (workMode === "remote" ? "Remote" : "Location not listed"),
      remote: workMode === "remote",
      workMode,
      employmentType,
      experienceLevel,
      description: fullDescription.slice(0, 360),
      fullDescription: fullDescription.slice(0, 6000),
      skills,
      publishedAt: publishedAt(raw.created_at || raw.published_at),
      applicationUrl,
      sourceUrl: applicationUrl,
      directApplication: false,
      country: "",
      normalizedUrl: id,
      discoveredAt: previous?.discoveredAt || now,
      status: previous?.status || "discovered",
      openedAt: previous?.openedAt || "",
      appliedAt: previous?.appliedAt || "",
      notes: previous?.notes || "",
      profile: "Default profile",
      resume: preferences.resume || previous?.resume || "",
      hidden: previous?.hidden || false,
    };
  const match = localJobScore(job, context, preferences);
  return {
    ...job,
    matchScore: match.score,
    matchedSkills: match.matchedSkills,
    missingSkills: match.missingSkills,
    matchReasons: match.matchReasons,
    matchExplanation: match.explanation,
    // Backward-compatible aliases used by older local records/UI versions.
    source: job.provider,
    postedAt: job.publishedAt,
    url: job.applicationUrl,
    jobType: job.employmentType,
    tags: job.skills,
  };
}
function finalizeJob(base, context, preferences, previous, now) {
  const applicationUrl = String(
      base.applicationUrl || base.sourceUrl || "",
    ).trim(),
    title = plain(base.title),
    fullDescription = plain(base.fullDescription || base.description),
    skills = [...new Set((base.skills || []).map(plain).filter(Boolean))];
  if (!applicationUrl || !title) return null;
  const normalizedUrl = normalizedJobUrl(applicationUrl),
    combined = `${title} ${fullDescription} ${skills.join(" ")}`,
    workMode =
      base.workMode ||
      inferWorkMode(
        { remote: base.remote },
        `${base.location || ""} ${combined}`,
      ),
    job = {
      id: String(base.id || normalizedUrl),
      provider: base.provider,
      providerId: base.providerId,
      sourceCategory: base.sourceCategory,
      providerQuality: base.providerQuality,
      title,
      company: plain(base.company) || "Company not listed",
      location:
        plain(base.location) ||
        (workMode === "remote" ? "Remote" : "Location not listed"),
      country: plain(base.country),
      remote: workMode === "remote",
      workMode,
      employmentType:
        plain(base.employmentType) || inferEmployment({}, combined),
      experienceLevel: base.experienceLevel || inferExperience(combined),
      description: fullDescription.slice(0, 360),
      fullDescription: fullDescription.slice(0, 6000),
      skills,
      publishedAt: publishedAt(base.publishedAt),
      applicationUrl,
      sourceUrl: String(base.sourceUrl || applicationUrl),
      directApplication: Boolean(base.directApplication),
      normalizedUrl,
      discoveredAt: previous?.discoveredAt || now,
      status: previous?.status || "discovered",
      openedAt: previous?.openedAt || "",
      appliedAt: previous?.appliedAt || "",
      notes: previous?.notes || "",
      profile: "Default profile",
      resume: preferences.resume || previous?.resume || "",
      hidden: previous?.hidden || false,
    },
    location = locationEligibility(job, preferences.location || ""),
    match = localJobScore(job, context, preferences);
  return addRanking({
    ...job,
    country: location.country || job.country,
    locationEligible: location.eligible,
    locationConfidence: location.confidence,
    matchScore: match.score,
    matchedSkills: match.matchedSkills,
    missingSkills: match.missingSkills,
    matchReasons: match.matchReasons,
    matchExplanation: match.explanation,
    source: job.provider,
    postedAt: job.publishedAt,
    url: job.applicationUrl,
    jobType: job.employmentType,
    tags: job.skills,
  });
}
function parseGreenhouse(raw, previous, context, preferences, now) {
  return finalizeJob(
    {
      id: `greenhouse:${raw._board}:${raw.id}`,
      provider: `${raw._company} Careers`,
      providerId: "greenhouse",
      sourceCategory: "public_ats",
      providerQuality: 100,
      title: raw.title,
      company: raw._company,
      location: raw.location?.name,
      fullDescription: raw.content,
      skills: [
        ...(raw.departments || []).map((d) => d.name),
        ...(raw.offices || []).map((o) => o.name),
      ],
      publishedAt: raw.updated_at,
      applicationUrl: raw.absolute_url,
      sourceUrl: raw.absolute_url,
      directApplication: true,
    },
    context,
    preferences,
    previous,
    now,
  );
}
function parseLever(raw, previous, context, preferences, now) {
  return finalizeJob(
    {
      id: `lever:${raw._board}:${raw.id}`,
      provider: `${raw._company} Careers`,
      providerId: "lever",
      sourceCategory: "public_ats",
      providerQuality: 100,
      title: raw.text,
      company: raw._company,
      location: raw.categories?.location,
      workMode:
        raw.workplaceType === "remote"
          ? "remote"
          : raw.workplaceType === "hybrid"
            ? "hybrid"
            : raw.workplaceType === "on-site"
              ? "on-site"
              : "",
      employmentType: raw.categories?.commitment,
      fullDescription: raw.descriptionPlain || raw.description,
      skills: [raw.categories?.team, raw.categories?.department].filter(
        Boolean,
      ),
      publishedAt: raw.createdAt,
      applicationUrl: raw.applyUrl || raw.hostedUrl,
      sourceUrl: raw.hostedUrl,
      directApplication: true,
    },
    context,
    preferences,
    previous,
    now,
  );
}
function parseJobicy(raw, previous, context, preferences, now) {
  const geo = plain(raw.jobGeo);
  return finalizeJob(
    {
      id: `jobicy:${raw.id || raw.jobSlug}`,
      provider: "Jobicy",
      providerId: "jobicy",
      sourceCategory: "other_public",
      providerQuality: 60,
      title: raw.jobTitle,
      company: raw.companyName,
      location: geo,
      country: /india/i.test(geo) ? "India" : geo,
      workMode: "remote",
      employmentType: Array.isArray(raw.jobType)
        ? raw.jobType.join(", ")
        : raw.jobType,
      experienceLevel: inferExperience(
        `${raw.jobLevel || ""} ${raw.jobTitle || ""} ${raw.jobDescription || ""}`,
      ),
      fullDescription: raw.jobDescription || raw.jobExcerpt,
      skills: [
        ...(Array.isArray(raw.jobIndustry) ? raw.jobIndustry : []),
        ...(Array.isArray(raw.jobType) ? raw.jobType : []),
      ],
      publishedAt: raw.pubDate,
      applicationUrl: raw.url,
      sourceUrl: raw.url,
      directApplication: false,
      remote: true,
    },
    context,
    preferences,
    previous,
    now,
  );
}
const GREENHOUSE_BOARDS = [
  ["bswiftindia", "bswift India"],
  ["superapp", "SuperApp"],
  ["conga", "Conga"],
  ["bluevineindia", "Bluevine India"],
  ["sigmoid", "Sigmoid"],
];
const LEVER_BOARDS = [
  ["endpointclinical", "Endpoint Clinical"],
  ["safe", "Safe Security"],
  ["rapidai", "RapidAI"],
  ["100ms", "100ms"],
];
async function fetchJson(url) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 429) throw Error("rate_limited");
    if (!response.ok) throw Error(`http_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
async function fetchGreenhouse() {
  const settled = await Promise.allSettled(
    GREENHOUSE_BOARDS.map(async ([board, company]) => {
      const body = await fetchJson(
        `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
      );
      return (body.jobs || []).map((job) => ({
        ...job,
        _board: board,
        _company: company,
      }));
    }),
  );
  const jobs = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (!jobs.length) throw Error("No Greenhouse boards were available.");
  return jobs;
}
async function fetchLever() {
  const settled = await Promise.allSettled(
    LEVER_BOARDS.map(async ([board, company]) => {
      const body = await fetchJson(
        `https://api.lever.co/v0/postings/${board}?mode=json`,
      );
      return (Array.isArray(body) ? body : []).map((job) => ({
        ...job,
        _board: board,
        _company: company,
      }));
    }),
  );
  const jobs = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (!jobs.length) throw Error("No Lever boards were available.");
  return jobs;
}
async function fetchJobicy(preferences) {
  const params = new URLSearchParams({ count: "100" });
  if (isIndiaRequest(preferences.location || "")) params.set("geo", "apac");
  const tag = String(preferences.role || "")
    .trim()
    .slice(0, 50);
  if (tag.length >= 3) params.set("tag", tag);
  const body = await fetchJson(
    `https://jobicy.com/api/v2/remote-jobs?${params}`,
  );
  if (body.success === false || !Array.isArray(body.jobs))
    throw Error("Unexpected Jobicy response.");
  return body.jobs;
}
async function fetchArbeitnow() {
  let raw = [],
    nextUrl = "https://www.arbeitnow.com/api/job-board-api",
    pages = 0;
  while (nextUrl && pages < 2) {
    const body = await fetchJson(nextUrl);
    if (!Array.isArray(body.data))
      throw Error("Unexpected Arbeitnow response.");
    raw.push(...body.data);
    pages += 1;
    const candidate = body.links?.next || body.meta?.next_page_url || "";
    nextUrl =
      candidate && candidate !== nextUrl
        ? new URL(candidate, "https://www.arbeitnow.com").toString()
        : "";
  }
  return raw;
}
const JOB_PROVIDERS = [
  {
    id: "greenhouse",
    label: "Direct Careers (Greenhouse)",
    priority: 100,
    ttl: 30 * 60 * 1000,
    fetch: fetchGreenhouse,
    parse: parseGreenhouse,
  },
  {
    id: "lever",
    label: "Direct Careers (Lever)",
    priority: 100,
    ttl: 30 * 60 * 1000,
    fetch: fetchLever,
    parse: parseLever,
  },
  {
    id: "jobicy",
    label: "Jobicy Remote",
    priority: 60,
    ttl: 60 * 60 * 1000,
    fetch: fetchJobicy,
    parse: parseJobicy,
  },
  {
    id: "arbeitnow",
    label: "Arbeitnow",
    priority: 10,
    ttl: 60 * 60 * 1000,
    fetch: fetchArbeitnow,
    parse: parseArbeitnow,
  },
];
function providerCacheKey(provider, preferences) {
  return `${provider.id}:${norm(preferences.role)}:${normalizeLocation(preferences.location)}`;
}
async function loadProvider(provider, preferences, cache, refresh) {
  const key = providerCacheKey(provider, preferences),
    entry = cache[key];
  if (
    !refresh &&
    entry?.failed &&
    Date.now() - entry.savedAt < Math.min(provider.ttl, 5 * 60 * 1000)
  )
    return { provider, raw: [], cached: true, cacheKey: key, failed: true };
  if (
    !refresh &&
    entry &&
    Date.now() - entry.savedAt < provider.ttl &&
    Array.isArray(entry.raw)
  ) {
    return { provider, raw: entry.raw, cached: true, cacheKey: key };
  }
  try {
    const raw = await provider.fetch(preferences);
    return { provider, raw, cached: false, cacheKey: key, stale: false };
  } catch (error) {
    if (entry && Array.isArray(entry.raw))
      return {
        provider,
        raw: entry.raw,
        cached: true,
        cacheKey: key,
        stale: true,
      };
    return {
      provider,
      raw: [],
      cached: false,
      cacheKey: key,
      failed: true,
      error: error?.message || "provider_failed",
    };
  }
}
function parseAIJobMatches(value, fallbackJobs = []) {
  const content = Array.isArray(value)
      ? value.map((part) => part?.text || part?.content || "").join("")
      : String(value || ""),
    cleaned = content
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .trim(),
    candidates = [cleaned];
  const objectStart = cleaned.indexOf("{"),
    objectEnd = cleaned.lastIndexOf("}"),
    arrayStart = cleaned.indexOf("["),
    arrayEnd = cleaned.lastIndexOf("]");
  if (objectStart >= 0 && objectEnd > objectStart)
    candidates.push(cleaned.slice(objectStart, objectEnd + 1));
  if (arrayStart >= 0 && arrayEnd > arrayStart)
    candidates.push(cleaned.slice(arrayStart, arrayEnd + 1));
  let parsed;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {}
  }
  if (!parsed) return [];
  let matches = Array.isArray(parsed)
    ? parsed
    : parsed.matches ||
      parsed.jobs ||
      parsed.results ||
      (parsed.matchScore != null || parsed.score != null ? [parsed] : []);
  if (!Array.isArray(matches)) return [];
  return matches
    .map((match, index) => {
      const score = Number(match.matchScore ?? match.score),
        toList = (entry) =>
          Array.isArray(entry)
            ? entry.map(plain).filter(Boolean)
            : typeof entry === "string"
              ? entry
                  .split(/[,;\n]/)
                  .map(plain)
                  .filter(Boolean)
              : [];
      if (!Number.isFinite(score)) return null;
      return {
        id: String(
          match.id || (matches.length === 1 ? fallbackJobs[0]?.id || "" : ""),
        ),
        score: Math.max(0, Math.min(100, score)),
        matchedSkills: toList(match.matchedSkills),
        missingSkills: toList(match.missingSkills),
        matchReasons: toList(
          match.matchReasons || match.reasons || match.explanation,
        ),
        index,
      };
    })
    .filter((match) => match?.id);
}
async function aiJobMatch(jobs, context, x) {
  let key = cleanApiKey(x.settings.apiKey);
  if (!key) throw Error("ai_not_configured");
  let safe = {
      roles: context.roles,
      skills: context.skills,
      education: context.education,
      graduationYear: context.graduationYear,
      experience: context.experience,
      locations: context.locations,
      workMode: context.workMode,
      technologies: context.technologies,
      resumeKeywords: context.resumeKeywords.slice(0, 3000),
    },
    payload = jobs.slice(0, 12).map((j) => ({
      id: j.id,
      title: j.title,
      location: j.location,
      description: j.description.slice(0, 800),
    })),
    prompt = `Return valid JSON only. No markdown and no prose. Compare only the supplied real jobs with the non-sensitive candidate context. Shape: {"matches":[{"id":"exact supplied id","matchScore":0,"matchedSkills":[],"missingSkills":[],"matchReasons":[]}]}. Scores must be integers 0-100. Context: ${JSON.stringify(safe)} Jobs: ${JSON.stringify(payload)}`,
    controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  let r;
  try {
    r = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: x.settings.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 1200,
        stream: false,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 240);
    console.warn("SmartForm AI job matching unavailable", {
      status: r.status,
      detail,
    });
    throw Error("ai_unavailable");
  }
  const body = await r.json(),
    raw = body.choices?.[0]?.message?.content,
    parsed = parseAIJobMatches(raw, jobs);
  if (!parsed.length) {
    console.warn(
      "SmartForm AI job matching returned no valid structured matches",
      { contentPreview: String(raw || "").slice(0, 240) },
    );
    throw Error("ai_unavailable");
  }
  let byId = new Map(parsed.map((v) => [String(v.id), v]));
  return jobs.map((j) => {
    let m = byId.get(String(j.id));
    return m
      ? {
          ...j,
          matchScore: m.score,
          matchedSkills: m.matchedSkills.length
            ? m.matchedSkills
            : j.matchedSkills,
          missingSkills: m.missingSkills.length
            ? m.missingSkills
            : j.missingSkills,
          matchReasons: m.matchReasons.length ? m.matchReasons : j.matchReasons,
          matchExplanation: (m.matchReasons.length
            ? m.matchReasons
            : j.matchReasons
          ).join(" "),
          aiMatched: true,
        }
      : j;
  });
}
async function enhanceJobsWithAI() {
  const x = await data(),
    context = safeContext(x, x.jobPreferences || {}),
    candidates = (x.jobs || [])
      .filter((job) => !job.hidden && job.status !== "irrelevant")
      .sort(
        (a, b) =>
          (b.finalRanking || b.matchScore || 0) -
          (a.finalRanking || a.matchScore || 0),
      )
      .slice(0, 12);
  if (!cleanApiKey(x.settings.apiKey) || !candidates.length)
    return { ok: false, unavailable: true };
  try {
    const enhanced = await aiJobMatch(candidates, context, x),
      byId = new Map(enhanced.map((job) => [job.id, addRanking(job)])),
      jobs = (x.jobs || []).map((job) => byId.get(job.id) || job);
    await set({ jobs });
    return {
      ok: true,
      enhanced: enhanced.filter((job) => job.aiMatched).length,
    };
  } catch (error) {
    console.warn(
      "SmartForm AI enhancement fell back to local matching",
      error?.message || error,
    );
    return { ok: false, unavailable: true };
  }
}
async function findJobsLegacy(preferences = {}) {
  let x = await data(),
    context = safeContext(x, preferences),
    now = new Date().toISOString(),
    rawJobs = [],
    nextUrl = "https://www.arbeitnow.com/api/job-board-api",
    pages = 0;
  while (nextUrl && pages < 3) {
    let response;
    try {
      response = await fetch(nextUrl);
    } catch {
      throw Error(
        "Unable to reach the job provider. Check your connection and retry.",
      );
    }
    if (response.status === 429)
      throw Error(
        "The job provider rate limit was reached. Please wait and retry.",
      );
    if (!response.ok)
      throw Error(`Job provider request failed (${response.status}).`);
    let body;
    try {
      body = await response.json();
    } catch {
      throw Error("The job provider returned an unreadable response.");
    }
    if (!Array.isArray(body.data))
      throw Error(
        "The job provider returned an unexpected response structure.",
      );
    rawJobs.push(...body.data);
    pages += 1;
    const candidate = body.links?.next || body.meta?.next_page_url || "";
    nextUrl =
      candidate && candidate !== nextUrl
        ? new URL(candidate, "https://www.arbeitnow.com").toString()
        : "";
  }
  const seen = new Map(
    (x.jobs || []).map((j) => [
      j.normalizedUrl || normalizedJobUrl(j.applicationUrl || j.url),
      j,
    ]),
  );
  let incoming = rawJobs
    .map((raw) => {
      const key = normalizedJobUrl(raw?.url || raw?.application_url);
      return parseArbeitnow(
        raw || {},
        seen.get(key),
        context,
        preferences,
        now,
      );
    })
    .filter(Boolean);
  const freshUrls = new Set();
  incoming = incoming.filter(
    (job) =>
      !freshUrls.has(job.normalizedUrl) && freshUrls.add(job.normalizedUrl),
  );
  let merged = new Map(
    (x.jobs || []).map((j) => [
      j.normalizedUrl || normalizedJobUrl(j.applicationUrl || j.url),
      j,
    ]),
  );
  incoming.forEach((j) => {
    let old = merged.get(j.normalizedUrl);
    merged.set(
      j.normalizedUrl,
      old
        ? {
            ...j,
            status: old.status,
            hidden: old.hidden,
            notes: old.notes,
            openedAt: old.openedAt,
          }
        : j,
    );
  });
  let jobs = [...merged.values()].slice(0, 750),
    jobSearchMeta = {
      searched: true,
      fetchedCount: rawJobs.length,
      normalizedCount: incoming.length,
      malformedCount: rawJobs.length - incoming.length,
      searchedAt: now,
      provider: "Arbeitnow",
    };
  await set({ jobs, jobPreferences: preferences, jobSearchMeta });
  let visible = incoming.filter((j) => j.status !== "irrelevant" && !j.hidden),
    aiError = "";
  if (preferences.useAi && x.settings.apiKey) {
    try {
      let scored = await aiJobMatch(visible, context, x),
        scores = new Map(scored.map((j) => [j.id, j]));
      jobs = jobs.map((j) => scores.get(j.id) || j);
      visible = visible.map((j) => scores.get(j.id) || j);
      await set({ jobs });
    } catch (e) {
      aiError = e.message;
    }
  }
  return {
    jobs: visible,
    provider: "Arbeitnow",
    fetchedCount: rawJobs.length,
    normalizedCount: incoming.length,
    aiConfigured: Boolean(x.settings.apiKey),
    aiError,
  };
}
async function findJobs(preferences = {}) {
  const x = await data(),
    context = safeContext(x, preferences),
    now = new Date().toISOString(),
    enabled = JOB_PROVIDERS.filter(
      (provider) => preferences.sources?.[provider.id] !== false,
    ),
    settled = await Promise.allSettled(
      enabled.map((provider) =>
        loadProvider(
          provider,
          preferences,
          x.jobProviderCache || {},
          Boolean(preferences.refresh),
        ),
      ),
    ),
    completed = settled
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value),
    successes = completed.filter((result) => !result.failed),
    providerErrors = settled.flatMap((result, index) =>
      result.status === "rejected"
        ? [enabled[index].label]
        : result.value.failed
          ? [result.value.provider.label]
          : [],
    );
  if (!successes.length)
    throw Error(
      "Unable to reach any enabled job source. Cached and saved jobs are still available.",
    );
  const jobProviderCache = { ...(x.jobProviderCache || {}) };
  completed.forEach((result) => {
    if (!result.cached)
      jobProviderCache[result.cacheKey] = {
        raw: result.raw,
        failed: Boolean(result.failed),
        savedAt: Date.now(),
      };
  });
  const oldJobs = x.jobs || [],
    oldByUrl = new Map(
      oldJobs.map((job) => [
        job.normalizedUrl || normalizedJobUrl(job.applicationUrl || job.url),
        job,
      ]),
    );
  let fetchedCount = 0,
    malformedCount = 0,
    normalized = [];
  successes.forEach(({ provider, raw }) => {
    fetchedCount += raw.length;
    raw.forEach((entry) => {
      let candidate = provider.parse(
        entry || {},
        null,
        context,
        preferences,
        now,
      );
      if (!candidate) {
        malformedCount += 1;
        return;
      }
      const previous = oldByUrl.get(candidate.normalizedUrl);
      if (previous)
        candidate = provider.parse(
          entry || {},
          previous,
          context,
          preferences,
          now,
        );
      const eligibility = locationEligibility(
        candidate,
        preferences.location || "",
      );
      candidate = addRanking({
        ...candidate,
        locationEligible: eligibility.eligible,
        locationConfidence: eligibility.confidence,
        country: eligibility.country || candidate.country,
      });
      normalized.push(candidate);
    });
  });
  const locationCompatible = normalized.filter((job) => job.locationEligible),
    fingerprint = (job) =>
      `${norm(job.company)
        .replace(
          /\b(ltd|limited|inc|corp|corporation|technologies|technology)\b/g,
          "",
        )
        .trim()}|${norm(job.title)
        .replace(/\b(sr|senior|jr|junior)\b/g, "")
        .trim()}|${normalizeLocation(job.location)
        .replace(/,? india\b/g, "")
        .trim()}`,
    roleFingerprint = (job) =>
      fingerprint(job).split("|").slice(0, 2).join("|"),
    descriptionSimilarity = (a, b) => {
      const left = new Set(words(a.description || "")),
        right = new Set(words(b.description || ""));
      if (!left.size || !right.size) return 0;
      const overlap = [...left].filter((word) => right.has(word)).length;
      return overlap / Math.min(left.size, right.size);
    },
    prefer = (a, b) => {
      const aValue =
          (a.directApplication ? 1000 : 0) + Number(a.providerQuality || 0),
        bValue =
          (b.directApplication ? 1000 : 0) + Number(b.providerQuality || 0),
        best = bValue > aValue ? b : a,
        other = best === a ? b : a;
      return addRanking({
        ...other,
        ...best,
        fullDescription:
          (best.fullDescription || "").length >=
          (other.fullDescription || "").length
            ? best.fullDescription
            : other.fullDescription,
        description:
          (best.description || "").length >= (other.description || "").length
            ? best.description
            : other.description,
        skills: [...new Set([...(best.skills || []), ...(other.skills || [])])],
        matchedSkills: [
          ...new Set([
            ...(best.matchedSkills || []),
            ...(other.matchedSkills || []),
          ]),
        ],
        sources: [
          ...new Set([
            ...(a.sources || [a.provider]),
            ...(b.sources || [b.provider]),
          ]),
        ],
      });
    },
    unique = [],
    urlIndex = new Map(),
    fingerprintIndex = new Map();
  locationCompatible
    .sort((a, b) => (b.providerQuality || 0) - (a.providerQuality || 0))
    .forEach((job) => {
      const fp = fingerprint(job);
      let index = urlIndex.get(job.normalizedUrl) ?? fingerprintIndex.get(fp);
      if (index == null)
        index = unique.findIndex(
          (other) =>
            roleFingerprint(other) === roleFingerprint(job) &&
            descriptionSimilarity(other, job) >= 0.68,
        );
      if (index === -1) index = undefined;
      if (index == null) {
        const next = unique.push({ ...job, sources: [job.provider] }) - 1;
        urlIndex.set(job.normalizedUrl, next);
        fingerprintIndex.set(fp, next);
      } else {
        unique[index] = prefer(unique[index], job);
        urlIndex.set(unique[index].normalizedUrl, index);
        fingerprintIndex.set(fp, index);
      }
    });
  const oldByFingerprint = new Map(
    oldJobs.map((job) => [fingerprint(job), job]),
  );
  const withWorkflow = unique.map((job) => {
    const old =
      oldByUrl.get(job.normalizedUrl) || oldByFingerprint.get(fingerprint(job));
    return old
      ? {
          ...job,
          discoveredAt: old.discoveredAt || job.discoveredAt,
          status: old.status || job.status,
          openedAt: old.openedAt || "",
          appliedAt: old.appliedAt || "",
          notes: old.notes || "",
          hidden: Boolean(old.hidden),
          resume: old.resume || job.resume,
        }
      : job;
  });
  const currentFingerprints = new Set(withWorkflow.map(fingerprint)),
    currentUrls = new Set(withWorkflow.map((job) => job.normalizedUrl)),
    retained = oldJobs.filter(
      (job) =>
        !currentUrls.has(job.normalizedUrl) &&
        !currentFingerprints.has(fingerprint(job)) &&
        (job.status === "saved" ||
          [
            "applied",
            "assessment",
            "interview",
            "offer",
            "rejected",
            "withdrawn",
          ].includes(job.status) ||
          job.hidden),
    );
  const jobs = [...withWorkflow, ...retained]
      .sort(
        (a, b) =>
          (b.finalRanking || b.matchScore || 0) -
          (a.finalRanking || a.matchScore || 0),
      )
      .slice(0, 1000),
    providerCounts = {};
  withWorkflow.forEach((job) => {
    providerCounts[job.providerId] = (providerCounts[job.providerId] || 0) + 1;
  });
  const jobSearchMeta = {
    searched: true,
    fetchedCount,
    normalizedCount: normalized.length,
    locationCompatibleCount: locationCompatible.length,
    uniqueCount: withWorkflow.length,
    malformedCount,
    providerCounts,
    sourceCount: Object.keys(providerCounts).length,
    providerErrors,
    cachedProviders: successes
      .filter((result) => result.cached)
      .map((result) => result.provider.id),
    staleProviders: successes
      .filter((result) => result.stale)
      .map((result) => result.provider.label),
    searchedAt: now,
  };
  const prunedProviderCache = Object.fromEntries(
    Object.entries(jobProviderCache)
      .sort((a, b) => Number(b[1].savedAt || 0) - Number(a[1].savedAt || 0))
      .slice(0, 12),
  );
  await set({
    jobs,
    jobPreferences: { ...preferences, refresh: false },
    jobSearchMeta,
    jobProviderCache: prunedProviderCache,
  });
  return {
    jobs: withWorkflow.filter(
      (job) => !job.hidden && job.status !== "irrelevant",
    ),
    fetchedCount,
    normalizedCount: normalized.length,
    locationCompatibleCount: locationCompatible.length,
    uniqueCount: withWorkflow.length,
    providerCounts,
    sourceCount: Object.keys(providerCounts).length,
    providerErrors,
    cachedProviders: jobSearchMeta.cachedProviders,
    staleProviders: jobSearchMeta.staleProviders,
    aiConfigured: Boolean(x.settings.apiKey),
  };
}
async function updateJob(message) {
  let x = await data(),
    key = normalizedJobUrl(message.url),
    jobs = (x.jobs || []).map((j) =>
      j.normalizedUrl === key
        ? { ...j, ...message.patch, updatedAt: new Date().toISOString() }
        : j,
    ),
    job = jobs.find((j) => j.normalizedUrl === key);
  await set({ jobs });
  if (message.open && job) {
    await chrome.tabs.create({ url: job.applicationUrl || job.url });
    return { ok: true, job };
  }
  return { ok: Boolean(job), job };
}
chrome.runtime.onMessage.addListener((m, s, reply) => {
  if (m.type !== "historyRecord" && m.type !== "deleteHistory") return;
  data()
    .then(async (x) => {
      let history =
        m.type === "historyRecord"
          ? [historyItem(m.record), ...x.history].slice(0, 100)
          : x.history.filter((_, i) => i !== m.index);
      await set({ history });
      reply({ ok: true });
    })
    .catch((e) => reply({ ok: false, error: e.message }));
  return true;
});
chrome.runtime.onMessage.addListener((m, s, reply) => {
  (async () => {
    if (m.type === "dashboard")
      return reply({ url: chrome.runtime.getURL("dashboard.html") });
    if (m.type === "getData") return reply(await dashboardData());
    if (m.type === "saveProfile") {
      await set({
        profile: m.profile || {},
        sensitiveKeys: m.sensitiveKeys || [],
      });
      return reply({ ok: true });
    }
    if (m.type === "saveEducation") {
      await set({ education: m.education || {} });
      return reply({ ok: true });
    }
    if (m.type === "saveDocuments") {
      await set({ documents: m.documents || [] });
      return reply({ ok: true });
    }
    if (m.type === "saveSettings") {
      let x = await data(),
        next = cleanSettings({
          ...x.settings,
          ...m.settings,
          apiKey: m.settings.apiKey || x.settings.apiKey,
        });
      delete next.apiKeyConfigured;
      await set({ settings: next });
      return reply({ ok: true, apiKeyConfigured: Boolean(next.apiKey) });
    }
    if (m.type === "match")
      return reply({ ok: true, data: await match(m.fields) });
    if (m.type === "generate")
      return reply({
        ok: true,
        data: await generate(m.question, m.pageContext),
      });
    if (m.type === "history") {
      let x = await data(),
        history = [
          {
            domain: m.domain,
            fields: m.fields,
            aiFields: m.aiFields,
            createdAt: new Date().toISOString(),
          },
          ...x.history,
        ].slice(0, 100);
      await set({ history });
      return reply({ ok: true });
    }
    if (m.type === "clearHistory") {
      await set({ history: [] });
      return reply({ ok: true });
    }
    if (m.type === "findJobs")
      return reply({ ok: true, ...(await findJobs(m.preferences || {})) });
    if (m.type === "enhanceJobs") return reply(await enhanceJobsWithAI());
    if (m.type === "updateJob") return reply(await updateJob(m));
    if (m.type === "getJobs") {
      let x = await data();
      return reply({
        ok: true,
        jobs: x.jobs || [],
        preferences: x.jobPreferences || {},
        searchMeta: x.jobSearchMeta || {
          searched: false,
          fetchedCount: 0,
          normalizedCount: 0,
        },
        aiConfigured: Boolean(x.settings.apiKey),
      });
    }
  })().catch((e) => reply({ ok: false, error: e.message }));
  return true;
});
