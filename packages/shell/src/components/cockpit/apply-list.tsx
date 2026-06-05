// Panel-gallery pass — the `ApplyPanel` archetype: the style-manager
// surface shared by Character / Paragraph / Object (and readonly
// Cell / Table) Styles. Applied select on top, grouped style rows
// with override "+" markers and shortcuts, New / Redefine / Delete
// footer. Footer actions without a handler render disabled — the
// honest-seam rule (redefine/delete await engine ops).

import type { ReactNode } from "react";

import { Icon } from "../../icons";

export interface ApplyStyleItem {
  /** IDML `Self` id — the apply payload + react key. */
  selfId: string;
  name: string;
  /** Local overrides on top of the applied style ("+" marker). */
  override?: boolean;
  /** Keyboard shortcut chip, e.g. "⌥1". */
  shortcut?: string;
}

export interface ApplyStyleGroup {
  /** Kicker label; omit for a single unnamed group. */
  name?: string;
  items: ApplyStyleItem[];
}

export function ApplyList({
  appliedId,
  groups,
  itemIcon,
  next,
  onApply,
  onNew,
  onRedefine,
  onDelete,
  readonly = false,
  readonlyNote,
  testId,
}: {
  /** Currently applied style's selfId ("" = [None] / unresolved). */
  appliedId: string;
  groups: ApplyStyleGroup[];
  /** Glyph for unselected rows (the panel's own glyph). */
  itemIcon: string;
  /** Next-style display line ("Next: Body") — paragraph styles. */
  next?: string;
  onApply?: (selfId: string) => void;
  onNew?: () => void;
  onRedefine?: () => void;
  onDelete?: () => void;
  /** Readonly variant (cell/table styles until table selection
   *  lands): rows render without apply affordance + a note. */
  readonly?: boolean;
  readonlyNote?: ReactNode;
  testId?: string;
}) {
  const flat = groups.flatMap((g) => g.items);
  const appliedItem = flat.find((i) => i.selfId === appliedId);
  return (
    <div style={{ padding: "12px 14px" }} data-apply-list={testId}>
      <div className="pg-label" style={{ margin: "0 0 7px" }}>
        Applied style
      </div>
      <select
        value={appliedId}
        disabled={readonly || onApply == null}
        data-apply-select
        onChange={(e) => onApply?.(e.target.value)}
        style={{
          width: "100%",
          height: 30,
          padding: "0 8px",
          borderRadius: 6,
          border: "1px solid var(--pg-border)",
          background: "var(--pg-bg)",
          color: "var(--pg-fg)",
          fontFamily: "var(--font-sans)",
          fontSize: 12.5,
          marginBottom: next ? 4 : 12,
        }}
      >
        <option value="">[None]</option>
        {flat.map((i) => (
          <option key={i.selfId} value={i.selfId}>
            {i.name}
            {i.override ? " +" : ""}
          </option>
        ))}
      </select>
      {next && (
        <div className="pg-ui-xs" style={{ margin: "0 0 12px" }}>
          Next: {next}
        </div>
      )}
      <div style={{ borderTop: "1px solid var(--pg-border)", paddingTop: 8 }}>
        {groups.map((g, gi) => (
          <div key={g.name ?? gi}>
            {g.name && (
              <div className="pg-label" style={{ margin: "8px 0 5px" }}>
                {g.name}
              </div>
            )}
            {g.items.map((it) => {
              const on = it.selfId === appliedId;
              const interactive = !readonly && onApply != null;
              return (
                <button
                  key={it.selfId}
                  type="button"
                  disabled={!interactive}
                  data-apply-item={it.selfId}
                  data-applied={on ? "true" : undefined}
                  data-override={it.override ? "true" : undefined}
                  onClick={() => onApply?.(it.selfId)}
                  onMouseEnter={(e) => {
                    if (!on && interactive)
                      e.currentTarget.style.background = "var(--hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!on) e.currentTarget.style.background = "transparent";
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    height: 30,
                    padding: "0 8px",
                    border: "none",
                    borderRadius: 6,
                    textAlign: "left",
                    cursor: interactive ? "pointer" : "default",
                    background: on ? "var(--selected-bg)" : "transparent",
                    color: on ? "var(--pg-primary)" : "var(--pg-fg)",
                  }}
                >
                  <Icon
                    name={on ? "ui-check" : itemIcon}
                    size={13}
                    style={{ opacity: on ? 1 : 0.4, flexShrink: 0 }}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12.5,
                      fontFamily: "var(--font-sans)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {it.name}
                  </span>
                  {it.override && (
                    <span
                      title="Local overrides"
                      style={{
                        color: "var(--status-review)",
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      +
                    </span>
                  )}
                  {it.shortcut && (
                    <span
                      className="pg-value"
                      style={{
                        fontSize: 10.5,
                        color: "var(--pg-muted-fg)",
                        flexShrink: 0,
                      }}
                    >
                      {it.shortcut}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {readonly ? (
        readonlyNote != null && (
          <div
            className="pg-ui-xs"
            style={{ marginTop: 10, fontStyle: "italic" }}
          >
            {readonlyNote}
          </div>
        )
      ) : (
        <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
          <ApplyFooterBtn
            icon="ui-plus"
            label={`New style${appliedItem ? ` from ${appliedItem.name}` : ""}`}
            text="New"
            onClick={onNew}
          />
          <ApplyFooterBtn
            icon="ui-return"
            label="Redefine style from selection"
            text="Redefine"
            onClick={onRedefine}
          />
          <ApplyFooterBtn
            icon="ui-x"
            label="Delete style"
            text="Delete"
            onClick={onDelete}
          />
        </div>
      )}
    </div>
  );
}

/** Footer action — disabled (honest seam) when no handler is wired. */
function ApplyFooterBtn({
  icon,
  label,
  text,
  onClick,
}: {
  icon: string;
  label: string;
  text: string;
  onClick?: () => void;
}) {
  const inert = onClick == null;
  return (
    <button
      type="button"
      title={label}
      disabled={inert}
      data-apply-action={text.toLowerCase()}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!inert) e.currentTarget.style.background = "var(--hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
      style={{
        flex: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        height: 28,
        borderRadius: 6,
        border: "1px dashed var(--chrome-divider)",
        background: "transparent",
        color: "var(--pg-muted-fg)",
        cursor: inert ? "default" : "pointer",
        opacity: inert ? 0.45 : 1,
        fontFamily: "var(--font-sans)",
        fontSize: 11.5,
      }}
    >
      <Icon name={icon} size={12} />
      {text}
    </button>
  );
}
