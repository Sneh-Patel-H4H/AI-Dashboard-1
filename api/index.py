from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import anthropic
import pandas as pd
import json
import os
import traceback

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

# ── Pydantic Models ──────────────────────────────────────────────────────────


class AnalyzeRequest(BaseModel):
    headers: list[str]
    sample_rows: list[dict]
    column_meta: dict
    total_rows: int
    file_name: str


class DashboardRequest(BaseModel):
    headers: list[str]
    column_meta: dict
    confirmed_kpis: list[dict]
    sample_rows: list[dict]
    total_rows: int
    currency: str
    time_column: Optional[str] = None


class ChatRequest(BaseModel):
    question: str
    headers: list[str]
    column_meta: dict
    sample_rows: list[dict]
    total_rows: int
    currency: str
    conversation_history: list[dict] = []
    sector: str = ""
    org_type: str = ""


# ── Claude Prompts ───────────────────────────────────────────────────────────

ANALYZE_SYSTEM_PROMPT = """You are a senior Business Intelligence analyst. You analyze datasets to detect:
1. Business sector (e.g. Sales/CRM, E-commerce, Marketing, SaaS/Product, Customer Support, Finance, HR, Logistics, Healthcare, Education, or Mixed)
2. Organisation type (e.g. Fashion Brand, Food Delivery, Subscription SaaS, B2B Agency, Healthcare Provider, Retail/D2C, Marketplace, Financial Services, etc.)
3. Key Performance Indicators that can be calculated from the data
4. Data quality issues

Rules:
- Provide confidence scores (0.0 to 1.0) for sector and org type
- Provide a one-line reason for each confidence score
- Suggest as many meaningful KPIs as the data supports, ranked by business importance (priority 1 = most important)
- Each KPI must map to an actual column in the data with a specific aggregation (sum, mean, count, max, min)
- For format, specify "currency", "number", or "percent"
- Flag data quality issues: high null rates (>20%), inconsistent types, suspicious outliers, duplicate columns
- Detect if time-series data exists and identify the time column
- Detect currency from symbols in data or column names (Revenue, Amount, Price, Cost, etc.)
- Write a plain-English summary of the dataset (2-3 sentences, non-technical)
- Never reference columns that don't exist in the data

You MUST respond with valid JSON matching this exact structure:
{
  "sector": "string",
  "sector_confidence": 0.0,
  "sector_reason": "string",
  "org_type": "string",
  "org_type_confidence": 0.0,
  "org_type_reason": "string",
  "suggested_kpis": [
    {
      "id": "kpi_1",
      "label": "Human-Readable KPI Name",
      "column": "exact_column_name",
      "aggregation": "sum|mean|count|max|min",
      "format": "currency|number|percent",
      "priority": 1
    }
  ],
  "data_quality_warnings": ["string"],
  "currency": "$|€|£|¥|₹|null",
  "has_time_series": true,
  "time_column": "column_name|null",
  "summary": "Plain English description of the dataset"
}"""

DASHBOARD_SYSTEM_PROMPT = """You are a dashboard designer. You create Plotly.js chart specifications for business dashboards.

Rules:
- Return 4-6 charts that tell a coherent data story
- Use diverse chart types: bar, line (if time data exists), pie/donut, scatter, area
- Each chart must use ONLY the actual column names and aggregated values provided to you
- Use these colors: primary=#4F46E5, secondary=#818CF8, accent=#06B6D4, positive=#10B981, negative=#F43F5E
- For color sequences use: ["#4F46E5", "#818CF8", "#06B6D4", "#10B981", "#F59E0B", "#F43F5E", "#8B5CF6", "#EC4899"]
- Plotly layout must include: title (plain English), clean axis labels, legend, and responsive margins
- Set paper_bgcolor and plot_bgcolor to "rgba(0,0,0,0)" for dark mode compatibility
- Set font color to "#334155" (will be overridden in dark mode by frontend)
- Each chart needs a brief plain-English description of what insight it shows
- Use the aggregated data values I provide — do NOT invent data
- Chart titles should be business-friendly (e.g. "Revenue by Region" not "sum_revenue_grouped_by_region")

You MUST respond with valid JSON matching this structure:
{
  "dashboard_title": "string",
  "charts": [
    {
      "id": "chart_1",
      "title": "string",
      "chart_type": "bar|line|pie|scatter|area",
      "description": "string",
      "plotly_data": [{"type": "bar", "x": [...], "y": [...], ...}],
      "plotly_layout": {"title": {"text": "..."}, "xaxis": {...}, "yaxis": {...}, ...},
      "source_columns": ["col1", "col2"]
    }
  ]
}"""

