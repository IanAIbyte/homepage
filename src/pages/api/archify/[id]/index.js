import fs from "fs/promises";
import { htmlPath } from "../../../../archify/paths";
import { getServiceArchifyPath } from "../../../../archify/service-config";

// Serves the generated archify diagram HTML for a service id.
// GET /api/archify/[id] -> 200 text/html, or 404 if no diagram exists yet.
export default async function handler(req, res) {
  const { id } = req.query;
  if (!(await getServiceArchifyPath(id))) {
    return res.status(404).send({ error: "unknown project" });
  }
  try {
    const body = await fs.readFile(htmlPath(id));
    res.setHeader("Content-Type", "text/html");
    return res.send(body);
  } catch {
    return res.status(404).send({ error: "no diagram" });
  }
}
