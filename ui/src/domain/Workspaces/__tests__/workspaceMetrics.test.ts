import { computeWorkspaceMetrics } from "../workspaceMetrics";
import { JobStatus } from "@/domain/generated/apiResources";
import { JobVia } from "../../types";
import type { WorkspaceJobRow } from "../workspaceDataUtils";

const job = (id: string, status: JobStatus, createdDate?: string, updatedDate?: string): WorkspaceJobRow => ({
  id,
  title: "Run",
  status,
  via: JobVia.Ui,
  commitId: "",
  approvalTeam: "",
  latestChange: "",
  createdBy: "admin",
  createdDate: createdDate ?? null,
  updatedDate: updatedDate ?? null,
  templateReference: null,
  approvedBy: null,
  approvedAt: null,
  comments: null,
  prCommentError: null,
});

describe("computeWorkspaceMetrics", () => {
  it("returns null when no run has finished", () => {
    expect(computeWorkspaceMetrics([])).toBeNull();
    expect(
      computeWorkspaceMetrics([job("1", JobStatus.running, "2026-10-01T10:00:00Z", "2026-10-01T10:01:00Z")])
    ).toBeNull();
  });

  it("averages finished runs, counts failures and finds the last successful run", () => {
    const metrics = computeWorkspaceMetrics([
      job("1", JobStatus.completed, "2026-10-01T10:00:00Z", "2026-10-01T10:00:30Z"),
      job("2", JobStatus.failed, "2026-10-02T10:00:00Z", "2026-10-02T10:01:30Z"),
      job("3", JobStatus.noChanges, "2026-10-03T10:00:00Z", "2026-10-03T10:01:00Z"),
      job("4", JobStatus.running, "2026-10-04T10:00:00Z", "2026-10-04T11:00:00Z"),
    ]);
    expect(metrics).toEqual({
      runCount: 4,
      averageDuration: "1m 00s",
      failedRuns: 1,
      lastSuccessfulRun: "2026-10-03T10:01:00Z",
    });
  });

  it("skips runs with missing or invalid dates and reports no success when every run failed", () => {
    const metrics = computeWorkspaceMetrics([
      job("1", JobStatus.failed, "2026-10-01T10:00:00Z", "2026-10-01T10:00:20Z"),
      job("2", JobStatus.failed, undefined, "2026-10-02T10:00:00Z"),
      job("3", JobStatus.cancelled, "2026-10-03T10:00:00Z", "2026-10-03T09:00:00Z"),
    ]);
    expect(metrics).toEqual({ runCount: 3, averageDuration: "20s", failedRuns: 2, lastSuccessfulRun: null });
  });

  it("leaves rejected, cancelled and not-executed runs out of the average, which include approval wait", () => {
    const metrics = computeWorkspaceMetrics([
      job("1", JobStatus.completed, "2026-10-01T10:00:00Z", "2026-10-01T10:00:40Z"),
      job("2", JobStatus.rejected, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z"),
      job("3", JobStatus.cancelled, "2026-10-03T10:00:00Z", "2026-10-03T12:00:00Z"),
      job("4", JobStatus.notExecuted, "2026-10-04T10:00:00Z", "2026-10-04T13:00:00Z"),
    ]);
    expect(metrics).toMatchObject({ runCount: 4, averageDuration: "40s", failedRuns: 0 });
    expect(
      computeWorkspaceMetrics([job("1", JobStatus.rejected, "2026-10-02T10:00:00Z", "2026-10-03T10:00:00Z")])
        ?.averageDuration
    ).toBeNull();
  });

  it("has no average duration when no finished run has usable dates", () => {
    expect(computeWorkspaceMetrics([job("1", JobStatus.completed)])?.averageDuration).toBeNull();
  });
});
