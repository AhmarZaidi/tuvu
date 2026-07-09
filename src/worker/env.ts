export function envString(env: Env, key: string) {
  return (env as unknown as Record<string, string | undefined>)[key];
}
