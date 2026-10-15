import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

// Isolated UI fixture: the preload is mocked and never contacts NetEase.
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  configFile: false,
  root,
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5187, strictPort: true },
  resolve: {
    alias: {
      "react-dom": fileURLToPath(new URL("../apps/desktop/node_modules/react-dom", import.meta.url)),
      react: fileURLToPath(new URL("../apps/desktop/node_modules/react", import.meta.url)),
    },
  },
});
await server.listen();
console.log("http://127.0.0.1:5187/tests/fixtures/work-editor.html");
