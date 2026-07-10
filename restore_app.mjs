import { execSync } from "child_process";
try {
  execSync("git checkout src/client/app.tsx", { stdio: "inherit" });
  console.log("Restored app.tsx");
} catch (e) {
  console.error("Failed to restore", e);
}
