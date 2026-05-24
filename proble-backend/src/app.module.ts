import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { QuizModule } from './quiz/quiz.module';
import { AttemptsModule } from './attempts/attempts.module';

@Module({
  imports: [
    // Configure ConfigModule to load your parent .env file located one level up!
    ConfigModule.forRoot({
      isGlobal: true,       // Makes these variables available in all services
      envFilePath: '../.env', // Points to d:\Gemini_Projects\Proble_5th\.env
    }),
    SupabaseModule, // Register your globally available Supabase client module!
    QuizModule,
    AttemptsModule, // Register the new secure attempts transactional lifecycle module!
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
