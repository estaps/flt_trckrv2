"use client";

import { useState } from "react";

export type Look = "pass" | "board";

// Switches between the boarding pass look and the departures board look. Remembered in a cookie
// so the server renders the chosen look and the page does not flash on load.
export function LookSwitch({ initial }: { initial: Look }) {
  const [look, setLook] = useState<Look>(initial);
  const choose = (next: Look) => {
    setLook(next);
    if (next === "board") document.documentElement.dataset.look = "board";
    else delete document.documentElement.dataset.look;
    document.cookie = `look=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div className="look" role="group" aria-label="Look">
      <button type="button" aria-pressed={look === "pass"} onClick={() => choose("pass")}>Pass</button>
      <button type="button" aria-pressed={look === "board"} onClick={() => choose("board")}>Board</button>
    </div>
  );
}
