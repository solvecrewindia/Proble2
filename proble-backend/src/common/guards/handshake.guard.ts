import { CanActivate, ExecutionContext, Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class HandshakeGuard implements CanActivate {
  private readonly logger = new Logger(HandshakeGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // 1. Extract the secure headers from the incoming request
    const timestampStr = request.headers['x-proble-timestamp'];
    const clientSignature = request.headers['x-proble-signature'];

    if (!timestampStr || !clientSignature) {
      this.logger.warn('🚫 Request blocked: Missing secure handshake headers.');
      throw new ForbiddenException('Access denied. Invalid secure client handshake.');
    }

    // 2. Load the shared secret key from environment variables
    const secret = this.configService.get<string>('HANDSHAKE_SECRET');
    if (!secret) {
      this.logger.error('❌ Server Error: HANDSHAKE_SECRET is not configured inside .env!');
      throw new ForbiddenException('Access denied. Server misconfiguration.');
    }

    // 3. Prevent Replay Attacks: Check if the request's timestamp is within a 30-second window
    const clientTimestamp = parseInt(timestampStr, 10);
    const serverTimestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

    if (isNaN(clientTimestamp)) {
      this.logger.warn('🚫 Request blocked: Invalid timestamp format.');
      throw new ForbiddenException('Access denied. Invalid handshake format.');
    }

    const timeDifference = Math.abs(serverTimestamp - clientTimestamp);
    if (timeDifference > 30) {
      this.logger.warn(`🚫 Request blocked: Handshake expired. Time drift: ${timeDifference}s.`);
      throw new ForbiddenException('Access denied. Request handshake has expired.');
    }

    // 4. Validate Cryptographic Signature: Re-compute the HMAC-SHA256 signature on the server
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(timestampStr)
      .digest('hex');

    // Prevent timingSafeEqual error if client sends a signature with incorrect character length
    if (computedSignature.length !== clientSignature.length) {
      this.logger.warn('🚫 Request blocked: Signature length mismatch.');
      throw new ForbiddenException('Access denied. Invalid secure client handshake.');
    }

    // Use a secure constant-time comparison to prevent timing side-channel attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(computedSignature, 'utf-8'),
      Buffer.from(clientSignature, 'utf-8'),
    );

    if (!isValid) {
      this.logger.warn('🚫 Request blocked: Cryptographic signature mismatch. Possible tampering.');
      throw new ForbiddenException('Access denied. Invalid secure client handshake.');
    }

    this.logger.log('✅ Secure client handshake successfully validated. Access granted!');
    return true;
  }
}
