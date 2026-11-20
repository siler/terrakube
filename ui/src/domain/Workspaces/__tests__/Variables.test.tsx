import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Variables } from "../Variables";
import type { WorkspaceVariableRow } from "../workspaceQuery";
import { recordOf } from "@/testUtils/readRequestBody";
import { ORGANIZATION_ARCHIVE, WORKSPACE_ARCHIVE } from "../../../config/actionTypes";

const getMock = jest.fn<Promise<unknown>, [url: string, config?: unknown]>();
const postMock = jest.fn<Promise<unknown>, [url: string, body: unknown, config?: unknown]>();
const patchMock = jest.fn<Promise<unknown>, [url: string, body: unknown, config?: unknown]>();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: (...args: Parameters<typeof getMock>) => getMock(...args),
    post: (...args: Parameters<typeof postMock>) => postMock(...args),
    patch: (...args: Parameters<typeof patchMock>) => patchMock(...args),
    delete: jest.fn(),
  },
  getErrorMessage: () => "error",
}));

const row = (overrides: Partial<WorkspaceVariableRow> = {}): WorkspaceVariableRow => ({
  id: "v-1",
  key: "db_password",
  value: null,
  category: "TERRAFORM",
  hcl: false,
  sensitive: true,
  incomplete: false,
  description: null,
  ...overrides,
});

const renderVariables = (vars: WorkspaceVariableRow[]) =>
  render(
    <Variables
      vars={vars}
      env={[]}
      manageWorkspace={true}
      collectionVars={[]}
      collectionEnvVars={[]}
      globalVariables={[]}
      globalEnvVariables={[]}
      reload={jest.fn()}
    />
  );

describe("Variables", () => {
  beforeEach(() => {
    [getMock, postMock, patchMock].forEach((mock) => mock.mockReset());
    sessionStorage.setItem(ORGANIZATION_ARCHIVE, "org-1");
    sessionStorage.setItem(WORKSPACE_ARCHIVE, "ws-1");
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  // The API never returns a sensitive variable's value, so saving must not wipe it with an empty string.
  it("blocks saving a sensitive variable whose write-only value was not re-entered", async () => {
    renderVariables([row()]);
    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    const modal = within(await screen.findByRole("dialog"));
    await waitFor(() => expect(modal.getByLabelText("Key")).toHaveValue("db_password"));
    await userEvent.click(modal.getByRole("button", { name: "Save variable" }));

    expect(await modal.findByText("Enter a value")).toBeInTheDocument();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("sends the re-entered value when a sensitive variable is edited", async () => {
    patchMock.mockResolvedValue({});
    renderVariables([row()]);
    // The edit icon contributes its own name to the button, like the row's other icons
    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    const modal = within(await screen.findByRole("dialog"));
    await userEvent.type(modal.getByLabelText("Value"), "hunter2");
    await userEvent.click(modal.getByRole("button", { name: "Save variable" }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
    expect(patchMock.mock.calls[0][0]).toBe("organization/org-1/workspace/ws-1/variable/v-1");
    expect(patchMock.mock.calls[0][1]).toEqual({
      data: {
        type: "variable",
        id: "v-1",
        attributes: {
          key: "db_password",
          value: "hunter2",
          sensitive: true,
          hcl: false,
          category: "TERRAFORM",
          description: undefined,
        },
      },
    });
    expect(recordOf(recordOf(patchMock.mock.calls[0][2]).headers)["Content-Type"]).toBe("application/vnd.api+json");
  });

  it("sends the entered attributes when a variable is created", async () => {
    postMock.mockResolvedValue({});
    renderVariables([]);
    await userEvent.click(screen.getByRole("button", { name: /Add variable/ }));
    const modal = within(await screen.findByRole("dialog"));
    await userEvent.type(modal.getByLabelText("Key"), "region");
    await userEvent.type(modal.getByLabelText("Value"), "us-east-1");
    await userEvent.click(modal.getByRole("button", { name: "Save variable" }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock.mock.calls[0][0]).toBe("organization/org-1/workspace/ws-1/variable");
    expect(postMock.mock.calls[0][1]).toEqual({
      data: {
        type: "variable",
        attributes: {
          key: "region",
          value: "us-east-1",
          sensitive: false,
          hcl: false,
          category: "TERRAFORM",
          description: undefined,
        },
      },
    });
  });
});
