export type SupabaseConfig = {
  url: string
  anonKey: string
}

export function getSupabaseConfig(
  environment: Record<string, string | undefined> = import.meta.env,
): SupabaseConfig | null {
  const url = environment.VITE_SUPABASE_URL?.trim()
  const anonKey = environment.VITE_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) return null

  return { url, anonKey }
}
