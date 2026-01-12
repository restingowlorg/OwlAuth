import {
  CanActivate,
  Inject,
  ExecutionContext,
  HttpStatus,
} from "@nestjs/common";
import { IAuthManager } from "../../interfaces";

export class MvpForceRotateGuard implements CanActivate {
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

    // Force rotation by passing true to forceRotate
    const result = await this.auth.me(token, undefined, true);

    console.log("ℹ️ ForceRotate Guard - old token:", token);
    console.log("ℹ️ ForceRotate Guard - new token:", result.data?.sessionToken);

    if (!result.success) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: result.message || "Invalid session",
        error: "Unauthorized",
      });
      return false;
    }

    // if (!result.success || !result.data) {
    //   throw new MvpUnauthorizedError(result.message);
    // }

    // Attach user and session to request
    req.user = { id: result.data.userId };
    req.session = result.data;

    // Update cookie with new rotated token
    // res.cookie("AUTH_SESSION", result.data.sessionToken, {
    //   httpOnly: true,
    //   sameSite: "lax",
    //   secure: true,
    // });

    return true;
  }
}
