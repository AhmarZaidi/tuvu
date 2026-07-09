import type { ProfileUpdateInput, ProfileVisibility } from "@shared/auth";

export type UserRecord = {
  id: string;
  email: string | null;
  username: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type ProfileRecord = {
  userId: string;
  bio: string;
  avatarUploadId: string | null;
  bannerUploadId: string | null;
  visibility: ProfileVisibility;
  preferredLanguage: string;
  preferredRegion: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  csrfToken: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
};

export type CredentialRecord = {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

export type ChallengeRecord = {
  id: string;
  userId: string | null;
  type: "passkey_registration" | "passkey_login" | "oauth_state";
  challenge: string;
  metadata: Record<string, unknown>;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

export type UploadRecord = {
  id: string;
  userId: string;
  bucket: string;
  objectPath: string;
  publicUrl: string | null;
  contentType: string;
  byteSize: number;
  kind: "avatar" | "banner" | "media_cache";
  status: "uploaded" | "deleted" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type OAuthAccountInput = {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PasswordCredentialRecord = {
  id: string;
  userId: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserInput = {
  user: UserRecord;
  profile: ProfileRecord;
};

export type AuthRepository = {
  createUserWithProfile(input: CreateUserInput): Promise<void>;
  findUserByUsername(username: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  findProfileByUserId(userId: string): Promise<ProfileRecord | null>;
  updateProfile(userId: string, input: ProfileUpdateInput, now: string): Promise<{ user: UserRecord; profile: ProfileRecord }>;
  createSession(session: SessionRecord): Promise<void>;
  findSessionByTokenHash(tokenHash: string, now: string): Promise<SessionRecord | null>;
  touchSession(sessionId: string, now: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  createChallenge(challenge: ChallengeRecord): Promise<void>;
  findChallenge(id: string, type: ChallengeRecord["type"], now: string): Promise<ChallengeRecord | null>;
  findOAuthState(state: string, now: string): Promise<ChallengeRecord | null>;
  consumeChallenge(id: string, now: string): Promise<void>;
  createCredential(credential: CredentialRecord): Promise<void>;
  findCredentialsByUserId(userId: string): Promise<CredentialRecord[]>;
  findCredentialByCredentialId(credentialId: string): Promise<CredentialRecord | null>;
  updateCredentialCounter(credentialId: string, counter: number, now: string): Promise<void>;
  createPasswordCredential(credential: PasswordCredentialRecord): Promise<void>;
  findPasswordCredentialByUserId(userId: string): Promise<PasswordCredentialRecord | null>;
  upsertOAuthAccount(input: OAuthAccountInput): Promise<void>;
  findOAuthUser(provider: string, providerAccountId: string): Promise<UserRecord | null>;
  createUpload(upload: UploadRecord): Promise<void>;
  findUploadById(uploadId: string): Promise<UploadRecord | null>;
  attachUpload(userId: string, uploadId: string, kind: "avatar" | "banner", now: string): Promise<ProfileRecord>;
};

type UserRow = {
  id: string;
  email: string | null;
  username: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  user_id: string;
  bio: string;
  avatar_upload_id: string | null;
  banner_upload_id: string | null;
  visibility: ProfileVisibility;
  preferred_language: string;
  preferred_region: string;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  csrf_token: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
  user_agent: string | null;
};

type CredentialRow = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string;
  created_at: string;
  last_used_at: string | null;
};

type ChallengeRow = {
  id: string;
  user_id: string | null;
  type: ChallengeRecord["type"];
  challenge: string;
  metadata_json: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

type UploadRow = {
  id: string;
  user_id: string;
  bucket: string;
  object_path: string;
  public_url: string | null;
  content_type: string;
  byte_size: number;
  kind: UploadRecord["kind"];
  status: UploadRecord["status"];
  created_at: string;
  updated_at: string;
};

type PasswordCredentialRow = {
  id: string;
  user_id: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

export class D1AuthRepository implements AuthRepository {
  constructor(private readonly db: D1Database) {}

  async createUserWithProfile({ user, profile }: CreateUserInput) {
    await this.db.batch([
      this.db
        .prepare("INSERT INTO users (id, email, username, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(user.id, user.email, user.username, user.displayName, user.createdAt, user.updatedAt),
      this.db
        .prepare(
          "INSERT INTO user_profiles (user_id, bio, avatar_upload_id, banner_upload_id, visibility, preferred_language, preferred_region, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          profile.userId,
          profile.bio,
          profile.avatarUploadId,
          profile.bannerUploadId,
          profile.visibility,
          profile.preferredLanguage,
          profile.preferredRegion,
          profile.createdAt,
          profile.updatedAt,
        ),
    ]);
  }

  async findUserByUsername(username: string) {
    const row = await this.db.prepare("SELECT * FROM users WHERE lower(username) = lower(?)").bind(username).first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async findUserByEmail(email: string) {
    const row = await this.db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").bind(email).first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async findUserById(id: string) {
    const row = await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async findProfileByUserId(userId: string) {
    const row = await this.db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").bind(userId).first<ProfileRow>();
    return row ? mapProfile(row) : null;
  }

  async updateProfile(userId: string, input: ProfileUpdateInput, now: string) {
    const currentUser = await this.findUserById(userId);
    const currentProfile = await this.findProfileByUserId(userId);

    if (!currentUser || !currentProfile) {
      throw new Error("User profile not found.");
    }

    const nextUser = {
      ...currentUser,
      displayName: input.displayName ?? currentUser.displayName,
      username: input.username ?? currentUser.username,
      updatedAt: now,
    };
    const nextProfile = {
      ...currentProfile,
      bio: input.bio ?? currentProfile.bio,
      visibility: input.visibility ?? currentProfile.visibility,
      preferredLanguage: input.preferredLanguage ?? currentProfile.preferredLanguage,
      preferredRegion: input.preferredRegion ?? currentProfile.preferredRegion,
      updatedAt: now,
    };

    await this.db.batch([
      this.db.prepare("UPDATE users SET username = ?, display_name = ?, updated_at = ? WHERE id = ?").bind(nextUser.username, nextUser.displayName, now, userId),
      this.db
        .prepare("UPDATE user_profiles SET bio = ?, visibility = ?, preferred_language = ?, preferred_region = ?, updated_at = ? WHERE user_id = ?")
        .bind(nextProfile.bio, nextProfile.visibility, nextProfile.preferredLanguage, nextProfile.preferredRegion, now, userId),
    ]);

    return { user: nextUser, profile: nextProfile };
  }

  async createSession(session: SessionRecord) {
    await this.db
      .prepare("INSERT INTO sessions (id, user_id, token_hash, csrf_token, expires_at, created_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(session.id, session.userId, session.tokenHash, session.csrfToken, session.expiresAt, session.createdAt, session.lastSeenAt, session.userAgent)
      .run();
  }

  async findSessionByTokenHash(tokenHash: string, now: string) {
    const row = await this.db
      .prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?")
      .bind(tokenHash, now)
      .first<SessionRow>();
    return row ? mapSession(row) : null;
  }

  async touchSession(sessionId: string, now: string) {
    await this.db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(now, sessionId).run();
  }

  async deleteSession(sessionId: string) {
    await this.db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }

  async createChallenge(challenge: ChallengeRecord) {
    await this.db
      .prepare("INSERT INTO auth_challenges (id, user_id, type, challenge, metadata_json, expires_at, consumed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(challenge.id, challenge.userId, challenge.type, challenge.challenge, JSON.stringify(challenge.metadata), challenge.expiresAt, challenge.consumedAt, challenge.createdAt)
      .run();
  }

  async findChallenge(id: string, type: ChallengeRecord["type"], now: string) {
    const row = await this.db
      .prepare("SELECT * FROM auth_challenges WHERE id = ? AND type = ? AND consumed_at IS NULL AND expires_at > ?")
      .bind(id, type, now)
      .first<ChallengeRow>();
    return row ? mapChallenge(row) : null;
  }

  async findOAuthState(state: string, now: string) {
    const row = await this.db
      .prepare("SELECT * FROM auth_challenges WHERE challenge = ? AND type = 'oauth_state' AND consumed_at IS NULL AND expires_at > ?")
      .bind(state, now)
      .first<ChallengeRow>();
    return row ? mapChallenge(row) : null;
  }

  async consumeChallenge(id: string, now: string) {
    await this.db.prepare("UPDATE auth_challenges SET consumed_at = ? WHERE id = ?").bind(now, id).run();
  }

  async createCredential(credential: CredentialRecord) {
    await this.db
      .prepare("INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, transports, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(credential.id, credential.userId, credential.credentialId, credential.publicKey, credential.counter, JSON.stringify(credential.transports), credential.createdAt, credential.lastUsedAt)
      .run();
  }

  async findCredentialsByUserId(userId: string) {
    const result = await this.db.prepare("SELECT * FROM webauthn_credentials WHERE user_id = ?").bind(userId).all<CredentialRow>();
    return result.results.map(mapCredential);
  }

  async findCredentialByCredentialId(credentialId: string) {
    const row = await this.db.prepare("SELECT * FROM webauthn_credentials WHERE credential_id = ?").bind(credentialId).first<CredentialRow>();
    return row ? mapCredential(row) : null;
  }

  async updateCredentialCounter(credentialId: string, counter: number, now: string) {
    await this.db.prepare("UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?").bind(counter, now, credentialId).run();
  }

  async createPasswordCredential(credential: PasswordCredentialRecord) {
    await this.db
      .prepare("INSERT INTO auth_passwords (id, user_id, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(credential.id, credential.userId, credential.passwordHash, credential.createdAt, credential.updatedAt)
      .run();
  }

  async findPasswordCredentialByUserId(userId: string) {
    const row = await this.db.prepare("SELECT * FROM auth_passwords WHERE user_id = ?").bind(userId).first<PasswordCredentialRow>();
    return row ? mapPasswordCredential(row) : null;
  }

  async upsertOAuthAccount(input: OAuthAccountInput) {
    await this.db
      .prepare(
        "INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider, provider_account_id) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at",
      )
      .bind(input.id, input.userId, input.provider, input.providerAccountId, input.email, input.createdAt, input.updatedAt)
      .run();
  }

  async findOAuthUser(provider: string, providerAccountId: string) {
    const row = await this.db
      .prepare("SELECT users.* FROM users INNER JOIN oauth_accounts ON oauth_accounts.user_id = users.id WHERE oauth_accounts.provider = ? AND oauth_accounts.provider_account_id = ?")
      .bind(provider, providerAccountId)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async createUpload(upload: UploadRecord) {
    await this.db
      .prepare(
        "INSERT INTO uploads (id, user_id, bucket, object_path, public_url, content_type, byte_size, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(upload.id, upload.userId, upload.bucket, upload.objectPath, upload.publicUrl, upload.contentType, upload.byteSize, upload.kind, upload.status, upload.createdAt, upload.updatedAt)
      .run();
  }

  async findUploadById(uploadId: string) {
    const row = await this.db.prepare("SELECT * FROM uploads WHERE id = ?").bind(uploadId).first<UploadRow>();
    return row ? mapUpload(row) : null;
  }

  async attachUpload(userId: string, uploadId: string, kind: "avatar" | "banner", now: string) {
    const column = kind === "avatar" ? "avatar_upload_id" : "banner_upload_id";
    await this.db.prepare(`UPDATE user_profiles SET ${column} = ?, updated_at = ? WHERE user_id = ?`).bind(uploadId, now, userId).run();
    const profile = await this.findProfileByUserId(userId);
    if (!profile) {
      throw new Error("User profile not found.");
    }
    return profile;
  }
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProfile(row: ProfileRow): ProfileRecord {
  return {
    userId: row.user_id,
    bio: row.bio,
    avatarUploadId: row.avatar_upload_id,
    bannerUploadId: row.banner_upload_id,
    visibility: row.visibility,
    preferredLanguage: row.preferred_language,
    preferredRegion: row.preferred_region,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    csrfToken: row.csrf_token,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    userAgent: row.user_agent,
  };
}

function mapCredential(row: CredentialRow): CredentialRecord {
  return {
    id: row.id,
    userId: row.user_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    transports: JSON.parse(row.transports) as string[],
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

function mapChallenge(row: ChallengeRow): ChallengeRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    challenge: row.challenge,
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  };
}

function mapUpload(row: UploadRow): UploadRecord {
  return {
    id: row.id,
    userId: row.user_id,
    bucket: row.bucket,
    objectPath: row.object_path,
    publicUrl: row.public_url,
    contentType: row.content_type,
    byteSize: row.byte_size,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPasswordCredential(row: PasswordCredentialRow): PasswordCredentialRecord {
  return {
    id: row.id,
    userId: row.user_id,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
