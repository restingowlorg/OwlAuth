import {
  CanActivate,
  Inject,
  ExecutionContext,
  HttpStatus,
} from "@nestjs/common";
import { IAuthManager } from "../../../interfaces";
import { authLog } from "../../../utils/logger";

export class MvpAuthGuard implements CanActivate {
  constructor(@Inject("AUTH_MANAGER") private readonly auth: IAuthManager) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();

    const token =
      req.cookies?.AUTH_SESSION ||
      req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: "No session token provided",
        error: "Unauthorized",
      });
      return false;
    }

    // Use AuthManager to validate session; no rotation for normal guard
    const result = await this.auth.me(token, undefined, false);



    if (!result.success) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: result.message || "Invalid session",
        error: "Unauthorized",
      });
      authLog("error", result.message || "Invalid session");
      return false;
    }

    // Attach typed user and session to request
    req.user = { id: result.data.userId };
    req.session = result.data;

    authLog("info", "Session validated");
    return true;
  }
}
