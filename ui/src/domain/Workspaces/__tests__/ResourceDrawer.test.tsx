import { render, waitFor } from "@testing-library/react";
import { Resource } from "../../types";
import { workspacePageRow } from "@/testUtils/workspacePageRow";
import { ResourceDrawer } from "../ResourceDrawer";

const getMock = jest.fn<Promise<unknown>, [url: string, config?: unknown]>();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: (...args: Parameters<typeof getMock>) => getMock(...args) },
}));

jest.mock("../../../ActionLoader", () => ({ __esModule: true, default: () => null }));

// Jest cannot resolve the `.jsx` extension the component imports with.
jest.mock("../Icons.jsx", () => jest.requireActual<typeof import("../Icons")>("../Icons"), { virtual: true });

window._env_ = {
  REACT_APP_AUTHORITY: "http://localhost/authority",
  REACT_APP_CLIENT_ID: "client-id",
  REACT_APP_REDIRECT_URI: "http://localhost/redirect",
  REACT_APP_SCOPE: "openid",
  REACT_APP_TERRAKUBE_API_URL: "http://localhost:8080/api/v1",
  REACT_APP_TERRAKUBE_VERSION: "test",
  REACT_APP_REGISTRY_URI: "http://localhost:8080/registry",
};

const workspace = workspacePageRow({ id: "ws-1", name: "ws" });
const resource: Resource = {
  name: "web",
  type: "aws_instance",
  provider: "aws",
  module: "root_module",
  values: {},
  depends_on: [],
};

describe("ResourceDrawer", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({ data: { data: [] } });
  });

  it("does not fetch actions while closed", async () => {
    render(<ResourceDrawer open={false} setOpen={jest.fn()} resource={resource} workspace={workspace} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getMock).not.toHaveBeenCalled();
  });

  it("fetches actions when it opens, and not again when it closes", async () => {
    const { rerender } = render(
      <ResourceDrawer open={false} setOpen={jest.fn()} resource={resource} workspace={workspace} />
    );
    rerender(<ResourceDrawer open setOpen={jest.fn()} resource={resource} workspace={workspace} />);
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    expect(getMock).toHaveBeenCalledWith(
      "action?fields[action]=action,displayCriteria,type,label&filter[action]=" +
        encodeURIComponent("active=='true';type=in=('Workspace/ResourceDrawer/Action','Workspace/ResourceDrawer/Tab')"),
      expect.anything()
    );

    rerender(<ResourceDrawer open={false} setOpen={jest.fn()} resource={resource} workspace={workspace} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});
