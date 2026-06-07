/// <reference types="vite/client" />

// Provides Vite's ambient module declarations — notably `*?url` asset
// imports. Decision-B: `inspector.ts` imports the introspect wasm via
// `@paged-media/introspect-wasm/paged_introspect_wasm_bg.wasm?url` so
// Vite emits/serves the binary as an asset rather than letting the
// wasm-bindgen loader fetch it relative to node_modules.
