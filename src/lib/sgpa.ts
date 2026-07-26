export type SubjectGrade = {
  credits: number
  percentage: number
}

export function gradePoint(percentage: number): number {
  if (percentage >= 90) return 10
  if (percentage >= 80) return 9
  if (percentage >= 70) return 8
  if (percentage >= 60) return 7
  if (percentage >= 50) return 6
  if (percentage >= 40) return 5
  return 0
}

export function calculateSgpa(subjects: SubjectGrade[]): number {
  const valid = subjects.filter((subject) => subject.credits > 0)
  const credits = valid.reduce((total, subject) => total + subject.credits, 0)
  if (credits === 0) return 0

  return valid.reduce((total, subject) => total + subject.credits * gradePoint(subject.percentage), 0) / credits
}
