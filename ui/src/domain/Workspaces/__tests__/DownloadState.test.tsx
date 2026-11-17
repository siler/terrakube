import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toJpeg, toPng } from "html-to-image";
import { DownloadState } from "../DownloadState";

const requestMock = jest.fn<Promise<unknown>, [config: unknown]>();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { request: (...args: Parameters<typeof requestMock>) => requestMock(...args) },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Error"),
}));

jest.mock("html-to-image", () => ({
  toPng: jest.fn(),
  toJpeg: jest.fn(),
  toSvg: jest.fn(),
}));

const toPngMock = jest.mocked(toPng);
const toJpegMock = jest.mocked(toJpeg);

const chooseMenuItem = async (label: string) => {
  const [, trigger] = screen.getAllByRole("button");
  fireEvent.mouseEnter(trigger);
  fireEvent.click(await screen.findByText(label));
};

describe("DownloadState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.querySelectorAll(".react-flow__renderer").forEach((node) => node.remove());
  });

  it("reports a failed state download instead of leaving the rejection unhandled", async () => {
    requestMock.mockRejectedValue(new Error("Network Error"));
    render(<DownloadState stateUrl="http://state" manageState />);

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    expect(await screen.findByText("Downloading the state failed: Network Error")).toBeInTheDocument();
    expect(requestMock).toHaveBeenCalledWith({ url: "http://state", method: "GET", responseType: "blob" });
  });

  it("says the diagram cannot be exported when it is not on the page", async () => {
    render(<DownloadState stateUrl="http://state" manageState />);

    await chooseMenuItem("Download PNG");

    expect(await screen.findByText("The state diagram is not shown, so it cannot be exported")).toBeInTheDocument();
    expect(toPngMock).not.toHaveBeenCalled();
  });

  it("exports the shown diagram, with a white background for JPEG", async () => {
    toJpegMock.mockResolvedValue("data:image/jpeg;base64,");
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const diagram = document.createElement("div");
    diagram.className = "react-flow__renderer";
    document.body.appendChild(diagram);
    render(<DownloadState stateUrl="http://state" manageState />);

    await chooseMenuItem("Download JPEG");

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(toJpegMock).toHaveBeenCalledWith(
      diagram,
      expect.objectContaining({ backgroundColor: "white", width: 1024 })
    );
    clickSpy.mockRestore();
  });

  it("reports a failed image export", async () => {
    toPngMock.mockRejectedValue(new Error("tainted canvas"));
    const diagram = document.createElement("div");
    diagram.className = "react-flow__renderer";
    document.body.appendChild(diagram);
    render(<DownloadState stateUrl="http://state" manageState />);

    await chooseMenuItem("Download PNG");

    expect(await screen.findByText("Exporting the state diagram failed: tainted canvas")).toBeInTheDocument();
  });
});
