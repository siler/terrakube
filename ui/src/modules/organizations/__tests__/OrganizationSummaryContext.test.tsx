import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { OrganizationSummaryProvider } from "../OrganizationSummaryContext";
import { useOrganizationSummaries } from "../useOrganizationSummaries";
import organizationService, { type OrganizationSummary } from "../organizationService";

jest.mock("../organizationService", () => ({
  __esModule: true,
  default: {
    listOrganizationSummaries: jest.fn(),
  },
}));

const listOrganizationSummaries = jest.mocked(organizationService.listOrganizationSummaries);

const acme: OrganizationSummary = {
  id: "org-1",
  name: "Acme",
  description: undefined,
  executionMode: undefined,
  icon: undefined,
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <OrganizationSummaryProvider>{children}</OrganizationSummaryProvider>
);

describe("OrganizationSummaryProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads once and shares its cached organizations with consumers", async () => {
    listOrganizationSummaries.mockResolvedValue([acme]);

    const { result, rerender } = renderHook(() => useOrganizationSummaries(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender();

    expect(listOrganizationSummaries).toHaveBeenCalledTimes(1);
    expect(result.current.organizations).toEqual([acme]);
  });

  it("updates cached entries after organization mutations without another list request", async () => {
    listOrganizationSummaries.mockResolvedValue([acme]);
    const { result } = renderHook(() => useOrganizationSummaries(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateOrganization("org-1", { name: "Acme Platform" }));
    act(() => result.current.upsertOrganization({ id: "org-2", name: "Data", workspaceCount: 0 }));
    act(() => result.current.removeOrganization("org-1"));

    expect(listOrganizationSummaries).toHaveBeenCalledTimes(1);
    expect(result.current.organizations).toEqual([{ id: "org-2", name: "Data", workspaceCount: 0 }]);
  });
});
