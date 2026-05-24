import { Controller, Post, Put, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { HandshakeGuard } from '../common/guards/handshake.guard';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';

@Controller('attempts')
@UseGuards(HandshakeGuard, SupabaseAuthGuard) // Protect the attempts lifecycle cryptographically AND with user session!
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  // 1. Initialize a new exam session (Zero-Trust studentId extraction)
  @Post('start')
  async startAttempt(@Req() req: any, @Body() body: { quizId: string }) {
    const studentId = req.user.id; // Verified and extracted directly from decrypted token payload!
    return this.attemptsService.create(body.quizId, studentId);
  }

  // 2. Incremental autosave of selected answers
  @Put(':id/autosave')
  async autosaveAttempt(
    @Param('id') id: string,
    @Body() body: { answers: Record<string, string> },
  ) {
    return this.attemptsService.autosave(id, body.answers);
  }

  // 3. Telemetry Ingestion (Logging cheat events)
  @Post(':id/telemetry')
  async logTelemetry(
    @Param('id') id: string,
    @Body() body: { flags: string[] },
  ) {
    return this.attemptsService.logTelemetry(id, body.flags);
  }

  // 4. Secure Server-Side Grading & Submit
  @Post(':id/submit')
  async submitAttempt(
    @Param('id') id: string,
    @Body() body: { answers: Record<string, string> },
  ) {
    return this.attemptsService.submit(id, body.answers);
  }
}
