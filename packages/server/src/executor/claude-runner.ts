import { spawn } from "node:child_process";

export interface ClaudeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ProgressCallback = (output: string) => void;

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

    child.stdin.write(plan);
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
