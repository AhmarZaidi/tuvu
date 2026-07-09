import { Hono } from "hono";
import type { HealthResponse } from "@shared/api";
import { createAuthRoutes } from "./auth-routes";
import { apiError } from "./http";
import { createProfileRoutes } from "./profile-routes";
import type { ProfileRouteDependencies } from "./profile-routes";
import type { AuthRepository } from "./repository";
import { D1AuthRepository } from "./repository";
import type { AppVariables } from "./session";

export type AppDependencies = {
  createRepository?: (env: Env) => AuthRepository;
} & ProfileRouteDependencies;

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  app.use("/api/*", async (c, next) => {
    const repository = dependencies.createRepository?.(c.env);
    if (repository) {
      c.set("repository", repository);
      return next();
    }

    if (!c.env?.DB) {
      if (c.req.path === "/api/health") {
        return next();
      }
      return apiError(c, 503, "server_error", "Database binding is not configured.");
    }

    c.set("repository", new D1AuthRepository(c.env.DB));
    return next();
  });

  app.get("/api/health", (c) => {
    const body: HealthResponse = {
      data: {
        ok: true,
        service: "tuvu-api",
        timestamp: new Date().toISOString(),
      },
    };

    return c.json(body);
  });

  app.route("/api/auth", createAuthRoutes());
  app.route("/api", createProfileRoutes({ uploadProfileImage: dependencies.uploadProfileImage }));

  app.onError((error, c) => {
    console.error(error);
    if (c.req.path.startsWith("/api/")) {
      return apiError(c, 500, "server_error", "Unexpected API error.");
    }

    return c.text("Unexpected server error.", 500);
  });

  app.notFound((c) => apiError(c, 404, "not_found", "The requested API route does not exist."));

  return app;
}

export const app = createApp();
