import type { ProfileUpdateInput } from "@shared/auth";
import type {
  AuthRepository,
  ChallengeRecord,
  CreateUserInput,
  CredentialRecord,
  OAuthAccountInput,
  PasswordCredentialRecord,
  ProfileRecord,
  SessionRecord,
  UploadRecord,
  UserRecord,
} from "@worker/repository";

export class MemoryAuthRepository implements AuthRepository {
  readonly users = new Map<string, UserRecord>();
  readonly profiles = new Map<string, ProfileRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly challenges = new Map<string, ChallengeRecord>();
  readonly credentials = new Map<string, CredentialRecord>();
  readonly passwordCredentials = new Map<string, PasswordCredentialRecord>();
  readonly oauthAccounts = new Map<string, OAuthAccountInput>();
  readonly uploads = new Map<string, UploadRecord>();

  async createUserWithProfile(input: CreateUserInput) {
    if (input.user.email && [...this.users.values()].some((user) => user.email && user.email.toLowerCase() === input.user.email?.toLowerCase())) {
      throw new Error("Email already exists.");
    }
    if ([...this.users.values()].some((user) => user.username.toLowerCase() === input.user.username.toLowerCase())) {
      throw new Error("Username already exists.");
    }
    this.users.set(input.user.id, input.user);
    this.profiles.set(input.profile.userId, input.profile);
  }

  async findUserByUsername(username: string) {
    return [...this.users.values()].find((user) => user.username.toLowerCase() === username.toLowerCase()) ?? null;
  }

  async findUserByEmail(email: string) {
    return [...this.users.values()].find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }

  async findProfileByUserId(userId: string) {
    return this.profiles.get(userId) ?? null;
  }

  async updateProfile(userId: string, input: ProfileUpdateInput, now: string) {
    const user = this.users.get(userId);
    const profile = this.profiles.get(userId);
    if (!user || !profile) {
      throw new Error("Profile not found.");
    }

    const updatedUser: UserRecord = {
      ...user,
      username: input.username ?? user.username,
      displayName: input.displayName ?? user.displayName,
      updatedAt: now,
    };
    const updatedProfile: ProfileRecord = {
      ...profile,
      bio: input.bio ?? profile.bio,
      visibility: input.visibility ?? profile.visibility,
      preferredLanguage: input.preferredLanguage ?? profile.preferredLanguage,
      preferredRegion: input.preferredRegion ?? profile.preferredRegion,
      updatedAt: now,
    };
    this.users.set(userId, updatedUser);
    this.profiles.set(userId, updatedProfile);
    return { user: updatedUser, profile: updatedProfile };
  }

  async createSession(session: SessionRecord) {
    this.sessions.set(session.id, session);
  }

  async findSessionByTokenHash(tokenHash: string, now: string) {
    return [...this.sessions.values()].find((session) => session.tokenHash === tokenHash && session.expiresAt > now) ?? null;
  }

  async touchSession(sessionId: string, now: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, { ...session, lastSeenAt: now });
    }
  }

  async deleteSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  async createChallenge(challenge: ChallengeRecord) {
    this.challenges.set(challenge.id, challenge);
  }

  async findChallenge(id: string, type: ChallengeRecord["type"], now: string) {
    const challenge = this.challenges.get(id);
    if (!challenge || challenge.type !== type || challenge.consumedAt || challenge.expiresAt <= now) {
      return null;
    }
    return challenge;
  }

  async findOAuthState(state: string, now: string) {
    return [...this.challenges.values()].find((challenge) => challenge.type === "oauth_state" && challenge.challenge === state && !challenge.consumedAt && challenge.expiresAt > now) ?? null;
  }

  async consumeChallenge(id: string, now: string) {
    const challenge = this.challenges.get(id);
    if (challenge) {
      this.challenges.set(id, { ...challenge, consumedAt: now });
    }
  }

  async createCredential(credential: CredentialRecord) {
    this.credentials.set(credential.credentialId, credential);
  }

  async findCredentialsByUserId(userId: string) {
    return [...this.credentials.values()].filter((credential) => credential.userId === userId);
  }

  async findCredentialByCredentialId(credentialId: string) {
    return this.credentials.get(credentialId) ?? null;
  }

  async updateCredentialCounter(credentialId: string, counter: number, now: string) {
    const credential = this.credentials.get(credentialId);
    if (credential) {
      this.credentials.set(credentialId, { ...credential, counter, lastUsedAt: now });
    }
  }

  async createPasswordCredential(credential: PasswordCredentialRecord) {
    this.passwordCredentials.set(credential.userId, credential);
  }

  async findPasswordCredentialByUserId(userId: string) {
    return this.passwordCredentials.get(userId) ?? null;
  }

  async upsertOAuthAccount(input: OAuthAccountInput) {
    this.oauthAccounts.set(`${input.provider}:${input.providerAccountId}`, input);
  }

  async findOAuthUser(provider: string, providerAccountId: string) {
    const account = this.oauthAccounts.get(`${provider}:${providerAccountId}`);
    return account ? this.findUserById(account.userId) : null;
  }

  async createUpload(upload: UploadRecord) {
    this.uploads.set(upload.id, upload);
  }

  async findUploadById(uploadId: string) {
    return this.uploads.get(uploadId) ?? null;
  }

  async attachUpload(userId: string, uploadId: string, kind: "avatar" | "banner", now: string) {
    const profile = this.profiles.get(userId);
    if (!profile) {
      throw new Error("Profile not found.");
    }

    const nextProfile: ProfileRecord = {
      ...profile,
      avatarUploadId: kind === "avatar" ? uploadId : profile.avatarUploadId,
      bannerUploadId: kind === "banner" ? uploadId : profile.bannerUploadId,
      updatedAt: now,
    };
    this.profiles.set(userId, nextProfile);
    return nextProfile;
  }
}

export function testEnv(): Env {
  return {
    DB: undefined as unknown as D1Database,
    ASSETS: undefined as unknown as Fetcher,
    ENVIRONMENT: "development",
    APP_NAME: "Tuvu",
    PUBLIC_APP_URL: "http://localhost",
    SUPABASE_STORAGE_AVATARS_BUCKET: "tuvu-avatars",
    SUPABASE_STORAGE_MEDIA_CACHE_BUCKET: "tuvu-media-cache",
  } as Env;
}
