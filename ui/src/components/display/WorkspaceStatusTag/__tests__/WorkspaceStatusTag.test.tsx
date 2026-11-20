import { render, screen } from "@testing-library/react";
import { JobStatus } from "@/domain/generated/apiResources";
import { statusColors } from "@/modules/workspaces/utils/workspaceStatusColors";
import WorkspaceStatusTag from "../WorkspaceStatusTag";

describe("WorkspaceStatusTag", () => {
  it("colours the tag through the tk-status-tag recipe, not Ant's color prop", () => {
    const { container } = render(<WorkspaceStatusTag status={JobStatus.failed} />);
    const tag = container.querySelector<HTMLElement>(".ant-tag");
    if (tag === null) {
      throw new Error("Expected an .ant-tag element");
    }

    // A color prop would make Ant paint the tag inline and bypass the contrast-safe CSS.
    expect(tag).toHaveClass("tk-status-tag");
    expect(tag.style.backgroundColor).toBe("");
    expect(tag.style.getPropertyValue("--status-color")).toBe(statusColors[JobStatus.failed]);
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });
});
