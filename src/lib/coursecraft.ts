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

export type TimetableSlot = { id: string; day_of_week: number; start_time: string; end_time: string; room: string | null; subject: { name: string } | null }
export type Attendance = { id: string; subject_id: string; date: string; status: 'present' | 'absent' | 'cancelled' }
export type PlannerItem = { id: string; title: string; due_at?: string | null; start_at?: string; done?: boolean; priority?: 'low' | 'normal' | 'high'; type?: string }
export type Habit = { id: string; name: string; checkedToday: boolean }
export type Note = { id: string; body: string; created_at: string }
export type PlanningSnapshot = { slots: TimetableSlot[]; attendance: Attendance[]; events: PlannerItem[]; tasks: PlannerItem[]; habits: Habit[]; notes: Note[] }

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

export async function loadPlanning(client: SupabaseClient, spaceId: string): Promise<PlanningSnapshot> {
  const today = new Date().toISOString().slice(0, 10)
  const [slots, attendance, events, tasks, habits, checkins, notes] = await Promise.all([
    client.from('timetable_slots').select('id, day_of_week, start_time, end_time, room, subject:subjects(name)').eq('space_id', spaceId).order('day_of_week').order('start_time'),
    client.from('attendance').select('id, subject_id, date, status').eq('space_id', spaceId).order('date', { ascending: false }),
    client.from('events').select('id, title, start_at, type').eq('space_id', spaceId).gte('start_at', new Date().toISOString()).order('start_at').limit(8),
    client.from('tasks').select('id, title, due_at, done, priority').eq('space_id', spaceId).order('done').order('due_at').limit(12),
    client.from('habits').select('id, name').eq('space_id', spaceId).order('created_at'),
    client.from('habit_checkins').select('habit_id').eq('space_id', spaceId).eq('date', today),
    client.from('notes').select('id, body, created_at').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(8),
  ])
  for (const result of [slots, attendance, events, tasks, habits, checkins, notes]) if (result.error) throw result.error
  const checked = new Set((checkins.data ?? []).map((item) => item.habit_id))
  return { slots: (slots.data ?? []) as unknown as TimetableSlot[], attendance: (attendance.data ?? []) as Attendance[], events: (events.data ?? []) as PlannerItem[], tasks: (tasks.data ?? []) as PlannerItem[], habits: (habits.data ?? []).map((habit) => ({ ...habit, checkedToday: checked.has(habit.id) })), notes: (notes.data ?? []) as Note[] }
}

export async function importTimetable(client: SupabaseClient, input: { spaceId: string; semesterId: string; timetable: unknown }) {
  const { data, error } = await client.rpc('import_timetable_json', { p_space_id: input.spaceId, p_semester_id: input.semesterId, p_timetable: input.timetable })
  if (error) throw error
  return data as { subjectsCreated: number; slotsCreated: number }
}

export async function deleteTimetable(client: SupabaseClient, spaceId: string) {
  const { error } = await client.from('timetable_slots').delete().eq('space_id', spaceId)
  if (error) throw error
}

export async function savePlanningItem(client: SupabaseClient, table: 'events' | 'tasks' | 'habits' | 'notes', item: Record<string, unknown>) {
  const payload = { ...item }
  if (table === 'tasks' || table === 'notes') {
    const { data: { user } } = await client.auth.getUser()
    if (!user) throw new Error('Your session has expired.')
    payload.created_by = user.id
    if (table === 'tasks') payload.created_by_role = 'student'
  }
  const { error } = await client.from(table).insert(payload)
  if (error) throw error
}

export async function toggleTask(client: SupabaseClient, id: string, done: boolean) { const { error } = await client.from('tasks').update({ done }).eq('id', id); if (error) throw error }
export async function toggleHabit(client: SupabaseClient, input: { id: string; spaceId: string; checked: boolean }) {
  const today = new Date().toISOString().slice(0, 10)
  const query = client.from('habit_checkins')
  const { error } = input.checked ? await query.delete().eq('habit_id', input.id).eq('date', today) : await query.insert({ habit_id: input.id, space_id: input.spaceId, date: today })
  if (error) throw error
}
export async function recordAttendance(client: SupabaseClient, input: { spaceId: string; subjectId: string; status: 'present' | 'absent' }) {
  const { error } = await client.from('attendance').upsert({ space_id: input.spaceId, subject_id: input.subjectId, date: new Date().toISOString().slice(0, 10), status: input.status }, { onConflict: 'subject_id,date' })
  if (error) throw error
}
