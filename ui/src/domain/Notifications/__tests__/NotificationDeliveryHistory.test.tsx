import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axiosInstance from "@/config/axiosConfig";
import { NotificationDeliveryHistory } from "../NotificationDeliveryHistory";

jest.mock("@/config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  getErrorMessage: jest.fn(() => "error"),
}));

describe("NotificationDeliveryHistory", () => {
  it("renders sent and failed deliveries with status and error detail", async () => {
    jest.mocked(axiosInstance.get).mockResolvedValue({
      data: [
        {
          id: "d1",
          jobId: 42,
          configurationName: "Prod Alerts",
          channelType: "SLACK",
          status: "FAILED",
          attemptCount: 3,
          lastAttemptAt: "2026-08-12T00:00:00Z",
          lastError: "connection refused",
          createdDate: "2026-08-12T00:00:00Z",
        },
        {
          id: "d2",
          jobId: 41,
          configurationName: "Prod Alerts",
          channelType: "SLACK",
          status: "SENT",
          attemptCount: 1,
          lastAttemptAt: "2026-08-11T23:00:00Z",
          lastError: null,
          createdDate: "2026-08-11T23:00:00Z",
        },
      ],
    });

    render(<NotificationDeliveryHistory workspaceId="ws-1" />);

    await waitFor(() => expect(screen.getByText("Failed")).toBeInTheDocument());
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("connection refused")).toBeInTheDocument();
    expect(screen.getByText(/Job #42/)).toBeInTheDocument();
  });

  it("renders nothing when there are no deliveries", async () => {
    jest.mocked(axiosInstance.get).mockResolvedValue({ data: [] });

    const { container } = render(<NotificationDeliveryHistory workspaceId="ws-1" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("retries a failed delivery and reloads the list", async () => {
    const failedDelivery = {
      id: "d1",
      jobId: 42,
      configurationName: "Prod Alerts",
      channelType: "SLACK",
      status: "FAILED",
      attemptCount: 3,
      lastAttemptAt: "2026-08-12T00:00:00Z",
      lastError: "connection refused",
      createdDate: "2026-08-12T00:00:00Z",
    };
    jest
      .mocked(axiosInstance.get)
      .mockResolvedValueOnce({ data: [failedDelivery] })
      .mockResolvedValueOnce({ data: [{ ...failedDelivery, status: "PENDING", lastError: null }] });
    jest.mocked(axiosInstance.post).mockResolvedValue({});

    render(<NotificationDeliveryHistory workspaceId="ws-1" />);
    await waitFor(() => expect(screen.getByText("Failed")).toBeInTheDocument());
    // While the list is loading the spinner blurs it and takes away pointer events, and clicking in that moment fails.
    await waitFor(() => expect(document.querySelector(".ant-spin-blur")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() =>
      expect(axiosInstance.post).toHaveBeenCalledWith(
        "https://terrakube-api.test/notification/v1/workspace/ws-1/deliveries/d1/retry"
      )
    );
    await waitFor(() => expect(screen.getByText("Pending")).toBeInTheDocument());
  });

  it("drops rows it cannot render and ignores a body that is not a list", async () => {
    const sent = {
      id: "d2",
      jobId: 41,
      configurationName: "Prod Alerts",
      channelType: "SLACK",
      status: "SENT",
      attemptCount: 1,
      lastAttemptAt: null,
      lastError: null,
      createdDate: "2026-08-11T23:00:00Z",
    };
    jest.mocked(axiosInstance.get).mockResolvedValueOnce({
      data: [sent, { ...sent, id: "d3", channelType: "EMAIL" }, { ...sent, id: "d4", status: "BOUNCED" }],
    });

    const { unmount } = render(<NotificationDeliveryHistory workspaceId="ws-1" />);

    await waitFor(() => expect(screen.getByText("Sent")).toBeInTheDocument());
    expect(screen.getByText("The last 1 notification attempts for this workspace's runs.")).toBeInTheDocument();
    unmount();

    jest.mocked(axiosInstance.get).mockResolvedValueOnce({ data: { error: "unexpected" } });
    const { container } = render(<NotificationDeliveryHistory workspaceId="ws-1" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
