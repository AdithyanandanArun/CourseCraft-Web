import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { BookOpen, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, GraduationCap, ImageUp, LayoutDashboard, ListTodo, LogOut, Minus, Moon, NotebookPen, Paperclip, Pencil, Plus, RefreshCw, Settings, Sun, Table2, Trash2, X } from 'lucide-react'

import {
  createAssessment,
  createSemester,
  createSubject,
  adjustAttendance,
  deleteTimetable,
  deleteTimetableSlot,
  ensureProfile,
  importTimetable,
  loadAcademics,
  loadPlanning,
  recordAttendanceForDate,
  savePlanningItem,
  subjectPercentage,
  toggleHabit,
  toggleTask,
  updateAssessment,
  updateSubject,
  saveTimetableSlot,
  type AcademicSnapshot,
  type AcademicSubject,
  type Assessment, type Profile, type PlanningSnapshot, type TimetableSlot,
} from './lib/coursecraft'
import { calculateSgpa } from './lib/sgpa'
import { emailConfirmationCallback, supabase } from './lib/supabase'
import './App.css'

const authRedirectUrl = 'https://adithyanandanarun.github.io/CourseCraft-Web/'

function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('coursecraft-theme') === 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('coursecraft-theme', dark ? 'dark' : 'light')
  }, [dark])

  return <>
    <ThemeToggle dark={dark} onToggle={() => setDark((current) => !current)} />
    {!supabase ? <ConfigurationScreen /> : <AuthenticatedApp client={supabase} />}
  </>
}

