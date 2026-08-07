import { createClient } from '@supabase/supabase-js'

// Unlike the old DOTT tracker, a missing configuration must never white-screen
// the whole hub: export null and let modules degrade gracefully.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient(url, key) : null
