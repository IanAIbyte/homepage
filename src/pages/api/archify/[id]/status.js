import { resolveProjectPath } from "../../../../archify/paths";
import { getServiceArchifyPath } from "../../../../archify/service-config";
import { inspectArchify } from "../../../../archify/status";

// Reports the render state (ok/stale/missing/failed) of a service's archify
// diagram relative to its live source tree.
// GET /api/archify/[id]/status -> 200 { renderState, htmlMtime? } | 404.
export default async function handler(req, res) {
  const { id } = req.query;
  const raw = await getServiceArchifyPath(id);
  if (!raw) return res.status(404).send({ error: "unknown project" });
  const status = await inspectArchify(id, resolveProjectPath(raw));
  return res.send(status);
}
