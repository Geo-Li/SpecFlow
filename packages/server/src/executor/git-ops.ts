import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const WORKTREE_DIR = join(homedir(), ".specflow", "worktrees");

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
}

export function validateRepo(repoPath: string): void {
  if (!existsSync(repoPath)) throw new Error(`Repo path does not exist: ${repoPath}`);
  try { git(["rev-parse", "--git-dir"], repoPath); }
  catch { throw new Error(`Not a git repo: ${repoPath}`); }
}

export function fetchOrigin(repoPath: string): void {
  git(["fetch", "origin"], repoPath);
}

export function setupWorktree(repoPath: string, sessionId: string, baseBranch: string): { worktreePath: string; branchName: string } {
  const branchName = `specflow/${sessionId}`;
  mkdirSync(WORKTREE_DIR, { recursive: true, mode: 0o700 });
  const worktreePath = join(WORKTREE_DIR, sessionId);
  git(["worktree", "add", worktreePath, "-b", branchName, `origin/${baseBranch}`], repoPath);
  return { worktreePath, branchName };
}

export function setupBranch(repoPath: string, sessionId: string, baseBranch: string): { branchName: string } {
  const branchName = `specflow/${sessionId}`;
  git(["checkout", baseBranch], repoPath);
  git(["pull", "origin", baseBranch], repoPath);
  git(["checkout", "-b", branchName], repoPath);
  return { branchName };
}

export function hasNewCommits(workDir: string, baseBranch: string): boolean {
  try {
    const result = git(["log", `origin/${baseBranch}..HEAD`, "--oneline"], workDir);
    return result.length > 0;
  } catch { return false; }
}

export function pushBranch(workDir: string, branchName: string): void {
  git(["push", "origin", branchName], workDir);
}

export function cleanupWorktree(repoPath: string, worktreePath: string): void {
  try { git(["worktree", "remove", worktreePath, "--force"], repoPath); }
  catch (err) { console.error(`Failed to cleanup worktree ${worktreePath}:`, err); }
}

export function checkoutDefault(repoPath: string, defaultBranch: string): void {
  try { git(["checkout", defaultBranch], repoPath); }
  catch (err) { console.error(`Failed to checkout ${defaultBranch}:`, err); }
}
