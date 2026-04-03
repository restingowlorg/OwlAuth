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
