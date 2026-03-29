import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client for use in the browser
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Function to create a fresh client for server-side operations
export const createServerSupabaseClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false, // Don't persist session on the server
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};
