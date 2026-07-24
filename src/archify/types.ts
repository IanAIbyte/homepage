// Job-related types copied verbatim from project-hub:src/shared/types.ts (the
// Job / JobStatus / JobStage block), so the copied orchestration files
// (jobs.ts, regenerate.ts) can import them locally without depending on a
// shared/ tree that does not exist in this repo.

export type JobStatus = "queued" | "running" | "done" | "failed";
export type JobStage = "analyzing" | "rendering" | "done";

export interface Job {
  id: string;
  projectId: string;
  status: JobStatus;
  stage: JobStage;
  progress: string[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
  result?: { receipt?: string };
}

// Archify status types (see status.ts). The render state classifies the
// on-disk artifact for a given diagram id relative to the live source tree.
export type RenderState = "ok" | "stale" | "missing" | "failed";

export interface ArchifyStatus {
  renderState: RenderState;
  htmlMtime?: string;
}
