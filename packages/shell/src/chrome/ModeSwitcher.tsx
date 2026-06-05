// Design system (publishing cockpit) — the 48px bottom mode bar.
// Six workflow modes, one product: the switcher is the cockpit's
// primary navigation. Left shows the save state (real
// `documentMeta.dirty`); the centre lists the registered modes;
// the right side is a seam for the zoom/progress cluster.

import { useState, type ReactNode } from "react";

import { Icon } from "../icons";
import { useDocumentMeta } from "../catalog/use-collection";
import { useCamera } from "../state/camera-context";
import { useRegistries } from "../state/registries-context";
import {
  useWorkflowMode,
  type WorkflowMode,
} from "../state/workflow-mode-context";

export interface ModeSwitcherProps {
  right?: ReactNode;
}

export function ModeSwitcher({ right }: ModeSwitcherProps) {
  const { mode, setMode } = useWorkflowMode();
  const { modes } = useRegistries();
  const meta = useDocumentMeta();
  const list = modes.list();
  if (list.length === 0) return null;

  return (
    <div data-mode-switcher style={barStyle}>
      <div style={sideStyle}>
        {meta ? (
          <span
            className="pg-ui-xs"
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            data-save-state={meta.dirty ? "dirty" : "saved"}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: meta.dirty
                  ? "var(--status-review)"
                  : "var(--status-approved)",
              }}
            />
            {meta.dirty ? "Unsaved changes" : "All changes saved"}
          </span>
        ) : null}
      </div>

      <div style={centerStyle}>
        {list.map((m) => (
          <ModeButton
            key={m.id}
            id={m.id}
            title={m.title}
            icon={m.icon}
            blurb={m.blurb}
            active={m.id === mode}
            onClick={() => setMode(m.id)}
          />
        ))}
      </div>

      <div style={{ ...sideStyle, justifyContent: "flex-end" }}>
        {right ?? <ZoomCluster />}
      </div>
    </div>
  );
}

/** Kit chrome.jsx — the bottom-right zoom cluster: live mono percent
 *  + a log-scale slider that zooms around the viewport centre. */
function ZoomCluster() {
  const { camera, setCamera, viewportSize } = useCamera();
  const pct = Math.round(camera.scale * 100);
  // Log mapping 1%…800% so page-fit zooms (~5–60%) get usable travel.
  const MIN = Math.log(0.01);
  const MAX = Math.log(8);
  const pos = Math.min(
    1,
    Math.max(0, (Math.log(Math.max(camera.scale, 0.01)) - MIN) / (MAX - MIN)),
  );
  const onInput = (v: number) => {
    const scale = Math.exp(MIN + v * (MAX - MIN));
    const [vw, vh] = viewportSize;
    const cx = vw / 2;
    const cy = vh / 2;
    const k = scale / Math.max(camera.scale, 1e-6);
    setCamera({
      scale,
      tx: cx - (cx - camera.tx) * k,
      ty: cy - (cy - camera.ty) * k,
    });
  };
  return (
    <div
      data-zoom-cluster
      style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}
    >
      <span className="pg-value" style={{ fontSize: 11.5 }}>
        {pct}%
      </span>
      <input
        type="range"
        aria-label="Zoom"
        min={0}
        max={1000}
        value={Math.round(pos * 1000)}
        onChange={(e) => onInput(Number(e.target.value) / 1000)}
        style={{ width: 84, accentColor: "var(--pg-primary)" }}
      />
      <Icon
        name="ui-displays"
        size={15}
        style={{ color: "var(--pg-muted-fg)" }}
      />
    </div>
  );
}

function ModeButton(props: {
  id: WorkflowMode;
  title: string;
  icon: string;
  blurb?: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      data-mode-option={props.id}
      data-active={props.active ? "true" : "false"}
      title={props.blurb ?? props.title}
      onClick={props.onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 32,
        padding: "0 13px",
        borderRadius: "var(--radius-md)",
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: 12.5,
        fontWeight: props.active ? 600 : 400,
        background: props.active
          ? "var(--pg-primary)"
          : hover
            ? "var(--hover)"
            : "transparent",
        color: props.active
          ? "var(--pg-primary-fg)"
          : "var(--chrome-menu-text)",
      }}
    >
      <Icon name={props.icon} size={15} />
      {props.title}
    </button>
  );
}

const barStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 48,
  padding: "0 14px",
  gap: 12,
  background: "var(--chrome-panel-bg)",
  borderTop: "1px solid var(--chrome-border)",
  flexShrink: 0,
};

const sideStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  minWidth: 0,
};

const centerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};
