import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RunList from "../RunList";
import { JobStatus } from "@/domain/generated/apiResources";
import { JobVia } from "@/domain/types";
import type { WorkspaceJobRow } from "@/domain/Workspaces/workspaceDataUtils";
import type { OrgTemplateRow } from "@/domain/Workspaces/workspaceQuery";

const planAndApply: OrgTemplateRow = { id: "tpl-1", name: "Plan and Apply", tcl: null, description: null };

const job = (id: string, status: JobStatus, extra: Partial<WorkspaceJobRow> = {}): WorkspaceJobRow => ({
  id,
  title: `Run ${id} title`,
  status,
  via: JobVia.Ui,
  approvalTeam: "",
  latestChange: "2 hours ago",
  createdBy: "admin@example.com",
  commitId: "937b249da41c50a9e944f7205e95f694842c5394",
  createdDate: "2026-10-04T10:00:00Z",
  updatedDate: "2026-10-04T10:01:05Z",
  templateReference: "tpl-1",
  approvedBy: null,
  approvedAt: null,
  comments: null,
  prCommentError: null,
  ...extra,
});

const renderList = (jobs: WorkspaceJobRow[], templates: OrgTemplateRow[] | null = [planAndApply]) =>
  render(
    <MemoryRouter>
      <RunList jobs={jobs} templates={templates} onRunClick={jest.fn()} runLink={(id) => `/runs/${id}`} />
    </MemoryRouter>
  );

describe("RunList", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("restores a stored template filter", () => {
    sessionStorage.setItem("runsTemplateFilter", JSON.stringify(["tpl-2"]));
    renderList([job("1", JobStatus.completed), job("2", JobStatus.completed, { templateReference: "tpl-2" })]);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Run 2 title" })).toBeInTheDocument();
  });

  it.each([["{not json"], ['{"tpl-1":true}'], ['"tpl-1"'], ["[1,2]"]])(
    "ignores a stored template filter that is not a list of ids: %s",
    (stored) => {
      sessionStorage.setItem("runsTemplateFilter", stored);
      renderList([job("1", JobStatus.completed), job("2", JobStatus.completed, { templateReference: "tpl-2" })]);

      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    }
  );

  it("names templates from the list it is given", () => {
    const templates: OrgTemplateRow[] = [{ id: "tpl-1", name: "Given template", tcl: null, description: null }];
    renderList([job("1", JobStatus.completed)], templates);

    expect(screen.getByText("Given template")).toBeInTheDocument();
  });

  it("lists runs without template names while the parent is still loading templates", () => {
    renderList([job("1", JobStatus.completed)], null);

    expect(screen.getByRole("link", { name: "Run 1 title" })).toBeInTheDocument();
    expect(screen.queryByText("Plan and Apply")).not.toBeInTheDocument();
  });

  it("shows the count, only statuses that have runs, and a byline with commit and duration", async () => {
    renderList([job("1", JobStatus.completed), job("2", JobStatus.failed), job("3", JobStatus.completed)]);

    expect(screen.getByRole("heading", { name: "Runs (3)" })).toBeInTheDocument();
    const chips = within(screen.getByRole("group", { name: "Filter by status" }));
    expect(chips.getByRole("button", { name: "All 3" })).toBeInTheDocument();
    expect(chips.getByRole("button", { name: "Failed 1" })).toBeInTheDocument();
    expect(chips.getByRole("button", { name: "Completed 2" })).toBeInTheDocument();
    expect(chips.queryByRole("button", { name: /running/i })).not.toBeInTheDocument();

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByRole("link", { name: "Run 3 title" })).toHaveAttribute("href", "/runs/3");
    expect(within(rows[0]).getByText("Current")).toBeInTheDocument();
    expect(within(rows[0]).getByText("937b249")).toBeInTheDocument();
    expect(within(rows[0]).getByText("1m 05s")).toBeInTheDocument();
    await waitFor(() => expect(within(rows[0]).getByText("Plan and Apply")).toBeInTheDocument());
  });

  it("filters by status and search, and clears back to every run", () => {
    renderList([job("1", JobStatus.completed), job("2", JobStatus.failed)]);

    fireEvent.click(screen.getByRole("button", { name: "Failed 1" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Run 2 title" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search runs"), { target: { value: "nothing like this" } });
    expect(screen.getByText("No runs match these filters.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows an empty state when the workspace has no runs", () => {
    renderList([]);
    expect(screen.getByRole("heading", { name: "Runs (0)" })).toBeInTheDocument();
    expect(screen.getByText(/No runs yet/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by status" })).not.toBeInTheDocument();
  });
});
