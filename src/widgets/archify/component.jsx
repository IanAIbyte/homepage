import Container from "components/services/widget/container";
import { useEffect, useRef, useState } from "react";

const STATE_LABEL = { ok: "ok", stale: "stale", failed: "failed", missing: "—" };

function busyLabel(job) {
  if (job?.stage === "analyzing") return "分析中";
  if (job?.stage === "rendering") return "渲染中";
  return "生成中";
}

export default function Component({ service }) {
  const id = service.name ?? service.title;
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);
  const mountedRef = useRef(true);
  const pollTimer = useRef(null);

  async function refresh() {
    try {
      setStatus(await (await fetch(`/api/archify/${id}/status`)).json());
    } catch {}
  }

  // Poll a regenerate job to completion: update busy/job while running, then
  // clear busy + refresh status when done/failed. Shared by regenerate() and
  // the on-mount re-attach (so a page refresh resumes the in-flight job).
  function pollJob(jobId) {
    let attempts = 0;
    const MAX_ATTEMPTS = 620; // ~15 min at 1.5s, matching the server analyzer timeout
    const poll = async () => {
      try {
        const j = await (await fetch(`/api/archify/jobs/${jobId}`)).json();
        if (!mountedRef.current) return;
        setJob(j);
        if ((j.status === "running" || j.status === "queued") && attempts++ < MAX_ATTEMPTS) {
          pollTimer.current = setTimeout(poll, 1500);
        } else {
          setBusy(false);
          setJob(null);
          refresh();
        }
      } catch {
        if (mountedRef.current) {
          setBusy(false);
          setJob(null);
        }
      }
    };
    poll();
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    // Re-attach to an in-flight job (e.g. after a page refresh): the job runs
    // server-side and survives a refresh, but the widget's busy state does not.
    (async () => {
      try {
        const r = await fetch(`/api/archify/${id}/job`);
        if (r.ok) {
          const j = await r.json();
          if (j.jobId) {
            setBusy(true);
            setJob(j);
            pollJob(j.jobId);
          }
        }
      } catch {}
    })();
    return () => clearInterval(t);
  }, []);

  async function regenerate() {
    setBusy(true);
    setJob(null);
    try {
      const { jobId } = await (await fetch(`/api/archify/${id}/regenerate`, { method: "POST" })).json();
      pollJob(jobId);
    } catch {
      setBusy(false);
      setJob(null);
    }
  }

  const state = status?.renderState ?? "missing";
  const color =
    state === "ok"
      ? "text-emerald-500"
      : state === "stale"
        ? "text-amber-500"
        : state === "failed"
          ? "text-rose-500"
          : "text-gray-500";
  const lastProgress = job?.progress?.length ? job.progress[job.progress.length - 1] : null;

  return (
    <Container service={service}>
      <div className="flex items-center gap-2 text-xs">
        <button className={`pointer-events-auto font-mono ${color}`} onClick={() => setOpen(true)} title="view diagram">
          ◈ archify · {STATE_LABEL[state]}
        </button>
        <button
          className="pointer-events-auto font-mono text-theme-500 hover:text-amber-500"
          onClick={regenerate}
          disabled={busy}
          title={busy && lastProgress ? lastProgress : "regenerate"}
        >
          {busy ? busyLabel(job) : "↻"}
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative h-[85vh] w-[90vw] rounded-lg border border-theme-500/40 bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute right-2 top-2 z-10 rounded border border-theme-500/40 px-2 text-sm"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            {busy ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-gray-400">
                <div className="font-mono text-lg text-amber-400">{busyLabel(job)}…</div>
                {lastProgress ? (
                  <div className="max-w-xl truncate font-mono text-[11px] text-gray-500">{lastProgress}</div>
                ) : null}
              </div>
            ) : state === "missing" || state === "failed" ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-gray-400">
                <div className="font-mono text-lg">{state === "failed" ? "上次生成失败" : "尚无架构图"}</div>
                <button
                  className="rounded border border-amber-500/50 px-4 py-2 font-mono text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                  onClick={regenerate}
                  disabled={busy}
                >
                  {state === "failed" ? "重新生成（archify）" : "用 archify 生成"}
                </button>
              </div>
            ) : (
              <iframe src={`/api/archify/${id}`} title="archify" className="h-full w-full rounded-lg" />
            )}
          </div>
        </div>
      )}
    </Container>
  );
}
