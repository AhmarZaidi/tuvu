import { app } from "./app";
import { scheduleHydrationJobs } from "./hydration";

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scheduleHydrationJobs(env));
  }
} satisfies ExportedHandler<Env>;
