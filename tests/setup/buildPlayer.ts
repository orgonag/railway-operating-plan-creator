/** Vitest global setup: build the standalone player bundle from current source, since the editor inlines it. */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function setup(): void {
  execSync("npm run build:player", {
    stdio: "inherit",
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
  });
}
