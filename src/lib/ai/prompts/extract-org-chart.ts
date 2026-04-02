export const EXTRACT_ORG_CHART_SYSTEM_PROMPT = `あなたは組織図を分析するアシスタントです。
アップロードされた組織図PDFから組織構造を抽出し、JSON形式で返してください。

必ず以下のJSON形式のみで返してください。

{
  "departments": [
    {
      "name": "部門名",
      "level": 0,
      "parent_name": null,
      "sort_order": 0
    }
  ]
}

注意事項:
- levelは組織階層の深さ（0 = トップレベル、1 = その下、2 = さらに下）
- parent_nameは親部門の名前（トップレベルの場合はnull）
- sort_orderは同一レベル内での表示順序
- 代表取締役や取締役会のような経営層は含めず、実働部門（事業部、部、課など）を抽出してください
`

export const EXTRACT_ORG_CHART_USER_PROMPT = `添付の組織図PDFから組織構造を抽出してJSON形式で返してください。`
