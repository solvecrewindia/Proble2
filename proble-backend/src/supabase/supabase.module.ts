import { Module, Global } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

// The @Global() decorator makes this module globally available.
// This means any other module in your application (like QuizModule) can inject the
// SupabaseService immediately without needing to import SupabaseModule inside its imports array!
@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService], // Export it so other services can inject it!
})
export class SupabaseModule {}
