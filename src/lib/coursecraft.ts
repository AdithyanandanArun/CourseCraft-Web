import type { SupabaseClient } from '@supabase/supabase-js'

export type Profile = {
  id: string
  role: 'student' | 'advisor'
  display_name: string | null
  space_id: string | null
}

export type Semester = {
  id: string
  name: string
}

export type Assessment = {
  id: string
  subject_id: string
  title: string
  weight_pct: number
  max_marks: number
  obtained_marks: number | null
}

export type AcademicSubject = {
  id: string
  name: string
  code: string | null
  credits: number
  assessments: Assessment[]
}

export type AcademicSnapshot = {
  semester: Semester | null
  subjects: AcademicSubject[]
}

export async function ensureProfile(client: SupabaseClient): Promise<Profile> {
  const { data, error } = await client.rpc('ensure_my_profile')
  if (error) throw error
  return data as Profile
}

export async function loadAcademics(client: SupabaseClient, spaceId: string): Promise<AcademicSnapshot> {
  const { data: semester, error: semesterError } = await client
    .from('semesters')
    .select('id, name')
    .eq('space_id', spaceId)
    .eq('status', 'active')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (semesterError) throw semesterError
  if (!semester) return { semester: null, subjects: [] }

  const { data: subjects, error: subjectsError } = await client
    .from('subjects')
    .select('id, name, code, credits')
    .eq('semester_id', semester.id)
    .order('created_at')
  if (subjectsError) throw subjectsError
  if (!subjects?.length) return { semester, subjects: [] }

  const subjectIds = subjects.map((subject) => subject.id)
  const { data: assessments, error: assessmentsError } = await client
    .from('assessments')
    .select('id, subject_id, title, weight_pct, max_marks, obtained_marks')
    .in('subject_id', subjectIds)
    .order('created_at')
  if (assessmentsError) throw assessmentsError

  const bySubject = new Map<string, Assessment[]>()
  for (const assessment of (assessments ?? []) as Assessment[]) {
    const current = bySubject.get(assessment.subject_id) ?? []
    current.push(assessment)
    bySubject.set(assessment.subject_id, current)
  }

  return {
    semester,
    subjects: (subjects as Omit<AcademicSubject, 'assessments'>[]).map((subject) => ({
      ...subject,
      assessments: bySubject.get(subject.id) ?? [],
    })),
  }
}

export async function createSemester(client: SupabaseClient, spaceId: string, name: string) {
  const { error } = await client
    .from('semesters')
    .insert({ space_id: spaceId, name: name.trim(), status: 'active' })
  if (error) throw error
}

export async function createSubject(
  client: SupabaseClient,
  input: { spaceId: string; semesterId: string; name: string; code: string; credits: number },
) {
  const { error } = await client.from('subjects').insert({
    space_id: input.spaceId,
    semester_id: input.semesterId,
    name: input.name.trim(),
    code: input.code.trim() || null,
    credits: input.credits,
  })
  if (error) throw error
}

export async function createAssessment(
  client: SupabaseClient,
  input: { spaceId: string; subjectId: string; title: string; weightPct: number; maxMarks: number; obtainedMarks: number | null },
) {
  const { error } = await client.from('assessments').insert({
    space_id: input.spaceId,
    subject_id: input.subjectId,
    title: input.title.trim(),
    weight_pct: input.weightPct,
    max_marks: input.maxMarks,
    obtained_marks: input.obtainedMarks,
  })
  if (error) throw error
}

export function subjectPercentage(subject: AcademicSubject): number | null {
  const completed = subject.assessments.filter((assessment) => assessment.obtained_marks !== null)
  const totalWeight = completed.reduce((sum, assessment) => sum + assessment.weight_pct, 0)
  if (!completed.length || totalWeight === 0) return null

  const weighted = completed.reduce(
    (sum, assessment) => sum + (assessment.obtained_marks! / assessment.max_marks) * assessment.weight_pct,
    0,
  )
  return (weighted / totalWeight) * 100
}
