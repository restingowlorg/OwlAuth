import { Pool } from "pg";

/**
 * Validation Helpers for PostgreSQL
 */

export async function validateSchema(pool: Pool, schema: string): Promise<void> {
  const res = await pool.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
    [schema]
  );
  if (res.rowCount === 0 || res.rowCount === null) {
    throw new Error(`[Auth:validateSchema] Schema '${schema}' does not exist`);
  }
}

export async function validateTable(pool: Pool, qualifiedTable: string): Promise<void> {
  const res = await pool.query<{ table_exists: string | null }>(
    `SELECT to_regclass($1) AS table_exists`,
    [qualifiedTable]
  );
  if (!res.rows[0].table_exists)
    throw new Error(`[Auth:validateTable] Table '${qualifiedTable}' does not exist`);
}

export async function validateColumns(
  pool: Pool,
  schema: string,
  table: string,
  requiredColumns: readonly string[]
): Promise<void> {
  const res = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = $2
    `,
    [table, schema]
  );

  const existingColumns = res.rows.map((r) => r.column_name);
  for (const col of requiredColumns) {
    if (!existingColumns.includes(col)) {
      throw new Error(
        `[Auth:validateColumns] Table '${schema}.${table}' missing required column '${col}'`
      );
    }
  }
}

export async function validateNonNullableColumns(
  pool: Pool,
  schema: string,
  table: string,
  requiredColumns: readonly string[]
): Promise<void> {
  const res = await pool.query<{ column_name: string; is_nullable: "YES" | "NO" }>(
    `
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
        AND table_schema = $2
        AND column_name = ANY($3)
    `,
    [table, schema, requiredColumns]
  );

  const nullableColumns = new Map(res.rows.map((row) => [row.column_name, row.is_nullable]));
  for (const column of requiredColumns) {
    if (nullableColumns.get(column) !== "NO") {
      throw new Error(
        `[Auth:validateNonNullableColumns] Column '${schema}.${table}.${column}' must be NOT NULL`
      );
    }
  }
}

/**
 * Verify a non-partial, single-column unique index or constraint. Composite indexes
 * do not prevent duplicate values for an individual identity field.
 */
export async function validateUniqueColumn(
  pool: Pool,
  schema: string,
  table: string,
  column: string
): Promise<void> {
  const res = await pool.query<{ index_name: string }>(
    `
      SELECT index_class.relname AS index_name
      FROM pg_index AS index_meta
      INNER JOIN pg_class AS table_class ON table_class.oid = index_meta.indrelid
      INNER JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
      INNER JOIN pg_class AS index_class ON index_class.oid = index_meta.indexrelid
      INNER JOIN pg_attribute AS attribute
        ON attribute.attrelid = table_class.oid
        AND attribute.attnum = index_meta.indkey[0]
      WHERE table_namespace.nspname = $1
        AND table_class.relname = $2
        AND attribute.attname = $3
        AND index_meta.indisunique = TRUE
        AND index_meta.indpred IS NULL
        AND index_meta.indnkeyatts = 1
    `,
    [schema, table, column]
  );

  if (res.rowCount === 0 || res.rowCount === null) {
    throw new Error(
      `[Auth:validateUniqueColumn] Table '${schema}.${table}' must have a non-partial single-column unique index or constraint on '${column}'`
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip the balanced parentheses PostgreSQL wraps around a rendered expression. */
function unwrapParentheses(expression: string): string {
  let current = expression.trim();

  while (current.startsWith("(") && current.endsWith(")")) {
    let depth = 0;
    let wrapsWholeExpression = true;

    for (let index = 0; index < current.length; index += 1) {
      const character = current[index];
      if (character === "(") depth += 1;
      else if (character === ")") {
        depth -= 1;
        if (depth === 0 && index < current.length - 1) {
          wrapsWholeExpression = false;
          break;
        }
      }
    }

    if (!wrapsWholeExpression) break;
    current = current.slice(1, -1).trim();
  }

  return current;
}

// A quoted literal with PostgreSQL's doubled-quote escaping, optionally cast.
const LITERAL = String.raw`'(?:[^']|'')*'(?:::[A-Za-z_ ]+)?`;
const LITERAL_LIST = new RegExp(String.raw`^\s*${LITERAL}(?:\s*,\s*${LITERAL})*\s*$`);

/**
 * Read the values from a predicate that constrains exactly one column, or `null` when the
 * expression is anything else.
 *
 * Only the canonical form PostgreSQL renders is accepted — `column = ANY (ARRAY[...])`,
 * which is what `IN (...)` normalises to — and it must be the *whole* expression. Scanning
 * for literals anywhere in the definition is not enough: a constraint such as
 * `CHECK ((status = 'active') OR (note = ANY (ARRAY['pending_email_verification','disabled'])))`
 * contains exactly the expected literals while leaving `status` effectively unconstrained,
 * since `status = 'suspended', note = 'disabled'` satisfies it.
 *
 * Parenthesis matching here does not account for parentheses inside string literals, so a
 * permitted value containing one is not recognised and the constraint is rejected. That
 * fails safe — a startup error rather than a silently accepted schema — and none of the
 * statuses this validates contain parentheses.
 */
