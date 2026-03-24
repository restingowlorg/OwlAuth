export { PostgresAdapter } from "../../adapters/PostgresAdapter";
export { initPostgres } from "./db";
export { PostgresUserRepository } from "../../repositories/postgresql/user.repo";
export { PostgresMagicLinkRepository } from "../../repositories/postgresql/magic.link.repo";
export {
  MagicLinkRow,
  TableColumn,
  ColumnRow,
  FKRow,
  TableExistsRow,
  ColumnInfoRow,
  PrimaryKeyRow
} from "../../types/index";
