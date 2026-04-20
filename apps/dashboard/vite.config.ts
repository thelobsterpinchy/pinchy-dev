import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    port: 4311,
    proxy: {
      "/api": "http://127.0.0.1:4310",
      "/artifact": "http://127.0.0.1:4310",
    },
  },
});
