import { createJob, hasRunningFor, runningCount } from "../../../../archify/jobs";
import { runRegeneration } from "../../../../archify/regenerate";
import { claudeAnalyzer } from "../../../../archify/analyzer";
import { renderArchify } from "../../../../archify/archify-runner";
import { jsonPath, htmlPath, resolveProjectPath, ensureDataDir } from "../../../../archify/paths";
import { getServiceArchifyPath } from "../../../../archify/service-config";

// Max concurrent regenerations across ALL projects. The fire-and-forget
// runRegeneration call below runs outside the request lifecycle; this cap plus
// the per-project hasRunningFor guard keeps the host bounded.
const MAX_CONCURRENT = 2;
const ARCHIFY_BIN =
  process.env.ARCHIFY_BIN ?? `${process.env.HOME}/.claude/skills/archify/bin/archify.mjs`;

// POST /api/archify/[id]/regenerate
//   202 { jobId }  - job queued (regeneration runs fire-and-forget)
//   404            - unknown service id (no widget.path configured)
//   409            - a job is already running for this id
//   503            - concurrency cap (MAX_CONCURRENT) reached
//   405            - non-POST
// Ports project-hub's app.ts regenerate wiring (createJob -> runRegeneration
// detached with .catch -> 202).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send({ error: "POST only" });
  const { id } = req.query;
  const raw = await getServiceArchifyPath(id);
  if (!raw) return res.status(404).send({ error: "unknown project" });
  const projectPath = resolveProjectPath(raw);
  if (hasRunningFor(id)) return res.status(409).send({ error: "already running" });
  if (runningCount() >= MAX_CONCURRENT) return res.status(503).send({ error: "concurrency cap reached" });
  await ensureDataDir();
  const job = createJob(id);
  runRegeneration(
    job,
    { id, path: projectPath, jsonPath: jsonPath(id), htmlPath: htmlPath(id) },
    { analyzer: claudeAnalyzer, render: renderArchify, archifyBin: ARCHIFY_BIN },
  ).catch((e) => {
    job.status = "failed";
    job.error = String(e?.message ?? e);
  });
  return res.status(202).send({ jobId: job.id });
}
