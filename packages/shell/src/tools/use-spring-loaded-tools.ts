import { useEffect, useRef } from "react";

import {
  useTool,
  HAND_TOOL_ID,
  DIRECT_SELECT_TOOL_ID,
  ZOOM_TOOL_ID,
} from "../state/tool-context";
import { useContentSelection } from "../state/content-selection-context";
import type { ToolId } from "../registries/tool";

// Concept 1 (T2) — spring-loaded momentary tools. Holding a key pushes
// a transient override onto the active-tool stack; releasing it pops.
// The gesture spine sees `reason: "suspend"` so the suspended
// handler's in-flight gesture is kept, not cancelled (AC 5).
//
//   Space        → momentary Hand (pan)
//   Cmd / Meta   → momentary Direct Selection
//   Cmd + Space  → momentary Zoom (Alt at click time zooms out)
//
// Guards: inert while typing in a DOM editable or while the canvas
// text caret is active (Space must type a space). Window blur clears
// every override — Cmd+Tab away means the key-ups never arrive.

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable
  );
}

export function useSpringLoadedTools(): void {
  const { pushOverride, popOverride, clearOverrides } = useTool();
  const { contentSelectionRef } = useContentSelection();

  // Which override each physical key pushed, so its key-up pops
  // exactly that id even if the modifier state changed in between.
  const pushedByKey = useRef(new Map<string, ToolId>());

  useEffect(() => {
    const keyFor = (e: KeyboardEvent): string | null => {
      if (e.code === "Space" || e.key === " ") return "space";
      if (e.key === "Meta") return "meta";
      return null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = keyFor(e);
      if (!key || e.repeat) return;
      if (pushedByKey.current.has(key)) return;
      if (isEditableTarget(e.target)) return;
      // A live text caret owns Space (it types). Cmd stays allowed —
      // it is a chord modifier everywhere.
      if (key === "space" && contentSelectionRef.current != null) return;

      let id: ToolId;
      if (key === "space") {
        id = e.metaKey ? ZOOM_TOOL_ID : HAND_TOOL_ID;
        // Keep Space from scrolling the page while spring-loaded.
        e.preventDefault();
      } else {
        id = pushedByKey.current.has("space")
          ? ZOOM_TOOL_ID
          : DIRECT_SELECT_TOOL_ID;
      }
      pushedByKey.current.set(key, id);
      pushOverride(id);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = keyFor(e);
      if (!key) return;
      const id = pushedByKey.current.get(key);
      if (id === undefined) return;
      pushedByKey.current.delete(key);
      popOverride(id);
    };

    const onBlur = () => {
      if (pushedByKey.current.size === 0) return;
      pushedByKey.current.clear();
      clearOverrides();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [pushOverride, popOverride, clearOverrides, contentSelectionRef]);
}
