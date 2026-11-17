import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { States, stateRequestUrl } from "../States";
import { workspacePageRow } from "@/testUtils/workspacePageRow";
import type { WorkspaceHistoryRow } from "../workspaceDataUtils";

const apiGet = jest.fn<Promise<unknown>, [url: string, config?: unknown]>();
const clientGet = jest.fn<Promise<unknown>, [url: string, config?: unknown]>();
const flowProps = jest.fn();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: (...args: Parameters<typeof apiGet>) => apiGet(...args), put: jest.fn() },
  axiosClient: { get: (...args: Parameters<typeof clientGet>) => clientGet(...args) },
  getErrorMessage: (error: Error) => error.message,
}));
jest.mock("reactflow", () => ({
  __esModule: true,
  default: (props: unknown) => {
    flowProps(props);
    return null;
  },
  Background: () => null,
  Controls: () => null,
  MarkerType: { Arrow: "arrow" },
  applyEdgeChanges: jest.fn(),
  applyNodeChanges: jest.fn(),
}));
jest.mock("reactflow/dist/style.css", () => ({}));
jest.mock("../ResourceDrawer", () => ({ ResourceDrawer: () => null }));
jest.mock("../NodeResource", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/display/JsonViewer", () => ({
  __esModule: true,
  default: ({ value }: { value: unknown }) => <pre>{JSON.stringify(value)}</pre>,
}));

const version = (id: string, output: string, createdDate: string): WorkspaceHistoryRow => ({
  id,
  title: `Version ${id}`,
  output,
  createdDate,
  relativeDate: "now",
  createdBy: "me",
  jobReference: "1",
});

// The parent owns the details flag; keep it in local state here.
const StatefulStates = ({ history }: { history: WorkspaceHistoryRow[] }) => {
  const [visible, setVisible] = useState(false);
  return (
    <MemoryRouter>
      <States
        history={history}
        stateDetailsVisible={visible}
        setStateDetailsVisible={setVisible}
        workspace={workspacePageRow({ id: "ws-1", name: "ws" })}
        onRollback={() => {}}
        manageState
      />
    </MemoryRouter>
  );
};

beforeEach(() => {
  apiGet.mockReset();
  clientGet.mockReset();
  flowProps.mockReset();
});

describe("States", () => {
  it("fetches the raw state and the previous version only from the Terrakube API", async () => {
    const api = "https://terrakube-api.test/tfstate/v1/organization/o/workspace/w/state";
    apiGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url.endsWith(".raw.json") ? { serial: url.includes("/2.") ? 2 : 1 } : { values: {} } })
    );
    render(
      <StatefulStates
        history={[version("1", `${api}/1.json`, "2026-01-01"), version("2", `${api}/2.json?v=1`, "2026-01-02")]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Version 2" }));

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith(`${api}/2.raw.json?v=1`));
    expect(apiGet).toHaveBeenCalledWith(`${api}/1.raw.json`);
    expect(clientGet).not.toHaveBeenCalled();
    expect(screen.queryByText(/not available for this storage/)).not.toBeInTheDocument();
  });

  it("shows raw state and comparison as unavailable for other storage URLs", async () => {
    const storage = "https://bucket.blob.core.windows.net/tfstate";
    clientGet.mockResolvedValue({ data: { values: {} } });
    render(
      <StatefulStates
        history={[
          version("1", `${storage}/1.json?sv=2024&sig=abc.json`, "2026-01-01"),
          version("2", `${storage}/2.json?sv=2024&sig=abc.json`, "2026-01-02"),
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Version 2" }));

    expect(
      await screen.findAllByText("Raw state and version comparison are not available for this storage.")
    ).toHaveLength(1);
    expect(clientGet).toHaveBeenCalledTimes(1);
    expect(clientGet).toHaveBeenCalledWith(`${storage}/2.json?sv=2024&sig=abc.json`);
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("draws resources of nested child modules in the diagram", async () => {
    const api = "https://terrakube-api.test/tfstate/v1/organization/o/workspace/w/state";
    const resource = (address: string) => ({ address, mode: "managed", type: "null_resource", name: "n" });
    apiGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.endsWith(".raw.json")
          ? {}
          : {
              values: {
                root_module: {
                  resources: [resource("null_resource.n")],
                  child_modules: [
                    {
                      address: "module.a",
                      resources: [resource("module.a.null_resource.n")],
                      child_modules: [
                        { address: "module.a.module.b", resources: [resource("module.a.module.b.null_resource.n")] },
                      ],
                    },
                  ],
                },
              },
            },
      })
    );
    render(<StatefulStates history={[version("1", `${api}/1.json`, "2026-01-01")]} />);

    fireEvent.click(screen.getByRole("button", { name: "Version 1" }));

    await waitFor(() =>
      expect(flowProps).toHaveBeenLastCalledWith(
        expect.objectContaining({
          nodes: [
            expect.objectContaining({ id: "null_resource.n" }),
            expect.objectContaining({ id: "module.a.null_resource.n" }),
            expect.objectContaining({ id: "module.a.module.b.null_resource.n" }),
          ],
        })
      )
    );
  });
});

describe("stateRequestUrl", () => {
  const originalEnv = window._env_;
  const setEnv = (extra: Partial<typeof window._env_>) => {
    window._env_ = Object.assign({}, originalEnv, extra);
  };

  afterEach(() => {
    window._env_ = originalEnv;
  });

  it("leaves split-domain state URLs unchanged", () => {
    setEnv({ REACT_APP_TERRAKUBE_API_URL: "https://api.example.com/api/v1/", REACT_APP_TERRAKUBE_PUBLIC_URL: "" });
    const url = "https://api.example.com/tfstate/v1/organization/o/workspace/w/state/1.json";
    expect(stateRequestUrl(url)).toBe(url);
  });

  it("rebuilds state URLs written with an old API host on the single-domain API", () => {
    setEnv({
      REACT_APP_TERRAKUBE_API_URL: "https://app.example.com/api/v1/",
      REACT_APP_TERRAKUBE_PUBLIC_URL: "https://app.example.com",
    });
    expect(stateRequestUrl("https://old-api.example.com/tfstate/v1/organization/o/workspace/w/state/1.json")).toBe(
      "https://app.example.com/api/tfstate/v1/organization/o/workspace/w/state/1.json"
    );
    expect(stateRequestUrl("https://app.example.com/api/tfstate/v1/archive/a/terraform.tfstate")).toBe(
      "https://app.example.com/api/tfstate/v1/archive/a/terraform.tfstate"
    );
  });

  it("leaves storage URLs alone", () => {
    const presigned = "https://bucket.s3.amazonaws.com/tfstate/o/w/state.json?X-Amz-Signature=x";
    expect(stateRequestUrl(presigned)).toBe(presigned);
  });
});
