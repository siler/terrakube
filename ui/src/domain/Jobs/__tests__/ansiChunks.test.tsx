import { render } from "@testing-library/react";
import { splitLines, useAnsiLines, __clearAnsiLineCache } from "../ansiChunks";

// The `mock` prefix lets the hoisted jest.mock factory reference it.
const mockParseCalls: string[] = [];
const parseCalls = mockParseCalls;

jest.mock("ansi-to-react", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const Ansi = ({ children }: { children: string }) => {
    mockParseCalls.push(children);
    return React.createElement("span", null, children);
  };
  return { __esModule: true, default: Ansi };
});

const LogView = ({ text }: { text: string }) => {
  const lines = useAnsiLines(text);
  return <div data-testid="log">{lines}</div>;
};

beforeEach(() => {
  __clearAnsiLineCache();
  parseCalls.length = 0;
});

describe("splitLines", () => {
  it("splits on newlines", () => {
    expect(splitLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("keeps a trailing empty element only when the text ends with a newline", () => {
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
    expect(splitLines("a\nb\n")).toEqual(["a", "b", ""]);
  });
});

describe("useAnsiLines", () => {
  it("parses each unique line only once as the log grows", () => {
    const { rerender } = render(<LogView text={"a\nb"} />);
    expect(parseCalls).toEqual(["a", "b"]);

    parseCalls.length = 0;
    rerender(<LogView text={"a\nb\nc"} />);
    expect(parseCalls).toEqual(["c"]);
  });

  it("renders one node per line", () => {
    const { getByTestId } = render(<LogView text={"one\ntwo\nthree"} />);
    expect(getByTestId("log").textContent).toBe("onetwothree");
  });
});
