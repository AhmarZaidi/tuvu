import { randomId } from "./crypto";
import { envString } from "./env";

export type UploadObjectInput = {
  env: Env;
  userId: string;
  kind: "avatar" | "banner";
  file: File;
};

export type UploadedObject = {
  bucket: string;
  objectPath: string;
  publicUrl: string | null;
};

const extensionByContentType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadProfileImageToSupabase({ env, userId, kind, file }: UploadObjectInput): Promise<UploadedObject> {
  const supabaseUrl = envString(env, "SUPABASE_URL");
  const serviceRoleKey = envString(env, "SUPABASE_SERVICE_ROLE_KEY");
  const bucket = envString(env, "SUPABASE_STORAGE_AVATARS_BUCKET");

  if (!supabaseUrl || !serviceRoleKey || !bucket) {
    throw new Error("Supabase Storage is not configured.");
  }

  const extension = extensionByContentType[file.type] ?? "bin";
  const objectPath = `${kind}s/${userId}/${randomId("upl")}.${extension}`;
  const uploadUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${objectPath}`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": file.type,
      "x-upsert": "false",
    },
    body: await file.arrayBuffer(),
  });

  if (!response.ok) {
    throw new Error(`Supabase upload failed with status ${response.status}.`);
  }

  return {
    bucket,
    objectPath,
    publicUrl: `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${objectPath}`,
  };
}

export type UploadMediaCoverInput = {
  env: Env;
  mediaId: string;
  file: File;
};

export async function uploadMediaCoverToSupabase({ env, mediaId, file }: UploadMediaCoverInput): Promise<UploadedObject> {
  const supabaseUrl = envString(env, "SUPABASE_URL");
  const serviceRoleKey = envString(env, "SUPABASE_SERVICE_ROLE_KEY");
  const bucket = envString(env, "SUPABASE_STORAGE_MEDIA_CACHE_BUCKET");

  if (!supabaseUrl || !serviceRoleKey || !bucket) {
    throw new Error("Supabase Storage is not configured.");
  }

  const extension = extensionByContentType[file.type] ?? "bin";
  const objectPath = `covers/${mediaId}/${randomId("cov")}.${extension}`;
  const uploadUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${objectPath}`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": file.type,
      "x-upsert": "false",
    },
    body: await file.arrayBuffer(),
  });

  if (!response.ok) {
    throw new Error(`Supabase upload failed with status ${response.status}.`);
  }

  return {
    bucket,
    objectPath,
    publicUrl: `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${objectPath}`,
  };
}

