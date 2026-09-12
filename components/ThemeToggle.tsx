"use client";

import { useEffect, useState } from "react";

// Reads/writes a "theme" key in localStorage and toggles the `.dark` class
// on <html>; see the inline script in app/layout.tsx for the no-flash
// initial value, and app/globals.css for how that class re-themes the app.
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage can be unavailable (private mode, etc.) — theme just
      // won't persist across reloads in that case, no need to error out.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`text-sm text-ink/70 hover:text-ink border border-line rounded-md px-3 py-1.5 ${className}`}
      aria-label="Toggle dark mode"
    >
      {dark ? "☀ Light" : "🌙 Dark"}
    </button>
  );
}
