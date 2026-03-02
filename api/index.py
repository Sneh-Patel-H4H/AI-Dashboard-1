from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import os
import re
import urllib.request
import urllib.error

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

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


# ── AI Prompts ───────────────────────────────────────────────────────────────

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


# ── Pure Python Helpers (no pandas/numpy) ────────────────────────────────────

_CURRENCY_RE = re.compile(r"[$€£¥₹,\s()%]")


def _to_number(val) -> float | None:
    """Convert a value to float, stripping currency symbols and formatting."""
    if val is None or val == "":
        return None
    s = str(val).strip()
    cleaned = _CURRENCY_RE.sub("", s)
    if cleaned.startswith("-") is False and s.startswith("(") and s.endswith(")"):
        cleaned = "-" + cleaned
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _extract_column(rows: list[dict], col: str) -> list:
    """Extract numeric values for a column from rows."""
    nums = []
    for row in rows:
        n = _to_number(row.get(col))
        if n is not None:
            nums.append(n)
    return nums


def _agg(nums: list[float], method: str) -> float | None:
    """Apply an aggregation to a list of numbers."""
    if not nums:
        return None
    if method == "sum":
        return sum(nums)
    if method == "mean":
        return sum(nums) / len(nums)
    if method == "count":
        return float(len(nums))
    if method == "max":
        return max(nums)
    if method == "min":
        return min(nums)
    return sum(nums)


def compute_kpis(rows: list[dict], confirmed_kpis: list[dict], time_column: str | None) -> list:
    """Compute KPI values from raw row data using pure Python."""
    results = []
    for kpi in confirmed_kpis:
        col = kpi.get("column", "")
        agg_method = kpi.get("aggregation", "sum")

        nums = _extract_column(rows, col)
        if not nums:
            continue

        value = _agg(nums, agg_method)
        if value is None:
            continue

        change_percent = None
        change_direction = None
        if time_column:
            try:
                sorted_rows = sorted(rows, key=lambda r: str(r.get(time_column, "")))
                mid = len(sorted_rows) // 2
                first_nums = _extract_column(sorted_rows[:mid], col)
                second_nums = _extract_column(sorted_rows[mid:], col)
                first_sum = sum(first_nums) if first_nums else 0
                second_sum = sum(second_nums) if second_nums else 0
                if first_sum != 0:
                    change_percent = round(((second_sum - first_sum) / abs(first_sum)) * 100, 1)
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

        results.append({
            "id": kpi.get("id", ""),
            "label": kpi.get("label", col),
            "value": value,
            "formatted_value": formatted,
            "change_percent": change_percent,
            "change_direction": change_direction,
            "format": fmt,
        })

    return results


def build_aggregation_summary(rows: list[dict], column_meta: dict) -> str:
    """Build cross-tabulation summaries using pure Python."""
    categorical = [
        k for k, v in column_meta.items()
        if v.get("type") == "string" and v.get("uniqueCount", 0) < 20
    ]
    numeric = [k for k, v in column_meta.items() if v.get("type") == "numeric"]
    parts = []

    for cat in categorical[:3]:
        for num in numeric[:4]:
            groups: dict[str, list[float]] = {}
            for row in rows:
                cat_val = str(row.get(cat, "")).strip()
                if not cat_val or cat_val.lower() in ("none", "null", ""):
                    continue
                n = _to_number(row.get(num))
                if n is not None:
                    groups.setdefault(cat_val, []).append(n)

            if not groups:
                continue

            lines = [f"\n{cat} x {num}:"]
            lines.append(f"  {'Category':<30} {'Sum':>12} {'Avg':>12} {'Count':>8}")
            for gname, gvals in sorted(groups.items(), key=lambda x: -sum(x[1]))[:10]:
                s = sum(gvals)
                a = s / len(gvals)
                c = len(gvals)
                lines.append(f"  {gname:<30} {s:>12.1f} {a:>12.1f} {c:>8}")
            parts.append("\n".join(lines))

    date_cols = [k for k, v in column_meta.items() if v.get("type") == "date"]
    if date_cols and numeric:
        dc = date_cols[0]
        for num in numeric[:2]:
            ts: dict[str, float] = {}
            for row in rows:
                dv = str(row.get(dc, "")).strip()
                if not dv:
                    continue
                n = _to_number(row.get(num))
                if n is not None:
                    ts[dv] = ts.get(dv, 0) + n
            if ts:
                lines = [f"\nTime series {dc} x {num}:"]
                for k, v in sorted(ts.items())[:20]:
                    lines.append(f"  {k}: {v:.1f}")
                parts.append("\n".join(lines))

    return "\n".join(parts) if parts else "No cross-tabulations could be computed."


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


# ── Gemini API Call (zero external dependencies) ─────────────────────────────


def call_ai(system_prompt: str, user_message: str) -> dict:
    """Call Google Gemini API and parse JSON response."""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured. Please add it to your Vercel environment variables.",
        )

    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": user_message}]}
        ],
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        },
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }

    url = f"{GEMINI_URL}?key={GEMINI_API_KEY}"
    req_data = json.dumps(payload).encode("utf-8")

    http_req = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(http_req, timeout=55) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = ""
        try:
            error_body = e.read().decode("utf-8")[:300]
        except Exception:
            pass
        raise HTTPException(
            status_code=500,
            detail=f"AI service error ({e.code}): {error_body}",
        )
    except urllib.error.URLError:
        raise HTTPException(
            status_code=500,
            detail="Could not connect to the AI service. Please try again.",
        )

    try:
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
            elif "```" in text:
                text = text[: text.rfind("```")]
        return json.loads(text.strip())
    except (KeyError, IndexError):
        raise HTTPException(
            status_code=500,
            detail="The AI returned an unexpected response format. Please try again.",
        )
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="The AI returned invalid data. Please try again.",
        )


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
        result = call_ai(ANALYZE_SYSTEM_PROMPT, user_message)
        return result
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="We couldn't analyse your data right now. Please try again.",
        )


@app.post("/api/dashboard")
async def dashboard(req: DashboardRequest):
    try:
        kpi_cards = compute_kpis(req.sample_rows, req.confirmed_kpis, req.time_column)
        agg_summary = build_aggregation_summary(req.sample_rows, req.column_meta)

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
        result = call_ai(DASHBOARD_SYSTEM_PROMPT, user_message)
        result["kpi_cards"] = kpi_cards
        return result
    except HTTPException:
        raise
    except Exception:
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
        result = call_ai(CHAT_SYSTEM_PROMPT, user_message)
        return result
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="I couldn't process your question right now. Please try again.",
        )


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "ai_provider": "gemini",
        "api_key_set": bool(GEMINI_API_KEY),
        "api_key_prefix": GEMINI_API_KEY[:8] + "..." if GEMINI_API_KEY else "NOT SET",
    }
