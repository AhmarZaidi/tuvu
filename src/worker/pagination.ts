export type OffsetPagination = {
  limit: number;
  offset: number;
};

export function parseOffsetPagination(input: { limit?: string | null; offset?: string | null }, defaults: { limit: number; maxLimit: number; offset?: number }): OffsetPagination {
  const requestedLimit = Number(input.limit ?? defaults.limit);
  const requestedOffset = Number(input.offset ?? defaults.offset ?? 0);
  return {
    limit: Number.isFinite(requestedLimit) ? Math.min(defaults.maxLimit, Math.max(1, Math.trunc(requestedLimit))) : defaults.limit,
    offset: Number.isFinite(requestedOffset) ? Math.max(0, Math.trunc(requestedOffset)) : defaults.offset ?? 0,
  };
}

export function offsetPage(limit: number, offset: number, count: number) {
  return { limit, offset, hasMore: count === limit };
}
