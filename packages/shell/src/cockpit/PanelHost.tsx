// Cockpit — renders a registered panel contribution into a fixed
// slot. The exact contract dockview's PanelRouter used: resolve the
// id at render time, pass `{ paged, api }`. Plugin/bundle panels
// registered later resolve the same way — the registry stays the
// single source of truth.

import { usePaged } from "../state/paged-editor";
import { useRegistries } from "../state/registries-context";

export function PanelHost({ id }: { id: string }) {
  const paged = usePaged();
  const { panels } = useRegistries();
  const contribution = panels.get(id);
  if (!contribution) {
    return (
      <div className="pg-ui-xs" style={{ padding: 12, opacity: 0.6 }}>
        Panel <code>{id}</code> not registered.
      </div>
    );
  }
  const Component = contribution.component;
  return <Component paged={paged} api={{ id }} />;
}
