/**
 * CloudBasePgAdapter——通过 CloudBase HTTP API (`/v1/rdb/exec-pgsql`) 访问 PostgreSQL 的
 * Prisma 7 驱动适配器。
 *
 * 背景：CloudBase 云托管（Cloud Run）容器无法通过 TCP 直连 CloudBase SQL PostgreSQL
 * （内网 VIP 不可达），但 CloudBase 网关提供永久 API Key 鉴权的 HTTP SQL 端点，
 * 支持参数化查询与任意 DDL/DML。本适配器把 Prisma 7 queryCompiler 生成的 SQL
 * 转译为 HTTP 调用，使整套 Prisma ORM 代码无需改动即可在云端运行。
 *
 * 假设（与 HWO schema 一致）：无 Decimal/BigInt/Bytes 字段；不使用 $transaction。
 */

export interface CloudBaseAdapterOptions {
  /** 环境 ID，例如 hwo-d3gj59xkz7d118c70 */
  envId: string;
  /** CloudBase API Key（service_role，拥有服务端权限） */
  apiKey: string;
  /** exec-pgsql 端点，默认 https://{envId}.api.tcloudbasegateway.com/v1/rdb/exec-pgsql */
  endpoint?: string;
  /** 执行 SQL 使用的 PG 角色 */
  role?: string;
}

// ─── 与 @prisma/driver-adapter-utils 的运行时解耦（避免 ESM/CJS 导入问题）───

type ColumnType = number;

const T = {
  Int32: 0,
  Int64: 1,
  Float: 2,
  Double: 3,
  Numeric: 4,
  Boolean: 5,
  Character: 6,
  Text: 7,
  Date: 8,
  Time: 9,
  DateTime: 10,
  Json: 11,
  Enum: 12,
  Bytes: 13,
  Uuid: 15,
} as const;

interface SqlQuery {
  sql: string;
  args?: Array<unknown>;
}

interface SqlResultSet {
  columnTypes: Array<ColumnType>;
  columnNames: Array<string>;
  rows: Array<Array<unknown>>;
  lastInsertId?: string;
}

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const DATE_HINT =
  /(^|_)(createdAt|updatedAt|scheduledAt|settledAt|deletedAt|playedAt|joinedAt|leftAt|startsAt|endsAt|lastLoginAt|date|Date|time|Time|At)$/;

function isDateLikeValue(v: unknown): v is string {
  return typeof v === "string" && ISO_TS.test(v);
}

/**
 * 从结果行推断列类型（exec-pgsql 返回纯 JSON，无列类型信息）。
 * 约定：Int 字段值为 JSON 整数、Float 为带小数的数、DateTime 为 ISO-8601 字符串且列名带时间暗示、
 * Json 为对象/数组、Boolean 为布尔、其余字符串为 Text。
 */
function inferColumnTypes(rows: Array<Record<string, unknown>>, columnNames: Array<string>): Array<ColumnType> {
  return columnNames.map((name) => {
    let allInt = true;
    let sawValue = false;
    let allDateLike = true;
    for (const row of rows) {
      const v = row[name];
      if (v === null || v === undefined) continue;
      sawValue = true;
      if (typeof v === "number") {
        if (!Number.isInteger(v)) allInt = false;
        continue;
      }
      allInt = false;
      if (!isDateLikeValue(v)) allDateLike = false;
    }
    if (!sawValue) return T.Text; // 全 null 列
    if (allInt) return T.Int32;
    if (allDateLike && DATE_HINT.test(name)) return T.DateTime;
    // 兜底：检查单值样例
    for (const row of rows) {
      const v = row[name];
      if (v === null || v === undefined) continue;
      switch (typeof v) {
        case "number":
          return Number.isInteger(v) ? T.Int32 : T.Double;
        case "boolean":
          return T.Boolean;
        case "object":
          return T.Json;
        case "string":
          if (allDateLike) return T.DateTime; // 列名没有时间暗示但值全是 ISO 时间
          return T.Text;
        default:
          return T.Text;
      }
    }
    return T.Text;
  });
}

/** 把 Prisma 查询参数转成网关可绑定的 JSON 参数（Date → ISO 字符串等）。 */
function serializeArgs(args: Array<unknown>): Array<unknown> {
  return args.map((a) => {
    if (a === null || a === undefined) return null;
    if (typeof a === "bigint") return a.toString();
    // Date 交给 JSON.stringify 时已是 ISO；显式转换保证一致
    return a;
  });
}

export class CloudBasePgAdapter {
  readonly provider = "postgres";
  readonly adapterName = "cloudbase-exec-pgsql";

  private readonly endpoint: string;
  private readonly role: string;
  private readonly apiKey: string;

  constructor(options: CloudBaseAdapterOptions) {
    this.apiKey = options.apiKey;
    this.role = options.role ?? "cloudbase_postgres";
    this.endpoint =
      options.endpoint ?? `https://${options.envId}.api.tcloudbasegateway.com/v1/rdb/exec-pgsql`;
  }

