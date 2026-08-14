// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { loadEnv } from "vite";
import path from "node:path";

// Load non-VITE_ env vars into process.env for server routes (never into the client bundle).
Object.assign(process.env, loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), ""));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  plugins: [mcpPlugin()],
  // rehype-katex ships its own nested copy of katex; without deduping, the
  // mhchem extension (\ce{...} chemistry) would be loaded into a different
  // instance than the one that renders the math.
  vite: {
    resolve: {
      dedupe: ["katex"],
      alias: [
        { find: "entities/lib/decode.js", replacement: path.resolve(process.cwd(), "node_modules/entities/lib/decode.js") },
        { find: "entities/lib/encode.js", replacement: path.resolve(process.cwd(), "node_modules/entities/lib/encode.js") },
        // Exact match only: parse5 imports "entities/decode" from its own
        // nested entities v6 copy, which must not be rewritten to v4.5.0.
        { find: /^entities$/, replacement: path.resolve(process.cwd(), "node_modules/entities") },
      ],

    },
  },
});

