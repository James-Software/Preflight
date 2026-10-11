import { createClient } from "@supabase/supabase-js";

// Placeholder wiring. Copy .env.example to .env.local and fill in the values.
// The Supabase project itself has not been created yet.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
