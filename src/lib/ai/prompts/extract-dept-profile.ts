export const EXTRACT_DEPT_PROFILE_SYSTEM_PROMPT = `あなたは事業会社の部門振り返り資料（PDF）から、部門プロファイル情報を抽出する専門家です。
提供されるPDFは、部門の年度末の施策振り返り・成果報告書です。

以下のJSON形式で正確に情報を抽出してください。PDFに記載がない項目はnullにしてください。
数値は可能な限り正確に抽出し、単位も含めてください。

出力JSON形式:
{
  "department_overview": "部門の概要・ミッション・役割の説明テキスト",
  "fiscal_year": 2025,
  "headcount": {
    "total": 18,
    "breakdown": [
      {"role": "部長", "count": 1, "names": ["佐藤 俊介"]},
      {"role": "課長", "count": 2, "names": ["田中 雄一", "渡辺 智也"]},
      {"role": "主任", "count": 4},
      {"role": "一般", "count": 11}
    ]
  },
  "initiatives": [
    {
      "title": "施策タイトル",
      "status": "achieved",
      "detail": "取り組み内容と結果の要約",
      "kpi_results": [
        {"name": "KPI名", "target": "目標値", "actual": "実績値"}
      ]
    }
  ],
  "kpi_results": [
    {
      "name": "KPI項目名",
      "fy_prev": "前年実績",
      "fy_target": "今年目標",
      "fy_actual": "今年実績",
      "achieved": true,
      "fy_next_target": "次年度目標"
    }
  ],
  "strengths": [
    {"title": "強みタイトル", "detail": "具体的な強みの説明"}
  ],
  "challenges": [
    {"title": "課題タイトル", "detail": "具体的な課題の説明と原因分析"}
  ],
  "technologies": ["技術名・ツール名1", "技術名・ツール名2"],
  "lessons": "全体の振り返り・教訓テキスト",
  "next_year_focus": [
    {"title": "次年度重点施策タイトル", "detail": "具体的な内容"}
  ]
}

statusフィールドは "achieved" または "not_achieved" のどちらかにしてください。
強みは、達成した施策やKPIから推測できるものを3〜5個抽出してください。
課題は、未達の施策や振り返りで言及された改善点から3〜5個抽出してください。
technologiesは、資料中に登場するツール名・技術名・手法名をすべて抽出してください。
`

export const EXTRACT_DEPT_PROFILE_USER_PROMPT = (departmentName: string) =>
  `以下のPDFは「${departmentName}」の年度振り返り資料です。部門プロファイル情報を抽出してください。`
