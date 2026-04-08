import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

const VALID_STATUSES = new Set([
  "intake", "clarifying", "intent_ready", "intent_approved",
  "planning", "plan_ready", "plan_approved", "executing",
  "preview_ready", "agent_reviewing", "human_review", "revision_requested",
  "ship_approved", "pr_created", "done", "blocked", "cancelled", "failed",
]);

const http = httpRouter();

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: JSON_HEADERS,
  });
}

function handleError(err: unknown, genericMessage: string, status = 400) {
  console.error(genericMessage, err);
  return errorResponse(genericMessage, status);
}

let authWarningLogged = false;
function requireAuth(request: Request): boolean {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  const expected = process.env.CONVEX_AUTH_TOKEN;
  if (!expected) {
    if (!authWarningLogged) {
      console.warn("WARNING: CONVEX_AUTH_TOKEN not set — HTTP endpoints are unauthenticated. Set this in production.");
      authWarningLogged = true;
    }
    return true;
  }
  return token === expected;
}

// Create a new contribution request
http.route({
  path: "/requests",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!requireAuth(request)) return errorResponse("Unauthorized", 401);
    try {
      const body = await request.json();
      const id = await ctx.runMutation(api.contributionRequests.create, body);
      return jsonResponse({ id });
    } catch (err) {
      return handleError(err, "Failed to create request");
    }
  }),
});

// Get a contribution request by source thread (Slack channel:threadTs)
http.route({
  path: "/requests/by-thread",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!requireAuth(request)) return errorResponse("Unauthorized", 401);
    try {
      const url = new URL(request.url);
      const channelId = url.searchParams.get("channelId");
      const threadTs = url.searchParams.get("threadTs");
      if (!channelId || !threadTs) {
        return errorResponse("channelId and threadTs required", 400);
      }
      const result = await ctx.runQuery(
        api.contributionRequests.getBySourceThread,
        { channelId, threadTs }
      );
      return jsonResponse(result);
    } catch (err) {
      return handleError(err, "Failed to fetch request by thread");
    }
  }),
});

// List contribution requests
http.route({
  path: "/requests/list",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!requireAuth(request)) return errorResponse("Unauthorized", 401);
    try {
      const url = new URL(request.url);
      const rawStatus = url.searchParams.get("status") || undefined;
      if (rawStatus && !VALID_STATUSES.has(rawStatus)) {
        return errorResponse(`Invalid status: ${rawStatus}`, 400);
      }
      // Validated above against VALID_STATUSES
      const status = rawStatus as any;
      const limitStr = url.searchParams.get("limit");
      let limit: number | undefined;
      if (limitStr) {
        limit = parseInt(limitStr, 10);
        if (isNaN(limit) || limit < 1) limit = undefined;
        else if (limit > 500) limit = 500;
      }
      const results = await ctx.runQuery(api.contributionRequests.list, {
        status,
        limit,
      });
      return jsonResponse(results);
    } catch (err) {
      return handleError(err, "Failed to list requests");
    }
  }),
});

// Update contribution request status
http.route({
  path: "/requests/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!requireAuth(request)) return errorResponse("Unauthorized", 401);
    try {
      const body = await request.json();
      await ctx.runMutation(api.contributionRequests.updateStatus, body);
      return jsonResponse({ ok: true });
    } catch (err) {
      return handleError(err, "Failed to update request status");
    }
  }),
});

// Get a single contribution request
http.route({
  path: "/requests/get",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!requireAuth(request)) return errorResponse("Unauthorized", 401);
    try {
      const url = new URL(request.url);
      const id = url.searchParams.get("id");
      if (!id) {
        return errorResponse("id required", 400);
      }
      const result = await ctx.runQuery(api.contributionRequests.get, {
        id: id as any,
      });
      return jsonResponse(result);
    } catch (err) {
      return handleError(err, "Failed to get request");
    }
  }),
});

// Start a planning conversation
http.route({
  path: "/agent/start",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!requireAuth(request)) return errorResponse("Unauthorized", 401);
    try {
      const body = await request.json();
      const result = await ctx.runAction(api.agent.startPlanning, body);
      return jsonResponse(result);
    } catch (err) {
      return handleError(err, "Failed to start planning", 500);
    }
  }),
});

// Continue a planning conversation
http.route({
  path: "/agent/continue",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!requireAuth(request)) return errorResponse("Unauthorized", 401);
    try {
      const body = await request.json();
      const result = await ctx.runAction(api.agent.continueThread, body);
      return jsonResponse(result);
    } catch (err) {
      return handleError(err, "Failed to continue planning", 500);
    }
  }),
});

// Create an approval gate
http.route({
  path: "/approval-gates",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!requireAuth(request)) return errorResponse("Unauthorized", 401);
    try {
      const body = await request.json();
      const id = await ctx.runMutation(api.approvalGates.create, body);
      return jsonResponse({ id });
    } catch (err) {
      return handleError(err, "Failed to create approval gate");
    }
  }),
});

// Decide on an approval gate
http.route({
  path: "/approval-gates/decide",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!requireAuth(request)) return errorResponse("Unauthorized", 401);
    try {
      const body = await request.json();
      await ctx.runMutation(api.approvalGates.decide, body);
      return jsonResponse({ ok: true });
    } catch (err) {
      return handleError(err, "Failed to decide on approval gate");
    }
  }),
});

// Create a job
http.route({
  path: "/jobs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!requireAuth(request)) return errorResponse("Unauthorized", 401);
    try {
      const body = await request.json();
      const id = await ctx.runMutation(api.jobs.create, body);
      return jsonResponse({ id });
    } catch (err) {
      return handleError(err, "Failed to create job");
    }
  }),
});

// Update job status
http.route({
  path: "/jobs/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!requireAuth(request)) return errorResponse("Unauthorized", 401);
    try {
      const body = await request.json();
      await ctx.runMutation(api.jobs.updateStatus, body);
      return jsonResponse({ ok: true });
    } catch (err) {
      return handleError(err, "Failed to update job status");
    }
  }),
});

export default http;
