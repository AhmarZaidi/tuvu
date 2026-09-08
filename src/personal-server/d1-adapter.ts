import { readFileSync, statSync } from "node:fs";
import {
  DatabaseSync,
  type SQLInputValue,
  type SQLOutputValue,
} from "node:sqlite";

type Row = Record<string, unknown>;

function inputValue(value: unknown): SQLInputValue {
  if (value === undefined) return null;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return value;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new TypeError(`Unsupported D1 bind value: ${typeof value}`);
}

function outputValue(value: SQLOutputValue): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Uint8Array) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    );
  }
  return value;
}

function outputRow(value: Record<string, SQLOutputValue>): Row {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, outputValue(item)]),
  );
}

function durationSince(startedAt: number) {
  return Math.max(0, performance.now() - startedAt);
}

export class NodeD1PreparedStatement implements D1PreparedStatement {
  constructor(
    private readonly owner: NodeD1Database,
    private readonly query: string,
    private readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new NodeD1PreparedStatement(
      this.owner,
      this.query,
      values.map(inputValue),
    );
  }

  async first<T = unknown>(columnName: string): Promise<T | null>;
  async first<T = Row>(): Promise<T | null>;
  async first<T = Row>(columnName?: string): Promise<T | null> {
    const row = this.owner.statement(this.query).get(...this.values);
    if (!row) return null;
    const normalized = outputRow(row);
    if (columnName !== undefined) {
      if (!Object.hasOwn(normalized, columnName)) {
        throw new Error(`D1 column not found: ${columnName}`);
      }
      return normalized[columnName] as T;
    }
    return normalized as T;
  }

  async run<T = Row>(): Promise<D1Result<T>> {
    const startedAt = performance.now();
    const result = this.owner.statement(this.query).run(...this.values);
    return this.owner.result<T>([], {
      changes: Number(result.changes),
      lastRowId: Number(result.lastInsertRowid),
      duration: durationSince(startedAt),
    });
  }

  async all<T = Row>(): Promise<D1Result<T>> {
    return this.executeAll<T>();
  }

  async raw<T = unknown[]>(options: {
    columnNames: true;
  }): Promise<[string[], ...T[]]>;
  async raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: {
    columnNames?: boolean;
  }): Promise<T[] | [string[], ...T[]]> {
    const statement = this.owner.statement(this.query);
    statement.setReturnArrays(true);
    const rawRows = statement.all(...this.values);
    const rows = rawRows.map((row) =>
      Object.values(row).map(outputValue),
    ) as T[];
    if (options?.columnNames) {
      return [statement.columns().map((column) => column.name), ...rows];
    }
    return rows;
  }

  belongsTo(database: NodeD1Database) {
    return this.owner === database;
  }

  async executeAll<T = Row>(): Promise<D1Result<T>> {
    const startedAt = performance.now();
    const changesBefore = this.owner.totalChanges();
    const rows = this.owner
      .statement(this.query)
      .all(...this.values)
      .map(outputRow) as T[];
    const changes = this.owner.totalChanges() - changesBefore;
    return this.owner.result(rows, {
      changes,
      lastRowId: this.owner.lastInsertRowId(),
      duration: durationSince(startedAt),
    });
  }
}

class NodeD1Session implements D1DatabaseSession {
  constructor(private readonly database: NodeD1Database) {}

  prepare(query: string): D1PreparedStatement {
    return this.database.prepare(query);
  }

  batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    return this.database.batch<T>(statements);
  }

  getBookmark(): D1SessionBookmark | null {
    return null;
  }
}

export class NodeD1Database implements D1Database {
  private readonly sqlite: DatabaseSync;

  constructor(readonly path: string) {
    this.sqlite = new DatabaseSync(path, {
      timeout: 5_000,
      enableForeignKeyConstraints: true,
    });
    this.sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  }

  prepare(query: string): D1PreparedStatement {
    return new NodeD1PreparedStatement(this, query);
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    const compatible = statements.map((statement) => {
      if (
        !(statement instanceof NodeD1PreparedStatement) ||
        !statement.belongsTo(this)
      ) {
        throw new TypeError("D1 batch statements must belong to this database");
      }
      return statement;
    });

    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results: D1Result<T>[] = [];
      for (const statement of compatible) {
        results.push(await statement.executeAll<T>());
      }
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(query: string): Promise<D1ExecResult> {
    const startedAt = performance.now();
    this.sqlite.exec(query);
    return {
      count: query
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean).length,
      duration: durationSince(startedAt),
    };
  }

  withSession(): D1DatabaseSession {
    return new NodeD1Session(this);
  }

  async dump(): Promise<ArrayBuffer> {
    this.sqlite.exec("PRAGMA wal_checkpoint(FULL)");
    const bytes = readFileSync(this.path);
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  }

  close() {
    this.sqlite.close();
  }

  statement(query: string) {
    return this.sqlite.prepare(query);
  }

  totalChanges() {
    const row = this.sqlite
      .prepare("SELECT total_changes() AS value")
      .get() as { value: number };
    return Number(row.value);
  }

  lastInsertRowId() {
    const row = this.sqlite
      .prepare("SELECT last_insert_rowid() AS value")
      .get() as { value: number };
    return Number(row.value);
  }

  result<T>(
    results: T[],
    input: { changes: number; lastRowId: number; duration: number },
  ): D1Result<T> {
    return {
      success: true,
      results,
      meta: {
        duration: input.duration,
        size_after: statSync(this.path).size,
        rows_read: results.length,
        rows_written: input.changes,
        last_row_id: input.lastRowId,
        changed_db: input.changes > 0,
        changes: input.changes,
      },
    };
  }
}
