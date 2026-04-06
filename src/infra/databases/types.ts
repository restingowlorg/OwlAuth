import { BaseAuthOptions } from "../../core/types";
import { AuthDB } from "../../repositories/contracts";

export interface IDatabaseAdapter {
  connect(options: BaseAuthOptions): Promise<AuthDB>;
}
