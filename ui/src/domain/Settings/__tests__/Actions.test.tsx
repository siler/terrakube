import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Buffer } from "node:buffer";
import axiosInstance from "@/config/axiosConfig";
import { ActionSettings } from "../Actions";

jest.mock("@/config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  getErrorMessage: (error: Error) => error.message,
}));

jest.mock("@/components/forms/CodeEditor", () => ({
  CodeEditor: ({ onMount }: { onMount: (editor: unknown) => void }) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const ref = React.useRef<HTMLTextAreaElement>(null);
    React.useEffect(() => {
      onMount({
        getValue: () => ref.current?.value ?? "",
        setValue: (value: string) => {
          if (ref.current) {
            ref.current.value = value;
          }
        },
        focus: () => ref.current?.focus(),
      });
    }, []);
    return <textarea aria-label="Action code" ref={ref} />;
  },
}));

const invalidCode = "() => { return (; }";
const validCode = "function(context) { return <Button>{context.name}</Button>; }";

const ACTION_LIST = "action?fields[action]=name,type,category,version,active";
const ACTION_EDIT =
  "action/example?fields[action]=name,description,version,active,type,label,category,displayCriteria,action";

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(axiosInstance.get).mockImplementation(async (url: string) => {
    if (url === ACTION_EDIT)
      return {
        data: {
          data: {
            id: "example",
            attributes: {
              name: "Example",
              type: "Workspace/Action",
              category: "General",
              label: "Run",
              version: "1.0.0",
              displayCriteria: "[]",
              action: Buffer.from(invalidCode).toString("base64"),
            },
          },
        },
      };
    if (url === ACTION_LIST) return { data: { data: [] } };
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  jest.mocked(axiosInstance.post).mockResolvedValue({ data: {} });
  jest.mocked(axiosInstance.patch).mockResolvedValue({ data: {} });
});

it.each(["new", "edit"] as const)("blocks invalid code and allows a corrected %s action", async (mode) => {
  render(
    <MemoryRouter>
      <ActionSettings editorMode={mode} editorId={mode === "edit" ? "example" : undefined} />
    </MemoryRouter>
  );
  if (mode === "new") {
    for (const [label, value] of [
      ["ID", "example"],
      ["Name", "Example"],
      ["Label", "Run"],
      ["Category", "General"],
      ["Version", "1.0.0"],
    ]) {
      fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
    }
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Workspace/Action", { selector: ".ant-select-item-option-content" }));
    fireEvent.change(screen.getByLabelText("Action code"), { target: { value: invalidCode } });
  } else {
    await waitFor(() => expect(screen.getByLabelText("Action code")).toHaveValue(invalidCode));
  }

  fireEvent.click(screen.getByRole("button", { name: mode === "new" ? "Create action" : "Update action" }));
  expect(await screen.findByText("Fix the action code before saving")).toBeInTheDocument();
  expect(axiosInstance.post).not.toHaveBeenCalled();
  expect(axiosInstance.patch).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Action code")).toHaveValue(invalidCode);
  expect(screen.getByLabelText("Action code")).toHaveFocus();

  fireEvent.change(screen.getByLabelText("Action code"), { target: { value: validCode } });
  fireEvent.click(screen.getByRole("button", { name: mode === "new" ? "Create action" : "Update action" }));
  const save = mode === "new" ? axiosInstance.post : axiosInstance.patch;
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const body = jest.mocked(save).mock.calls[0][1];
  expect(body).toMatchObject({
    data: { type: "action", id: "example", attributes: { action: Buffer.from(validCode).toString("base64") } },
  });
  // the identifier is the resource id, not an attribute
  expect(body).toHaveProperty("data.attributes");
  expect(body).not.toHaveProperty("data.attributes.id");
  expect(screen.queryByText("Fix the action code before saving")).not.toBeInTheDocument();
});

const editActionWith = (displayCriteria: string) =>
  jest.mocked(axiosInstance.get).mockImplementation(async (url: string) => {
    if (url === ACTION_EDIT) {
      return {
        data: {
          data: {
            id: "example",
            attributes: {
              name: "Example",
              type: "Workspace/Action",
              category: "General",
              label: "Run",
              version: "1.0.0",
              displayCriteria,
              action: Buffer.from(validCode).toString("base64"),
            },
          },
        },
      };
    }
    if (url === ACTION_LIST) {
      return { data: { data: [] } };
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });

it.each([
  ["no stored criteria", "", "[]"],
  [
    "stored criteria",
    '[{"filter":"true","settings":[{"key":"a","value":"one"}]}]',
    '[{"filter":"true","settings":[{"key":"a","value":"one"}]}]',
  ],
])("opens and saves an action with %s", async (_, stored, saved) => {
  editActionWith(stored);
  render(
    <MemoryRouter>
      <ActionSettings editorMode="edit" editorId="example" />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByLabelText("Action code")).toHaveValue(validCode));

  fireEvent.click(screen.getByRole("button", { name: "Update action" }));
  await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalledTimes(1));
  expect(jest.mocked(axiosInstance.patch).mock.calls[0][1]).toMatchObject({
    data: { attributes: { displayCriteria: saved } },
  });
});
