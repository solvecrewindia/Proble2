import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  public client: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    // We fetch the keys directly from your parent .env variables!
    const supabaseUrl = this.configService.get<string>('VITE_SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('VITE_SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      this.logger.error('❌ Supabase VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing inside .env!');
      throw new Error('Supabase credentials are required');
    }

    // Initialize the official Supabase client!
    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false, // Don't persist session inside backend node environments
      },
    });

    this.logger.log('🚀 Supabase client successfully initialized on the backend!');
  }

  // Verify active Supabase JWT token and return the authenticated user details
  async verifyToken(token: string) {
    const { data: { user }, error } = await this.client.auth.getUser(token);
    
    if (error || !user) {
      this.logger.error(`❌ Token verification failed: ${error?.message || 'User not found'}`);
      throw new Error(`Invalid or expired authentication session: ${error?.message || 'User not found'}`);
    }
    
    return user;
  }
}
