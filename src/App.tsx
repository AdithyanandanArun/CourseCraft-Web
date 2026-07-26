import { useEffect, useState, type FormEvent } from 'react'
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { BookOpen, GraduationCap, LogOut, Moon, Plus, RefreshCw, Sun, UserRoundPlus, X } from 'lucide-react'

import {
  createAssessment,
  createSemester,
  createSubject,
  ensureProfile,
  loadAcademics,
  subjectPercentage,
  type AcademicSnapshot,
  type AcademicSubject,
  type Profile,
} from './lib/coursecraft'
import { calculateSgpa } from './lib/sgpa'
import { supabase } from './lib/supabase'
import './App.css'

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

  useEffect(() => {
    void client.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.subscription.unsubscribe()
  }, [client])

  if (session === undefined) return <LoadingScreen />
  if (!session) return <AuthScreen client={client} />
  return <ProfileGate client={client} user={session.user} />
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
          options: { data: { display_name: displayName, role } },
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
  const [modal, setModal] = useState<'semester' | 'subject' | 'assessment' | null>(null)
  const [assessmentSubject, setAssessmentSubject] = useState<AcademicSubject | null>(null)

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
      <section className="page-heading">
        <div>
          <p className="eyebrow">STUDENT WORKSPACE</p>
          <h1>{profile.display_name ? `Hello, ${profile.display_name}.` : 'Your student workspace.'}</h1>
          <p className="intro">Your academic plan is completely usable before you pair an advisor.</p>
        </div>
        {snapshot.semester && <button className="primary-action" type="button" onClick={() => setModal('subject')}><Plus size={18} /> Add subject</button>}
      </section>
      {!snapshot.semester ? (
        <EmptySemester onCreate={() => setModal('semester')} />
      ) : (
        <>
          <section className="overview" aria-label="Semester overview">
            <article className="metric"><span>Projected SGPA</span><strong>{sgpa?.toFixed(2) ?? '---'}</strong><small>{sgpa ? 'From your entered marks' : 'Add marks to calculate it'}</small></article>
            <article className="metric"><span>Current semester</span><strong className="metric-name">{snapshot.semester.name}</strong><small>{snapshot.subjects.length} subject{snapshot.subjects.length === 1 ? '' : 's'}</small></article>
            <article className="metric"><span>Advisor coaching</span><strong className="metric-name">Optional</strong><small>Pairing arrives in Phase 3</small></article>
          </section>
          <section className="content-grid">
            <section className="subjects-section" aria-labelledby="subjects-heading">
              <div className="section-heading"><div><p className="eyebrow">CURRENT SEMESTER</p><h2 id="subjects-heading">Subjects</h2></div><button className="text-button" type="button" onClick={() => setModal('subject')}>Add subject</button></div>
              {snapshot.subjects.length === 0 ? <p className="empty-copy">Add your first subject, then record assessment weights and marks.</p> : <div className="subject-list">
                {snapshot.subjects.map((subject) => <SubjectRow key={subject.id} subject={subject} onAddAssessment={() => { setAssessmentSubject(subject); setModal('assessment') }} />)}
              </div>}
            </section>
            <aside className="next-section"><p className="eyebrow">NEXT ACTION</p><h2>Get a reliable projection.</h2><p className="aside-copy">Add each assessment's weighting and the marks you receive. CourseCraft will calculate a credit-weighted SGPA.</p><div className="advisor-callout"><UserRoundPlus size={19} /><div><strong>Advisor access is optional.</strong><p>Student workflows remain yours until you deliberately pair an advisor.</p></div></div></aside>
          </section>
        </>
      )}
      {modal === 'semester' && <SemesterModal client={client} spaceId={profile.space_id!} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal === 'subject' && snapshot.semester && <SubjectModal client={client} spaceId={profile.space_id!} semesterId={snapshot.semester.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal === 'assessment' && assessmentSubject && <AssessmentModal client={client} spaceId={profile.space_id!} subject={assessmentSubject} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </main>
  )
}

function SubjectRow({ subject, onAddAssessment }: { subject: AcademicSubject; onAddAssessment: () => void }) {
  const percentage = subjectPercentage(subject)
  return <article className="subject-row"><div className="subject-icon"><BookOpen size={18} /></div><div className="subject-detail"><h3>{subject.name}</h3><p>{subject.code ? `${subject.code} · ` : ''}{subject.credits} credits · {subject.assessments.length} assessment{subject.assessments.length === 1 ? '' : 's'}</p>{subject.assessments.map((assessment) => <small key={assessment.id}>{assessment.title}: {assessment.obtained_marks ?? '-'} / {assessment.max_marks} ({assessment.weight_pct}%)</small>)}</div><div className="grade"><strong>{percentage === null ? '---' : `${percentage.toFixed(0)}%`}</strong><button className="text-button" type="button" onClick={onAddAssessment}>Add marks</button></div></article>
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

function AssessmentModal({ client, spaceId, subject, onClose, onSaved }: { client: SupabaseClient; spaceId: string; subject: AcademicSubject; onClose: () => void; onSaved: () => void }) {
  return <Modal title={`Add assessment to ${subject.name}`} onClose={onClose}><AsyncForm onSubmit={async (form) => { const rawMarks = String(form.get('obtainedMarks') ?? '').trim(); return createAssessment(client, { spaceId, subjectId: subject.id, title: String(form.get('title') ?? ''), weightPct: Number(form.get('weightPct')), maxMarks: Number(form.get('maxMarks')), obtainedMarks: rawMarks ? Number(rawMarks) : null }) }} onSaved={onSaved}><label>Assessment title<input name="title" required autoFocus /></label><label>Weight percent<input name="weightPct" type="number" min="0.1" max="100" step="0.1" defaultValue="100" required /></label><label>Maximum marks<input name="maxMarks" type="number" min="0.1" step="0.1" defaultValue="100" required /></label><label>Marks obtained <span>(optional)</span><input name="obtainedMarks" type="number" min="0" step="0.1" /></label><button className="primary-action wide" type="submit">Save assessment</button></AsyncForm></Modal>
}

function AsyncForm({ children, onSubmit, onSaved }: { children: React.ReactNode; onSubmit: (form: FormData) => Promise<void>; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setError(null); try { await onSubmit(new FormData(event.currentTarget)); onSaved() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this change.') } finally { setPending(false) } }
  return <form className="modal-form" onSubmit={submit}>{children}{error && <p className="form-message">{error}</p>}{pending && <p className="saving-copy">Saving...</p>}</form>
}

export default App
