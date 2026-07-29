import { createClient } from '@supabase/supabase-js'

import { getSupabaseConfig } from './env'

const config = getSupabaseConfig()

function isEmailConfirmationCallback() {
  if (typeof window === 'undefined') return false

  const hash = new URLSearchParams(window.location.hash.slice(1))
  const query = new URLSearchParams(window.location.search)
  const hashConfirmation = hash.get('type') === 'signup' && (hash.has('access_token') || hash.has('code'))
  const queryConfirmation = query.get('type') === 'signup' && query.has('code')
  return hashConfirmation || queryConfirmation
}

export const emailConfirmationCallback = isEmailConfirmationCallback()

export const supabase = config ? createClient(config.url, config.anonKey) : null
