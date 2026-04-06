import { execFileSync } from "node:child_process";

export interface PRResult { url: string; }

export function createPR(workDir: string, title: string, body: string, baseBranch: string): PRResult {
  const truncatedTitle = title.length > 72 ? title.slice(0, 69) + "..." : title;
  const url = execFileSync(
    "gh", ["pr", "create", "--title", truncatedTitle, "--body", body, "--base", baseBranch],
    { cwd: workDir, encoding: "utf-8", stdio: "pipe" }
  ).trim();
  return { url };
}
