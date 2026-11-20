import { linkIncluded } from "../fixtureLinkage";

const fixture = () => ({
  data: {
    data: { type: "job", id: "1", attributes: { status: "completed" } },
    included: [
      { type: "step", id: "s-1", attributes: { name: "Plan" } },
      { type: "workspace", id: "ws-1", attributes: { name: "prod" } },
    ],
  },
});

describe("linkIncluded", () => {
  it("links only the relationships fields[type] names, as Elide does", () => {
    const linked = linkIncluded("organization/o/job/1?include=step,workspace&fields[job]=status,step", fixture());

    expect(linked.data.data).toEqual({
      type: "job",
      id: "1",
      attributes: { status: "completed" },
      relationships: { step: { data: [{ type: "step", id: "s-1" }] } },
    });
  });

  it("sends empty linkage for a named relationship with nothing included", () => {
    const linked = linkIncluded("organization/o/job/1?fields[job]=status,step,organization", fixture());

    expect(linked.data.data).toMatchObject({
      relationships: { step: { data: [{ type: "step", id: "s-1" }] }, organization: { data: null } },
    });
  });

  it("links every included type when the URL names no fields for the resource", () => {
    const linked = linkIncluded("organization/o/job/1", fixture());

    expect(linked.data.data).toMatchObject({
      relationships: {
        step: { data: [{ type: "step", id: "s-1" }] },
        workspace: { data: { type: "workspace", id: "ws-1" } },
      },
    });
  });

  it("leaves a relationship unlinked when more than one included resource could be its target", () => {
    const response = fixture();
    response.data.included.push({ type: "step", id: "s-2", attributes: { name: "Apply" } });

    const linked = linkIncluded("organization/o/job/1?fields[job]=status,step,workspace", response);

    expect(linked.data.data).toEqual({
      type: "job",
      id: "1",
      attributes: { status: "completed" },
      relationships: { workspace: { data: { type: "workspace", id: "ws-1" } } },
    });
  });

  it("keeps linkage the fixture states, even with several candidates included", () => {
    const response = {
      data: {
        data: {
          type: "job",
          id: "1",
          relationships: { step: { data: [{ type: "step", id: "s-2" }] } },
        },
        included: [
          { type: "step", id: "s-1" },
          { type: "step", id: "s-2" },
        ],
      },
    };

    const linked = linkIncluded("organization/o/job/1?fields[job]=step", response);

    expect(linked.data.data.relationships).toEqual({ step: { data: [{ type: "step", id: "s-2" }] } });
  });

  it("leaves the fixture it was given unchanged", () => {
    const original = fixture();
    const snapshot: unknown = JSON.parse(JSON.stringify(original));

    linkIncluded("organization/o/job/1?fields[job]=status,step", original);

    expect(original).toEqual(snapshot);
  });
});
