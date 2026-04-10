import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";

const app: ReturnType<typeof defineApp> = defineApp();
app.use(agent);

export default app;
