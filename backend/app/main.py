import hashlib, json, os, re, sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from cryptography.fernet import Fernet
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "smartform.db"
SENSITIVE = {"aadhaar", "pan", "passport", "voter_id", "government_id", "password", "card"}
ALIASES = {
    "first_name": ["first name", "given name", "forename"], "last_name": ["last name", "family name", "surname"],
    "full_name": ["full name", "candidate name", "applicant name", "name"], "email": ["email", "email address", "gmail id"],
    "phone": ["phone", "mobile", "contact number", "telephone"], "institution": ["college", "university", "institution", "institute"],
    "degree": ["degree", "qualification"], "branch": ["branch", "specialization", "major"], "cgpa": ["cgpa", "gpa"],
    "roll_number": ["roll number", "student id"], "enrollment_number": ["enrollment", "registration number", "university id"],
    "linkedin": ["linkedin"], "github": ["github"], "portfolio": ["portfolio", "personal website"], "address": ["address", "street"],
    "city": ["city"], "state": ["state"], "country": ["country"], "pin_code": ["pin code", "postal code", "zipcode"],
}

def init_db():
    with sqlite3.connect(DB) as con:
        con.execute("CREATE TABLE IF NOT EXISTS vault (key TEXT PRIMARY KEY, value TEXT NOT NULL, sensitive INTEGER DEFAULT 0)")
        con.execute("CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, domain TEXT, created_at TEXT, fields INTEGER, ai_fields INTEGER)")
        con.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")

def cipher():
    raw = os.getenv("SMARTFORM_SECRET", "smartform-development-secret-change-me")
    return Fernet(__import__('base64').urlsafe_b64encode(hashlib.sha256(raw.encode()).digest()))

def encode(value: Any) -> str: return cipher().encrypt(json.dumps(value).encode()).decode()
def decode(value: str) -> Any: return json.loads(cipher().decrypt(value.encode()).decode())
def normalized(text: str) -> str: return re.sub(r"[^a-z0-9 ]", " ", text.lower()).strip()

class Profile(BaseModel): values: dict[str, Any] = Field(default_factory=dict); sensitive_keys: list[str] = Field(default_factory=list)
class FieldIn(BaseModel): id: str; text: str; type: str = "text"; options: list[str] = []
class MatchRequest(BaseModel): fields: list[FieldIn]; include_sensitive: bool = False
class GenerateRequest(BaseModel): question: str; page_context: str = ""; max_words: int = 150
class HistoryIn(BaseModel): domain: str; fields: int = 0; ai_fields: int = 0
class AISettings(BaseModel): api_key: str = ""; model: str = "nvidia/nemotron-3-super-120b-a12b"; base_url: str = "https://integrate.api.nvidia.com/v1"

app = FastAPI(title="SmartForm Local Agent")
app.add_middleware(CORSMiddleware, allow_origin_regex=r"(http://localhost:5173|chrome-extension://.*)", allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup(): init_db()

# Makes the module safe to use from scripts and test clients as well as Uvicorn.
init_db()

def vault():
    with sqlite3.connect(DB) as con:
        return {key: (decode(value), bool(sensitive)) for key, value, sensitive in con.execute("SELECT key,value,sensitive FROM vault")}

def setting(key: str, fallback: str = "") -> str:
    with sqlite3.connect(DB) as con:
        row = con.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return decode(row[0]) if row else fallback

@app.get("/health")
def health(): return {"ok": True, "ai_configured": bool(setting("nvidia_api_key", os.getenv("NVIDIA_API_KEY", "")))}

@app.get("/settings/ai")
def get_ai_settings():
    key = setting("nvidia_api_key", os.getenv("NVIDIA_API_KEY", ""))
    return {"api_key_configured": bool(key), "api_key_masked": ("•" * 12 + key[-4:]) if key else "", "model": setting("nvidia_model", os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b")), "base_url": setting("nvidia_base_url", os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"))}

