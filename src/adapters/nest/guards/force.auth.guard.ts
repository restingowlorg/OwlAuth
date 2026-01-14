import {
  CanActivate,
  Inject,
  ExecutionContext,
  HttpStatus,
} from "@nestjs/common";
import { IAuthManager } from "../../../interfaces";

export class MvpForceRotateGuard implements CanActivate {
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

    // Force rotation by passing true to forceRotate
    const result = await this.auth.me(token, undefined, true);

    if (!result.success) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: result.message || "Invalid session",
        error: "Unauthorized",
      });
      return false;
    }


    // Attach user and session to request
    req.user = { id: result.data.userId };
    req.session = result.data;

    return true;
  }
}
