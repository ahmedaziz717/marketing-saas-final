import base from "../../../../vite.config";
import path from "node:path";
export default {
  ...base,
  cacheDir: path.resolve(
    import.meta.dirname,
    "../../../../../gallery-qa-cache"
  ),
  server: {
    host: "127.0.0.1",
    port: 5187,
    strictPort: true,
    fs: { allow: [path.resolve(import.meta.dirname, "../../../..")] },
  },
};
