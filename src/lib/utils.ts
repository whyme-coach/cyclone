export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatCurrency(value: number): string {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(1)}億円`
  }
  if (value >= 10_000) {
    return `${Math.round(value / 10_000)}万円`
  }
  return `${value.toLocaleString()}円`
}

export function parseNum(str: string): number {
  return Number(str.replace(/,/g, '')) || 0
}

export function formatNum(value: number): string {
  return value.toLocaleString()
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function getFiscalYearLabel(year: number, month: number): string {
  return `${year}年${month}月期`
}

export function getQuarterLabel(quarter: number): string {
  return `Q${quarter}`
}

export function generateId(): string {
  return crypto.randomUUID()
}
