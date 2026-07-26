import { createClient } from '@supabase/supabase-js'

import { getSupabaseConfig } from './env'

const config = getSupabaseConfig()

export const supabase = config ? createClient(config.url, config.anonKey) : null