CHAT_SYSTEM_PROMPT = """You are a conversational BI assistant helping non-technical business users understand their data. Users ask questions in plain English and you respond with insights.

Rules:
- Always provide a clear text explanation first (2-4 sentences, no jargon)
- If the question benefits from a visualization, include a Plotly.js chart spec
- If the question asks for specific data points or rankings, include a table
- You can combine text + chart, text + table, or all three
- Suggest 2-3 natural follow-up questions the user might want to ask
- Cite specific numbers from the data in your text answers
- Use the design colors: primary=#4F46E5, sequence=["#4F46E5","#818CF8","#06B6D4","#10B981","#F59E0B","#F43F5E"]
- Set paper_bgcolor and plot_bgcolor to "rgba(0,0,0,0)" for charts
- Never expose raw code, errors, or technical details
- If you can't answer from the available data, say so politely and suggest what data would help
- Keep table rows to maximum 20 for readability

You MUST respond with valid JSON:
{
  "items": [
    {"type": "text", "content": "Your explanation here..."},
    {"type": "chart", "chart_spec": {"title": "...", "plotly_data": [...], "plotly_layout": {...}}},
    {"type": "table", "table_data": {"headers": ["Col1", "Col2"], "rows": [["val1", "val2"]]}}
  ],
  "follow_ups": ["Question 1?", "Question 2?", "Question 3?"]
}"""


# ── Helper Functions ─────────────────────────────────────────────────────────


def call_claude(system_prompt: str, user_message: str) -> dict:
    """Call Claude and parse JSON response."""
    try:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250514",
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        text = response.content[0].text
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
            elif "```" in text:
                text = text[: text.rfind("```")]
        return json.loads(text.strip())
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="The AI returned an unexpected response. Please try again.",
        )
    except anthropic.APIError as e:
        raise HTTPException(
            status_code=500,
            detail="Could not connect to the AI service. Please check your API key and try again.",
        )


def build_data_summary(req: AnalyzeRequest) -> str:
    lines = []
    for header in req.headers:
        meta = req.column_meta.get(header, {})
        line = f"- {header}: type={meta.get('type', 'unknown')}"
        line += f", nulls={meta.get('nullCount', 0)}/{req.total_rows}"
        line += f", unique={meta.get('uniqueCount', 0)}"
        if meta.get("type") == "numeric":
            line += f", range=[{meta.get('min')}, {meta.get('max')}], mean={meta.get('mean')}"
        if meta.get("currency"):
            line += f", currency={meta.get('currency')}"
        samples = meta.get("sampleValues", [])[:3]
        line += f", samples={samples}"
        lines.append(line)
    return "\n".join(lines)


def compute_kpis(df: pd.DataFrame, confirmed_kpis: list, time_column: str | None) -> list:
    results = []
    for kpi in confirmed_kpis:
        col = kpi.get("column", "")
        agg = kpi.get("aggregation", "sum")

        if col not in df.columns:
            continue

        series = pd.to_numeric(
            df[col].astype(str).str.replace(r"[$,\s()%€£¥₹]", "", regex=True),
            errors="coerce",
        ).dropna()

        if series.empty:
            continue

        if agg == "sum":
            value = float(series.sum())
        elif agg == "mean":
            value = float(series.mean())
        elif agg == "count":
            value = int(len(series))
        elif agg == "max":
            value = float(series.max())
        elif agg == "min":
            value = float(series.min())
        else:
            value = float(series.sum())

        change_percent = None
        change_direction = None
        if time_column and time_column in df.columns:
            try:
                df_sorted = df.sort_values(time_column)
                midpoint = len(df_sorted) // 2
                first_half = pd.to_numeric(
                    df_sorted[col].iloc[:midpoint]
                    .astype(str)
                    .str.replace(r"[$,\s()%€£¥₹]", "", regex=True),
                    errors="coerce",
                ).dropna()
                second_half = pd.to_numeric(
                    df_sorted[col].iloc[midpoint:]
                    .astype(str)
                    .str.replace(r"[$,\s()%€£¥₹]", "", regex=True),
                    errors="coerce",
                ).dropna()
                if len(first_half) > 0 and first_half.sum() != 0:
                    change_percent = round(
                        ((second_half.sum() - first_half.sum()) / abs(first_half.sum())) * 100,
                        1,
                    )
                    change_direction = "up" if change_percent > 0 else "down"
            except Exception:
                pass

        fmt = kpi.get("format", "number")
        if fmt == "currency":
            formatted = f"${value:,.2f}"
        elif fmt == "percent":
            formatted = f"{value:.1f}%"
        else:
            formatted = f"{value:,.0f}" if abs(value) >= 100 else f"{value:.2f}"

        results.append(
            {
                "id": kpi.get("id", ""),
                "label": kpi.get("label", col),
                "value": value,
                "formatted_value": formatted,
                "change_percent": change_percent,
                "change_direction": change_direction,
                "format": fmt,
            }
        )

    return results


