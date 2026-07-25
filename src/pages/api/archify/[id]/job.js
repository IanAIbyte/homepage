import { runningJobFor } from "../../../../archify/jobs";
import { getServiceArchifyPath } from "../../../../archify/service-config";

// Returns the in-flight (queued/running) archify job for a project, so a widget
// can re-attach after a page refresh (the job lives server-side; the widget's
// busy state is client-side and is lost on refresh). 404 if none running.
export default async function handler(req, res) {
  const { id } = req.query;
  if (!(await getServiceArchifyPath(id))) {
    return res.status(404).send({ error: "unknown project" });
  }
  const job = runningJobFor(id);
  if (!job) {
    return res.status(404).send({ error: "no running job" });
  }
  return res.send({ jobId: job.id, status: job.status, stage: job.stage, progress: job.progress });
}
