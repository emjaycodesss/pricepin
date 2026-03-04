import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client for PricePin.
 * Uses anon key; RLS handles read/write. Anonymous Auth gives stable UID per browser for upload attribution.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