def build_aggregation_summary(df: pd.DataFrame, column_meta: dict) -> str:
    parts = []
    categorical = [
        k
        for k, v in column_meta.items()
        if v.get("type") == "string" and v.get("uniqueCount", 0) < 20 and k in df.columns
    ]
    numeric = [k for k, v in column_meta.items() if v.get("type") == "numeric" and k in df.columns]

    # Clean numeric columns
    for col in numeric:
        df[col] = pd.to_numeric(
            df[col].astype(str).str.replace(r"[$,\s()%€£¥₹]", "", regex=True),
            errors="coerce",
        )

    for cat in categorical[:3]:
        for num in numeric[:4]:
            try:
                grouped = df.groupby(cat)[num].agg(["sum", "mean", "count"]).head(10)
                if not grouped.empty:
                    parts.append(f"\n{cat} x {num}:\n{grouped.to_string()}")
            except Exception:
                pass

    # Time series summary if available
    date_cols = [k for k, v in column_meta.items() if v.get("type") == "date" and k in df.columns]
    if date_cols and numeric:
        for dc in date_cols[:1]:
            for num in numeric[:2]:
                try:
                    ts = df.groupby(dc)[num].sum().head(20)
                    if not ts.empty:
                        parts.append(f"\nTime series {dc} x {num}:\n{ts.to_string()}")
                except Exception:
                    pass

    return "\n".join(parts) if parts else "No cross-tabulations could be computed."


# ── API Endpoints ────────────────────────────────────────────────────────────


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    try:
        data_summary = build_data_summary(req)

        user_message = f"""Analyze this dataset and provide structured insights.

**File:** {req.file_name}
**Shape:** {req.total_rows} rows x {len(req.headers)} columns

**Columns and Metadata:**
{data_summary}

**Sample Data (first 5 rows):**
{json.dumps(req.sample_rows[:5], indent=2, default=str)}
"""
        result = call_claude(ANALYZE_SYSTEM_PROMPT, user_message)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="We couldn't analyse your data right now. Please try again.",
        )


@app.post("/api/dashboard")
async def dashboard(req: DashboardRequest):
    try:
        df = pd.DataFrame(req.sample_rows)
        kpi_cards = compute_kpis(df, req.confirmed_kpis, req.time_column)
        agg_summary = build_aggregation_summary(df.copy(), req.column_meta)

        user_message = f"""Design a dashboard with charts for this business data.

**KPI Summary:** {json.dumps(kpi_cards, default=str)}
**Column Names:** {json.dumps(req.headers)}
**Column Types:** {json.dumps({k: v.get('type') for k, v in req.column_meta.items()})}
**Currency:** {req.currency}
**Time Column:** {req.time_column or 'None'}
**Total Rows:** {req.total_rows}

**Aggregated Data:**
{agg_summary}

Design 4-6 charts using the actual aggregated values above. Use business-friendly titles and descriptions.
"""
        result = call_claude(DASHBOARD_SYSTEM_PROMPT, user_message)
        result["kpi_cards"] = kpi_cards
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="We couldn't generate the dashboard right now. Please try again.",
        )


@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        history_text = ""
        for entry in req.conversation_history[-6:]:
            history_text += f"\nUser: {entry.get('question', '')}\nAssistant: {entry.get('answer_summary', '')}\n"

        user_message = f"""Answer this question about the dataset.

**Question:** {req.question}

**Business Context:** {req.sector} - {req.org_type}

**Dataset Info:**
- {req.total_rows} rows, {len(req.headers)} columns
- Columns: {', '.join(req.headers)}
- Column types: {json.dumps({k: v.get('type') for k, v in req.column_meta.items()})}
- Currency: {req.currency}

**Sample Data (first 20 rows):**
{json.dumps(req.sample_rows[:20], indent=2, default=str)}

**Conversation History:**
{history_text}

Provide a helpful answer with text, and include a chart or table if it would help explain the answer.
"""
        result = call_claude(CHAT_SYSTEM_PROMPT, user_message)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="I couldn't process your question right now. Please try again.",
        )


@app.get("/api/health")
async def health():
    return {"status": "ok"}
