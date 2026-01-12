import {
  CanActivate,
  Inject,
  ExecutionContext,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import { IAuthManager } from "../../interfaces";

export class MvpAuthGuard implements CanActivate {
  constructor(@Inject("AUTH_MANAGER") private readonly auth: IAuthManager) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();

    // const token = req.cookies?.AUTH_SESSION;
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

    // if (!token) {
    //   throw new UnauthorizedException("No session token provided");
    // }

    // Use AuthManager to validate session; no rotation for normal guard
    const result = await this.auth.me(token, undefined, false);

    console.log("ℹ️ Auth Guard - session token:", token);
    console.log("ℹ️ Auth Guard - validation result:", result);

    if (!result.success) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: result.message || "Invalid session",
        error: "Unauthorized",
      });
      return false;
    }

    // if (!result.success) {
    //   throw new UnauthorizedException(result.message || "Invalid session");
    // }

    // Attach typed user and session to request
    req.user = { id: result.data.userId };
    req.session = result.data;

    return true;
  }
}
