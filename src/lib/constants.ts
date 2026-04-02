export const FISCAL_MONTHS = [
  { value: 1, label: '1月' },
  { value: 2, label: '2月' },
  { value: 3, label: '3月' },
  { value: 4, label: '4月' },
  { value: 5, label: '5月' },
  { value: 6, label: '6月' },
  { value: 7, label: '7月' },
  { value: 8, label: '8月' },
  { value: 9, label: '9月' },
  { value: 10, label: '10月' },
  { value: 11, label: '11月' },
  { value: 12, label: '12月' },
]

export const INDUSTRIES = [
  '製造業',
  '建設業',
  '情報通信業',
  '運輸業',
  '卸売業',
  '小売業',
  '金融業・保険業',
  '不動産業',
  '飲食サービス業',
  '医療・福祉',
  '教育・学習支援業',
  'サービス業',
  'その他',
]

export const SETUP_STEPS = [
  { id: 1, label: '会社情報', sections: ['company-url', 'company-info'] },
  { id: 2, label: '事業計画', sections: ['business-plan-upload', 'goals-strategies'] },
  { id: 3, label: '組織構造', sections: ['org-chart-upload', 'departments'] },
  { id: 4, label: '戦略-施策紐付け', sections: ['strategy-measure-links'] },
  { id: 5, label: 'メンバー招待', sections: ['invite-members'] },
]

export const AI_MODELS = {
  default: 'claude-sonnet-4-6',
  fast: 'claude-haiku-4-5',
} as const
