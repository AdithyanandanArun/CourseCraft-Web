import { BookOpen, CalendarDays, CheckCircle2, GraduationCap, UserRoundPlus } from 'lucide-react'

import { calculateSgpa } from './lib/sgpa'
import { supabase } from './lib/supabase'
import './App.css'

const subjects = [
  { name: 'Data Structures', credits: 4, percentage: 86, assessment: 'Assignment due Friday' },
  { name: 'Computer Networks', credits: 3, percentage: 91, assessment: 'Mid-semester next week' },
  { name: 'Discrete Mathematics', credits: 3, percentage: 78, assessment: 'Revise unit 4' },
]

function App() {
  const sgpa = calculateSgpa(subjects)
  const configured = supabase !== null

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/CourseCraft-Web/" aria-label="CourseCraft home">
          <span className="brand-mark"><GraduationCap size={20} /></span>
          <span>CourseCraft</span>
        </a>
        <button className="avatar-button" type="button" aria-label="Open profile">S</button>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">STUDENT WORKSPACE</p>
          <h1>Plan the semester with clarity.</h1>
          <p className="intro">Keep your subjects, marks, and next actions in one place. Advisor coaching is optional.</p>
        </div>
        <button className="primary-action" type="button"><BookOpen size={18} /> Add subject</button>
      </section>

      <section className="overview" aria-label="Semester overview">
        <article className="metric">
          <span>Projected SGPA</span>
          <strong>{sgpa.toFixed(2)}</strong>
          <small>Target: 9.50</small>
        </article>
        <article className="metric">
          <span>Attendance</span>
          <strong>84%</strong>
          <small>Above your 75% goal</small>
        </article>
        <article className="metric">
          <span>Open tasks</span>
          <strong>3</strong>
          <small>One due this week</small>
        </article>
      </section>

      <section className="content-grid">
        <section className="subjects-section" aria-labelledby="subjects-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CURRENT SEMESTER</p>
              <h2 id="subjects-heading">Subjects</h2>
            </div>
            <button className="text-button" type="button">View all</button>
          </div>
          <div className="subject-list">
            {subjects.map((subject) => (
              <article className="subject-row" key={subject.name}>
                <div className="subject-icon"><BookOpen size={18} /></div>
                <div className="subject-detail">
                  <h3>{subject.name}</h3>
                  <p>{subject.credits} credits · {subject.assessment}</p>
                </div>
                <div className="grade"><strong>{subject.percentage}%</strong><span>current</span></div>
              </article>
            ))}
          </div>
        </section>

        <aside className="next-section" aria-labelledby="next-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NEXT UP</p>
              <h2 id="next-heading">Today</h2>
            </div>
          </div>
          <ul className="next-list">
            <li><CalendarDays size={18} /><span><strong>Networks lecture</strong><small>10:00 AM · Room 204</small></span></li>
            <li><CheckCircle2 size={18} /><span><strong>Finish DSA assignment</strong><small>Due Friday</small></span></li>
          </ul>
          <div className="advisor-callout">
            <UserRoundPlus size={19} />
            <div><strong>Work independently, connect later.</strong><p>Pair an advisor only when you want coaching tools.</p></div>
          </div>
        </aside>
      </section>

      {!configured && <p className="config-note">Demo mode: add Supabase values to enable sign-in and data sync.</p>}
    </main>
  )
}

export default App
