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

/**
 * Verify that a CHECK constraint restricts a column to an expected set of values.
 *
 * Without such a constraint a `TEXT` column accepts any string, so a typo or case
 * mismatch can be stored where a meaningful status was intended. The service layer
 * denies unrecognised values at runtime; this check surfaces the misconfiguration at
 * startup instead of leaving it to be discovered during an authentication attempt.
 *
 * This inspects the constraint definition rendered by `pg_get_constraintdef`, which
 * normalises `IN (...)` to `= ANY (ARRAY[...])`, and compares the complete set of string
 * literals it contains against the expected values. The sets must match exactly: a
 * constraint permitting a fourth value is rejected, because accepting it would make the
 * schema contradict what the migration and documentation promise.
 *
 * A consequence worth knowing: a compound constraint such as
 * `CHECK (status IN (...) AND note <> 'x')` is rejected, because `'x'` joins the literal
 * set. The contract here is a plain enum constraint on the column.
 */
export async function validateEnumCheckConstraint(
  pool: Pool,
  schema: string,
  table: string,
  column: string,
  allowedValues: readonly string[]
): Promise<void> {
  const res = await pool.query<{ definition: string }>(
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

  const hasEnumConstraint = res.rows.some((row) => {
    const definition = row.definition;
    if (!definition.includes(column)) {
      return false;
    }

    // Every single-quoted literal in the definition, with PostgreSQL's doubled-quote
    // escaping ('' inside a literal) collapsed back to a single quote.
    const literals = new Set<string>(
      Array.from(definition.matchAll(/'((?:[^']|'')*)'/g), (match) =>
        (match[1] ?? "").replace(/''/g, "'")
      )
    );

    // Exact set equality. A subset means a promised value cannot be stored; a superset
    // means an unsupported one can.
    return (
      literals.size === allowedValues.length && allowedValues.every((value) => literals.has(value))
    );
  });

  if (!hasEnumConstraint) {
    throw new Error(
      `[Auth:validateEnumCheckConstraint] Table '${schema}.${table}' must have a CHECK constraint restricting '${column}' to exactly (${allowedValues
        .map((value) => `'${value}'`)
        .join(", ")}). A constraint permitting any other value is rejected.`
    );
  }
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
