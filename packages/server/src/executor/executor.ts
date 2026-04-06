import type { Session, RepoConfig } from "@specflow/shared";
import { validateRepo, fetchOrigin, setupWorktree, setupBranch, hasNewCommits, pushBranch, cleanupWorktree, checkoutDefault } from "./git-ops.js";
import { runClaude } from "./claude-runner.js";
import { createPR } from "./pr-creator.js";
import { ExecutionQueue } from "./execution-queue.js";

export interface ExecutionResult { success: boolean; prUrl?: string; error?: string; }
export type StatusCallback = (message: string) => void;

let queue: ExecutionQueue | null = null;

export function initExecutor(maxConcurrent: number): void { queue = new ExecutionQueue(maxConcurrent); }
export function getQueue(): ExecutionQueue { if (!queue) throw new Error("Executor not initialized"); return queue; }

export async function executeSession(session: Session, repo: RepoConfig, onStatus: StatusCallback): Promise<ExecutionResult> {
  const q = getQueue();
  return q.enqueue(async () => {
    let workDir = repo.localPath;
    let branchName = "";
    const isWorktree = session.executionMode === "worktree";

    try {
      validateRepo(repo.localPath);
      fetchOrigin(repo.localPath);

      if (isWorktree) {
        const result = setupWorktree(repo.localPath, session.id, session.baseBranch);
        workDir = result.worktreePath;
        branchName = result.branchName;
      } else {
        if (!q.acquireRepoLock(repo.id)) {
          return { success: false, error: "Repo is locked by another branch-mode execution. Please try again shortly." };
        }
        const result = setupBranch(repo.localPath, session.id, session.baseBranch);
        branchName = result.branchName;
      }

      onStatus("Execution started. Claude Code is working on the implementation...");

      const claudeResult = await runClaude(workDir, session.plan!, (progress) => {
        onStatus(`In progress...\n\`\`\`\n${progress}\n\`\`\``);
      });

      if (claudeResult.exitCode !== 0) {
        const errTail = claudeResult.stderr.split("\n").slice(-50).join("\n");
        return { success: false, error: `Claude Code failed (exit ${claudeResult.exitCode}):\n${errTail}` };
      }

      if (!hasNewCommits(workDir, session.baseBranch)) {
        return { success: false, error: "Claude Code completed but made no changes." };
      }

      pushBranch(workDir, branchName);
      const planFirstLine = session.plan!.split("\n").find((l) => l.trim().length > 0) || session.originalMessage;
      const title = planFirstLine.replace(/^#+\s*/, "").slice(0, 72);
      const pr = createPR(workDir, title, session.plan!, session.baseBranch);

      return { success: true, prUrl: pr.url };
    } catch (err) {
      return { success: false, error: `Execution failed: ${(err as Error).message}` };
    } finally {
      if (isWorktree) { cleanupWorktree(repo.localPath, workDir); }
      else { q.releaseRepoLock(repo.id); checkoutDefault(repo.localPath, repo.defaultBranch); }
    }
  });
}
