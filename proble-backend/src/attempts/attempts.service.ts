import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // 1. Initialize a new exam session
  async create(quizId: string, studentId: string) {
    this.logger.log(`🏁 Starting new exam session for Student: ${studentId}, Quiz: ${quizId}`);

    const { data, error } = await this.supabaseService.client
      .from('attempts')
      .insert({
        quiz_id: quizId,
        student_id: studentId,
        status: 'in-progress',
        started_at: new Date().toISOString(),
        answers: {},
        flags: [],
      })
      .select('id')
      .single();

    if (error) {
      this.logger.error(`❌ Failed to start attempt in Supabase: ${error.message}`);
      throw new BadRequestException(`Failed to start attempt: ${error.message}`);
    }

    this.logger.log(`✅ Exam session successfully initialized. Attempt UUID: ${data.id}`);
    return { attemptId: data.id };
  }

  // 2. Incremental autosave of selected answers
  async autosave(attemptId: string, answers: Record<string, string>) {
    this.logger.log(`💾 Autosaving progress for Attempt: ${attemptId}...`);

    const { data, error } = await this.supabaseService.client
      .from('attempts')
      .update({
        answers,
      })
      .eq('id', attemptId)
      .eq('status', 'in-progress') // Only allow saving active attempts!
      .select('id');

    if (error || !data || data.length === 0) {
      this.logger.error(`❌ Autosave failed or attempt is not active/completed.`);
      throw new BadRequestException('Autosave failed. Attempt is either completed or does not exist.');
    }

    return { success: true };
  }

  // 3. Telemetry Ingestion (Logging cheat events)
  async logTelemetry(attemptId: string, newFlags: string[]) {
    this.logger.log(`📡 Ingesting telemetry flags for Attempt: ${attemptId}: [${newFlags.join(', ')}]`);

    // Fetch the current flags first
    const { data: attempt, error: fetchError } = await this.supabaseService.client
      .from('attempts')
      .select('flags')
      .eq('id', attemptId)
      .single();

    if (fetchError || !attempt) {
      throw new NotFoundException('Attempt not found.');
    }

    // Merge existing flags with new flags, removing duplicates
    const currentFlags: string[] = attempt.flags || [];
    const mergedFlags = Array.from(new Set([...currentFlags, ...newFlags]));

    // Update back to the database
    const { error: updateError } = await this.supabaseService.client
      .from('attempts')
      .update({
        flags: mergedFlags,
      })
      .eq('id', attemptId);

    if (updateError) {
      this.logger.error(`❌ Failed to update telemetry flags: ${updateError.message}`);
      throw new BadRequestException(`Failed to update telemetry: ${updateError.message}`);
    }

    this.logger.log(`✅ Telemetry logged. Combined flags: [${mergedFlags.join(', ')}]`);
    return { success: true };
  }

  // 4. Secure Server-Side Grading & Submit
  async submit(attemptId: string, submittedAnswers: Record<string, string>) {
    this.logger.log(`🎓 Securing and grading final submission for Attempt: ${attemptId}...`);

    // Step A: Fetch the attempt record to verify active state and get quizId
    const { data: attempt, error: fetchError } = await this.supabaseService.client
      .from('attempts')
      .select('quiz_id, status')
      .eq('id', attemptId)
      .single();

    if (fetchError || !attempt) {
      throw new NotFoundException('Attempt not found.');
    }

    if (attempt.status === 'completed') {
      throw new BadRequestException('Exam has already been submitted and completed.');
    }

    // Step B: Fetch the correct answers from the questions database table for this quiz
    const { data: questions, error: questionsError } = await this.supabaseService.client
      .from('questions')
      .select('id, correct_answer')
      .eq('quiz_id', attempt.quiz_id);

    if (questionsError || !questions) {
      this.logger.error(`❌ Failed to fetch quiz questions for grading: ${questionsError?.message}`);
      throw new BadRequestException('Failed to grade exam. Questions could not be retrieved.');
    }

    // Step C: Perform secure server-side grading
    let calculatedScore = 0;
    const gradingBreakdown: Record<string, any> = {};

    for (const q of questions) {
      const studentAnswer = submittedAnswers[q.id];
      const isCorrect = studentAnswer === q.correct_answer;
      
      if (isCorrect) {
        calculatedScore++;
      }

      gradingBreakdown[q.id] = {
        correct: isCorrect,
        submitted: studentAnswer || null,
        correct_answer: q.correct_answer, // Return correct answer in grading summary
      };
    }

    // Step D: Write final results to the Supabase database
    const { error: submitError } = await this.supabaseService.client
      .from('attempts')
      .update({
        status: 'completed',
        answers: submittedAnswers,
        score: calculatedScore,
        ended_at: new Date().toISOString(),
      })
      .eq('id', attemptId);

    if (submitError) {
      this.logger.error(`❌ Failed to write final score: ${submitError.message}`);
      throw new BadRequestException(`Failed to submit exam: ${submitError.message}`);
    }

    this.logger.log(`✅ Exam completed! Graded Score: ${calculatedScore}/${questions.length}`);
    return {
      success: true,
      score: calculatedScore,
      totalQuestions: questions.length,
      breakdown: gradingBreakdown,
    };
  }
}
