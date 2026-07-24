// Maps a homepage service id (the YAML key, i.e. `.name` on the parsed
// service object) to the per-service archify project path declared under
// `widget.path` in services.yaml, e.g.:
//   - My Project:
//       widget:
//         type: archify
//         path: ~/code/my-project
//
// `servicesFromConfig()` returns the RAW parsed groups (before
// `cleanServiceGroups` relocates `widget` -> `widgets[]`), so each service
// still carries its singular `.widget` object with the custom `path` field.
import { servicesFromConfig } from "utils/config/service-helpers.js";

export async function getServiceArchifyPath(id: string): Promise<string | null> {
  const groups = await servicesFromConfig();
  for (const group of groups) {
    for (const s of group.services ?? []) {
      const name = s.name ?? s.title;
      if (name === id) return s.widget?.path ?? null;
    }
  }
  return null;
}
