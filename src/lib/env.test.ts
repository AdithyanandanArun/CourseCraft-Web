import { describe, expect, it } from 'vitest'

import { getSupabaseConfig } from './env'

describe('getSupabaseConfig', () => {
  it('returns null without both public Supabase values', () => {
    expect(getSupabaseConfig({ VITE_SUPABASE_URL: 'https://project.supabase.co' })).toBeNull()
  })

  it('returns trimmed browser configuration', () => {
    expect(getSupabaseConfig({
      VITE_SUPABASE_URL: ' https://project.supabase.co ',
      VITE_SUPABASE_ANON_KEY: ' anon-key ',
    })).toEqual({ url: 'https://project.supabase.co', anonKey: 'anon-key' })
  })
})
