import { externalApiEndpoints } from "@shared/constants";
import type { ProviderResult } from "./types";

export function tmdbImage(path: string | null | undefined, size: string) {
  if (!path) return null;
  return String(path).startsWith("http") ? String(path) : `${externalApiEndpoints.tmdbImage}/${size}${path}`;
}

export function isProviderResult(value: ProviderResult | null): value is ProviderResult {
  return Boolean(value);
}

export function valueOrEmpty(result: PromiseSettledResult<ProviderResult[]>) {
  return result.status === "fulfilled" ? result.value : [];
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function numberOrString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return stringValue(value);
}

export function firstString(value: unknown) {
  if (Array.isArray(value)) return (value.find((item) => typeof item === "string" && item.trim()) as string | undefined) ?? null;
  return stringValue(value);
}

export function arrayNames(value: unknown, nestedKey?: string) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = item as Record<string, unknown>;
    const target = nestedKey && record[nestedKey] && typeof record[nestedKey] === "object" ? record[nestedKey] as Record<string, unknown> : record;
    return stringValue(target.name);
  }).filter((item): item is string => Boolean(item));
}

export function yearFromDate(value: string | null) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

export function normalizeDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function stableKey(value: string) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  return Math.abs(hash).toString(36);
}
