import { render, screen } from "@testing-library/react";
import ActionLoader from "../ActionLoader";
import { isActionComponent } from "../actionComponent";

// The first load pulls in antd, react-vis and sucrase, which takes a few seconds under Jest.
const LOAD_TIMEOUT = { timeout: 15000 };

jest.mock("../config/axiosConfig", () => ({ __esModule: true, default: {} }));
// react-markdown is ESM-only, which Jest can't load untransformed.
jest.mock("react-markdown", () => ({ __esModule: true, default: () => null }));

const encodeAction = (source: string) => window.btoa(unescape(encodeURIComponent(source)));

describe("ActionLoader", () => {
  jest.setTimeout(20000);

  it("compiles the action source and renders it with the given context", async () => {
    const action = encodeAction("({ context }) => <span>{context.workspace?.name ?? 'none'}</span>;");

    render(<ActionLoader action={action} context={{ workspace: { name: "prod-network" } }} />);

    expect(await screen.findByText("prod-network", {}, LOAD_TIMEOUT)).toBeInTheDocument();
  });

  it("reports an error when the action source does not evaluate to a component", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    render(<ActionLoader action={encodeAction("42")} context={{}} />);

    expect(
      await screen.findByText(
        /Error loading component: Error: action did not evaluate to a React component/,
        {},
        LOAD_TIMEOUT
      )
    ).toBeInTheDocument();
    consoleError.mockRestore();
  });
});

describe("isActionComponent", () => {
  it("accepts function components and memo/forwardRef wrapper objects", () => {
    expect(isActionComponent(() => null)).toBe(true);
    expect(isActionComponent({ $$typeof: Symbol.for("react.memo") })).toBe(true);
  });

  it("rejects values React cannot render as a component", () => {
    expect(isActionComponent(42)).toBe(false);
    expect(isActionComponent({ render: () => null })).toBe(false);
    expect(isActionComponent(null)).toBe(false);
  });
});
