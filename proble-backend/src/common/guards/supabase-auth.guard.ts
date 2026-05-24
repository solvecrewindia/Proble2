import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // 1. Extract authorization header
    const authHeader = request.headers['authorization'];
    if (!authHeader) {
      this.logger.warn('🚫 Request blocked: Missing Authorization header.');
      throw new UnauthorizedException('Authorization session token is missing.');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      this.logger.warn('🚫 Request blocked: Invalid Authorization scheme.');
      throw new UnauthorizedException('Invalid authorization scheme.');
    }

    // 2. Validate token and attach user to request object
    try {
      const user = await this.supabaseService.verifyToken(token);
      request.user = user; // Attach the authenticated user object directly to the request!
      return true;
    } catch (err) {
      this.logger.warn(`🚫 Request blocked: Invalid user token. Error: ${err.message}`);
      throw new UnauthorizedException('Authentication failed. Invalid or expired token.');
    }
  }
}
