import { Hono } from "hono";
import { updateUnitActivitySchema } from "@shared/media";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { bumpUserLibraryVersion } from "./library-version-service";
import type { MediaRepository } from "./media-repository";
import { requireAuth, requireCsrf, type AppVariables } from "./session";

export function createUnitRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables & { mediaRepository: MediaRepository } }>();
  router.get("/:unitId", requireAuth(), async (c) => {
    const repo = c.get("mediaRepository");
    const unit = await repo.findMediaUnitById(c.req.param("unitId"));
    if (!unit) return apiError(c, 404, "not_found", "Unit not found.");
    const [media, activity] = await Promise.all([repo.findMediaById(unit.mediaId), repo.findUnitActivity(c.get("auth").user.id, unit.id)]);
    return c.json(apiSuccess({ unit, media, activity }));
  });
  router.patch("/:unitId/activity", requireAuth(), requireCsrf(), async (c) => {
    const body = updateUnitActivitySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Unit activity is invalid.", body.error.flatten());
    const repo = c.get("mediaRepository");
    const auth = c.get("auth");
    const unit = await repo.findMediaUnitById(c.req.param("unitId"));
    if (!unit) return apiError(c, 404, "not_found", "Unit not found.");
    const existing = await repo.findUnitActivity(auth.user.id, unit.id);
    const now = new Date().toISOString();
    const completed = body.data.completed ?? existing?.completed ?? false;
    const completedAtInput = body.data.completedAt !== undefined ? body.data.completedAt : existing?.completedAt;
    const activity = await repo.upsertUnitActivity({ id: existing?.id ?? randomId("una"), userId: auth.user.id, unitId: unit.id, mediaId: unit.mediaId, completed, completedAt: completed ? completedAtInput ?? now : null, rating: body.data.rating !== undefined ? body.data.rating : existing?.rating ?? null, notes: body.data.notes !== undefined ? body.data.notes : existing?.notes ?? null, createdAt: existing?.createdAt ?? now, updatedAt: now });
    const libraryVersion = await bumpUserLibraryVersion(c.env.DB, auth.user.id);
    return c.json(apiSuccess({ activity, libraryVersion }));
  });
  return router;
}
