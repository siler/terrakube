import { type AxiosResponse, CanceledError } from "axios";
import axiosInstance from "@/config/axiosConfig";
import { and, api, fields, or, type Row } from "..";
import { axiosResponse } from "@/testUtils/axiosResponse";

// Names a member at compile time, so a missing one fails on the argument rather than yielding an unresolved type.
const memberOf = <T>(_value: T, name: keyof T & string): string => name;

jest.mock("@/config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const get = jest.mocked(axiosInstance.get);

const respond = (document: unknown) => get.mockResolvedValue(axiosResponse({ data: document }));

describe("api", () => {
  beforeEach(() => get.mockReset());

  describe("url", () => {
    it("url of an org-scoped workspace item", () => {
      const query = api
        .organization("o")
        .workspace("w")
        .select("name", { vcs: ["vcsType"] });

      expect(query.url()).toBe("organization/o/workspace/w?include=vcs&fields[workspace]=name,vcs&fields[vcs]=vcsType");
    });

    it("url of a nested collection", () => {
      expect(api.organization("o").workspace("w").job().select("status").url()).toBe(
        "organization/o/workspace/w/job?fields[job]=status"
      );
    });

    it("url of a root item, a root collection and a to-one relationship", () => {
      expect(api.workspace("w").select("name").url()).toBe("workspace/w?fields[workspace]=name");
      expect(api.organization().select("name").url()).toBe("organization?fields[organization]=name");
      expect(api.workspace("w").vcs().select("vcsType").url()).toBe("workspace/w/vcs?fields[vcs]=vcsType");
    });

    it("selects with a fragment as with its arguments", () => {
      const fragment = fields.workspace("name", { vcs: ["vcsType"] });

      expect(api.workspace("w").select(fragment).url()).toBe(
        api
          .workspace("w")
          .select("name", { vcs: ["vcsType"] })
          .url()
      );
    });

    it("encodes ids into their path segment", () => {
      expect(api.workspace("a/b?c").select("name").url()).toBe("workspace/a%2Fb%3Fc?fields[workspace]=name");
    });

    it("where encodes filter[primary]", () => {
      const query = api
        .organization("o")
        .workspace()
        .select("name")
        .where((w) => and(w.vcs.id.eq("v1"), or(w.name.contains("a b"), w.locked.eq(true))));

      expect(query.url()).toBe(
        "organization/o/workspace?fields[workspace]=name&filter[workspace]=" +
          encodeURIComponent("vcs.id=='v1';(name=='*a b*',locked=='true')")
      );
    });

    it("ands a second where onto the first", () => {
      const query = api
        .workspace()
        .select("name")
        .where((w) => w.name.eq("a"))
        .where((w) => w.locked.eq(false));

      expect(query.url()).toBe(
        "workspace?fields[workspace]=name&filter[workspace]=" + encodeURIComponent("name=='a';locked=='false'")
      );
    });

    it("throws at select when two include paths select one type differently", () => {
      expect(() =>
        api.workspace("w").select({ organization: ["name"], project: [{ organization: ["description"] }] })
      ).toThrow("Conflicting selections for organization");
    });
  });

  it("builders are immutable", () => {
    const base = api.organization("o").workspace();
    const names = base.select("name");
    const branches = base.select("branch");
    const filtered = names.where((w) => w.name.eq("x"));
    const signalled = names.signal(new AbortController().signal);

    expect(names.url()).toBe("organization/o/workspace?fields[workspace]=name");
    expect(branches.url()).toBe("organization/o/workspace?fields[workspace]=branch");
    expect(filtered.url()).not.toBe(names.url());
    expect(signalled.url()).toBe(names.url());
  });

  describe("awaiting", () => {
    it("awaiting sends exactly one GET and returns rows", async () => {
      respond({
        data: [
          { type: "job", id: "1", attributes: { status: "completed" } },
          { type: "job", id: "2", attributes: { status: "running" } },
        ],
      });

      const rows = await api.organization("o").workspace("w").job().select("status");

      expect(get).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledWith("organization/o/workspace/w/job?fields[job]=status", { signal: undefined });
      expect(rows).toStrictEqual([
        { id: "1", status: "completed" },
        { id: "2", status: "running" },
      ]);
    });

    it("resolves an item to one flat row", async () => {
      respond({
        data: {
          type: "workspace",
          id: "w",
          attributes: { name: "infra" },
          relationships: { vcs: { data: { id: "v" } } },
        },
        included: [{ type: "vcs", id: "v", attributes: { vcsType: "GITHUB" } }],
      });

      const ws = await api.workspace("w").select("name", { vcs: ["vcsType"] });

      expect(ws).toStrictEqual({ id: "w", name: "infra", vcs: { id: "v", vcsType: "GITHUB" } });
    });

    it("resolves a query returned from an async function", async () => {
      respond({ data: { type: "organization", id: "o", attributes: { name: "od" } } });
      const load = async () => api.organization("o").select("name");

      expect(await load()).toStrictEqual({ id: "o", name: "od" });
      expect(get).toHaveBeenCalledTimes(1);
    });

    it("propagates request errors", async () => {
      get.mockRejectedValue(new Error("boom"));

      await expect(api.workspace("w").select("name")).rejects.toThrow("boom");
    });

    it("sends nothing until awaited, and paths are not thenable", async () => {
      const path = api.workspace("w");
      api.workspace("w").select("name");

      expect(get).not.toHaveBeenCalled();
      expect("then" in path).toBe(false);
      expect("then" in api.workspace()).toBe(false);
      expect(await path).toBe(path);
    });

    it("resolves an optional to-one that points at nothing to null", async () => {
      respond({ data: null });

      await expect(api.workspace("w").vcs().select("vcsType")).resolves.toBeNull();
    });

    it("rejects when a required path yields no resource", async () => {
      respond({ data: null });

      await expect(api.workspace("w").select("name")).rejects.toThrow("workspace/w returned no resource");
      await expect(api.workspace("w").organization().select("name")).rejects.toThrow(
        "workspace/w/organization returned no resource"
      );
    });

    it("rejects a list read answered with one resource, and an item read answered with a list", async () => {
      respond({ data: { type: "job", id: "1", attributes: { status: "completed" } } });
      await expect(api.workspace("w").job().select("status")).rejects.toThrow("Expected a list of job");

      respond({ data: [{ type: "workspace", id: "w", attributes: { name: "infra" } }] });
      await expect(api.workspace("w").select("name")).rejects.toThrow("Expected one workspace, got a list");
    });

    it("rejects a body that is not a JSON:API document", async () => {
      respond("<html>Bad gateway</html>");
      await expect(api.workspace("w").select("name")).rejects.toThrow("Expected a JSON:API document");

      respond({ data: [{ type: "job", attributes: { status: "completed" } }] });
      await expect(api.workspace("w").job().select("status")).rejects.toThrow("Expected a JSON:API document");
    });

    it("reads a lone relationship object as a selection entry, not a fragment", () => {
      expect(
        api
          .workspace("w")
          .select({ vcs: ["vcsType"] })
          .url()
      ).toBe("workspace/w?include=vcs&fields[workspace]=vcs&fields[vcs]=vcsType");
    });

    it("ends the path at a to-one relationship", () => {
      expect(Object.keys(api.workspace("w").vcs())).toEqual(["select"]);
      expect(Object.keys(api.workspace("w"))).toContain("vcs");
    });

    it("continues a path through a to-one relationship by id", () => {
      expect(Object.keys(api.organization("o").workspace("w").webhook("h"))).toContain("events");
      expect(api.organization("o").workspace("w").webhook("h").select("remoteHookId").url()).toBe(
        "organization/o/workspace/w/webhook/h?fields[webhook]=remoteHookId"
      );
      expect(api.organization("o").workspace("w").webhook("h").events().select("priority").url()).toBe(
        "organization/o/workspace/w/webhook/h/events?fields[webhook_event]=priority"
      );
      // Only the to-one with an id continues: without one the path ends.
      expect(Object.keys(api.organization("o").workspace("w").webhook())).toEqual(["select"]);
    });
  });

  it("signal is passed through and abort rejects", async () => {
    let resolveLate: (value: AxiosResponse<unknown>) => void = () => undefined;
    get.mockImplementation((_url, config) => {
      const signal = config?.signal;
      if (!(signal instanceof AbortSignal)) {
        throw new Error("Expected the request to carry an AbortSignal");
      }
      return new Promise<AxiosResponse<unknown>>((resolve, reject) => {
        resolveLate = resolve;
        signal.addEventListener("abort", () => reject(new CanceledError()));
      });
    });
    const controller = new AbortController();

    const pending = api.workspace().select("name").signal(controller.signal).then();
    expect(get).toHaveBeenCalledWith("workspace?fields[workspace]=name", { signal: controller.signal });
    controller.abort();
    resolveLate(axiosResponse({ data: { data: [{ type: "workspace", id: "w", attributes: { name: "late" } }] } }));

    await expect(pending).rejects.toBeInstanceOf(CanceledError);
  });

  describe("types", () => {
    const run = async () => {
      const ws = await api.workspace("w").select("name", { vcs: ["vcsType"], organization: ["name"] });
      const name: string = ws.name;
      const orgName: string = ws.organization.name;
      // @ts-expect-error vcs is an optional to-one
      const vcsType: string = ws.vcs.vcsType;
      // @ts-expect-error branch was not selected
      expect(ws.branch).toBeUndefined();

      const jobs = await api.workspace("w").job().select("status");
      const statuses: string[] = jobs.map((job) => job.status);

      const vcs = await api.workspace("w").vcs().select("vcsType");
      // @ts-expect-error a workspace may have no vcs, so the to-one path may resolve null
      expect(vcs.vcsType).toBeDefined();
      const organization = await api.workspace("w").organization().select("name");
      const required: string = organization.name;

      const hook = await api.organization("o").workspace("w").webhook("h").select("remoteHookId");
      // @ts-expect-error a workspace may have no webhook, so the to-one path by id may resolve null
      expect(hook.remoteHookId).toBeDefined();
      const triggers = await api.organization("o").workspace("w").webhook("h").events().select("priority");
      const priorities: number[] = triggers.map((trigger) => trigger.priority);

      const item = api.workspace("w").select("name");
      // @ts-expect-error an item has no where
      memberOf(item, "where");
      const selectedList = api.workspace().select("name");
      // @ts-expect-error select is allowed once
      memberOf(selectedList, "select");

      const unselected = await api.workspace("w");
      // @ts-expect-error nothing was selected, so there are no fields to read
      expect(unselected.name).toBeUndefined();

      const orgWorkspace = api.organization("o").workspace("w");
      // @ts-expect-error bogus is not a workspace relationship
      memberOf(orgWorkspace, "bogus");
      // @ts-expect-error job is reachable only through a parent
      memberOf(api, "job");
      // a to-one relationship continues through its id
      api.workspace("w").vcs("v");
      // @ts-expect-error not a job attribute
      api.workspace("w").job().select("name");
      // @ts-expect-error a fragment of another type
      api.workspace("w").select(fields.organization("name"));
      const vcsPath = api.workspace("w").vcs();
      // @ts-expect-error Elide cannot continue a path after a to-one segment
      memberOf(vcsPath, "workspace");
      const organizationPath = api.workspace("w").organization();
      // @ts-expect-error Elide cannot continue a path after a to-one segment, even a required one
      memberOf(organizationPath, "workspace");
      // @ts-expect-error an empty selection asks for nothing
      api.workspace("w").select();
      // @ts-expect-error an empty selection asks for nothing
      api.workspace().select();
      // @ts-expect-error an empty fragment asks for nothing
      fields.workspace();

      return [name, orgName, vcsType, statuses, required, priorities];
    };

    it("type-checks call sites (compile-time only)", () => {
      expect(run).toBeDefined();
    });

    it("Row reads a query's row, for items and lists alike", () => {
      const item = api.workspace("w").select("name", { vcs: ["vcsType"] });
      const list = api
        .workspace()
        .select("name", { vcs: ["vcsType"] })
        .where((w) => w.name.eq("a"));
      const fromItem: Row<typeof item> = { id: "w", name: "infra", vcs: null };
      const fromList: Row<typeof list> = fromItem;
      const fromFragment: Row<ReturnType<typeof fields.workspace<["name", { vcs: ["vcsType"] }]>>> = fromList;
      // @ts-expect-error branch was not selected
      const branch: Row<typeof item> = { id: "w", name: "infra", vcs: null, branch: "main" };

      expect([item.url(), list.url(), fromFragment, branch]).toHaveLength(4);
    });
  });
});