function ConfigurationScreen() {
  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <Brand />
        <p className="eyebrow">SETUP REQUIRED</p>
        <h1>Connect CourseCraft to Supabase.</h1>
        <p>Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` for local use, or add the matching GitHub Actions secrets for Pages.</p>
      </section>
    </main>
  )
}

function AuthenticatedApp({ client }: { client: SupabaseClient }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(emailConfirmationCallback)

  useEffect(() => {
    if (showEmailConfirmation) {
      window.history.replaceState({}, document.title, window.location.pathname)
      void client.auth.signOut()
      return
    }

    void client.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.subscription.unsubscribe()
  }, [client, showEmailConfirmation])

  if (showEmailConfirmation) return <EmailConfirmedScreen onLogin={() => setShowEmailConfirmation(false)} />
  if (session === undefined) return <LoadingScreen />
  if (!session) return <AuthScreen client={client} />
  return <ProfileGate client={client} user={session.user} />
}

function EmailConfirmedScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="auth-layout">
      <section className="auth-panel confirmation-panel">
        <Brand />
        <div className="confirmation-icon" aria-hidden="true"><CheckCircle2 size={28} /></div>
        <p className="eyebrow">EMAIL CONFIRMED</p>
        <h1>Your email is confirmed.</h1>
        <p>You can now sign in to open your CourseCraft workspace.</p>
        <button className="primary-action wide" type="button" onClick={onLogin}>Log in</button>
      </section>
    </main>
  )
}

function AuthScreen({ client }: { client: SupabaseClient }) {
  const [signUp, setSignUp] = useState(false)
  const [role, setRole] = useState<'student' | 'advisor'>('student')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const displayName = String(form.get('displayName') ?? '').trim()
    setMessage(null)
    setPending(true)
    try {
      if (signUp) {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authRedirectUrl, data: { display_name: displayName, role } },
        })
        if (error) throw error
        if (!data.session) setMessage('Check your email to confirm this account, then sign in.')
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reach CourseCraft. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-layout">
      <form className="auth-panel" onSubmit={submit}>
        <Brand />
        <p className="eyebrow">{signUp ? 'CREATE YOUR WORKSPACE' : 'WELCOME BACK'}</p>
        <h1>{signUp ? 'Build your academic system.' : 'Sign in to CourseCraft.'}</h1>
        {signUp && <>
          <label>Name<input name="displayName" required autoComplete="name" /></label>
          <fieldset className="role-picker">
            <legend>Account type</legend>
            <button type="button" className={role === 'student' ? 'selected' : ''} onClick={() => setRole('student')}>Student</button>
            <button type="button" className={role === 'advisor' ? 'selected' : ''} onClick={() => setRole('advisor')}>Advisor</button>
          </fieldset>
        </>}
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password<input name="password" type="password" required minLength={8} autoComplete={signUp ? 'new-password' : 'current-password'} /></label>
        {message && <p className="form-message">{message}</p>}
        <button className="primary-action wide" disabled={pending} type="submit">{pending ? 'Please wait...' : signUp ? 'Create account' : 'Sign in'}</button>
        <button className="text-button auth-switch" type="button" disabled={pending} onClick={() => { setSignUp(!signUp); setMessage(null) }}>
          {signUp ? 'Already have an account? Sign in' : 'New to CourseCraft? Create an account'}
        </button>
      </form>
    </main>
  )
}

function ProfileGate({ client, user }: { client: SupabaseClient; user: User }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setProfile(null)
    setError(null)
    void ensureProfile(client).then(setProfile).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'We could not prepare your workspace.')
    })
  }

  useEffect(load, [client, user.id])

  if (error) return <ErrorScreen message={error} onRetry={load} onSignOut={() => void client.auth.signOut()} />
  if (!profile) return <LoadingScreen />
  if (profile.role === 'advisor' || !profile.space_id) return <AdvisorWaiting client={client} />
  return <StudentWorkspace client={client} profile={profile} />
}

function StudentWorkspace({ client, profile }: { client: SupabaseClient; profile: Profile }) {
  const [snapshot, setSnapshot] = useState<AcademicSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'dashboard' | 'subjects' | 'daily' | 'timetable' | 'account'>('dashboard')
  const [modal, setModal] = useState<'semester' | 'subject' | 'assessment' | 'timetable' | 'slot' | null>(null)
  const [assessmentSubject, setAssessmentSubject] = useState<AcademicSubject | null>(null)
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null)
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null)
  const [editingSubject, setEditingSubject] = useState<AcademicSubject | null>(null)

  const load = () => {
    setSnapshot(null)
    setError(null)
    void loadAcademics(client, profile.space_id!).then(setSnapshot).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'We could not load your academics.')
    })
  }

  useEffect(load, [client, profile.space_id])

  if (error) return <ErrorScreen message={error} onRetry={load} onSignOut={() => void client.auth.signOut()} />
  if (!snapshot) return <LoadingScreen />

  const gradedSubjects = snapshot.subjects.flatMap((subject) => {
    const percentage = subjectPercentage(subject)
    return percentage === null ? [] : [{ credits: subject.credits, percentage }]
  })
  const sgpa = gradedSubjects.length ? calculateSgpa(gradedSubjects) : null

  return (
    <main className="app-shell">
      <header className="topbar">
        <Brand />
        <button className="icon-button" type="button" aria-label="Sign out" title="Sign out" onClick={() => void client.auth.signOut()}><LogOut size={18} /></button>
      </header>
      {snapshot.semester && <WorkspaceNav view={view} onChange={setView} />}
      {view === 'dashboard' && <section className="page-heading">
        <div>
          <p className="eyebrow">STUDENT WORKSPACE</p>
          <h1>{profile.display_name ? `Hello, ${profile.display_name}.` : 'Your student workspace.'}</h1>
          <p className="intro">Your academic plan is completely usable before you pair an advisor.</p>
        </div>
        {snapshot.semester && <button className="primary-action" type="button" onClick={() => setModal('subject')}><Plus size={18} /> Add subject</button>}
      </section>}
      {!snapshot.semester ? (
        <EmptySemester onCreate={() => setModal('semester')} />
      ) : view === 'dashboard' ? (
        <>
          <section className="overview" aria-label="Semester overview">
            <article className="metric"><span>Projected SGPA</span><strong>{sgpa?.toFixed(2) ?? '---'}</strong><small>{sgpa ? 'From your entered marks' : 'Add marks to calculate it'}</small></article>
            <article className="metric"><span>Advisor coaching</span><strong className="metric-name">Optional</strong><small>Pairing arrives in Phase 3</small></article>
          </section>
          <PlanningBoard client={client} spaceId={profile.space_id!} semesterId={snapshot.semester.id} subjects={snapshot.subjects} />
          <section className="content-grid dashboard-subjects-grid">
            <section className="subjects-section" aria-labelledby="subjects-heading">
              <div className="section-heading"><div><p className="eyebrow">CURRENT SEMESTER</p><h2 id="subjects-heading">Subjects</h2></div><button className="text-button" type="button" onClick={() => setModal('subject')}>Add subject</button></div>
              {snapshot.subjects.length === 0 ? <p className="empty-copy">Add your first subject, then record assessment weights and marks.</p> : <div className="subject-list">
                {snapshot.subjects.map((subject) => <SubjectRow key={subject.id} subject={subject} onAddAssessment={() => { setEditingAssessment(null); setAssessmentSubject(subject); setModal('assessment') }} onEditAssessment={(assessment) => { setEditingAssessment(assessment); setAssessmentSubject(subject); setModal('assessment') }} />)}
              </div>}
            </section>
          </section>
        </>
      ) : view === 'subjects' ? <SubjectsView snapshot={snapshot} onAdd={() => setModal('subject')} onEdit={(subject) => setEditingSubject(subject)} onAddAssessment={(subject) => { setEditingAssessment(null); setAssessmentSubject(subject); setModal('assessment') }} />
        : view === 'daily' ? <DailyLogView client={client} spaceId={profile.space_id!} subjects={snapshot.subjects} />
          : view === 'timetable' ? <TimetableView client={client} spaceId={profile.space_id!} onImport={() => setModal('timetable')} onAddSlot={() => { setEditingSlot(null); setModal('slot') }} onEditSlot={(slot) => { setEditingSlot(slot); setModal('slot') }} />
            : <AccountView client={client} profile={profile} />}
      {modal === 'semester' && <SemesterModal client={client} spaceId={profile.space_id!} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal === 'subject' && snapshot.semester && <SubjectModal client={client} spaceId={profile.space_id!} semesterId={snapshot.semester.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal === 'assessment' && assessmentSubject && <AssessmentModal client={client} spaceId={profile.space_id!} subject={assessmentSubject} assessment={editingAssessment} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {editingSubject && <SubjectEditModal client={client} subject={editingSubject} onClose={() => setEditingSubject(null)} onSaved={() => { setEditingSubject(null); load() }} />}
      {modal === 'timetable' && snapshot.semester && <TimetableImportModal client={client} spaceId={profile.space_id!} semesterId={snapshot.semester.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal === 'slot' && snapshot.semester && <SlotModal client={client} spaceId={profile.space_id!} subjects={snapshot.subjects} slot={editingSlot} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </main>
  )
}

function SubjectRow({ subject, onAddAssessment, onEditAssessment }: { subject: AcademicSubject; onAddAssessment: () => void; onEditAssessment: (assessment: Assessment) => void }) {
  const percentage = subjectPercentage(subject)
  return <article className="subject-row"><div className="subject-icon"><BookOpen size={18} /></div><div className="subject-detail"><h3>{subject.name}</h3><p>{subject.code ? `${subject.code} · ` : ''}{subject.credits} credits · {subject.assessments.length} assessment{subject.assessments.length === 1 ? '' : 's'}</p>{subject.assessments.map((assessment) => <button className="assessment-edit" key={assessment.id} type="button" onClick={() => onEditAssessment(assessment)}>{assessment.title}: {assessment.obtained_marks ?? '-'} / {assessment.max_marks} ({assessment.weight_pct}%) <Pencil size={13} /></button>)}</div><div className="grade"><strong>{percentage === null ? '---' : `${percentage.toFixed(0)}%`}</strong><button className="text-button" type="button" onClick={onAddAssessment}>Add marks</button></div></article>
}

function WorkspaceNav({ view, onChange }: { view: 'dashboard' | 'subjects' | 'daily' | 'timetable' | 'account'; onChange: (view: 'dashboard' | 'subjects' | 'daily' | 'timetable' | 'account') => void }) {
  const items = [['dashboard', LayoutDashboard, 'Dashboard'], ['subjects', BookOpen, 'Subjects'], ['daily', ClipboardCheck, 'Daily log'], ['timetable', Table2, 'Timetable'], ['account', Settings, 'Account']] as const
  return <nav className="workspace-nav" aria-label="Workspace"><div className="nav-scroll">{items.map(([id, Icon, label]) => <button key={id} type="button" className={view === id ? 'active' : ''} onClick={() => onChange(id)}><Icon size={18} />{label}</button>)}</div></nav>
}

function SubjectsView({ snapshot, onAdd, onEdit, onAddAssessment }: { snapshot: AcademicSnapshot; onAdd: () => void; onEdit: (subject: AcademicSubject) => void; onAddAssessment: (subject: AcademicSubject) => void }) {
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">ACADEMICS</p><h1>Subjects</h1><p className="intro">Set subject details and attendance requirements, then keep marks close at hand.</p></div><button className="primary-action" onClick={onAdd}><Plus size={18} /> Add subject</button></div><div className="subject-settings-list">{snapshot.subjects.map((subject) => <article className="subject-setting" key={subject.id}><div><h2>{subject.name}</h2><p>{subject.code ? `${subject.code} · ` : ''}{subject.credits} credits · target {subject.attendance_target ?? 75}% · {subject.assessments.length} assessments</p></div><button className="icon-button" aria-label={`Edit ${subject.name}`} title="Edit subject" onClick={() => onEdit(subject)}><Pencil size={18} /></button><button className="text-button" onClick={() => onAddAssessment(subject)}>Add marks</button></article>)}</div></section>
}

function DailyLogView({ client, spaceId, subjects }: { client: SupabaseClient; spaceId: string; subjects: AcademicSubject[] }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)); const [data, setData] = useState<PlanningSnapshot | null>(null)
  const reload = () => void loadPlanning(client, spaceId).then(setData)
  useEffect(reload, [client, spaceId])
  const weekday = new Date(`${date}T12:00:00`).getDay() || 7
  const classes = data?.slots.filter((slot) => slot.day_of_week === weekday && slot.subject_id) ?? []
  const byId = new Map(subjects.map((subject) => [subject.id, subject]))
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">ATTENDANCE</p><h1>Daily log</h1><p className="intro">Mark each scheduled class for a specific day. Attendance is calculated per subject.</p></div></div><div className="date-switcher"><button className="icon-button" aria-label="Previous day" onClick={() => setDate(new Date(new Date(`${date}T12:00:00`).getTime() - 86400000).toISOString().slice(0, 10))}><ChevronLeft size={20} /></button><input aria-label="Attendance date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /><button className="icon-button" aria-label="Next day" onClick={() => setDate(new Date(new Date(`${date}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10))}><ChevronRight size={20} /></button></div><div className="daily-list">{classes.map((slot) => { const subject = byId.get(slot.subject_id!); const records = data?.attendance.filter((item) => item.subject_id === slot.subject_id) ?? []; const present = records.filter((item) => item.status === 'present').length; const rate = records.length ? Math.round(present / records.length * 100) : 0; const today = records.find((item) => item.date === date); return <article className="daily-class" key={slot.id}><div><h2>{slot.subject?.name}</h2><p>{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}{slot.room ? ` · ${slot.room}` : ''}</p><small>Attendance {records.length ? `${rate}%` : 'not started'} · target {subject?.attendance_target ?? 75}%</small></div><div className="attendance-actions"><button className={today?.status === 'present' ? 'marked present' : ''} onClick={() => void recordAttendanceForDate(client, { spaceId, subjectId: slot.subject_id!, date, status: 'present' }).then(reload)}>Present</button><button className={today?.status === 'absent' ? 'marked absent' : ''} onClick={() => void recordAttendanceForDate(client, { spaceId, subjectId: slot.subject_id!, date, status: 'absent' }).then(reload)}>Absent</button></div></article> })}{data && !classes.length && <p className="empty-copy">No timetable classes are scheduled for this day.</p>}</div></section>
}