function readSingleColumnDomain(definition: string, column: string): string[] | null {
  const body = unwrapParentheses(definition.replace(/^CHECK\s*/i, ""));

  const predicate = new RegExp(
    String.raw`^\(?${escapeRegExp(column)}\)?(?:::[A-Za-z_ ]+)?\s*=\s*ANY\s*\(\s*\(?ARRAY\[(.*?)\]\)?(?:::[A-Za-z_\[\] ]+)?\s*\)$`,
    "is"
  );

  const match = predicate.exec(body);
  if (!match) return null;

  const inner = match[1] ?? "";
  // Every element must be a plain literal; a function call or column reference among them
  // would mean the permitted set is not knowable from the definition.
  if (!LITERAL_LIST.test(inner)) return null;

  return Array.from(inner.matchAll(/'((?:[^']|'')*)'/g), (literal) =>
    (literal[1] ?? "").replace(/''/g, "'")
  );
}

function setsMatch(values: readonly string[], expected: readonly string[]): boolean {
  const found = new Set(values);
  return found.size === expected.length && expected.every((value) => found.has(value));
}

/**
 * Verify the datastore restricts a column to exactly an expected set of values, either
 * through a native `ENUM` type or a CHECK constraint.
 *
 * Without such a restriction a `TEXT` column accepts any string, so a typo or case mismatch
 * can be stored where a meaningful status was intended. The service layer denies unrecognised
 * values at runtime; this surfaces the misconfiguration at startup instead of leaving it to be
 * discovered during an authentication attempt.
 *
 * The sets must match exactly. A subset means a documented value cannot be stored; a superset
 * means an unsupported one can, which would make the schema contradict what the migration and
 * documentation promise.
 */
export async function validateColumnDomain(
  pool: Pool,
  schema: string,
  table: string,
  column: string,
  allowedValues: readonly string[]
): Promise<void> {
  const fail = (): never => {
    throw new Error(
      `[Auth:validateColumnDomain] Table '${schema}.${table}' must restrict '${column}' to exactly (${allowedValues
        .map((value) => `'${value}'`)
        .join(
          ", "
        )}), using a native enum type or a CHECK constraint of the form '${column} IN (...)'. A constraint permitting any other value, or one combined with another predicate, is rejected.`
    );
  };

  // A native enum type states the permitted set directly, so prefer it when present.
  const enumLabels = await pool.query<{ enumlabel: string }>(
    `
      SELECT enum_meta.enumlabel
      FROM pg_attribute AS attribute
      INNER JOIN pg_class AS table_class ON table_class.oid = attribute.attrelid
      INNER JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
      INNER JOIN pg_type AS column_type ON column_type.oid = attribute.atttypid
      INNER JOIN pg_enum AS enum_meta ON enum_meta.enumtypid = column_type.oid
      WHERE table_namespace.nspname = $1
        AND table_class.relname = $2
        AND attribute.attname = $3
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND column_type.typtype = 'e'
    `,
    [schema, table, column]
  );

  if (enumLabels.rowCount && enumLabels.rowCount > 0) {
    const labels = enumLabels.rows.map((row) => row.enumlabel);
    if (!setsMatch(labels, allowedValues)) fail();
    return;
  }

  const constraints = await pool.query<{ definition: string }>(
    `
      SELECT pg_get_constraintdef(constraint_meta.oid) AS definition
      FROM pg_constraint AS constraint_meta
      INNER JOIN pg_class AS table_class ON table_class.oid = constraint_meta.conrelid
      INNER JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
      WHERE table_namespace.nspname = $1
        AND table_class.relname = $2
        AND constraint_meta.contype = 'c'
    `,
    [schema, table]
  );

  const satisfied = constraints.rows.some((row) => {
    const values = readSingleColumnDomain(row.definition, column);
    return values !== null && setsMatch(values, allowedValues);
  });

  if (!satisfied) fail();
}

export async function validateForeignKey(
  pool: Pool,
  schema: string,
  table: string,
  refSchema: string,
  refTable: string,
  col: string,
  refCol: string
): Promise<void> {
  const res = await pool.query<{
    referenced_table: string;
    referenced_schema: string;
    referenced_column: string;
  }>(
    `
      SELECT
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column,
        ccu.table_schema AS referenced_schema
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = $1
        AND tc.table_schema = $2
        AND kcu.column_name = $3
    `,
    [table, schema, col]
  );

  const valid = res.rows.some(
    (r) =>
      r.referenced_table === refTable &&
      r.referenced_schema === refSchema &&
      r.referenced_column === refCol
  );

  if (!valid) {
    throw new Error(
      `[Auth:validateForeignKey] Table '${schema}.${table}' must have a foreign key '${col}' referencing '${refSchema}.${refTable}.${refCol}'`
    );
  }
}
