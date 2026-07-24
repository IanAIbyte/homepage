import { inspectArchify } from "../../../../archify/status";
import { getServiceArchifyPath } from "../../../../archify/service-config";

// Reports the render state (ok/stale/missing/failed) of a service's archify
// diagram relative to its live source tree.
// GET /api/archify/[id]/status -> 200 { renderState, htmlMtime? } | 404.
export default async function handler(req, res) {
  const { id } = req.query;
  const projectPath = await getServiceArchifyPath(id);
  if (!projectPath) return res.status(404).send({ error: "unknown project" });
  const status = await inspectArchify(id, projectPath);
  return res.send(status);
}
