import type {
  AtomicOperationsBody,
  ClientIdCreateBody,
  CreateBody,
  FormValues,
  RelationshipBody,
  UpdateBody,
} from "../bodies";

// These are compile-time checks: `npx tsc -p tsconfig.test.json` fails if an expected error disappears.
describe("write bodies", () => {
  it("strips optionality and null from FormValues", () => {
    const folder: FormValues<"workspace">["folder"] = "/";
    // @ts-expect-error the API's null is stripped
    const nulled: FormValues<"workspace">["folder"] = null;
    // @ts-expect-error the API's optional marker is stripped, so every attribute is required
    const partial: FormValues<"workspace"> = {};
    expect([folder, nulled, partial]).toEqual(["/", null, {}]);
  });

  it("accepts bodies the schema describes", () => {
    const create: CreateBody<"workspace"> = {
      data: {
        type: "workspace",
        attributes: { name: "ws", executionMode: "remote" },
        relationships: {
          vcs: { data: { type: "vcs", id: "v" } },
          ssh: { data: null },
          workspaceTag: { data: [{ type: "workspacetag", id: "t" }] },
        },
      },
    };
    const clientCreate: ClientIdCreateBody<"action"> = {
      data: { type: "action", id: "terrakube.restart-vm", attributes: { name: "Restart VM" } },
    };
    const noAttributes: CreateBody<"policy_attachment"> = {
      data: { type: "policy_attachment", relationships: { tag: { data: { type: "tag", id: "t" } } } },
    };
    const update: UpdateBody<"job"> = { data: { type: "job", id: "1", attributes: { status: "approved" } } };
    const toOne: RelationshipBody<"workspace", "project"> = { data: { type: "project", id: "p" } };
    const cleared: RelationshipBody<"workspace", "project"> = { data: null };
    const toMany: RelationshipBody<"notification_configuration", "templates"> = {
      data: [{ type: "template", id: "t" }],
    };

    expect([create, clientCreate, noAttributes, update, toOne, cleared, toMany]).toHaveLength(7);
  });

  it("rejects bodies the schema does not describe", () => {
    const unknownAttribute: UpdateBody<"workspace"> = {
      // @ts-expect-error address is not a workspace attribute
      data: { type: "workspace", id: "1", attributes: { address: "x" } },
    };
    // @ts-expect-error an update names the resource it changes
    const noId: UpdateBody<"workspace"> = { data: { type: "workspace", attributes: { name: "ws" } } };
    // @ts-expect-error the body's type is the resource's type
    const wrongType: CreateBody<"workspace"> = { data: { type: "project", attributes: {} } };
    // @ts-expect-error not one of JobStatus's values
    const wrongValue: UpdateBody<"job"> = { data: { type: "job", id: "1", attributes: { status: "done" } } };
    const wrongLinkage: CreateBody<"workspace"> = {
      // @ts-expect-error vcs points at vcs, not ssh
      data: { type: "workspace", attributes: {}, relationships: { vcs: { data: { type: "ssh", id: "s" } } } },
    };
    const unknownRelationship: CreateBody<"workspace"> = {
      // @ts-expect-error step is a job relationship, not a workspace one
      data: { type: "workspace", attributes: {}, relationships: { step: { data: [] } } },
    };
    const manyAsOne: CreateBody<"workspace"> = {
      data: {
        type: "workspace",
        attributes: {},
        // @ts-expect-error workspaceTag is to-many
        relationships: { workspaceTag: { data: { type: "workspacetag", id: "t" } } },
      },
    };
    const unknownId = (): string | undefined => undefined;
    const maybeId = unknownId();
    // @ts-expect-error an id that may be undefined is neither an update nor a server-named create
    const unsureUpdate: CreateBody<"workspace"> | UpdateBody<"workspace"> = {
      data: { type: "workspace", id: maybeId },
    };
    // @ts-expect-error a client-generated id is required once given
    const unsureClientId: ClientIdCreateBody<"action"> = { data: { type: "action", id: maybeId } };
    // @ts-expect-error project is to-one
    const oneAsMany: RelationshipBody<"workspace", "project"> = { data: [{ type: "project", id: "p" }] };
    // @ts-expect-error a to-many relationship is cleared with [], not null
    const nullMany: RelationshipBody<"notification_configuration", "templates"> = { data: null };

    expect([
      unknownAttribute,
      noId,
      wrongType,
      wrongValue,
      wrongLinkage,
      unknownRelationship,
      manyAsOne,
      unsureUpdate,
      unsureClientId,
      oneAsMany,
      nullMany,
    ]).toHaveLength(11);
  });

  it("accepts atomic operations the schema describes", () => {
    const body: AtomicOperationsBody<"webhook" | "webhook_event"> = {
      "atomic:operations": [
        { op: "remove", href: "/webhook/w/events/e0" },
        { op: "add", href: "/webhook", data: { type: "webhook", id: "w" } },
        {
          op: "add",
          href: "/webhook/w/events",
          data: { type: "webhook_event", lid: "e1", attributes: { branch: "main" } },
        },
        { op: "update", href: "/webhook/w/events/e2", data: { type: "webhook_event", id: "e2", attributes: {} } },
      ],
    };
    const linked: AtomicOperationsBody<"workspace"> = {
      "atomic:operations": [
        {
          op: "add",
          href: "/organization/o/workspace",
          data: {
            type: "workspace",
            lid: "l",
            attributes: { name: "ws" },
            relationships: { project: { data: { type: "project", id: "p" } } },
          },
        },
      ],
    };

    expect([body, linked]).toHaveLength(2);
  });

  it("rejects atomic operations the schema does not describe", () => {
    const misplacedLinkage: AtomicOperationsBody<"webhook"> = {
      "atomic:operations": [
        {
          op: "update",
          href: "/webhook",
          data: { type: "webhook", id: "w" },
          // @ts-expect-error relationships belong inside data
          relationships: { events: { data: [] } },
        },
      ],
    };
    const updateWithoutId: AtomicOperationsBody<"workspace"> = {
      // @ts-expect-error an update names the resource it changes
      "atomic:operations": [{ op: "update", href: "/workspace/1", data: { type: "workspace", attributes: {} } }],
    };
    const unknownAttribute: AtomicOperationsBody<"workspace"> = {
      "atomic:operations": [
        // @ts-expect-error address is not a workspace attribute
        { op: "add", href: "/workspace", data: { type: "workspace", attributes: { address: "x" } } },
      ],
    };
    const otherType: AtomicOperationsBody<"workspace"> = {
      // @ts-expect-error the body only carries the types it names
      "atomic:operations": [{ op: "add", href: "/project", data: { type: "project", attributes: {} } }],
    };
    const unknownOp: AtomicOperationsBody<"workspace"> = {
      // @ts-expect-error Elide's ops are add, update and remove
      "atomic:operations": [{ op: "replace", href: "/workspace/1" }],
    };

    expect([misplacedLinkage, updateWithoutId, unknownAttribute, otherType, unknownOp]).toHaveLength(5);
  });
});
