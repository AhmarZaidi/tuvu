export type TmdbProxy = {
  listen(port?: number, host?: string): Promise<void>;
  close(): Promise<void>;
};

export function createTmdbProxy(): TmdbProxy;
