import { JobStatus } from "../../generated/apiResources";
import { fields, filterFor } from "../../generated/apiPaths";
import { and, type Filter, type FilterPaths, or } from "../filter";
import { buildQuery, toQueryString } from "../selection";

// Names a member at compile time, so a missing one fails on the argument rather than yielding an unresolved type.
const memberOf = <T>(name: keyof T & string): string => name;

describe("filterFor", () => {
  describe("quoting", () => {
    it.each([
      ["", "''"],
      ["prod", "'prod'"],
      ["foo bar", "'foo bar'"],
      ["a,b", "'a,b'"],
      ["a;b", "'a;b'"],
      ["f(x)", "'f(x)'"],
      ["it's", "'it\\'s'"],
      ['say "hi"', "'say \"hi\"'"],
      ["back\\slash", "'back\\\\slash'"],
      ["\\'", "'\\\\\\''"],
    ])("quotes %j as %s", (value, quoted) => {
      expect(filterFor("workspace", (w) => w.name.eq(value))).toBe(`name==${quoted}`);
    });

    // A value that tries to close the quote and append its own clause stays inside one literal.
    it("keeps an injection attempt inside the literal", () => {
      expect(filterFor("workspace", (w) => w.name.eq("x',id=='1"))).toBe("name=='x\\',id==\\'1'");
    });
  });

  describe("contains", () => {
    it("wraps the quoted text in wildcards", () => {
      expect(filterFor("workspace", (w) => w.name.contains("foo bar"))).toBe("name=='*foo bar*'");
      expect(filterFor("workspace", (w) => w.name.contains("o'neil"))).toBe("name=='*o\\'neil*'");
    });
  });

  describe("containsIgnoreCase", () => {
    it("wraps the quoted text in wildcards after =ini=", () => {
      expect(filterFor("workspace", (w) => w.name.containsIgnoreCase("Foo bar"))).toBe("name=ini='*Foo bar*'");
      expect(filterFor("workspace", (w) => w.description.containsIgnoreCase("o'neil"))).toBe(
        "description=ini='*o\\'neil*'"
      );
    });
  });

  describe("in", () => {
    it("quotes every value", () => {
      expect(filterFor("workspace", (w) => w.name.in(["a", "b,c"]))).toBe("name=in=('a','b,c')");
    });

    // `=in=()` is not RSQL; an empty list has no filter that matches nothing.
    it("refuses an empty list", () => {
      expect(() => filterFor("workspace", (w) => w.name.in([]))).toThrow("at least one value");
    });
  });

  it("compares the other operators", () => {
    expect(filterFor("workspace", (w) => w.name.ne("a"))).toBe("name!='a'");
    expect(filterFor("workspace", (w) => w.description.isNull())).toBe("description=isnull=true");
    expect(filterFor("workspace", (w) => w.description.notNull())).toBe("description=isnull=false");
    expect(filterFor("workspace", (w) => w.locked.eq(true))).toBe("locked=='true'");
    expect(filterFor("job", (j) => j.prNumber.eq(42))).toBe("prNumber=='42'");
  });

  it("accepts an enum attribute's values", () => {
    expect(filterFor("job", (j) => j.status.in([JobStatus.pending, JobStatus.running]))).toBe(
      "status=in=('pending','running')"
    );
  });

  it("filters on a relationship's id", () => {
    expect(filterFor("workspace", (w) => w.vcs.id.eq("x"))).toBe("vcs.id=='x'");
    expect(filterFor("workspace", (w) => w.ssh.id.eq("k1"))).toBe("ssh.id=='k1'");
    expect(filterFor("workspace", (w) => w.agent.id.in(["a1", "a2"]))).toBe("agent.id=in=('a1','a2')");
    expect(filterFor("workspace", (w) => w.vcs.id.isNull())).toBe("vcs.id=isnull=true");
  });

  it("filters on a related resource's attributes", () => {
    expect(filterFor("workspace", (w) => w.workspaceTag.tagId.eq("tag-1"))).toBe("workspaceTag.tagId=='tag-1'");
    expect(filterFor("workspace", (w) => w.job.status.in([JobStatus.pending, JobStatus.running]))).toBe(
      "job.status=in=('pending','running')"
    );
    expect(filterFor("workspace", (w) => w.project.name.containsIgnoreCase("core"))).toBe("project.name=ini='*core*'");
    expect(filterFor("workspace", (w) => w.project.id.isNull())).toBe("project.id=isnull=true");
  });

  // Elide puts every predicate on one to-many path onto the same join alias, so both must match one tag binding.
  it("keeps a related pair in one ; group", () => {
    expect(
      filterFor("workspace", (w) =>
        and(
          or(w.name.containsIgnoreCase("api"), w.description.containsIgnoreCase("api")),
          and(w.workspaceTag.tagId.eq("tag-1"), w.workspaceTag.value.eq("prod")),
          w.project.id.eq("p-1")
        )
      )
    ).toBe(
      "(name=ini='*api*',description=ini='*api*');workspaceTag.tagId=='tag-1';workspaceTag.value=='prod';project.id=='p-1'"
    );
  });

  it("filters on the resource's own id", () => {
    expect(filterFor("workspace", (w) => w.id.eq("ws-1"))).toBe("id=='ws-1'");
    expect(filterFor("workspace", (w) => w.id.in(["ws-a", "ws-b"]))).toBe("id=in=('ws-a','ws-b')");
    expect(filterFor("workspace", (w) => w.id.isNull())).toBe("id=isnull=true");
    expect(filterFor("workspace", (w) => w.id.notNull())).toBe("id=isnull=false");
  });

  // Compile-time only: the runtime filter builder shares its operators with attributes, but the type withholds
  // `contains` so an id can never be searched instead of matched.
  it("the resource's own id is not searchable (compile-time only)", () => {
    const probe = () =>
      // @ts-expect-error the id matches exactly; it is not searched
      memberOf<FilterPaths<"workspace">["id"]>("contains");

    expect(probe).toBeDefined();
  });

  describe("and / or", () => {
    it("joins with ; and ,", () => {
      expect(filterFor("workspace", (w) => and(w.name.eq("a"), w.locked.eq(false)))).toBe("name=='a';locked=='false'");
      expect(filterFor("workspace", (w) => or(w.name.eq("a"), w.name.eq("b")))).toBe("(name=='a',name=='b')");
    });

    it("parenthesises a nested or group", () => {
      expect(filterFor("workspace", (w) => and(or(w.name.eq("a"), w.name.eq("b")), w.vcs.id.eq("c")))).toBe(
        "(name=='a',name=='b');vcs.id=='c'"
      );
    });

    it("refuses to combine nothing", () => {
      expect(() => filterFor("workspace", () => and())).toThrow("at least one filter");
      expect(() => filterFor("workspace", () => or())).toThrow("at least one filter");
    });

    it("keeps a single operand bare", () => {
      expect(filterFor("workspace", (w) => or(w.name.eq("a")))).toBe("name=='a'");
    });
  });

  // Review Focus 3: hostile input stays one quoted value and `*` is a wildcard only where contains adds it.
  describe("hostile values", () => {
    const hostile = ["a'b", "a\\b", "*", "a,b", "(x)", ";", "ü", "two words"];

    it.each(hostile)("keeps %j one quoted value through toQueryString", (value) => {
      const rsql = filterFor("workspace", (w) => w.name.eq(value));
      const query = toQueryString(buildQuery("workspace", fields.workspace("name").selection), rsql);
      const encoded = query.split("filter[workspace]=")[1];

      expect(decodeURIComponent(encoded)).toBe(rsql);
      expect(encoded).not.toMatch(/[ ,;&=\\ü]/);
    });

    it("quotes and escapes each one", () => {
      expect(filterFor("workspace", (w) => w.name.eq("a'b"))).toBe("name=='a\\'b'");
      expect(filterFor("workspace", (w) => w.name.eq("a\\b"))).toBe("name=='a\\\\b'");
      expect(filterFor("workspace", (w) => w.name.eq("a,b"))).toBe("name=='a,b'");
      expect(filterFor("workspace", (w) => w.name.eq("(x)"))).toBe("name=='(x)'");
      expect(filterFor("workspace", (w) => w.name.eq(";"))).toBe("name==';'");
      expect(filterFor("workspace", (w) => w.name.eq("ü"))).toBe("name=='ü'");
    });

    it("encodes non-ASCII as UTF-8", () => {
      const query = toQueryString(
        buildQuery("workspace", fields.workspace("name").selection),
        filterFor("workspace", (w) => w.name.eq("ü"))
      );

      expect(query).toBe("fields[workspace]=name&filter[workspace]=name%3D%3D'%C3%BC'");
    });

    // Elide picks a wildcard match from the first value of `==`/`!=`/`=in=`/`=out=`; range comparisons have none.
    describe("wildcard literal", () => {
      it("compares a single edge-* value through a range", () => {
        expect(filterFor("workspace", (w) => w.name.eq("prod*"))).toBe("(name=ge='prod*';name=le='prod*')");
        expect(filterFor("workspace", (w) => w.name.eq("*"))).toBe("(name=ge='*';name=le='*')");
        expect(filterFor("workspace", (w) => w.name.ne("*x"))).toBe("(name=lt='*x',name=gt='*x')");
      });

      it("leaves an inner * on ==", () => {
        expect(filterFor("workspace", (w) => w.name.eq("a*b"))).toBe("name=='a*b'");
      });

      it("puts a value without an edge * first in =in=", () => {
        expect(filterFor("workspace", (w) => w.name.in(["a*", "b"]))).toBe("name=in=('b','a*')");
        expect(filterFor("workspace", (w) => w.name.in(["*a", "b", "c*"]))).toBe("name=in=('b','*a','c*')");
      });

      it("ors a range per value when every value has an edge *", () => {
        expect(filterFor("workspace", (w) => w.name.in(["*a", "b*"]))).toBe(
          "((name=ge='*a';name=le='*a'),(name=ge='b*';name=le='b*'))"
        );
        expect(filterFor("workspace", (w) => w.name.in(["*a"]))).toBe("(name=ge='*a';name=le='*a')");
      });

      it("keeps a list without edge * unchanged", () => {
        expect(filterFor("workspace", (w) => w.name.in(["a", "b"]))).toBe("name=in=('a','b')");
      });

      it("still quotes hostile edge-* values", () => {
        expect(filterFor("workspace", (w) => w.name.eq("*a',b;c"))).toBe("(name=ge='*a\\',b;c';name=le='*a\\',b;c')");
        expect(filterFor("workspace", (w) => w.name.ne("x\\*"))).toBe("(name=lt='x\\\\*',name=gt='x\\\\*')");
      });

      it("keeps contains' own wildcards", () => {
        expect(filterFor("workspace", (w) => w.name.contains("*"))).toBe("name=='***'");
        expect(filterFor("workspace", (w) => w.name.containsIgnoreCase("x"))).toBe("name=ini='*x*'");
      });
    });
  });

  it("rejects what the schema does not allow", () => {
    // Never called: these lines only have to fail to compile.
    const rejected = (jobFilter: Filter<"job">) => {
      // @ts-expect-error not a workspace attribute
      memberOf<FilterPaths<"workspace">>("address");
      // @ts-expect-error step is a job relationship, not a workspace one
      memberOf<FilterPaths<"workspace">>("step");
      // @ts-expect-error contains needs a string attribute
      memberOf<FilterPaths<"workspace">["locked"]>("contains");
      // @ts-expect-error contains is for free text, not an enum
      memberOf<FilterPaths<"job">["status"]>("contains");
      // @ts-expect-error in takes an array
      filterFor("workspace", (w) => w.name.in("a"));
      // @ts-expect-error a boolean attribute compares to a boolean
      filterFor("workspace", (w) => w.locked.eq("true"));
      // @ts-expect-error not a JobStatus
      filterFor("job", (j) => j.status.eq("done"));
      // @ts-expect-error a filter built for another type
      filterFor("workspace", () => jobFilter);
      // @ts-expect-error filters combine only within one type
      filterFor("workspace", (w) => and(w.name.eq("a"), jobFilter));
      // @ts-expect-error a list attribute has no comparisons
      memberOf<FilterPaths<"job">>("targetAddrs");
      // @ts-expect-error containsIgnoreCase needs a string attribute
      memberOf<FilterPaths<"workspace">["locked"]>("containsIgnoreCase");
      // @ts-expect-error containsIgnoreCase is for free text, not an enum
      memberOf<FilterPaths<"workspace">["lastJobStatus"]>("containsIgnoreCase");
      // @ts-expect-error not a workspacetag attribute
      memberOf<FilterPaths<"workspace">["workspaceTag"]>("colour");
      // @ts-expect-error a related attribute keeps its own value type
      filterFor("workspace", (w) => w.job.status.eq("done"));
      // @ts-expect-error paths stop one relationship deep
      memberOf<FilterPaths<"workspace">["workspaceTag"]>("workspace");
      // @ts-expect-error a raw string is not a filter
      filterFor("workspace", () => "name=='a'");
    };
    expect(rejected).toBeInstanceOf(Function);
  });
});