@app.put("/settings/ai")
def put_ai_settings(settings: AISettings):
    if settings.api_key and len(settings.api_key) < 12: raise HTTPException(422, "The NVIDIA API key looks too short")
    values = {"nvidia_model": settings.model.strip(), "nvidia_base_url": settings.base_url.rstrip("/")}
    if settings.api_key: values["nvidia_api_key"] = settings.api_key.strip()
    with sqlite3.connect(DB) as con:
        for key, value in values.items(): con.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)", (key, encode(value)))
    return {"saved": True, "api_key_configured": bool(settings.api_key or setting("nvidia_api_key", os.getenv("NVIDIA_API_KEY", "")))}

@app.get("/profile")
def get_profile():
    data = vault(); return {"values": {k:v[0] for k,v in data.items()}, "sensitive_keys": [k for k,v in data.items() if v[1]]}

@app.put("/profile")
def put_profile(profile: Profile):
    protected = set(profile.sensitive_keys) | SENSITIVE
    with sqlite3.connect(DB) as con:
        con.execute("DELETE FROM vault")
        con.executemany("INSERT INTO vault(key,value,sensitive) VALUES(?,?,?)", [(k, encode(v), int(k in protected)) for k,v in profile.values.items() if v not in (None, "")])
    return {"saved": len(profile.values)}

@app.post("/match")
def match(request: MatchRequest):
    data = vault(); results = []
    for field in request.fields:
        text = normalized(field.text); best = None
        for key, aliases in ALIASES.items():
            score = max((len(a) for a in aliases if a in text), default=0)
            if score and key in data: best = (score, key)
        if best:
            key = best[1]; value, sensitive = data[key]
            if not sensitive or request.include_sensitive: results.append({"id": field.id, "key": key, "value": value, "sensitive": sensitive})
    return {"matches": results}

@app.post("/generate")
async def generate(request: GenerateRequest):
    data = vault()
    safe = {k:v for k,(v,is_sensitive) in data.items() if not is_sensitive and k not in SENSITIVE}
    q = normalized(request.question)
    ranked = sorted(safe.items(), key=lambda kv: sum(token in normalized(kv[0] + " " + str(kv[1])) for token in q.split()), reverse=True)[:8]
    context = "\n".join(f"{k}: {str(v)[:800]}" for k,v in ranked if v)
    key = setting("nvidia_api_key", os.getenv("NVIDIA_API_KEY", ""))
    if not key:
        return {"answer": context[:1200] or "No relevant non-sensitive information is stored yet.", "source": "local-draft", "sent_to_ai": False}
    prompt = f"Answer this application-form question in at most {request.max_words} words. Use only the supplied profile context. Never invent facts.\nQuestion: {request.question}\nPage context: {request.page_context[:1500]}\nProfile context:\n{context}"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(f"{setting('nvidia_base_url', os.getenv('NVIDIA_BASE_URL','https://integrate.api.nvidia.com/v1'))}/chat/completions", headers={"Authorization": f"Bearer {key}"}, json={"model": setting("nvidia_model", os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b")), "messages":[{"role":"user","content":prompt}], "temperature":0.3, "max_tokens":500})
            response.raise_for_status(); answer = response.json()["choices"][0]["message"]["content"]
        return {"answer": answer, "source": "nvidia", "sent_to_ai": True}
    except Exception as exc: raise HTTPException(503, "AI unavailable; direct filling remains available") from exc

@app.get("/history")
def history():
    with sqlite3.connect(DB) as con: rows = con.execute("SELECT id,domain,created_at,fields,ai_fields FROM history ORDER BY id DESC LIMIT 100").fetchall()
    return [{"id":r[0],"domain":r[1],"created_at":r[2],"fields":r[3],"ai_fields":r[4]} for r in rows]
@app.post("/history")
def add_history(item: HistoryIn):
    with sqlite3.connect(DB) as con: con.execute("INSERT INTO history(domain,created_at,fields,ai_fields) VALUES(?,?,?,?)", (item.domain, datetime.now(timezone.utc).isoformat(), item.fields, item.ai_fields))
    return {"ok":True}
@app.delete("/history")
def clear_history():
    with sqlite3.connect(DB) as con: con.execute("DELETE FROM history")
    return {"ok":True}
