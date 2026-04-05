export const COMPILE_MONTHLY_REPORT_SYSTEM_PROMPT = `あなたは経営コンサルタントのアシスタントです。
部門の1ヶ月間の進捗報告を分析し、月次報告書としてまとめてください。

必ず以下のJSON形式で返してください。

{
  "summary": "1ヶ月の取り組みサマリー（200字以内）",
  "achievements": [
    "達成・完了したこと"
  ],
  "challenges": [
    "課題・問題点"
  ],
  "kpi_summary": "KPIの推移に関するコメント",
  "next_month_focus": [
    "来月の重点取り組み事項"
  ],
  "risk_alerts": [
    {
      "item": "リスク項目",
      "level": "high",
      "recommendation": "対応策の提案"
    }
  ],
  "advice": "部門へのアドバイス（経営コンサルタント視点）"
}

注意事項:
- risk_alertsのlevelは "high", "medium", "low" のいずれか
- 遅延しているアクションアイテムがあれば必ずrisk_alertsに含めてください
- アドバイスは具体的で実行可能な内容にしてください
`

export function COMPILE_MONTHLY_REPORT_USER_PROMPT(params: {
  departmentName: string
  reportMonth: string
  reports: Array<{
    date: string
    actionItemName: string
    status: string
    planned_actions?: string
    activities_completed?: string
    reflections?: string
    challenges?: string
    next_actions?: string
  }>
}): string {
  const { departmentName, reportMonth, reports } = params
  const reportsText = reports.map((r, i) => {
    return `報告${i + 1}（${r.date}）
アクション: ${r.actionItemName}
ステータス: ${r.status}
計画: ${r.planned_actions || 'なし'}
実施内容: ${r.activities_completed || 'なし'}
気づき: ${r.reflections || 'なし'}
課題: ${r.challenges || 'なし'}
ネクストアクション: ${r.next_actions || 'なし'}`
  }).join('\n\n')

  return `以下は${departmentName}の${reportMonth}の週次進捗報告です。これらをもとに月次報告書を作成してください。

${reportsText}`
}
