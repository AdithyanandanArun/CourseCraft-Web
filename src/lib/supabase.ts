import { createClient } from '@supabase/supabase-js'

import { getSupabaseConfig } from './env'

const config = getSupabaseConfig()

export type AuthCallbackType = 'signup' | 'recovery' | null

function getAuthCallbackType(): AuthCallbackType {
  if (typeof window === 'undefined') return null

  const hash = new URLSearchParams(window.location.hash.slice(1))
  const query = new URLSearchParams(window.location.search)
  const type = hash.get('type') ?? query.get('type')
  const hasCallbackToken = hash.has('access_token') || hash.has('code') || query.has('code')
  return hasCallbackToken && (type === 'signup' || type === 'recovery') ? type : null
}

export const authCallbackType = getAuthCallbackType()

export const supabase = config ? createClient(config.url, config.anonKey) : null
