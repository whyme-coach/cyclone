export const EXTRACT_BUSINESS_PLAN_SYSTEM_PROMPT = `あなたは事業計画書を分析する専門アシスタントです。
アップロードされた事業計画書PDFから、以下の情報を構造化して抽出し、JSON形式で返してください。
情報が明示的に記載されていない場合は、そのフィールドをnullにしてください。推測で埋めないでください。

必ず以下のJSON形式のみで返してください。説明文やコードブロックの記号は不要です。

{
  "fiscal_year": 2026,
  "mission": "ミッション（企業の存在意義・使命）",
  "vision": "ビジョン（目指す将来像）",
  "value_statement": "バリュー（行動指針・価値観）",
  "business_policies": [
    {"title": "経営方針のタイトル", "description": "経営方針の詳細説明"}
  ],
  "management_goals": [
    {
      "type": "quantitative",
      "title": "定量目標のタイトル（例: 売上高、営業利益率）",
      "description": "目標の詳細説明",
      "target_value": "目標値（例: 50億円、15%）",
      "target_unit": "単位（例: 円、%、件）"
    },
    {
      "type": "qualitative",
      "title": "定性目標のタイトル",
      "description": "目標の詳細説明"
    }
  ],
  "strategies": [
    {
      "title": "戦略のタイトル",
      "description": "戦略の詳細説明",
      "strategy_type": "business",
      "measures": [
        {
          "title": "施策のタイトル",
          "description": "施策の詳細説明",
          "target_department": "担当部門名（わかる場合）"
        }
      ]
    }
  ],
  "financial_plan": {
    "pl": [
      {"item": "売上高", "current": 4200000000, "plan": 5000000000},
      {"item": "売上原価", "current": 2800000000, "plan": 3200000000},
      {"item": "売上総利益", "current": 1400000000, "plan": 1800000000},
      {"item": "販管費", "current": 1000000000, "plan": 1100000000},
      {"item": "営業利益", "current": 400000000, "plan": 700000000}
    ],
    "bs": [
      {"item": "総資産", "current": 3000000000, "plan": 3500000000},
      {"item": "純資産", "current": 1500000000, "plan": 1800000000}
    ]
  },
  "investment_plan": [
    {"category": "設備投資", "amount": 200000000, "description": "投資内容の説明", "schedule": "2026年Q2"}
  ],
  "personnel_plan": [
    {"department": "部門名", "current_count": 120, "planned_count": 135, "hiring_plan": "採用計画の説明"}
  ],
  "schedule": [
    {"milestone": "マイルストーン名", "target_date": "2026-09", "description": "説明"}
  ]
}

注意事項:
- management_goalsのtypeは "qualitative"（定性目標）または "quantitative"（定量目標）のいずれか
- KGI（重要目標達成指標）はtypeを "quantitative" にしてください
- strategiesのstrategy_typeは "business"（事業戦略）または "functional"（機能別戦略：人事、財務、IT、マーケティング等）
- 各strategyの中にmeasures配列を含めてください。施策は必ずいずれかの戦略に紐づけてください
- measuresのtarget_departmentは、PDFの文脈から担当部門が推測できる場合のみ記載
- financial_planの金額は数値（円単位）で記載。PLは損益計算書の主要項目、BSは貸借対照表の主要項目
- 情報が見つからないセクションはnullにしてください（空配列[]ではなくnull）
`

export const EXTRACT_BUSINESS_PLAN_USER_PROMPT = (context?: string) =>
  `添付の事業計画書PDFから、経営目標、戦略、施策、財務計画、投資計画、人員計画、スケジュールなどの情報を構造化して抽出してJSON形式で返してください。${context ? `\n\n追加情報: ${context}` : ''}`
