import { Hono } from "hono";
import { profileUpdateSchema } from "@shared/auth";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { getUserLibraryVersion } from "./library-version-service";
import { publicProfileWithUploads, publicUser } from "./responses";
import type { UploadRecord } from "./repository";
import { requireAuth, requireCsrf, type AppVariables } from "./session";
import { profileStatsSnapshot } from "./stats-service";
import { uploadProfileImageToSupabase, type UploadedObject, type UploadObjectInput } from "./supabase-storage";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxBytesByKind = {
  avatar: 2 * 1024 * 1024,
  banner: 5 * 1024 * 1024,
} as const;

export type ProfileRouteDependencies = {
  uploadProfileImage?: (input: UploadObjectInput) => Promise<UploadedObject>;
};

export function createProfileRoutes(dependencies: ProfileRouteDependencies = {}) {
  const routes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  routes.get("/me", requireAuth(), async (c) => {
    const auth = c.get("auth");
    const repository = c.get("repository");
    return c.json(
      apiSuccess({
        user: publicUser(auth.user),
        profile: await publicProfileWithUploads(repository, auth.profile),
        csrfToken: auth.session.csrfToken,
        libraryVersion: await getUserLibraryVersion(c.env.DB, auth.user.id),
      }),
    );
  });

  routes.patch("/me/profile", requireAuth(), requireCsrf(), async (c) => {
    const body = profileUpdateSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Profile update is invalid.", body.error.flatten());
    }

    const auth = c.get("auth");
    const repository = c.get("repository");

    if (body.data.username && body.data.username.toLowerCase() !== auth.user.username.toLowerCase()) {
      const existing = await repository.findUserByUsername(body.data.username);
      if (existing) {
        return apiError(c, 409, "conflict", "That username is already taken.");
      }
    }

    const updated = await repository.updateProfile(auth.user.id, body.data, new Date().toISOString());
    return c.json(apiSuccess({ user: publicUser(updated.user), profile: await publicProfileWithUploads(repository, updated.profile) }));
  });

  routes.get("/me/stats", requireAuth(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Profile stats are unavailable.");
    const auth = c.get("auth");
    return c.json(apiSuccess({ stats: await profileStatsSnapshot(c.env.DB, auth.user.id) }));
  });

  routes.post("/uploads/profile", requireAuth(), requireCsrf(), async (c) => {
    const form = await c.req.parseBody().catch(() => null);
    if (!form) {
      return apiError(c, 400, "bad_request", "Upload must be multipart form data.");
    }

    const kind = form.kind;
    const file = form.file;
    if ((kind !== "avatar" && kind !== "banner") || !(file instanceof File)) {
      return apiError(c, 400, "validation_failed", "Upload requires kind and file.");
    }

    if (!allowedImageTypes.has(file.type)) {
      return apiError(c, 400, "validation_failed", "Only JPEG, PNG, WebP, or GIF images are allowed.");
    }

    if (file.size > maxBytesByKind[kind]) {
      return apiError(c, 400, "validation_failed", `${kind} image is too large.`);
    }

    const auth = c.get("auth");
    const repository = c.get("repository");
    let uploaded;
    try {
      uploaded = await (dependencies.uploadProfileImage ?? uploadProfileImageToSupabase)({ env: c.env, userId: auth.user.id, kind, file });
    } catch (error) {
      return apiError(c, 503, "server_error", error instanceof Error ? error.message : "Upload storage failed.");
    }

    const now = new Date().toISOString();
    const upload: UploadRecord = {
      id: randomId("upl"),
      userId: auth.user.id,
      bucket: uploaded.bucket,
      objectPath: uploaded.objectPath,
      publicUrl: uploaded.publicUrl,
      contentType: file.type,
      byteSize: file.size,
      kind,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    };
    await repository.createUpload(upload);
    const profile = await repository.attachUpload(auth.user.id, upload.id, kind, now);

    return c.json(apiSuccess({ upload, profile: await publicProfileWithUploads(repository, profile) }));
  });

  routes.delete("/me", requireAuth(), requireCsrf(), async (c) => {
    const auth = c.get("auth");
    if (!c.env.DB) {
      return apiError(c, 503, "server_error", "Database is unavailable.");
    }
    try {
      await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(auth.user.id).run();
      return c.json(apiSuccess({ deleted: true }));
    } catch (error) {
      return apiError(c, 500, "server_error", error instanceof Error ? error.message : "Failed to delete account.");
    }
  });

  return routes;
}
