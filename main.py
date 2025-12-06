from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# =========================
# Config
# =========================
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
OLLAMA_MODEL = "llama3:latest"
OLLAMA_TIMEOUT = 180

# Demo rate limit (na localhost w zupełności starczy)
WINDOW_S = 60
MAX_REQ_PER_WINDOW = 60

# =========================
# App
# =========================
app = FastAPI(title="Local LLM API (FastAPI + Ollama)", version="1.1")

# Jeśli korzystasz z Vite dev server (5173), to to ułatwia życie (albo użyj proxy).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# Simple Observability
# =========================
counts: Dict[str, int] = defaultdict(int)
lat_ms: Deque[float] = deque(maxlen=500)

def p95(values):
    if not values:
        return 0.0
    s = sorted(values)
    idx = int(0.95 * (len(s) - 1))
    return float(s[idx])

# =========================
# Simple Rate Limiter
# =========================
_bucket: Dict[str, Tuple[float, int]] = {}

@app.middleware("http")
async def rate_limit_and_metrics(request: Request, call_next):
    # ---- rate limit ----
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    ws, cnt = _bucket.get(ip, (now, 0))
    if now - ws > WINDOW_S:
        ws, cnt = now, 0
    cnt += 1
    _bucket[ip] = (ws, cnt)
    if cnt > MAX_REQ_PER_WINDOW:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    # ---- metrics ----
    start = time.time()
    response = await call_next(request)
    took = (time.time() - start) * 1000.0
    counts[request.url.path] += 1
    lat_ms.append(took)
    return response


# =========================
# Models
# =========================
class ChatReq(BaseModel):
    prompt: str

class TextReq(BaseModel):
    text: str


# =========================
# Ollama client
# =========================
def ollama_generate(prompt: str) -> str:
    r = requests.post(
        OLLAMA_URL,
        json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
        timeout=OLLAMA_TIMEOUT,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Ollama error {r.status_code}: {r.text}")
    return r.json().get("response", "")


# =========================
# Endpoints
# =========================
@app.get("/health")
def health():
    return {
        "ok": True,
        "model": OLLAMA_MODEL,
        "ollama_url": OLLAMA_URL,
    }

@app.get("/metrics")
def metrics():
    values = list(lat_ms)
    avg = float(sum(values) / len(values)) if values else 0.0
    return {
        "requests": dict(counts),
        "latency_ms": {
            "avg": avg,
            "p95": p95(values),
            "samples": len(values),
        },
        "rate_limit": {"window_s": WINDOW_S, "max_req": MAX_REQ_PER_WINDOW},
    }

@app.post("/chat")
def chat(req: ChatReq):
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt required")
    answer = ollama_generate(prompt)
    return {"answer": answer, "model": OLLAMA_MODEL}

@app.post("/summarize")
def summarize(req: TextReq):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text required")
    prompt = (
        "Summarize the text in 5 concise bullet points.\n"
        "Keep it factual.\n\n"
        f"TEXT:\n{text}"
    )
    summary = ollama_generate(prompt)
    return {"summary": summary, "model": OLLAMA_MODEL}

@app.post("/classify")
def classify(req: TextReq):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text required")
    prompt = (
        "Classify the text into ONE label: BUG, FEATURE, QUESTION, OTHER.\n"
        "Return ONLY the label.\n\n"
        f"TEXT:\n{text}"
    )
    label = ollama_generate(prompt).strip().splitlines()[0].strip()
    # sanity
    if label not in {"BUG", "FEATURE", "QUESTION", "OTHER"}:
        label = "OTHER"
    return {"label": label, "model": OLLAMA_MODEL}
