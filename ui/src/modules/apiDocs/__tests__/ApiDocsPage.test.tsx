import { render, screen, waitFor } from "@testing-library/react";
import { axiosResponse } from "@/testUtils/fakeAxiosResponse";
import { User } from "oidc-client-ts";
import { MemoryRouter } from "react-router-dom";
import { ApiDocsPage } from "../ApiDocsPage";
import getUserFromStorage from "@/config/authUser";
import { axiosRegistry } from "@/config/axiosConfig";
import { isRecord } from "@/modules/utils/typeGuards";

jest.mock("@/config/authUser");
const mockGetUserFromStorage = jest.mocked(getUserFromStorage);

jest.mock("@/config/axiosConfig", () => ({
  axiosRegistry: { get: jest.fn() },
}));
const mockAxiosGet = jest.mocked(axiosRegistry.get);

const apiReferenceMock = jest.fn<null, [unknown]>(() => null);
jest.mock("@scalar/api-reference-react", () => ({
  __esModule: true,
  ApiReferenceReact: (props: unknown) => apiReferenceMock(props),
}));

const fakeSpec = { openapi: "3.0.1", info: { title: "Elide Service" }, paths: {} };

const signedInUser = new User({
  access_token: "token-123",
  token_type: "Bearer",
  profile: { iss: "https://issuer.test", sub: "user-1", aud: "terrakube", exp: 0, iat: 0 },
});

function renderApiDocsPage() {
  return render(
    <MemoryRouter>
      <ApiDocsPage />
    </MemoryRouter>
  );
}

const scalarConfiguration = (): Record<string, unknown> => {
  const props = apiReferenceMock.mock.lastCall?.[0];
  if (!isRecord(props) || !isRecord(props.configuration)) {
    throw new Error("ApiReferenceReact was not rendered with a configuration");
  }
  return props.configuration;
};

const runOnBeforeRequest = (headers: { set: jest.Mock }) => {
  const hook = scalarConfiguration().onBeforeRequest;
  if (typeof hook !== "function") {
    throw new Error("onBeforeRequest is not a function");
  }
  Reflect.apply(hook, undefined, [{ requestBuilder: { headers } }]);
};

describe("ApiDocsPage", () => {
  beforeEach(() => {
    apiReferenceMock.mockClear();
    mockGetUserFromStorage.mockReset();
    mockAxiosGet.mockReset();
    mockAxiosGet.mockResolvedValue(axiosResponse({ data: fakeSpec }));
  });

  it("fetches the spec from the API's /doc endpoint and passes it to Scalar as content", async () => {
    renderApiDocsPage();

    await waitFor(() => expect(apiReferenceMock).toHaveBeenCalled());

    expect(mockAxiosGet).toHaveBeenCalledWith("/doc");
    expect(scalarConfiguration().content).toEqual(fakeSpec);
  });

  it("attaches the signed-in user's bearer token to every request Scalar's 'Try it' fires", async () => {
    mockGetUserFromStorage.mockReturnValue(signedInUser);
    renderApiDocsPage();
    await waitFor(() => expect(apiReferenceMock).toHaveBeenCalled());

    const headers = { set: jest.fn() };
    runOnBeforeRequest(headers);

    expect(headers.set).toHaveBeenCalledWith("Authorization", "Bearer token-123");
  });

  it("leaves the Authorization header unset when there is no signed-in user", async () => {
    mockGetUserFromStorage.mockReturnValue(null);
    renderApiDocsPage();
    await waitFor(() => expect(apiReferenceMock).toHaveBeenCalled());

    const headers = { set: jest.fn() };
    runOnBeforeRequest(headers);

    expect(headers.set).not.toHaveBeenCalled();
  });

  it("points Try It requests at the API's origin instead of resolving the spec's relative server URL against the docs page's own origin", async () => {
    renderApiDocsPage();

    await waitFor(() => expect(apiReferenceMock).toHaveBeenCalled());

    expect(scalarConfiguration().baseServerURL).toBe("https://terrakube-api.test");
  });

  it("links 'Back to Terrakube' to the app shell", async () => {
    renderApiDocsPage();
    await waitFor(() => expect(apiReferenceMock).toHaveBeenCalled());

    expect(screen.getByText("Back to Terrakube").closest("a")).toHaveAttribute("href", "/");
  });

  it("shows an error instead of spinning forever when the spec request fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAxiosGet.mockRejectedValue(new Error("Network Error"));
    renderApiDocsPage();

    expect(await screen.findByText("Failed to load the API specification.")).toBeInTheDocument();
    expect(apiReferenceMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("shows an error when /doc returns something other than a JSON object", async () => {
    mockAxiosGet.mockResolvedValue(axiosResponse({ data: "<html>not a spec</html>" }));
    renderApiDocsPage();

    expect(await screen.findByText("Failed to load the API specification.")).toBeInTheDocument();
    expect(apiReferenceMock).not.toHaveBeenCalled();
  });
});
