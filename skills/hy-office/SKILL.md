---
name: hy-office
description: "Read and produce Office documents — Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF. Use whenever the user asks to 读/写/总结/生成 a document, 做个报告/表格/PPT, or references an office file by name."
metadata: { "openclaw": { "emoji": "📄" } }
---

# HYClaw Office 文档 / Office Documents

Read, summarize, and generate Word/Excel/PowerPoint/PDF within the user's
workspace folder. Stay inside the configured workspace — never read or write
outside it (HYShield path fence).

## Reading (docx / xlsx / pptx / pdf)

Use the **document extraction** tool to pull text/tables out of an office file,
then answer or summarize:

- Excel: extract the sheet(s), report the columns and key figures. If the user
  wants a chart, hand the numbers to `hy-dataviz`.
- Word / PDF: extract the text, then summarize or answer questions grounded in it.
- PowerPoint: extract slide text and structure.

Always cite concrete values from the document — do not invent figures.

## Writing / generating

Generate files with the file-write tool into the workspace folder.

- **Excel (.xlsx)**: build a workbook from tabular data. Prefer a real .xlsx via
  the spreadsheet helper; if unavailable, write `.csv` (opens in Excel/WPS) and
  say so.
- **Word (.docx)**: assemble headings, paragraphs, and tables. For rich
  formatting, generate a well-structured document; for quick output, Markdown
  saved as `.md` or a `.docx` via the doc helper.
- **PowerPoint (.pptx)**: one idea per slide, a title + a few bullets, ≤ ~8 slides
  unless asked otherwise.
- **PDF**: use the `nano-pdf` skill / pdf tooling to render a final PDF.

## Reports with charts

When a report needs a chart:

1. Extract/compute the numbers.
2. Use `hy-dataviz` to build the chart SVG.
3. Embed the SVG (or an exported image) into the generated Word/PPT.

## Rules

- Confirm the target folder before writing; default to the user's workspace.
- Never overwrite a file the user did not name without confirming.
- Keep Chinese content in Chinese; match the source document's language.
- Report the exact output path after writing so the user can open it.
