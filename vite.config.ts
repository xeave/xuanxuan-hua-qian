import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

function omitPrivateCsv(): Plugin {
  return {
    name: "omit-private-csv",
    closeBundle() {
      const dir = join("dist", "data");
      try {
        for (const name of readdirSync(dir)) {
          if (name === "sample.csv") continue;
          rmSync(join(dir, name), { force: true });
        }
      } catch {
        // dist/data may not exist in a clean build
      }
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: "public",
  plugins: [omitPrivateCsv()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});

