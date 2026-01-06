import {
  CanActivate,
  Inject,
  ExecutionContext,
  HttpStatus,
} from "@nestjs/common";
import { IAuthManager } from "../../interfaces";

export class MvpAuthGuard implements CanActivate {
  constructor(
    @Inject("AUTH_MANAGER")
    private readonly auth: IAuthManager
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();

    const token = req.cookies?.AUTH_SESSION;
    if (!token) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: "No session token provided",
        error: "Unauthorized",
      });
      return false;
    }

    const result = await this.auth.me(token);

    if (!result.success) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: result.message || "Invalid session",
        error: "Unauthorized",
      });
      return false;
    }

    req.user = { id: result.data.userId };
    req.session = result.data;

    console.log(" MvpAuthGuard: User authenticated ✅", req.user);
    console.log(" Rotated session token ✅");

    // Transparent rotation
    res.cookie("AUTH_SESSION", result.data.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });

    return true;
  }
}
