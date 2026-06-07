import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Decision-B: the introspect wasm loader ships in
    // @paged-media/introspect-wasm. Keep it out of the dep pre-bundle
    // so the dynamic import + `?url` wasm asset resolve intact.
    exclude: ["@paged-media/introspect-wasm"],
  },
});
