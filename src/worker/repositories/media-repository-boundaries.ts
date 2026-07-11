import type { MediaRepository } from "../media-repository";

export type MediaCatalogRepository = Pick<
  MediaRepository,
  "createMedia" | "findMediaById" | "searchMedia"
>;

export type UserLibraryRepository = Pick<
  MediaRepository,
  "findUserMedia" | "upsertUserMedia" | "createActivityEvent"
>;

export type CanonicalMediaRepository = MediaCatalogRepository & UserLibraryRepository;
