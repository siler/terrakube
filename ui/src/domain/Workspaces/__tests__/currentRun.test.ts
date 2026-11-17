import { JobStatus } from "../../generated/apiResources";
import { JobVia } from "../../types";
import type { WorkspaceJobRow } from "../workspaceDataUtils";
import { selectCurrentRun } from "../currentRun";

const job = (id: number, status: JobStatus): WorkspaceJobRow => ({
  id: String(id),
  title: `run ${id}`,
  status,
  via: JobVia.Ui,
  commitId: "",
  approvalTeam: "",
  latestChange: "",
  createdBy: "someone",
  createdDate: null,
  updatedDate: null,
  templateReference: null,
  approvedBy: null,
  approvedAt: null,
  comments: null,
  prCommentError: null,
});

describe("selectCurrentRun", () => {
  it("returns undefined without runs", () => {
    expect(selectCurrentRun([])).toBeUndefined();
  });

  it("shows the newest run when every run is finished", () => {
    const result = selectCurrentRun([
      job(1, JobStatus.failed),
      job(3, JobStatus.completed),
      job(2, JobStatus.rejected),
    ]);
    expect(result?.job.id).toBe("3");
    expect(result?.active).toBe(false);
    expect(result?.queuedBehind).toEqual([]);
  });

  it("keeps a run waiting for approval in the card when a newer run is pending behind it", () => {
    const result = selectCurrentRun([
      job(1, JobStatus.completed),
      job(2, JobStatus.waitingApproval),
      job(3, JobStatus.pending),
    ]);
    expect(result?.job.id).toBe("2");
    expect(result?.active).toBe(true);
    expect(result?.queuedBehind.map((queued) => queued.id)).toEqual(["3"]);
  });

  it("does not let a newer finished plan-only run replace the waiting run", () => {
    const result = selectCurrentRun([job(2, JobStatus.waitingApproval), job(3, JobStatus.completed)]);
    expect(result?.job.id).toBe("2");
    expect(result?.queuedBehind).toEqual([]);
  });

  it("orders ids numerically, not as text", () => {
    const result = selectCurrentRun([job(9, JobStatus.pending), job(10, JobStatus.pending)]);
    expect(result?.job.id).toBe("9");
    expect(result?.queuedBehind.map((queued) => queued.id)).toEqual(["10"]);
  });

  it.each([JobStatus.approved, JobStatus.running, JobStatus.queue, JobStatus.pending])(
    "treats %s as active",
    (status) => {
      expect(selectCurrentRun([job(1, JobStatus.completed), job(2, status)])?.job.id).toBe("2");
    }
  );

  it("ignores finished runs older than the current run", () => {
    const result = selectCurrentRun([job(1, JobStatus.failed), job(2, JobStatus.running)]);
    expect(result?.job.id).toBe("2");
    expect(result?.queuedBehind).toEqual([]);
  });

  it("does not count a run that is itself running or waiting for approval as queued behind", () => {
    const result = selectCurrentRun([
      job(1, JobStatus.waitingApproval),
      job(2, JobStatus.running),
      job(3, JobStatus.waitingApproval),
      job(4, JobStatus.queue),
      job(5, JobStatus.pending),
    ]);
    expect(result?.job.id).toBe("1");
    expect(result?.queuedBehind.map((queued) => queued.id)).toEqual(["4", "5"]);
  });
});
