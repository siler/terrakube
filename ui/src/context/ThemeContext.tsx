import { createContext, ReactNode, useContext, useState } from "react";
import {
  ColorSchemeOption,
  ThemeMode,
  colorSchemeOptions,
  defaultColorScheme,
  defaultThemeMode,
  themeModeOptions,
} from "../config/themeConfig";
import { isOneOf } from "@/modules/utils/typeGuards";

interface ThemeContextType {
  colorScheme: ColorSchemeOption;
  themeMode: ThemeMode;
  setColorScheme: (scheme: ColorSchemeOption) => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const getStoredColorScheme = (): ColorSchemeOption => {
  if (typeof window === "undefined") {
    return defaultColorScheme;
  }

  const saved = localStorage.getItem("terrakube-color-scheme");
  return isOneOf(colorSchemeOptions, saved) ? saved : defaultColorScheme;
};

const getStoredThemeMode = (): ThemeMode => {
  if (typeof window === "undefined") {
    return defaultThemeMode;
  }

  const saved = localStorage.getItem("terrakube-theme-mode");
  return isOneOf(themeModeOptions, saved) ? saved : defaultThemeMode;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [colorScheme, setColorSchemeState] = useState<ColorSchemeOption>(getStoredColorScheme);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getStoredThemeMode);

  const setColorScheme = (scheme: ColorSchemeOption) => {
    localStorage.setItem("terrakube-color-scheme", scheme);
    setColorSchemeState(scheme);
  };

  const setThemeMode = (mode: ThemeMode) => {
    localStorage.setItem("terrakube-theme-mode", mode);
    setThemeModeState(mode);
  };

  return (
    <ThemeContext.Provider value={{ colorScheme, themeMode, setColorScheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
};
