import { createBrowserClient } from '@supabase/ssr';

// The one connection to Supabase. The key is the browser-safe one: what it can reach is decided by the access rules in
// supabase/schema.sql. The service role key must never appear here, or in any NEXT_PUBLIC_ variable.
export const supabase = createBrowserClient(
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
