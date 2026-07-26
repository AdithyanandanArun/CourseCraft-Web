import { describe, expect, it } from 'vitest'

import { calculateSgpa } from './sgpa'

describe('calculateSgpa', () => {
  it('calculates the shared credit-weighted fixture', () => {
    expect(calculateSgpa([
      { credits: 4, percentage: 86 },
      { credits: 3, percentage: 91 },
      { credits: 3, percentage: 78 },
    ])).toBe(9)
  })

  it('returns zero without valid credits', () => {
    expect(calculateSgpa([{ credits: 0, percentage: 95 }])).toBe(0)
  })
})
