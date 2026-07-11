import type { AuthRepository, ProfileRecord, UploadRecord, UserRecord } from "./repository";
import type { AuthContext } from "./session";

export function publicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function publicProfile(profile: ProfileRecord, uploads: { avatar?: UploadRecord | null; banner?: UploadRecord | null } = {}) {
  return {
    userId: profile.userId,
    bio: profile.bio,
    avatarUploadId: profile.avatarUploadId,
    bannerUploadId: profile.bannerUploadId,
    avatarUrl: uploads.avatar?.publicUrl ?? null,
    bannerUrl: uploads.banner?.publicUrl ?? null,
    visibility: profile.visibility,
    preferredLanguage: profile.preferredLanguage,
    preferredRegion: profile.preferredRegion,
    updatedAt: profile.updatedAt,
  };
}

export async function publicProfileWithUploads(repository: AuthRepository, profile: ProfileRecord) {
  const [avatar, banner] = await Promise.all([
    profile.avatarUploadId ? repository.findUploadById(profile.avatarUploadId) : null,
    profile.bannerUploadId ? repository.findUploadById(profile.bannerUploadId) : null,
  ]);

  return publicProfile(profile, { avatar, banner });
}

export async function authPayload(repository: AuthRepository, auth: AuthContext, db?: any) {
  let theme = "system";
  if (db) {
    try {
      const row = (await db
        .prepare("SELECT value_json FROM user_settings WHERE user_id = ? AND key = ?")
        .bind(auth.user.id, "appearance")
        .first()) as { value_json: string } | null;
      if (row?.value_json) {
        const parsed = JSON.parse(row.value_json);
        if (parsed && typeof parsed.theme === "string") {
          theme = parsed.theme;
        }
      }
    } catch {}
  }
  return {
    user: publicUser(auth.user),
    profile: await publicProfileWithUploads(repository, auth.profile),
    appearance: { theme },
    csrfToken: auth.session.csrfToken,
    sessionExpiresAt: auth.session.expiresAt,
  };
}
