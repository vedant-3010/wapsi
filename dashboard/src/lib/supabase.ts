import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see dashboard/.env.example)')
}

// Read-only: publishable key, RLS allows select only. Every write goes through lib/api.ts.
export const supabase = createClient(url, key)
