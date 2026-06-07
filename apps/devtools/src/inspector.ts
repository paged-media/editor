// Typed wrapper around the paged-introspect-wasm module.
//
// The wasm-bindgen module is loaded lazily so the initial bundle
// stays small until the user actually loads an IDML. All wire types
// here mirror the Rust serde shapes in:
//   crates/paged-introspect/src/{tree,descriptor}.rs
//   crates/paged-introspect-wasm/src/lib.rs

// Decision-B package boundary: the introspect wasm now ships in the
// published `@paged-media/introspect-wasm` package. As in the canvas
// worker, hand Vite the wasm asset explicitly via `?url` so `default()`
// fetches a served/fingerprinted URL rather than one relative to the
// loader JS inside node_modules (which Vite does not rewrite).
import introspectWasmUrl from "@paged-media/introspect-wasm/paged_introspect_wasm_bg.wasm?url";

let modulePromise: Promise<typeof import("@paged-media/introspect-wasm")> | null = null;

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const mod = await import("@paged-media/introspect-wasm");
      // Object form (`{ module_or_path }`) — the bare-URL positional
      // form is deprecated by current wasm-bindgen loaders.
      const init = mod.default as (
        opts?: { module_or_path?: string | URL },
      ) => Promise<unknown>;
      await init({ module_or_path: introspectWasmUrl });
      return mod;
    })();
  }
  return modulePromise;
}

export type NodeId =
  | { kind: "TextFrame"; id: string }
  | { kind: "Rectangle"; id: string }
  | { kind: "Oval"; id: string }
  | { kind: "Polygon"; id: string }
  | { kind: "GraphicLine"; id: string }
  | { kind: "Group"; id: string };

export interface InspectorTree {
  spreads: SpreadEntry[];
}

export interface SpreadEntry {
  index: number;
  label: string;
  pages: PageEntry[];
}

export interface PageEntry {
  index: number;
  label: string;
  frames: FrameEntry[];
}

export interface FrameEntry {
  id: NodeId;
  label: string;
}

export type PropertyKey = "frameBounds" | "frameFillColor";

export type PropertyKind = "bounds" | "length" | "color" | "text" | "bool" | "enum";

export type PropertyValue =
  | { type: "bounds"; value: [number, number, number, number] }
  | { type: "colorRef"; value: string | null }
  | { type: "length"; value: number }
  | { type: "text"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "enum"; value: string }
  | { type: "none" };

export interface PropertySource {
  kind: "Local" | "InheritedFrom" | "Default";
  name?: string;
}

export interface PropertyDescriptor {
  key: PropertyKey;
  label: string;
  kind: PropertyKind;
  authored: PropertyValue;
  computed: PropertyValue;
  source: PropertySource;
  settable: boolean;
}

export interface Mutation {
  node: NodeId;
  property: PropertyKey;
  value: PropertyValue;
}

export interface MutationResult {
  node: NodeId;
  property: PropertyKey;
  previous: PropertyValue;
  new: PropertyValue;
  invalidation: string;
}

export class InspectorClient {
  private constructor(private inner: import("@paged-media/introspect-wasm").Inspector) {}

  static async open(bytes: Uint8Array): Promise<InspectorClient> {
    const mod = await loadModule();
    return new InspectorClient(new mod.Inspector(bytes));
  }

  tree(): InspectorTree {
    return JSON.parse(this.inner.tree()) as InspectorTree;
  }

  properties(node: NodeId): PropertyDescriptor[] {
    return JSON.parse(this.inner.properties(JSON.stringify(node))) as PropertyDescriptor[];
  }

  apply(mutation: Mutation): MutationResult {
    return JSON.parse(this.inner.apply(JSON.stringify(mutation))) as MutationResult;
  }

  renderPage(pageIndex: number, dpi = 144): Uint8Array {
    return this.inner.renderPage(pageIndex, dpi);
  }
}

export function nodeKey(node: NodeId): string {
  return `${node.kind}:${node.id}`;
}
