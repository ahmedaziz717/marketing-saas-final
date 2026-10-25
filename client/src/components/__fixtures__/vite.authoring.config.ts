import base from "../../../../vite.config";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../../..");
export default {
  ...base,
  root,
  cacheDir: path.resolve(root, "../authoring-qa-cache"),
  resolve: {
    alias: {
      ...Object.fromEntries(
        [
          "@/_core/hooks/useAuth",
          "@/hooks/useWorkspace",
          "@/components/WorkspaceGate",
        ].map(id => [
          id,
          path.join(root, "scripts/fixtures/channel-workspace-stubs.tsx"),
        ])
      ),
      ...(base as any).resolve.alias,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5189,
    strictPort: true,
    fs: { allow: [root] },
  },
};
