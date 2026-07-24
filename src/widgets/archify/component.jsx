import Container from "components/services/widget/container";
import { useEffect, useState } from "react";

const STATE_LABEL = { ok: "ok", stale: "stale", failed: "failed", missing: "—" };

export default function Component({ service }) {
  const id = service.name ?? service.title;
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try { setStatus(await (await fetch(`/api/archify/${id}/status`)).json()); } catch {}
  }
  useEffect(() => { refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t); }, []);

  async function regenerate() {
    setBusy(true);
    try {
      const { jobId } = await (await fetch(`/api/archify/${id}/regenerate`, { method: "POST" })).json();
      const poll = async () => {
        const j = await (await fetch(`/api/archify/jobs/${jobId}`)).json();
        if (j.status === "running" || j.status === "queued") setTimeout(poll, 1500);
        else { setBusy(false); refresh(); }
      };
      poll();
    } catch { setBusy(false); }
  }

  const state = status?.renderState ?? "missing";
  const color = state === "ok" ? "text-emerald-500" : state === "stale" ? "text-amber-500" : state === "failed" ? "text-rose-500" : "text-gray-500";

  return (
    <Container service={service}>
      <div className="flex items-center gap-2 text-xs">
        <button className={`pointer-events-auto font-mono ${color}`} onClick={() => setOpen(true)} title="view diagram">
          ◈ archify · {STATE_LABEL[state]}
        </button>
        <button className="pointer-events-auto font-mono text-theme-500 hover:text-amber-500" onClick={regenerate} disabled={busy} title="regenerate">
          {busy ? "…" : "↻"}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setOpen(false)}>
          <div className="relative h-[85vh] w-[90vw] rounded-lg border border-theme-500/40 bg-black" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-2 top-2 z-10 rounded border border-theme-500/40 px-2 text-sm" onClick={() => setOpen(false)}>×</button>
            <iframe src={`/api/archify/${id}`} title="archify" className="h-full w-full rounded-lg" />
          </div>
        </div>
      )}
    </Container>
  );
}
