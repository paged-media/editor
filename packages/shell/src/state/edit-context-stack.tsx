// W3.2 — the edit-context STACK (closes plugin-draw B-02 / plugin-web
// W-03). The registry (registries/edit-context.ts) holds the registered
// contexts + object types; THIS context owns the live, ordered STACK of
// entered contexts and the chrome/scope they imply.
//
// STACK SEMANTICS
//   · `enter(type, id, ...)` PUSHES a frame: the active edit-context
//     type, the element it was entered on (the write-scope root), the
//     restricted tool-set, and the emphasized panel-set. Re-entering the
//     SAME type on the SAME element is a no-op (a stray double-click
//     doesn't stack duplicates).
//   · `pop()` removes the TOP frame (Esc pops ONE level — nested
//     contexts unwind one at a time). Returns the popped frame so the
//     caller can run onExit.
//   · `exitAll()` clears the stack (selection-clear / document-close).
//   · `active` is the TOP frame (or null); `breadcrumb` is the whole
//     stack root→top for the UI trail.
//
// WRITE-SCOPE LINE (documented honesty — what this enforces vs. what it
// doesn't):
//   The stack carries `scopeRoot` = the entered element's id. This is
//   the SELECTION-LEVEL scope: the canvas gesture/mutation entry (where
//   SELECTION already narrows what a click can target) consults
//   `isInScope(id)` to keep edits inside the context's element. That is
//   the same enforcement depth SELECTION has today — a guard at the
//   gesture/mutation ENTRY, not a kernel-level capability. TRUE
//   engine-level subtree isolation (a mutation addressed at an
//   out-of-scope id REJECTED by the engine) is the isolate's job and is
//   NOT done here; `isInScope` is the honest selection-space line. v1
//   scopes to the entered element itself (+ its descendants once a
//   subtree query lands); see the B-02 closure RESIDUALS.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { ElementId } from "@paged-media/client";

import type {
  EditContextContribution,
  EnteredEditContext,
} from "../registries/edit-context";

/** One entered context — a stack frame. */
export interface EditContextFrame {
  /** The edit-context type (`"vectorGraphic"`, `"webFrame"`, …). */
  type: string;
  /** The element the context was entered on — the write-scope root. */
  scopeRoot: ElementId;
  /** Tool ids the rail is restricted to while this frame is top.
   *  Empty = no restriction. */
  toolIds: string[];
  /** Panel ids the cockpit emphasizes while this frame is active. */
  panelIds: string[];
  /** A human label for the breadcrumb (the type, title-cased by the UI). */
  label: string;
}

export interface EditContextStackValue {
  /** The whole stack, root→top. */
  stack: EditContextFrame[];
  /** The TOP frame, or null when no context is active. */
  active: EditContextFrame | null;
  /** The TOP frame's CONTRIBUTION (its live hooks — onContentPointer*,
   *  onCommit/onCancel/isDirty), or null. K-1: the canvas reads this to
   *  deliver content-space pointers to the active context. */
  activeContribution: EditContextContribution | null;
  /** Breadcrumb trail (root→top) — the same as `stack`, named for the UI. */
  breadcrumb: EditContextFrame[];
  /** Push a context onto the stack (double-click / programmatic enter).
   *  Re-entering the same type+element is a no-op. Returns the pushed
   *  frame, or the existing one when it was a no-op. */
  enter(contribution: EditContextContribution, on: ElementId): EditContextFrame;
  /** Pop the TOP frame (plain exit — runs `onExit` only). Returns the
   *  popped frame, or null when the stack was empty. */
  pop(): EditContextFrame | null;
  /** K-1 — modal COMMIT the top frame: run its `onCommit` (Enter /
   *  click-outside) THEN `onExit`, then pop. */
  commit(): EditContextFrame | null;
  /** K-1 — modal CANCEL the top frame: run its `onCancel` (Esc) THEN
   *  `onExit`, then pop. */
  cancel(): EditContextFrame | null;
  /** K-1 — does the active context have unsaved edits? Polls the top
   *  contribution's `isDirty` (false when none / no context). Gates the
   *  discard prompt + the §8.0 seamless-undo boundary. */
  isActiveDirty(): boolean;
  /** Clear the entire stack (selection-clear / document-close). */
  exitAll(): void;
  /** Is `id` inside the ACTIVE context's write-scope? True when no
   *  context is active (no restriction). The honest selection-space
   *  line — see the module header. */
  isInScope(id: ElementId | null | undefined): boolean;
}

const Context = createContext<EditContextStackValue | null>(null);

/** Stable string key for an ElementId (kind+id) — used to de-dupe a
 *  re-enter and to compare scope membership without importing the
 *  client's id helpers. */
function idKey(id: ElementId): string {
  const anyId = id as unknown as { kind?: string; id?: string };
  return `${anyId.kind ?? ""}:${anyId.id ?? String(id)}`;
}

