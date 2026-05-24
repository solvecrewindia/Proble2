import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { HandshakeGuard } from '../common/guards/handshake.guard';

// The @Controller('quizzes') decorator tells NestJS that this class handles requests
// coming to the "http://localhost:3000/quizzes" URL route.
@Controller('quizzes')
@UseGuards(HandshakeGuard) // Protect all quiz endpoints with our secure handshake guard!
export class QuizController {
  // Dependency Injection (DI): NestJS automatically creates an instance of QuizService
  // and injects it into our controller constructor when the app boots up.
  constructor(private readonly quizService: QuizService) {}

  // Handles HTTP GET requests to "http://localhost:3000/quizzes".
  // Optionally supports filtering by quiz access code via query parameter "?code=XYZ".
  @Get()
  getAllQuizzes(@Query('code') code?: string) {
    if (code) {
      return this.quizService.findByCode(code);
    }
    // We delegate the actual work (business logic) to our brain: the QuizService
    return this.quizService.findAll();
  }

  // The @Get(':id') decorator handles HTTP GET requests to "http://localhost:3000/quizzes/:id"
  @Get(':id')
  getQuizById(@Param('id') id: string) {
    return this.quizService.findOne(id);
  }

  // Serve sanitized quiz questions to the secure client exam window
  @Get(':id/questions')
  getQuizQuestions(@Param('id') id: string) {
    return this.quizService.findQuestions(id);
  }
}
