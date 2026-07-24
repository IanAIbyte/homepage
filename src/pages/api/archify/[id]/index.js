import fs from "fs/promises";
import { resolveProjectPath } from "../../../../archify/paths";
import { resolveDiagramHtml } from "../../../../archify/status";
import { getServiceArchifyPath } from "../../../../archify/service-config";

// Serves the archify diagram HTML for a service id: Homepage's own generated
// diagram (data/archify) if present, else a reused one from the project dir
// (e.g. produced by project-hub / the archify skill). 404 if neither exists.
export default async function handler(req, res) {
  const { id } = req.query;
  const raw = await getServiceArchifyPath(id);
  if (!raw) {
    return res.status(404).send({ error: "unknown project" });
  }
  const html = await resolveDiagramHtml(id, resolveProjectPath(raw));
  if (!html) {
    return res.status(404).send({ error: "no diagram" });
  }
  try {
    const body = await fs.readFile(html);
    res.setHeader("Content-Type", "text/html");
    return res.send(body);
  } catch {
    return res.status(404).send({ error: "no diagram" });
  }
}
