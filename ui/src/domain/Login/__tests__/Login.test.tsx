import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { mgr } from "@/config/authConfig";
import Login from "../Login";

jest.mock("@/config/authConfig", () => ({
  mgr: { signinRedirect: jest.fn() },
}));

const mockSigninRedirect = jest.mocked(mgr.signinRedirect);

describe("Login", () => {
  beforeEach(() => {
    mockSigninRedirect.mockReset();
    localStorage.clear();
  });

  it("applies the stored theme", () => {
    localStorage.setItem("terrakube-color-scheme", "blue");
    localStorage.setItem("terrakube-theme-mode", "dark");

    render(<Login />);

    expect(document.documentElement).toHaveAttribute("data-color-scheme", "blue");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("falls back to the default theme when the stored one is unknown", () => {
    localStorage.setItem("terrakube-color-scheme", "neon");
    localStorage.setItem("terrakube-theme-mode", "sepia");

    render(<Login />);

    expect(document.documentElement).toHaveAttribute("data-color-scheme", "terrakube");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("shows an error instead of doing nothing when the identity provider is unreachable", async () => {
    mockSigninRedirect.mockRejectedValue(new Error("Failed to fetch"));

    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/unable to reach the identity provider/i)).toBeInTheDocument();
  });

  it("does not show an error when sign-in redirect succeeds", async () => {
    mockSigninRedirect.mockResolvedValue(undefined);

    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(mockSigninRedirect).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/unable to reach the identity provider/i)).not.toBeInTheDocument();
  });
});
