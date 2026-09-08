import { Hono } from "hono";
import { cors } from "hono/cors";
import type { HealthResponse } from "@shared/api";
import { createAuthRoutes } from "./auth-routes";
import { apiError } from "./http";
import { createEpisodeRoutes } from "./episode-routes";
import { createLibraryRoutes } from "./library-routes";
import { createMediaRoutes } from "./media-routes";
import { createUnitRoutes } from "./unit-routes";
import { createImportRoutes } from "./import-routes";
import { createExploreRoutes } from "./explore-routes";
import { createMergeRoutes } from "./merge-routes";
import { createPeopleRoutes } from "./people-routes";
import { createCharacterRoutes } from "./character-routes";
import { createProfileRoutes } from "./profile-routes";
import { createSettingsRoutes } from "./settings-routes";
import type { ProfileRouteDependencies } from "./profile-routes";
import type { AuthRepository } from "./repository";
import { D1AuthRepository } from "./repository";
import type { MediaRepository } from "./media-repository";
import { D1MediaRepository } from "./media-repository";
import type { AppVariables } from "./session";

export type AppDependencies = {
  createRepository?: (env: Env) => AuthRepository;
  createMediaRepository?: (env: Env) => MediaRepository;
} & ProfileRouteDependencies;

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables & { mediaRepository: MediaRepository } }>();

  app.use(
    "/api/*",
    cors({
      origin: (origin) => origin || "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Cookie"],
      credentials: true,
    })
  );

  app.use("/api/*", async (c, next) => {
    // Auth repository
    const repository = dependencies.createRepository?.(c.env);
    if (repository) {
      c.set("repository", repository);
    } else if (!c.env?.DB) {
      if (c.req.path === "/api/health") {
        return next();
      }
      return apiError(c, 503, "server_error", "Database binding is not configured.");
    } else {
      c.set("repository", new D1AuthRepository(c.env.DB));
    }

    // Media repository
    const mediaRepository = dependencies.createMediaRepository?.(c.env);
    if (mediaRepository) {
      c.set("mediaRepository", mediaRepository);
    } else if (c.env?.DB) {
      c.set("mediaRepository", new D1MediaRepository(c.env.DB));
    }

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
  app.route("/api/media", createMediaRoutes());
  app.route("/api/library", createLibraryRoutes());
  app.route("/api/episodes", createEpisodeRoutes());
  app.route("/api/units", createUnitRoutes());
  app.route("/api/imports", createImportRoutes());
  app.route("/api/explore", createExploreRoutes());
  app.route("/api/merge", createMergeRoutes());
  app.route("/api/people", createPeopleRoutes());
  app.route("/api/characters", createCharacterRoutes());
  app.route("/api/settings", createSettingsRoutes());

  app.onError((error, c) => {
    console.error(error);
    if (c.req.path.startsWith("/api/")) {
      const isDev = (c.env as any)?.ENVIRONMENT === "development";
      return apiError(c, 500, "server_error", isDev ? error.message : "Unexpected API error.", isDev ? { stack: error.stack } : undefined);
    }

    return c.text("Unexpected server error.", 500);
  });

  app.notFound((c) => apiError(c, 404, "not_found", "The requested API route does not exist."));

  return app;
}

export const app = createApp();
