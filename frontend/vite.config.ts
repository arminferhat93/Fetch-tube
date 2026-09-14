import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  envDir: "..",
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: "0.0.0.0",
    port: 3000,

    allowedHosts: ["fetch-tube.com", "www.fetch-tube.com"],

    hmr: {
      host: "fetch-tube.com",
      clientPort: 80,
    },

    watch: {
      usePolling: true,
    },
  },
});