export function EditContextStackProvider({ children }: PropsWithChildren) {
  const [stack, setStack] = useState<EditContextFrame[]>([]);
  // Hooks fire OUTSIDE React state (the plugin's onEnter/onExit) — keep
  // them in a ref so the callbacks stay stable and don't re-fire on
  // unrelated renders.
  const hooksRef = useRef(
    new Map<string, EditContextContribution>(),
  );

  const enter = useCallback(
    (contribution: EditContextContribution, on: ElementId): EditContextFrame => {
      const frame: EditContextFrame = {
        type: contribution.type,
        scopeRoot: on,
        toolIds: contribution.toolIds ?? [],
        panelIds: contribution.panelIds ?? [],
        label: contribution.type,
      };
      let result = frame;
      setStack((prev) => {
        const top = prev[prev.length - 1];
        if (
          top &&
          top.type === frame.type &&
          idKey(top.scopeRoot) === idKey(frame.scopeRoot)
        ) {
          // Same context, same element — a no-op (don't stack dupes).
          result = top;
          return prev;
        }
        hooksRef.current.set(frame.type, contribution);
        return [...prev, frame];
      });
      // Run the plugin's onEnter AFTER the push is scheduled (the hook
      // primes panel state / publishes bindings; it must not see a stale
      // stack, but it also must not block the state update).
      if (result === frame) {
        const entered: EnteredEditContext = { type: frame.type, id: on };
        try {
          contribution.onEnter?.(entered);
        } catch {
          /* a throwing hook must not wedge the stack */
        }
      }
      return result;
    },
    [],
  );

  // Pop the top frame, running the modal hook for `mode` (commit/cancel,
  // K-1) BEFORE `onExit`. `exit` runs `onExit` only (the plain pop). A
  // throwing hook never wedges the unwind.
  const popWith = useCallback(
    (mode: "exit" | "commit" | "cancel"): EditContextFrame | null => {
      let popped: EditContextFrame | null = null;
      setStack((prev) => {
        if (prev.length === 0) return prev;
        popped = prev[prev.length - 1];
        return prev.slice(0, -1);
      });
      if (popped) {
        const frame = popped as EditContextFrame;
        const contribution = hooksRef.current.get(frame.type);
        hooksRef.current.delete(frame.type);
        try {
          if (mode === "commit") contribution?.onCommit?.();
          else if (mode === "cancel") contribution?.onCancel?.();
        } catch {
          /* a modal hook must not wedge the unwind */
        }
        try {
          contribution?.onExit?.({ type: frame.type, id: frame.scopeRoot });
        } catch {
          /* onExit must not wedge the unwind */
        }
      }
      return popped;
    },
    [],
  );

  const pop = useCallback(() => popWith("exit"), [popWith]);
  const commit = useCallback(() => popWith("commit"), [popWith]);
  const cancel = useCallback(() => popWith("cancel"), [popWith]);

  const exitAll = useCallback(() => {
    setStack((prev) => {
      // Run onExit for every frame, top→root, on the way out.
      for (let i = prev.length - 1; i >= 0; i--) {
        const frame = prev[i];
        const contribution = hooksRef.current.get(frame.type);
        try {
          contribution?.onExit?.({ type: frame.type, id: frame.scopeRoot });
        } catch {
          /* keep unwinding */
        }
      }
      hooksRef.current.clear();
      return prev.length === 0 ? prev : [];
    });
  }, []);

  const active = stack.length > 0 ? stack[stack.length - 1] : null;
  // The active frame's live contribution (its hooks live in the ref; this
  // recomputes whenever `active` changes). K-1 content-pointer delivery
  // reads it.
  const activeContribution = active
    ? hooksRef.current.get(active.type) ?? null
    : null;

  const isActiveDirty = useCallback((): boolean => {
    if (!active) return false;
    const contribution = hooksRef.current.get(active.type);
    try {
      return contribution?.isDirty?.() ?? false;
    } catch {
      return false;
    }
  }, [active]);

  const isInScope = useCallback(
    (id: ElementId | null | undefined): boolean => {
      if (!active) return true; // no context → no restriction
      if (id == null) return false;
      // v1 selection-space line: the entered element itself is in scope.
      // Descendant membership (a leaf inside the entered group/frame)
      // needs a subtree query — the B-02 residual; until then a click on
      // the entered element stays editable, a click outside the scope
      // root is out-of-scope (the gesture entry treats it as a request
      // to pop / re-target, not an in-context edit).
      return idKey(id) === idKey(active.scopeRoot);
    },
    [active],
  );

  const value = useMemo<EditContextStackValue>(
    () => ({
      stack,
      active,
      activeContribution,
      breadcrumb: stack,
      enter,
      pop,
      commit,
      cancel,
      isActiveDirty,
      exitAll,
      isInScope,
    }),
    [
      stack,
      active,
      activeContribution,
      enter,
      pop,
      commit,
      cancel,
      isActiveDirty,
      exitAll,
      isInScope,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useEditContextStack(): EditContextStackValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error(
      "useEditContextStack called outside EditContextStackProvider",
    );
  }
  return ctx;
}

/** Non-throwing variant for consumers that may mount standalone. */
export function useOptionalEditContextStack(): EditContextStackValue | null {
  return useContext(Context);
}
