/**
 * Shared constants within the Convex package.
 *
 * NOTE: The Convex package cannot import from @specflow/shared (different runtime).
 * Keep these in sync with the canonical types in packages/shared/src/types.ts.
 */

export const VALID_STATUSES = [
  "intake", "clarifying", "intent_ready", "intent_approved",
  "planning", "plan_ready", "plan_approved", "executing",
  "preview_ready", "agent_reviewing", "human_review", "revision_requested",
  "ship_approved", "pr_created", "done", "blocked", "cancelled", "failed",
] as const;

export type ContributionStatus = (typeof VALID_STATUSES)[number];

export const VALID_STATUSES_SET = new Set<string>(VALID_STATUSES);

export const VALID_ARTIFACT_TYPES = [
  "intent_contract", "research_memo", "competitor_comparison", "product_spec",
  "coding_plan", "execution_log", "diff_summary", "preview_bundle",
  "review_notes", "pr_summary",
] as const;

/**
 * Mirrors RuntimeProviderPayload from @specflow/shared.
 * Must stay in sync manually since Convex cannot import shared.
 */
export type RuntimeProvider = {
  type: "anthropic" | "openai" | "google" | "openai-compatible";
  apiKey: string;
  model: string;
  baseUrl?: string;
};
