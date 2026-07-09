import { z } from "zod";

export const profileVisibilitySchema = z.enum(["public", "connections", "private"]);

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only.");

export const displayNameSchema = z.string().trim().min(1).max(80);

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  username: usernameSchema.optional(),
  bio: z.string().max(280).optional(),
  visibility: profileVisibilitySchema.optional(),
  preferredLanguage: z.string().trim().min(2).max(16).optional(),
  preferredRegion: z.string().trim().min(2).max(16).optional(),
});

export const passkeyRegistrationOptionsSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
});

export const passkeyRegistrationVerifySchema = z.object({
  challengeId: z.string().min(1),
  credential: z.object({
    id: z.string().min(1),
    publicKey: z.string().min(1).optional(),
    counter: z.number().int().nonnegative().optional(),
    transports: z.array(z.string()).optional(),
  }).passthrough(),
});

export const passkeyLoginOptionsSchema = z.object({
  username: usernameSchema,
});

export const passkeyLoginVerifySchema = z.object({
  challengeId: z.string().min(1),
  credentialId: z.string().min(1).optional(),
  credential: z.object({ id: z.string().min(1) }).passthrough().optional(),
  counter: z.number().int().nonnegative().optional(),
});

export const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(128);

export const passwordRegistrationSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

export const passwordLoginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type ProfileVisibility = z.infer<typeof profileVisibilitySchema>;
