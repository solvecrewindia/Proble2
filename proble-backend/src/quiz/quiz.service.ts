import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  // Dependency Injection: Inject the global SupabaseService in our constructor
  constructor(private readonly supabaseService: SupabaseService) {}

  // Fetch live quizzes from your Supabase PostgreSQL database!
  async findAll() {
    this.logger.log('📡 Querying live quizzes from Supabase PostgreSQL...');
    
    // Query your public.quizzes table directly using the Supabase client
    const { data, error } = await this.supabaseService.client
      .from('quizzes')
      .select('*');

    if (error) {
      this.logger.error(`❌ Error fetching quizzes from Supabase: ${error.message}`);
      throw new Error(`Failed to fetch quizzes: ${error.message}`);
    }

    this.logger.log(`✅ Successfully fetched ${data?.length ?? 0} quizzes from the live database!`);
    return data;
  }

  // Fetch a single quiz by its UUID from Supabase
  async findOne(id: string) {
    this.logger.log(`📡 Querying single quiz ${id} from Supabase PostgreSQL...`);
    
    const { data, error } = await this.supabaseService.client
      .from('quizzes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      this.logger.error(`❌ Error fetching quiz ${id} from Supabase: ${error.message}`);
      throw new Error(`Failed to fetch quiz: ${error.message}`);
    }

    this.logger.log(`✅ Successfully fetched quiz ${id} from the live database!`);
    return data;
  }

  // Fetch a single quiz by its access code from Supabase
  async findByCode(code: string) {
    this.logger.log(`📡 Querying quiz with code ${code} from Supabase PostgreSQL...`);
    
    const { data, error } = await this.supabaseService.client
      .from('quizzes')
      .select('*')
      .eq('code', code)
      .limit(1)
      .single();

    if (error) {
      this.logger.error(`❌ Error fetching quiz with code ${code} from Supabase: ${error.message}`);
      throw new Error(`Failed to fetch quiz: ${error.message}`);
    }

    this.logger.log(`✅ Successfully fetched quiz with code ${code} from the live database!`);
    return data;
  }

  // Fetch and sanitize questions for a specific quiz (Strips out correct answers to prevent student cheating!)
  async findQuestions(quizId: string) {
    this.logger.log(`📡 Fetching and sanitizing questions for Quiz: ${quizId}...`);
    
    const { data: questions, error } = await this.supabaseService.client
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('id');

    if (error) {
      this.logger.error(`❌ Error fetching questions for quiz ${quizId}: ${error.message}`);
      throw new Error(`Failed to fetch questions: ${error.message}`);
    }

    // Zero-Trust Security: Map through questions and completely remove correct_answer fields for standard questions
    // For coding questions, preserve metadata like testCases and starterCode, but completely strip the secret solution keys!
    const sanitizedQuestions = (questions || []).map((q: any) => {
      const derivedType = (q.type || 'mcq').toLowerCase();

      if (derivedType === 'code') {
        try {
          const parsed = JSON.parse(q.correct_answer || '{}');
          // Strip secret solutions, keeping starterCode, driverCode, and testCases needed for proctored local runs
          const { solution, correct_solution, answer, ...stripped } = parsed;
          return {
            ...q,
            correct_answer: JSON.stringify(stripped),
          };
        } catch {
          const { correct_answer, ...sanitized } = q;
          return sanitized;
        }
      }

      // Standard questions: completely strip correct_answer
      const { correct_answer, ...sanitized } = q;
      return sanitized;
    });

    this.logger.log(`✅ Successfully fetched and sanitized ${sanitizedQuestions.length} questions.`);
    return sanitizedQuestions;
  }
}
