import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

// The @Module() decorator defines a logical container.
// It tells NestJS exactly which controllers and providers (services) are bundled 
// together under the "Quiz" domain.
@Module({
  controllers: [QuizController], // Makes the receptionist route active
  providers: [QuizService],      // Makes the database/business brain available
})
export class QuizModule {}
