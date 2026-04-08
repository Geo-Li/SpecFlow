const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL;
const CONVEX_AUTH_TOKEN = process.env.CONVEX_AUTH_TOKEN;

async function convexFetch(path: string, options: RequestInit = {}): Promise<any> {
  if (!CONVEX_SITE_URL) throw new Error("CONVEX_SITE_URL not configured");
  const url = `${CONVEX_SITE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (CONVEX_AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${CONVEX_AUTH_TOKEN}`;
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex HTTP error ${res.status}: ${text}`);
  }
  return res.json();
}

export function isConvexEnabled(): boolean {
  return !!CONVEX_SITE_URL;
}

export function assertConvexEnabled(): void {
  if (!CONVEX_SITE_URL) {
    throw new Error(
      "CONVEX_SITE_URL is not configured. Convex is required for session storage. " +
      "Run 'cd packages/convex && npx convex dev' to set up your Convex project, " +
      "then add CONVEX_SITE_URL to your .env file."
    );
  }
}

export const convex = {
  requests: {
    create: (data: Record<string, unknown>) =>
      convexFetch("/requests", { method: "POST", body: JSON.stringify(data) }),

    get: (id: string) =>
      convexFetch(`/requests/get?id=${encodeURIComponent(id)}`),

    getByThread: (channelId: string, threadTs: string) =>
      convexFetch(
        `/requests/by-thread?channelId=${encodeURIComponent(channelId)}&threadTs=${encodeURIComponent(threadTs)}`
      ),

    list: (params?: { status?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.limit) query.set("limit", String(params.limit));
      return convexFetch(`/requests/list?${query}`);
    },

    updateStatus: (data: Record<string, unknown>) =>
      convexFetch("/requests/status", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  agent: {
    startPlanning: (data: {
      requestId: string;
      rawRequest: string;
      userId: string;
    }) =>
      convexFetch("/agent/start", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    continueThread: (data: { threadId: string; message: string }) =>
      convexFetch("/agent/continue", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  approvalGates: {
    create: (data: Record<string, unknown>) =>
      convexFetch("/approval-gates", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    decide: (data: Record<string, unknown>) =>
      convexFetch("/approval-gates/decide", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  jobs: {
    create: (data: Record<string, unknown>) =>
      convexFetch("/jobs", { method: "POST", body: JSON.stringify(data) }),

    updateStatus: (data: Record<string, unknown>) =>
      convexFetch("/jobs/status", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
};
