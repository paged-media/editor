// Design system — the header's collaboration cluster (kit
// chrome.jsx: avatar stack · Share · comments · notifications).
// The kit composition, rendered VISIBLE BUT INERT: there is no
// multiplayer/notification backend yet, so every control is
// disabled with an honest tooltip, the avatar stack shows neutral
// placeholder seats (never invented users), and the bell carries no
// badge (a live count would be fake data).

import { Icon } from "../icons";

const SOON = "Collaboration coming soon";

export function CollabCluster() {
  return (
    <div
      data-collab-cluster
      style={{ display: "flex", alignItems: "center", gap: 10 }}
    >
      {/* Placeholder presence seats — outlined, anonymous. */}
      <div
        title={SOON}
        aria-disabled
        style={{ display: "flex", alignItems: "center", opacity: 0.45 }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "1.5px dashed var(--chrome-divider)",
              background: "var(--pg-muted)",
              marginLeft: i ? -8 : 0,
              position: "relative",
              zIndex: 10 - i,
            }}
          />
        ))}
      </div>
      <button
        type="button"
        disabled
        data-collab-share
        title={`Share — ${SOON.toLowerCase()}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          height: 32,
          padding: "0 15px",
          borderRadius: "var(--radius-lg)",
          border: "none",
          cursor: "default",
          background: "var(--pg-primary)",
          color: "var(--pg-primary-fg)",
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          fontWeight: 600,
          opacity: 0.45,
        }}
      >
        Share
      </button>
      <InertIconButton name="ui-comment" label="Comments" />
      <InertIconButton name="ui-bell" label="Notifications" />
    </div>
  );
}

function InertIconButton({ name, label }: { name: string; label: string }) {
  return (
    <button
      type="button"
      disabled
      title={`${label} — ${SOON.toLowerCase()}`}
      style={{
        width: 30,
        height: 30,
        borderRadius: "var(--radius-md)",
        border: "none",
        background: "transparent",
        color: "var(--chrome-icon)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        opacity: 0.45,
        padding: 0,
      }}
    >
      <Icon name={name} size={17} />
    </button>
  );
}
