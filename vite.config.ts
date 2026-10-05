import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

function omitPrivateCsv(): Plugin {
  return {
    name: "omit-private-csv",
    closeBundle() {
      const dataDir = join("dist", "data");
      try {
        for (const name of readdirSync(dataDir)) {
          if (name === "六城漫游.csv") continue;
          rmSync(join(dataDir, name), { force: true, recursive: true });
        }
      } catch {
        // dist/data may not exist in a clean build
      }
      rmSync(join("dist", "xuanxuan-hua-xiao"), { force: true, recursive: true });
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

