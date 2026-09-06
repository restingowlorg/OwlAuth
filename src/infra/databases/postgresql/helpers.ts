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
