/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

// Design system — the editor theme. DARK is the primary surface
// ("long design sessions"); light ships as the toggle for colour /
// proof judgement. Both themes are ONE token set (styles/theme.css
// `:root` + `.dark`) — switching is just the `dark` class on
// <html>, so tokens cascade into portals (radix popovers, dockview
// floating groups) that render outside the React root.

export type EditorTheme = "dark" | "light";

const STORAGE_KEY = "paged.theme";

function loadInitialTheme(): EditorTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    /* storage unavailable (iframe sandbox) — fall through */
  }
  return "dark";
}

interface ThemeValue {
  theme: EditorTheme;
  setTheme: (t: EditorTheme) => void;
  toggleTheme: () => void;
}

const Context = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<EditorTheme>(loadInitialTheme);

  // Apply on <html> so EVERYTHING (portals, dockview overlays,
  // body background) inherits; persist the choice.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* persistence is a convenience only */
    }
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );
  const value = useMemo<ThemeValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, toggleTheme],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useTheme called outside ThemeProvider");
  }
  return ctx;
}

export function useOptionalTheme(): ThemeValue | null {
  return useContext(Context);
}
