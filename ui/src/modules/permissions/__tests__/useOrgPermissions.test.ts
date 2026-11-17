import { renderHook, waitFor } from "@testing-library/react";
import axiosInstance from "@/config/axiosConfig";
import { parseOrgPermissions, useOrgPermissions, type OrgPermissionSet } from "../useOrgPermissions";

jest.mock("react-router-dom", () => ({ useParams: () => ({}) }));
jest.mock("@/config/axiosConfig", () => ({ __esModule: true, default: { get: jest.fn() } }));

const mockGet = jest.mocked(axiosInstance.get);

const allDenied: OrgPermissionSet = {
  manageState: false,
  manageWorkspace: false,
  manageModule: false,
  manageProvider: false,
  manageVcs: false,
  manageTemplate: false,
  manageCollection: false,
  manageJob: false,
  planJob: false,
  approveJob: false,
  managePermission: false,
  managePolicies: false,
};

describe("parseOrgPermissions", () => {
  it("reads every flag of the PermissionSet body", () => {
    const body = { ...allDenied, manageState: true, planJob: true, managePolicies: true };

    expect(parseOrgPermissions(body)).toEqual(body);
  });

  it("denies everything when the body is not an object", () => {
    expect(parseOrgPermissions(null)).toEqual(allDenied);
    expect(parseOrgPermissions("forbidden")).toEqual(allDenied);
    expect(parseOrgPermissions([true])).toEqual(allDenied);
  });

  it("denies flags that are missing or not booleans", () => {
    expect(parseOrgPermissions({ manageState: "true", manageWorkspace: 1, manageJob: true })).toEqual({
      ...allDenied,
      manageJob: true,
    });
  });

  it("falls back to managePermission when managePolicies is absent", () => {
    expect(parseOrgPermissions({ managePermission: true })).toEqual({
      ...allDenied,
      managePermission: true,
      managePolicies: true,
    });
  });

  it("keeps an explicit managePolicies false over managePermission", () => {
    expect(parseOrgPermissions({ managePermission: true, managePolicies: false })).toEqual({
      ...allDenied,
      managePermission: true,
    });
  });
});

describe("useOrgPermissions", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("fetches and parses the organization's permissions", async () => {
    mockGet.mockResolvedValue({ data: { ...allDenied, manageWorkspace: true } });

    const { result } = renderHook(() => useOrgPermissions("org-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringMatching(/\/access-token\/v1\/teams\/permissions\/organization\/org-1$/)
    );
    expect(result.current.permissions).toEqual({ ...allDenied, manageWorkspace: true });
  });

  it("stays read-only when the request fails", async () => {
    mockGet.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useOrgPermissions("org-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.permissions).toEqual(allDenied);
  });

  it("does not fetch without an organization", () => {
    const { result } = renderHook(() => useOrgPermissions());

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current).toEqual({ permissions: allDenied, loading: false });
  });
});
