import { randomUUID } from "node:crypto";
import type { Job } from "./types";

const jobs = new Map<string, Job>();

export function createJob(projectId: string): Job {
  const job: Job = {
    id: randomUUID(),
    projectId,
    status: "queued",
    stage: "analyzing",
    progress: [],
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function hasRunningFor(projectId: string): boolean {
  for (const j of jobs.values()) {
    if (j.projectId === projectId && (j.status === "queued" || j.status === "running")) return true;
  }
  return false;
}

/** The in-flight job for a project, if any (so a refreshed widget can re-attach). */
export function runningJobFor(projectId: string): Job | undefined {
  for (const j of jobs.values()) {
    if (j.projectId === projectId && (j.status === "queued" || j.status === "running")) return j;
  }
  return undefined;
}

export function runningCount(): number {
  let n = 0;
  for (const j of jobs.values()) if (j.status === "queued" || j.status === "running") n++;
  return n;
}

/** Test-only: clears the registry so tests start from a known empty state. */
export function __resetForTest(): void {
  jobs.clear();
}

export function jobController(job: Job) {
  return {
    setStage(stage: Job["stage"]) {
      job.stage = stage;
    },
    markRunning() {
      job.status = "running";
    },
    pushProgress(line: string) {
      job.progress.push(line);
    },
    succeed(receipt?: string) {
      job.status = "done";
      job.stage = "done";
      job.finishedAt = new Date().toISOString();
      job.result = { receipt };
    },
    fail(error: string) {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = error;
    },
  };
}
