import type { KnownBlock } from "@slack/bolt";

export function buildPlanMessage(plan: string, sessionId: string): KnownBlock[] {
  const chunks = splitText(plan, 2900);
  const blocks: KnownBlock[] = chunks.map((chunk) => ({
    type: "section" as const,
    text: { type: "mrkdwn" as const, text: chunk },
  }));
  blocks.push({ type: "divider" as const });
  blocks.push({
    type: "actions" as const,
    block_id: `plan_actions_${sessionId}`,
    elements: [
      { type: "button" as const, text: { type: "plain_text" as const, text: "Confirm", emoji: true }, style: "primary" as const, action_id: "confirm_plan", value: sessionId },
      { type: "button" as const, text: { type: "plain_text" as const, text: "Edit", emoji: true }, action_id: "edit_plan", value: sessionId },
      { type: "button" as const, text: { type: "plain_text" as const, text: "Cancel", emoji: true }, style: "danger" as const, action_id: "cancel_plan", value: sessionId },
    ],
  });
  return blocks;
}

export function buildConfirmedMessage(userId: string): KnownBlock[] {
  return [{ type: "section", text: { type: "mrkdwn", text: `Confirmed by <@${userId}> — execution started.` } }];
}

export function buildCancelledMessage(userId: string): KnownBlock[] {
  return [{ type: "section", text: { type: "mrkdwn", text: `Cancelled by <@${userId}>.` } }];
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt === -1 || splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}
