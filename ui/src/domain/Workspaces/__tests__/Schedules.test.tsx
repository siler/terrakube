import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WORKSPACE_ARCHIVE } from "../../../config/actionTypes";
import { Schedules } from "../Schedules";
import type { NamedSchedule } from "../workspaceDataUtils";

const getMock = jest.fn<Promise<unknown>, [url: string, config?: unknown]>();
const deleteMock = jest.fn<Promise<unknown>, [url: string, config?: unknown]>();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: (...args: Parameters<typeof getMock>) => getMock(...args),
    delete: (...args: Parameters<typeof deleteMock>) => deleteMock(...args),
  },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Error"),
}));

const schedule: NamedSchedule = {
  id: "sch-1",
  cron: "0 0 1 * * ? *",
  templateReference: "tpl-1",
  name: "Plan",
};

describe("Schedules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    getMock.mockResolvedValue({ data: { data: [] } });
    deleteMock.mockResolvedValue({});
  });

  it("addresses the workspace from the route, not from a stale session value", async () => {
    sessionStorage.setItem(WORKSPACE_ARCHIVE, "stale-ws");
    const reload = jest.fn();
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/workspaces/ws-1"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/workspaces/:id"
            element={<Schedules schedules={[schedule]} manageWorkspace reload={reload} />}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes" }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(deleteMock.mock.calls[0][0]).toBe("organization/org-1/workspace/ws-1/schedule/sch-1");
    expect(getMock.mock.calls[0][0]).toContain("organization/org-1/template");
  });
});
