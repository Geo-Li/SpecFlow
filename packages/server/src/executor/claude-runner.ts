import { spawn } from "node:child_process";

export interface ClaudeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ProgressCallback = (output: string) => void;

function buildExecutionPrompt(plan: string): string {
  return [
    "You are executing an approved implementation plan inside the current git repository.",
    "",
    "Requirements:",
    "- Implement the approved plan in this repository.",
    "- Make the smallest set of changes needed to complete the work.",
    "- Run relevant tests or checks when feasible.",
    "- If you make file changes, create a git commit before finishing.",
    "- Do not push, open a PR, or change git remotes; the executor handles that.",
    "- If the plan cannot be completed safely, explain why instead of guessing.",
    "",
    "Approved plan:",
    plan,
  ].join("\n");
}

export async function runClaude(
  workDir: string,
  plan: string,
  onProgress?: ProgressCallback
): Promise<ClaudeRunResult> {
  return new Promise((resolve) => {
    const child = spawn("claude", ["--print", "-p", "-"], {
      cwd: workDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdin.write(buildExecutionPrompt(plan));
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    let lastProgressTime = 0;

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      const now = Date.now();
      if (onProgress && now - lastProgressTime > 30_000) {
        lastProgressTime = now;
        onProgress(stdout.slice(-500));
      }
    });

    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on("error", (err) => {
      resolve({ exitCode: 1, stdout, stderr: stderr + "\n" + err.message });
    });
  });
}
