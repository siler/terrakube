import { renderHook } from "@testing-library/react";
import { ReactNode } from "react";
import { ThemeProvider, useTheme } from "../ThemeContext";

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

describe("ThemeProvider", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("restores known stored values", () => {
    localStorage.setItem("terrakube-color-scheme", "blue");
    localStorage.setItem("terrakube-theme-mode", "dark");

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.colorScheme).toBe("blue");
    expect(result.current.themeMode).toBe("dark");
  });

  it("falls back to the defaults when stored values are unknown", () => {
    localStorage.setItem("terrakube-color-scheme", "green");
    localStorage.setItem("terrakube-theme-mode", "sepia");

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.colorScheme).toBe("terrakube");
    expect(result.current.themeMode).toBe("light");
  });

  it("falls back to the defaults when nothing is stored", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.colorScheme).toBe("terrakube");
    expect(result.current.themeMode).toBe("light");
  });
});