  /** factory 形态（PrismaClient 构造参数） */
  async connect(): Promise<CloudBasePgAdapter> {
    return this;
  }

  async connectToShadowDb(): Promise<CloudBasePgAdapter> {
    return this;
  }

  /** 与 @prisma/driver-adapter-utils 兼容的连接信息 */
  getConnectionInfo(): { schemaName?: string; maxBindValues?: number; supportsRelationJoins: boolean } {
    return { schemaName: "public", maxBindValues: 65535, supportsRelationJoins: true };
  }

  private async exec(sql: string, parameters?: Array<unknown>): Promise<Array<Record<string, unknown>>> {
    const body: Record<string, unknown> = { sql, role: this.role };
    if (parameters && parameters.length > 0) body.parameters = parameters;

    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try {
          const j = JSON.parse(text);
          msg = j?.message ?? j?.details ?? JSON.stringify(j);
        } catch {
          /* keep raw text */
        }
        const err: any = new Error(`[exec-pgsql] HTTP ${res.status}: ${msg}`);
        err.code = `P-${res.status}`;
        throw err;
      }
      return JSON.parse(text || "[]");
    } catch (e: any) {
      if (e?.code) throw e;
      const err: any = new Error(`[exec-pgsql] network error: ${e?.message ?? String(e)}`);
      err.code = "P-NET";
      throw err;
    }
  }

  /** Prisma 查询（SELECT / INSERT..RETURNING / UPDATE..RETURNING / DELETE..RETURNING） */
  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const params = serializeArgs(query.args ?? []);
    const rows = await this.exec(query.sql, params);

    if (rows.length === 0) {
      return { columnTypes: [], columnNames: [], rows: [] };
    }
    const columnNames = Object.keys(rows[0]);
    const columnTypes = inferColumnTypes(rows, columnNames);
    const values = rows.map((row) =>
      columnNames.map((c, idx) => {
        const v = row[c] ?? null;
        // Prisma 要求 Json 列以 JSON 字符串形式返回（运行时会 JSON.parse）
        if (v !== null && (columnTypes[idx] === T.Json || columnTypes[idx] === 75)) {
          return JSON.stringify(v);
        }
        return v;
      })
    );
    return { columnTypes, columnNames, rows: values };
  }

  /**
   * Prisma 写操作（无 RETURNING）。exec-pgsql 不返回受影响行数，
   * 通过 `WITH ... RETURNING 1` 包装统计受影响行数（INSERT/UPDATE/DELETE）。
   */
  async executeRaw(query: SqlQuery): Promise<number> {
    const params = serializeArgs(query.args ?? []);
    const sql = query.sql.trim();

    // 只包装单条数据修改语句；ON CONFLICT DO UPDATE 在 CTE 中不受支持，直接执行并把行数视为 1
    const canWrap =
      /^INSERT\b/i.test(sql) || /^UPDATE\b/i.test(sql) || /^DELETE\b/i.test(sql);
    const doUpdateConflict = /ON\s+CONFLICT[\s\S]*DO\s+UPDATE/i.test(sql);

    if (!canWrap || doUpdateConflict) {
      // INSERT 无冲突语法时成功必影响 1 行；其余场景尽力而为（执行成功但行数不可知）
      const rows = await this.exec(query.sql, params);
      void rows;
      return /^INSERT\b/i.test(sql) ? 1 : 0;
    }

    const wrapped = `WITH "hwo_rc" AS (${query.sql} RETURNING 1) SELECT COUNT(*)::int AS "hwo_cnt" FROM "hwo_rc"`;
    try {
      const rows = await this.exec(wrapped, params);
      const cnt = Number(rows?.[0]?.["hwo_cnt"] ?? 0);
      return Number.isFinite(cnt) ? cnt : 0;
    } catch (e: any) {
      // CTE 包装不可用（如 ON CONFLICT 等），退化执行
      if (/ON\s+CONFLICT|syntax error|42601/i.test(String(e?.message))) {
        await this.exec(query.sql, params);
        return /^INSERT\b/i.test(sql) ? 1 : 0;
      }
      throw e;
    }
  }

  /** 迁移脚本执行：网关支持单语句，多语句按分号切分逐个执行。 */
  async executeScript(script: string): Promise<void> {
    const statements = script
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await this.exec(stmt);
    }
  }

  /**
   * 事务：exec-pgsql HTTP 网关无会话连续性，无法持有真实事务。
   * HWO 业务代码不使用 $transaction，故这里提供直通实现（提交/回滚为 no-op）。
   */
  async startTransaction(): Promise<any> {
    const self = this;
    return {
      options: { usePhantomQuery: false },
      provider: self.provider,
      adapterName: self.adapterName,
      async queryRaw(q: SqlQuery) {
        return self.queryRaw(q);
      },
      async executeRaw(q: SqlQuery) {
        return self.executeRaw(q);
      },
      async commit() {},
      async rollback() {},
    };
  }

  async dispose(): Promise<void> {}
}