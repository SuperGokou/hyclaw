---
name: hy-dataviz
description: "Turn tabular data (from Excel/CSV/analysis) into a chart rendered inline in chat via the show_widget tool — bar, line, pie. Use whenever the user asks to 可视化/画图/图表/chart/plot data."
metadata: { "openclaw": { "emoji": "📊" } }
---

# HYClaw 数据可视化 / Data Visualization

Render charts **inline in the web chat** by producing self-contained **SVG** and
passing it to the `show_widget` tool. The widget appears directly in your
assistant message — no browser window, no external file. Everything must be
inline SVG/CSS (the widget sandbox blocks network/resource loads).

> `show_widget` is only available on clients that support inline widgets (the
> HYClaw Control UI does). It is not offered in the plain CLI, so never write a
> chart to an HTML file and tell the user to open it in a browser — always use
> `show_widget`.

## When to use

- The user asks to 可视化 / 画个图 / 出个图表 / chart / plot / dashboard.
- You just read numbers (e.g. via document extraction on an Excel) and a chart
  communicates them better than a table.

## Workflow

1. Get the data as rows/series. From a spreadsheet, extract the columns first.
2. Pick the form (heuristic below).
3. Build one `<svg>` string with a `viewBox` (never fixed pixel width) so it
   scales; include a title, axis labels, and a legend for multiple series.
4. Call `show_widget({ title: "<snake_case>", widget_code: "<svg …>" })` — e.g.
   `q3_revenue_by_region`, not `chart`.

## Form heuristic

| Data shape                         | Chart       |
| ---------------------------------- | ----------- |
| One value per category, comparison | 柱状图 bar  |
| Value over ordered time            | 折线图 line |
| Parts of a whole (≤6 slices)       | 饼图 pie    |
| A single headline number           | KPI tile    |

## Design rules (so every chart reads as one system)

- Categorical palette, in order:
  `#c8281e` (EFD red), `#ff7a1a`, `#2ea44f`, `#3b7dd8`, `#8b5cf6`, `#e6a700`.
- `font-family: "Segoe UI","Microsoft YaHei",sans-serif` so Chinese labels render.
- Grid/axis `stroke="#d9d9df"`; text `fill="#26262a"`. Flat — no 3D, no heavy shadows.
- Always title the chart and label axes; format large numbers with separators.

## Example — bar chart (adapt numbers/labels; bar height = value/maxValue × 150)

```svg
<svg viewBox="0 0 420 260" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Microsoft YaHei, sans-serif">
  <text x="210" y="22" text-anchor="middle" font-size="15" font-weight="600" fill="#26262a">季度营收(万元)</text>
  <line x1="50" y1="210" x2="400" y2="210" stroke="#d9d9df"/>
  <line x1="50" y1="40" x2="50" y2="210" stroke="#d9d9df"/>
  <g fill="#c8281e">
    <rect x="78" y="110" width="46" height="100"/>
    <rect x="160" y="70" width="46" height="140"/>
    <rect x="242" y="130" width="46" height="80"/>
    <rect x="324" y="45" width="46" height="165"/>
  </g>
  <g font-size="12" fill="#26262a" text-anchor="middle">
    <text x="101" y="228">Q1</text><text x="183" y="228">Q2</text>
    <text x="265" y="228">Q3</text><text x="347" y="228">Q4</text>
  </g>
</svg>
```

Then: `show_widget({ title: "quarterly_revenue", widget_code: "<svg …>" })`.

## Reports with charts

For a chart destined for a Word/PPT report, build the same SVG and hand it to the
hy-office workflow to embed, in addition to (or instead of) rendering inline.
