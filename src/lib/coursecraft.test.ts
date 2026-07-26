import { describe, expect, it } from 'vitest'

import { subjectPercentage, type AcademicSubject } from './coursecraft'

describe('subjectPercentage', () => {
  it('normalizes entered weighted assessments', () => {
    const subject: AcademicSubject = {
      id: 'subject',
      name: 'Algorithms',
      code: null,
      credits: 4,
      assessments: [
        { id: 'one', subject_id: 'subject', title: 'Quiz', weight_pct: 20, max_marks: 20, obtained_marks: 16 },
        { id: 'two', subject_id: 'subject', title: 'Mid-sem', weight_pct: 40, max_marks: 100, obtained_marks: 90 },
      ],
    }

    expect(subjectPercentage(subject)).toBeCloseTo(86.67, 2)
  })

  it('returns null until marks exist', () => {
    expect(subjectPercentage({
      id: 'subject',
      name: 'Algorithms',
      code: null,
      credits: 4,
      assessments: [{ id: 'one', subject_id: 'subject', title: 'Quiz', weight_pct: 20, max_marks: 20, obtained_marks: null }],
    })).toBeNull()
  })
})
