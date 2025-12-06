# fastapi-ollama-react — Local LLM Web App

Local web app that connects a React UI to a FastAPI backend, which calls a local LLM served by **Ollama** (tested with `llama3:latest`).

## Features
- **FastAPI REST API**:
  - `POST /chat` — chat endpoint
  - `POST /summarize` — summarize text (5 bullet points)
  - `POST /classify` — classify text into `BUG | FEATURE | QUESTION | OTHER`
  - `GET /health` — healthcheck + model info
  - `GET /metrics` — simple request counts + latency (avg, p95)
- **React (Vite) UI**
  - mode switch: Chat / Summarize / Classify
  - message history + loading/error states
- Basic API hardening: **rate limiting** (in-memory)

## Tech Stack
- Backend: Python, FastAPI, Uvicorn, Requests
- LLM runtime: Ollama
- Frontend: React, Vite, TypeScript

---

## Prerequisites
- Python 3.9+
- Node.js 18+
- Ollama installed: https://ollama.com
- Download a model (example):
  ```bash
  ollama pull llama3
