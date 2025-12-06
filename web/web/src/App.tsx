import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type Mode = "chat" | "summarize" | "classify";
type Msg = { role: "user" | "bot"; text: string; ts: number };

const API = "/api";

export default function App() {
  const [mode, setMode] = useState<Mode>("chat");
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      const raw = localStorage.getItem("msgs");
      return raw ? (JSON.parse(raw) as Msg[]) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem("msgs", JSON.stringify(msgs.slice(-200)));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const placeholder = useMemo(() => {
    if (mode === "chat") return "Napisz wiadomość… (Enter wysyła, Shift+Enter nowa linia)";
    if (mode === "summarize") return "Wklej tekst do streszczenia…";
    return "Wklej opis / ticket / wiadomość do klasyfikacji…";
  }, [mode]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  function clear() {
    setMsgs([]);
    setError("");
    localStorage.removeItem("msgs");
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setError("");
    setLoading(true);
    setInput("");

    setMsgs((m) => [...m, { role: "user", text: `[${mode}] ${text}`, ts: Date.now() }]);

    try {
      let url = "";
      let body: any = {};

      if (mode === "chat") {
        url = `${API}/chat`;
        body = { prompt: text };
      } else if (mode === "summarize") {
        url = `${API}/summarize`;
        body = { text };
      } else {
        url = `${API}/classify`;
        body = { text };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      const data = await res.json();

      let out = "";
      if (mode === "chat") out = data.answer ?? JSON.stringify(data);
      if (mode === "summarize") out = data.summary ?? JSON.stringify(data);
      if (mode === "classify") out = data.label ?? JSON.stringify(data);

      setMsgs((m) => [...m, { role: "bot", text: out, ts: Date.now() }]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <div className="title">Local LLM Demo</div>
          <div className="subtitle">React (Vite) → FastAPI → Ollama (Llama3)</div>
        </div>

        <div className="actions">
          <select
            className="select"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            disabled={loading}
            title="Tryb działania"
          >
            <option value="chat">Chat</option>
            <option value="summarize">Summarize</option>
            <option value="classify">Classify</option>
          </select>

          <a className="link" href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">
            Swagger
          </a>

          <button className="btn ghost" onClick={clear}>
            Clear
          </button>
        </div>
      </header>

      <main className="card">
        <div className="chat">
          {msgs.length === 0 ? (
            <div className="empty">Wybierz tryb i wyślij wiadomość.</div>
          ) : (
            msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="meta">{m.role === "user" ? "You" : "Model"}</div>
                <div className="bubble">{m.text}</div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {error && <div className="error">Error: {error}</div>}

        <div className="composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={loading}
          />
          <button className="btn" onClick={() => void send()} disabled={!canSend}>
            {loading ? "..." : "Send"}
          </button>
        </div>
      </main>

      <footer className="footer">
        Tip: sprawdź <code>/metrics</code> na backendzie (latency + request count).
      </footer>
    </div>
  );
}