function TimetableView({ client, spaceId, onImport, onAddSlot, onEditSlot }: { client: SupabaseClient; spaceId: string; onImport: () => void; onAddSlot: () => void; onEditSlot: (slot: TimetableSlot) => void }) { const [data, setData] = useState<PlanningSnapshot | null>(null); const [day, setDay] = useState(1); const reload = () => void loadPlanning(client, spaceId).then(setData); useEffect(reload, [client, spaceId]); const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']; const records = data?.attendance ?? []; return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">WEEKLY SCHEDULE</p><h1>Timetable</h1><p className="intro">Add, edit, or remove individual classes without rebuilding your timetable.</p></div><div className="view-actions"><button className="text-button" onClick={onImport}><ImageUp size={18} /> Import JSON</button><button className="primary-action" onClick={onAddSlot}><Plus size={18} /> Add class</button></div></div><div className="day-tabs">{days.map((name, index) => <button className={day === index + 1 ? 'active' : ''} onClick={() => setDay(index + 1)} key={name}>{name.slice(0, 3)}</button>)}</div><div className="timetable-list">{data?.slots.filter((slot) => slot.day_of_week === day).map((slot) => { const count = records.filter((item) => item.subject_id === slot.subject_id); const present = count.filter((item) => item.status === 'present').length; const rate = count.length ? Math.round(present / count.length * 100) : null; return <article className="timetable-class" key={slot.id}><span className="time-rail" /><div><h2>{slot.subject?.name}</h2><p>{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}{slot.room ? ` · ${slot.room}` : ''}</p></div><strong>{rate === null ? '---' : `${rate}%`}<small>attendance</small></strong><button className="icon-button" title="Edit class" aria-label="Edit class" onClick={() => onEditSlot(slot)}><Pencil size={17} /></button><button className="icon-button destructive" title="Delete class" aria-label="Delete class" onClick={() => { if (window.confirm('Remove this class from the timetable?')) void deleteTimetableSlot(client, slot.id).then(reload) }}><Trash2 size={17} /></button></article> })}{data && !data.slots.some((slot) => slot.day_of_week === day) && <p className="empty-copy">No classes on {days[day - 1]}.</p>}</div></section> }
function AccountView({ client, profile }: { client: SupabaseClient; profile: Profile }) { return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">ACCOUNT</p><h1>{profile.display_name || 'Your account'}</h1><p className="intro">Your CourseCraft workspace is private to you until you choose to pair an advisor.</p></div></div><section className="account-panel"><div className="subject-icon"><CheckCircle2 size={20} /></div><div><h2>Student workspace</h2><p>Signed in and ready to plan.</p></div><button className="text-button destructive" onClick={() => void client.auth.signOut()}>Sign out</button></section></section> }

const timetablePrompt = `Analyze the attached timetable image and convert it into JSON format.
1. Group the data hierarchically by Subject.
2. Ignore all teacher or professor names.
3. Clean up subject names by removing any group, section, or batch designations. Combine schedules for the same base subject under a single subject entry.
4. Ensure you use standard straight double quotes, not smart quotes.
5. The output MUST be a valid JSON object matching this exact structure:
{"subjects":[{"name":"Subject Name","schedules":[{"day":"Monday","classTimes":[{"startTime":"09:00 AM","endTime":"10:30 AM","roomNumber":"Room 101"}]}]}]}
Return ONLY the raw JSON text. Do not wrap it in markdown blocks like \`\`\`json.`

function PlanningBoard({ client, spaceId, semesterId, subjects }: { client: SupabaseClient; spaceId: string; semesterId: string; subjects: AcademicSubject[] }) {
  const [data, setData] = useState<PlanningSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null)
  const reload = () => { setError(null); void loadPlanning(client, spaceId).then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load your planner.')) }
  useEffect(reload, [client, spaceId])
  useEffect(() => { const channel = client.channel(`planning-${spaceId}`).on('postgres_changes', { event: '*', schema: 'public', filter: `space_id=eq.${spaceId}` }, reload).subscribe(); return () => { void client.removeChannel(channel) } }, [client, spaceId])
  const today = new Date().getDay() || 7
  const todaySlots = data?.slots.filter((slot) => slot.day_of_week === today) ?? []
  async function updateAttendance(subjectId: string, status: 'present' | 'absent', delta: -1 | 1) {
    setPendingSubjectId(subjectId)
    setError(null)
    try {
      await adjustAttendance(client, { spaceId, subjectId, status, delta })
      reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update attendance.')
    } finally {
      setPendingSubjectId(null)
    }
  }
  return <section className="planner-section" aria-labelledby="planning-heading">
    <div className="section-heading"><div><p className="eyebrow">PHASE 2</p><h2 id="planning-heading">Academic planning</h2></div></div>
    <p className="planner-intro">Turn an image timetable into structured classes with an AI model, then paste the JSON here. Attendance remains under your control.</p>
    {error && <p className="form-message">{error}</p>}
    {!data ? <div className="planner-loading">Loading planner...</div> : <div className="planner-grid">
      <PlannerPanel icon={<CalendarDays size={18} />} title="Today’s timetable" action={<div className="planner-actions">{data.slots.length > 0 && <button className="text-button destructive" type="button" onClick={() => { if (window.confirm('Clear this timetable and all its subjects? Linked assessments and attendance records will also be deleted. This cannot be undone.')) void deleteTimetable(client, { spaceId, semesterId }).then(reload).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not clear the timetable.')) }}>Clear</button>}</div>}>
        {todaySlots.length ? todaySlots.map((slot) => <div className="planner-row" key={slot.id}><strong>{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}</strong><span>{slot.subject?.name ?? 'Untitled class'}{slot.room ? ` · ${slot.room}` : ''}</span></div>) : <p className="empty-copy">No classes scheduled today.</p>}
      </PlannerPanel>
      <PlannerPanel icon={<ClipboardCheck size={18} />} title="Attendance">
        {subjects.length ? <div className="attendance-card-list">{subjects.map((subject) => <AttendanceCard key={subject.id} subject={subject} data={data} pending={pendingSubjectId === subject.id} onAdjust={(status, delta) => void updateAttendance(subject.id, status, delta)} />)}</div> : <p className="empty-copy">Import a timetable or add subjects to record attendance.</p>}
      </PlannerPanel>
      <PlannerPanel icon={<ListTodo size={18} />} title="Tasks">
        <QuickAdd placeholder="Add a task" onAdd={(title) => savePlanningItem(client, 'tasks', { space_id: spaceId, title })} onDone={reload} />
        {data.tasks.map((task) => <label className="check-row" key={task.id}><input type="checkbox" checked={Boolean(task.done)} onChange={() => void toggleTask(client, task.id, !task.done).then(reload)} /><span>{task.title}</span></label>)}
      </PlannerPanel>
      <PlannerPanel icon={<Check size={18} />} title="Habits">
        <QuickAdd placeholder="Add a daily habit" onAdd={(name) => savePlanningItem(client, 'habits', { space_id: spaceId, name })} onDone={reload} />
        {data.habits.map((habit) => <label className="check-row" key={habit.id}><input type="checkbox" checked={habit.checkedToday} onChange={() => void toggleHabit(client, { id: habit.id, spaceId, checked: habit.checkedToday }).then(reload)} /><span>{habit.name}</span></label>)}
      </PlannerPanel>
      <PlannerPanel icon={<CalendarDays size={18} />} title="Calendar">
        <QuickAdd placeholder="Add a calendar event" onAdd={(title) => savePlanningItem(client, 'events', { space_id: spaceId, title, type: 'college', start_at: new Date().toISOString() })} onDone={reload} />
        {data.events.map((event) => <div className="planner-row" key={event.id}><strong>{new Date(event.start_at!).toLocaleDateString()}</strong><span>{event.title}</span></div>)}
      </PlannerPanel>
      <PlannerPanel icon={<NotebookPen size={18} />} title="Notes">
        <QuickAdd placeholder="Write a quick note" onAdd={(body) => savePlanningItem(client, 'notes', { space_id: spaceId, body })} onDone={reload} />
        <AttachmentUpload client={client} spaceId={spaceId} onDone={reload} />
        {data.notes.map((note) => <p className="note-row" key={note.id}>{note.body}</p>)}
      </PlannerPanel>
    </div>}
  </section>
}

function AttendanceCard({ subject, data, pending, onAdjust }: { subject: AcademicSubject; data: PlanningSnapshot; pending: boolean; onAdjust: (status: 'present' | 'absent', delta: -1 | 1) => void }) {
  const history = data.attendance.filter((item) => item.subject_id === subject.id)
  const adjustment = data.adjustments.find((item) => item.subject_id === subject.id)
  const attended = history.filter((item) => item.status === 'present').length + (adjustment?.attended_count ?? 0)
  const missed = history.filter((item) => item.status === 'absent').length + (adjustment?.missed_count ?? 0)
  const total = attended + missed
  const rate = total ? Math.round(attended / total * 100) : 0
  const target = subject.attendance_target ?? 75
  const tone = total === 0 ? 'neutral' : rate >= target ? 'good' : rate >= target - 10 ? 'warning' : 'risk'
  const status = total === 0 ? 'No classes logged' : tone === 'good' ? 'On track' : tone === 'warning' ? 'Near target' : 'Below target'
  return <article className={`attendance-card attendance-card-${tone}`} aria-label={`${subject.name}: ${attended} attended, ${missed} missed, ${total} total, ${total ? `${rate}%` : 'no attendance recorded'}`}>
    <div className="attendance-card-heading"><div><h3>{subject.name}</h3><p>{status} · target {target}%</p></div><span className="attendance-status">{status}</span></div>
    <div className="attendance-card-body">
      <div className="attendance-counts"><div><strong>{attended}</strong><span>Attended</span></div><div><strong>{missed}</strong><span>Missed</span></div><div><strong>{total}</strong><span>Total</span></div></div>
      <div className="attendance-ring" style={{ '--attendance-progress': `${rate}%` } as CSSProperties}><div><strong>{total ? `${rate}%` : '---'}</strong><span>attendance</span></div></div>
    </div>
    <div className="attendance-adjusters">
      <AttendanceAdjuster label="Attended" count={attended} tone="positive" disabled={pending} onDecrease={() => onAdjust('present', -1)} onIncrease={() => onAdjust('present', 1)} />
      <AttendanceAdjuster label="Missed" count={missed} tone="danger" disabled={pending} onDecrease={() => onAdjust('absent', -1)} onIncrease={() => onAdjust('absent', 1)} />
    </div>
  </article>
}

function AttendanceAdjuster({ label, count, tone, disabled, onDecrease, onIncrease }: { label: string; count: number; tone: 'positive' | 'danger'; disabled: boolean; onDecrease: () => void; onIncrease: () => void }) {
  return <div className={`attendance-adjuster ${tone}`}><span>{label} <strong>{count}</strong></span><div><button type="button" disabled={disabled || count === 0} aria-label={`Reduce ${label.toLowerCase()} classes`} title={`Reduce ${label.toLowerCase()} classes`} onClick={onDecrease}><Minus size={18} /></button><button type="button" disabled={disabled} aria-label={`Add ${label.toLowerCase()} class`} title={`Add ${label.toLowerCase()} class`} onClick={onIncrease}><Plus size={18} /></button></div></div>
}

function PlannerPanel({ icon, title, children, action }: { icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }) { return <section className="planner-panel"><div className="planner-title"><span className="subject-icon">{icon}</span><h3>{title}</h3>{action}</div>{children}</section> }
function QuickAdd({ placeholder, onAdd, onDone }: { placeholder: string; onAdd: (value: string) => Promise<void>; onDone: () => void }) { const [value, setValue] = useState(''); const [pending, setPending] = useState(false); return <form className="quick-add" onSubmit={(event) => { event.preventDefault(); if (!value.trim()) return; setPending(true); void onAdd(value.trim()).then(() => { setValue(''); onDone() }).finally(() => setPending(false)) }}><input aria-label={placeholder} value={value} placeholder={placeholder} onChange={(event) => setValue(event.target.value)} /><button className="mini-action" disabled={pending} type="submit"><Plus size={15} /></button></form> }
function AttachmentUpload({ client, spaceId, onDone }: { client: SupabaseClient; spaceId: string; onDone: () => void }) { const [message, setMessage] = useState(''); async function upload(file: File) { setMessage('Uploading...'); const { data: { user } } = await client.auth.getUser(); if (!user) throw new Error('Your session has expired.'); const path = `${spaceId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`; const { error: storageError } = await client.storage.from('attachments').upload(path, file, { contentType: file.type, upsert: false }); if (storageError) throw storageError; const { error } = await client.from('attachments').insert({ space_id: spaceId, bucket_path: path, caption: file.name, linked_type: 'note', uploaded_by: user.id }); if (error) throw error; setMessage('Image attached.'); onDone() } return <><label className="attachment-button"><Paperclip size={15} /> Attach image<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file).catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Upload failed.')) }} /></label>{message && <p className="attachment-message">{message}</p>}</> }

function TimetableImportModal({ client, spaceId, semesterId, onClose, onSaved }: { client: SupabaseClient; spaceId: string; semesterId: string; onClose: () => void; onSaved: () => void }) {
  const [json, setJson] = useState(''); const [copied, setCopied] = useState(false); const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(false)
  async function submit() { setError(null); let timetable: unknown; try { timetable = JSON.parse(json) } catch { setError('Paste valid JSON only, without markdown fences.'); return } if (!window.confirm('Import this timetable and replace all current subjects for this semester? Linked assessments and attendance records will be deleted.')) return; setPending(true); try { await importTimetable(client, { spaceId, semesterId, timetable }); onSaved() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import this timetable.') } finally { setPending(false) } }
  return <Modal title="Import timetable from an image" onClose={onClose}><div className="import-steps"><p>1. Upload your timetable image to ChatGPT or another AI model.</p><p>2. Copy this prompt, then paste its raw JSON response below.</p><button className="text-button" type="button" onClick={() => void navigator.clipboard.writeText(timetablePrompt).then(() => setCopied(true))}>{copied ? 'Prompt copied' : 'Copy extraction prompt'}</button><label>Timetable JSON<textarea value={json} onChange={(event) => setJson(event.target.value)} placeholder='{"subjects":[...]}' rows={10} /></label>{error && <p className="form-message">{error}</p>}<button className="primary-action wide" type="button" disabled={pending} onClick={() => void submit()}>{pending ? 'Importing...' : 'Create timetable and subjects'}</button></div></Modal>
}

function EmptySemester({ onCreate }: { onCreate: () => void }) {
  return <section className="empty-state"><BookOpen size={36} /><h2>Start your first semester.</h2><p>Create a semester to begin tracking subjects, assessment weights, marks, and projected SGPA.</p><button className="primary-action" type="button" onClick={onCreate}><Plus size={18} /> Create semester</button></section>
}

function AdvisorWaiting({ client }: { client: SupabaseClient }) {
  return <main className="auth-layout"><section className="auth-panel"><Brand /><p className="eyebrow">ADVISOR PROFILE READY</p><h1>Wait for a student pairing.</h1><p>Your advisor account is set up. Pairing and coaching tools are part of Phase 3, while students can work independently in the meantime.</p><button className="primary-action wide" type="button" onClick={() => void client.auth.signOut()}>Sign out</button></section></main>
}

function ErrorScreen({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return <main className="auth-layout"><section className="auth-panel"><Brand /><h1>We could not open your workspace.</h1><p>{message}</p><button className="primary-action wide" type="button" onClick={onRetry}><RefreshCw size={18} /> Try again</button><button className="text-button auth-switch" type="button" onClick={onSignOut}>Sign out</button></section></main>
}

function LoadingScreen() { return <main className="loading-screen"><span className="loader" aria-label="Loading CourseCraft" /></main> }
function Brand() { return <a className="brand" href="/CourseCraft-Web/"><span className="brand-mark"><GraduationCap size={20} /></span><span>CourseCraft</span></a> }
function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const label = dark ? 'Use light theme' : 'Use dark theme'
  return <button className="theme-toggle" type="button" aria-label={label} title={label} aria-pressed={dark} onClick={onToggle}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" type="button" aria-label="Close" title="Close" onClick={onClose}><X size={20} /></button></div>{children}</section></div>
}

function SemesterModal({ client, spaceId, onClose, onSaved }: { client: SupabaseClient; spaceId: string; onClose: () => void; onSaved: () => void }) {
  return <Modal title="Create semester" onClose={onClose}><AsyncForm onSubmit={async (form) => createSemester(client, spaceId, String(form.get('name') ?? ''))} onSaved={onSaved}><label>Semester name<input name="name" defaultValue="Current semester" required autoFocus /></label><button className="primary-action wide" type="submit">Create semester</button></AsyncForm></Modal>
}

function SubjectModal({ client, spaceId, semesterId, onClose, onSaved }: { client: SupabaseClient; spaceId: string; semesterId: string; onClose: () => void; onSaved: () => void }) {
  return <Modal title="Add subject" onClose={onClose}><AsyncForm onSubmit={async (form) => createSubject(client, { spaceId, semesterId, name: String(form.get('name') ?? ''), code: String(form.get('code') ?? ''), credits: Number(form.get('credits')) })} onSaved={onSaved}><label>Subject name<input name="name" required autoFocus /></label><label>Subject code <span>(optional)</span><input name="code" /></label><label>Credits<input name="credits" type="number" min="0.5" step="0.5" defaultValue="3" required /></label><button className="primary-action wide" type="submit">Add subject</button></AsyncForm></Modal>
}

function AssessmentModal({ client, spaceId, subject, assessment, onClose, onSaved }: { client: SupabaseClient; spaceId: string; subject: AcademicSubject; assessment: Assessment | null; onClose: () => void; onSaved: () => void }) {
  return <Modal title={assessment ? `Edit marks for ${subject.name}` : `Add assessment to ${subject.name}`} onClose={onClose}><AsyncForm onSubmit={async (form) => { const rawMarks = String(form.get('obtainedMarks') ?? '').trim(); const input = { title: String(form.get('title') ?? ''), weightPct: Number(form.get('weightPct')), maxMarks: Number(form.get('maxMarks')), obtainedMarks: rawMarks ? Number(rawMarks) : null }; if (assessment) { if (!window.confirm('Save these assessment changes?')) return false; return updateAssessment(client, { id: assessment.id, ...input }) } return createAssessment(client, { spaceId, subjectId: subject.id, ...input }) }} onSaved={onSaved}><label>Assessment title<input name="title" defaultValue={assessment?.title} required autoFocus /></label><label>Weight percent<input name="weightPct" type="number" min="0.1" max="100" step="0.1" defaultValue={assessment?.weight_pct ?? 100} required /></label><label>Maximum marks<input name="maxMarks" type="number" min="0.1" step="0.1" defaultValue={assessment?.max_marks ?? 100} required /></label><label>Marks obtained <span>(optional)</span><input name="obtainedMarks" type="number" min="0" step="0.1" defaultValue={assessment?.obtained_marks ?? ''} /></label><button className="primary-action wide" type="submit">{assessment ? 'Save changes' : 'Save assessment'}</button></AsyncForm></Modal>
}

function SubjectEditModal({ client, subject, onClose, onSaved }: { client: SupabaseClient; subject: AcademicSubject; onClose: () => void; onSaved: () => void }) {
  return <Modal title={`Edit ${subject.name}`} onClose={onClose}><AsyncForm onSubmit={async (form) => { if (!window.confirm('Save these subject changes?')) return false; return updateSubject(client, { id: subject.id, name: String(form.get('name')), credits: Number(form.get('credits')), attendanceTarget: Number(form.get('attendanceTarget')) }) }} onSaved={onSaved}><label>Subject name<input name="name" defaultValue={subject.name} required autoFocus /></label><label>Credits<input name="credits" type="number" min="0.5" step="0.5" defaultValue={subject.credits} required /></label><label>Attendance target<input name="attendanceTarget" type="number" min="1" max="100" step="1" defaultValue={subject.attendance_target ?? 75} required /></label><button className="primary-action wide" type="submit">Save changes</button></AsyncForm></Modal>
}

function SlotModal({ client, spaceId, subjects, slot, onClose, onSaved }: { client: SupabaseClient; spaceId: string; subjects: AcademicSubject[]; slot: TimetableSlot | null; onClose: () => void; onSaved: () => void }) {
  return <Modal title={slot ? 'Edit class' : 'Add class'} onClose={onClose}><AsyncForm onSubmit={async (form) => saveTimetableSlot(client, { id: slot?.id, spaceId, subjectId: String(form.get('subjectId')), day: Number(form.get('day')), startTime: String(form.get('startTime')), endTime: String(form.get('endTime')), room: String(form.get('room') ?? '') })} onSaved={onSaved}><label>Subject<select name="subjectId" required defaultValue={slot?.subject_id ?? subjects[0]?.id}>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label><label>Day<select name="day" defaultValue={String(slot?.day_of_week ?? 1)}><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="7">Sunday</option></select></label><label>Start time<input name="startTime" type="time" defaultValue={slot?.start_time.slice(0, 5)} required /></label><label>End time<input name="endTime" type="time" defaultValue={slot?.end_time.slice(0, 5)} required /></label><label>Room <span>(optional)</span><input name="room" defaultValue={slot?.room ?? ''} /></label><button className="primary-action wide" type="submit">{slot ? 'Save class' : 'Add class'}</button></AsyncForm></Modal>
}

function AsyncForm({ children, onSubmit, onSaved }: { children: React.ReactNode; onSubmit: (form: FormData) => Promise<void | false>; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setError(null); try { const result = await onSubmit(new FormData(event.currentTarget)); if (result !== false) onSaved() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this change.') } finally { setPending(false) } }
  return <form className="modal-form" onSubmit={submit}>{children}{error && <p className="form-message">{error}</p>}{pending && <p className="saving-copy">Saving...</p>}</form>
}

export default App
