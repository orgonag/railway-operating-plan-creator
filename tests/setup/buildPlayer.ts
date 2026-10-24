/** Vitest global setup: build the standalone player bundle when it is missing, since the editor inlines it. */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default function setup(): void {
  const out = fileURLToPath(new URL("../../app/generated/player.iife.js", import.meta.url));
  if (existsSync(out)) return;
  execSync("npm run build:player", { stdio: "inherit", cwd: fileURLToPath(new URL("../..", import.meta.url)) });
}
