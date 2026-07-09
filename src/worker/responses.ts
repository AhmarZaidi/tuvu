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

export async function authPayload(repository: AuthRepository, auth: AuthContext) {
  return {
    user: publicUser(auth.user),
    profile: await publicProfileWithUploads(repository, auth.profile),
    csrfToken: auth.session.csrfToken,
    sessionExpiresAt: auth.session.expiresAt,
  };
}
