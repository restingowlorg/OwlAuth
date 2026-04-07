import { AuthDB } from "../repositories/contracts";
import { AuthOptions, AuthType, IAuthMethods } from "../core/types";

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export interface IAuthStrategy {
  register(
    target: Mutable<Partial<IAuthMethods>>,
    db: AuthDB,
    options: AuthOptions<AuthType>
  ): void;
}
