import { getJob } from "../../../../archify/jobs";

// GET /api/archify/jobs/[jobId] -> 200 job object | 404 { error: "job not found" }.
export default function handler(req, res) {
  const job = getJob(req.query.jobId);
  if (!job) return res.status(404).send({ error: "job not found" });
  return res.send(job);
}
