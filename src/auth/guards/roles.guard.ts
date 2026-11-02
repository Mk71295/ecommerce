import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import type { Role } from '../../common/enums/role.enum.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';

/** Use after JwtAuthGuard. Routes without @Roles() are open to any signed-in user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    return !!user && roles.includes(user.role);
  }
}
