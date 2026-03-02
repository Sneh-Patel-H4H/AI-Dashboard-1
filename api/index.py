from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import math
import os
import re
import urllib.request
import urllib.error
import time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── AI Provider Config (auto-detect from env vars) ──────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

GEMINI_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"]
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

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


def _std(nums: list[float]) -> float:
    """Standard deviation."""
    if len(nums) < 2:
        return 0.0
    m = sum(nums) / len(nums)
    return math.sqrt(sum((x - m) ** 2 for x in nums) / len(nums))


def _median(nums: list[float]) -> float:
    s = sorted(nums)
    n = len(s)
    if n % 2 == 1:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2


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


# ── Heuristic Fallback Engine (works with ZERO API keys) ────────────────────

# Keyword → sector mapping for heuristic detection
SECTOR_KEYWORDS = {
    "Sales/CRM": ["revenue", "sales", "deal", "pipeline", "lead", "opportunity", "quota", "commission", "prospect", "account", "crm", "close"],
    "E-commerce": ["order", "product", "sku", "cart", "shipping", "customer", "item", "price", "discount", "coupon", "store", "shop"],
    "Marketing": ["campaign", "impression", "click", "ctr", "conversion", "spend", "roi", "channel", "ad", "marketing", "email", "bounce"],
    "SaaS/Product": ["user", "subscription", "mrr", "arr", "churn", "retention", "signup", "trial", "plan", "tier", "feature", "active"],
    "Finance": ["amount", "transaction", "balance", "debit", "credit", "account", "payment", "invoice", "tax", "interest", "profit", "loss", "expense", "budget"],
    "HR": ["employee", "salary", "department", "hire", "termination", "leave", "attendance", "performance", "rating", "position", "headcount"],
    "Healthcare": ["patient", "diagnosis", "treatment", "medication", "visit", "hospital", "doctor", "nurse", "claim", "procedure", "health"],
    "Logistics": ["shipment", "delivery", "warehouse", "inventory", "tracking", "freight", "route", "carrier", "dispatch", "supply"],
    "Customer Support": ["ticket", "issue", "resolution", "sla", "response", "satisfaction", "csat", "nps", "support", "agent", "queue"],
    "Education": ["student", "course", "grade", "enrollment", "teacher", "class", "exam", "score", "attendance", "semester"],
}

ORG_KEYWORDS = {
    "Retail/D2C": ["store", "shop", "product", "sku", "price", "discount"],
    "Fashion Brand": ["size", "color", "style", "clothing", "apparel", "fashion"],
    "Food Delivery": ["delivery", "restaurant", "food", "menu", "order"],
    "Subscription SaaS": ["subscription", "mrr", "arr", "churn", "plan", "tier"],
    "B2B Agency": ["client", "project", "campaign", "agency", "service"],
    "Financial Services": ["transaction", "balance", "interest", "loan", "bank"],
    "Healthcare Provider": ["patient", "diagnosis", "hospital", "doctor"],
    "Marketplace": ["seller", "buyer", "listing", "marketplace"],
}

CURRENCY_COL_KEYWORDS = ["revenue", "sales", "price", "cost", "amount", "total",
                         "profit", "income", "expense", "payment", "fee", "salary",
                         "wage", "budget", "spend", "value", "balance"]


def _detect_sector(headers: list[str], column_meta: dict) -> tuple[str, float, str]:
    """Detect business sector from column names using keyword matching."""
    lower_headers = [h.lower().replace("_", " ") for h in headers]
    all_text = " ".join(lower_headers)

    scores: dict[str, int] = {}
    for sector, keywords in SECTOR_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in all_text)
        if score > 0:
            scores[sector] = score

    if not scores:
        return "General Business", 0.4, "Could not determine specific sector from column names"

    best = max(scores, key=scores.get)
    max_score = scores[best]
    confidence = min(0.9, 0.4 + max_score * 0.1)
    return best, confidence, f"Detected {max_score} matching keywords in column names"


def _detect_org_type(headers: list[str], sector: str) -> tuple[str, float, str]:
    """Detect organization type from column names."""
    lower_headers = [h.lower().replace("_", " ") for h in headers]
    all_text = " ".join(lower_headers)

    scores: dict[str, int] = {}
    for org, keywords in ORG_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in all_text)
        if score > 0:
            scores[org] = score

    if not scores:
        # Map sector to a generic org type
        sector_to_org = {
            "Sales/CRM": "B2B Company",
            "E-commerce": "Retail/D2C",
            "Marketing": "Marketing Org",
            "SaaS/Product": "Subscription SaaS",
            "Finance": "Financial Services",
            "HR": "Enterprise Company",
            "Healthcare": "Healthcare Provider",
            "Logistics": "Logistics Company",
            "Customer Support": "Service Company",
            "Education": "Educational Institution",
        }
        org = sector_to_org.get(sector, "Business Organization")
        return org, 0.3, "Inferred from detected sector"

    best = max(scores, key=scores.get)
    confidence = min(0.8, 0.3 + scores[best] * 0.1)
    return best, confidence, f"Matched {scores[best]} organization keywords"


def _detect_currency(column_meta: dict) -> str:
    """Detect currency from column metadata."""
    for col, meta in column_meta.items():
        if meta.get("currency"):
            return meta["currency"]
    # Check if column names suggest currency
    for col in column_meta:
        if any(kw in col.lower() for kw in CURRENCY_COL_KEYWORDS):
            return "$"
    return "$"


def _detect_time_column(column_meta: dict) -> str | None:
    """Find the time/date column."""
    for col, meta in column_meta.items():
        if meta.get("type") == "date":
            return col
    # Check column names for date-like names
    date_names = ["date", "time", "timestamp", "created", "updated", "month", "year", "day", "period", "week"]
    for col in column_meta:
        if any(dn in col.lower() for dn in date_names):
            return col
    return None


def _suggest_kpis(headers: list[str], column_meta: dict, total_rows: int) -> list[dict]:
    """Suggest KPIs based on column types and names."""
    kpis = []
    priority = 1

    numeric_cols = [h for h in headers if column_meta.get(h, {}).get("type") == "numeric"]
    string_cols = [h for h in headers if column_meta.get(h, {}).get("type") == "string"]

    # Revenue/sales-like columns → sum
    for col in numeric_cols:
        cl = col.lower()
        if any(kw in cl for kw in ["revenue", "sales", "total", "amount", "income", "profit"]):
            label = col.replace("_", " ").title()
            kpis.append({
                "id": f"kpi_{priority}",
                "label": f"Total {label}",
                "column": col,
                "aggregation": "sum",
                "format": "currency",
                "priority": priority,
            })
            priority += 1

    # Count-like columns (or just total records)
    count_added = False
    for col in numeric_cols:
        cl = col.lower()
        if any(kw in cl for kw in ["order", "transaction", "ticket", "deal", "count"]):
            kpis.append({
                "id": f"kpi_{priority}",
                "label": f"Total {col.replace('_', ' ').title()}s",
                "column": col,
                "aggregation": "count",
                "format": "number",
                "priority": priority,
            })
            priority += 1
            count_added = True
            break

    if not count_added and numeric_cols:
        kpis.append({
            "id": f"kpi_{priority}",
            "label": "Total Records",
            "column": numeric_cols[0],
            "aggregation": "count",
            "format": "number",
            "priority": priority,
        })
        priority += 1

    # Average-like columns → mean
    for col in numeric_cols:
        cl = col.lower()
        if any(kw in cl for kw in ["price", "cost", "rate", "score", "rating", "salary", "wage"]):
            label = col.replace("_", " ").title()
            is_currency = any(kw in cl for kw in ["price", "cost", "salary", "wage"])
            kpis.append({
                "id": f"kpi_{priority}",
                "label": f"Average {label}",
                "column": col,
                "aggregation": "mean",
                "format": "currency" if is_currency else "number",
                "priority": priority,
            })
            priority += 1

    # Percentage-like columns → mean
    for col in numeric_cols:
        cl = col.lower()
        if any(kw in cl for kw in ["rate", "percent", "ratio", "conversion", "ctr", "bounce"]):
            if not any(k["column"] == col for k in kpis):  # avoid duplicates
                kpis.append({
                    "id": f"kpi_{priority}",
                    "label": f"Avg {col.replace('_', ' ').title()}",
                    "column": col,
                    "aggregation": "mean",
                    "format": "percent",
                    "priority": priority,
                })
                priority += 1

    # Max value columns → max
    for col in numeric_cols:
        cl = col.lower()
        if any(kw in cl for kw in ["max", "highest", "top", "peak"]):
            kpis.append({
                "id": f"kpi_{priority}",
                "label": f"Max {col.replace('_', ' ').title()}",
                "column": col,
                "aggregation": "max",
                "format": "number",
                "priority": priority,
            })
            priority += 1

    # If we have fewer than 3 KPIs, add remaining numeric columns
    remaining = [c for c in numeric_cols if not any(k["column"] == c for k in kpis)]
    for col in remaining:
        if len(kpis) >= 6:
            break
        cl = col.lower()
        is_currency = any(kw in cl for kw in CURRENCY_COL_KEYWORDS)
        agg = "sum" if is_currency else "mean"
        fmt = "currency" if is_currency else "number"
        label = col.replace("_", " ").title()
        prefix = "Total" if agg == "sum" else "Average"
        kpis.append({
            "id": f"kpi_{priority}",
            "label": f"{prefix} {label}",
            "column": col,
            "aggregation": agg,
            "format": fmt,
            "priority": priority,
        })
        priority += 1

    return kpis[:8]  # Cap at 8 KPIs


def _detect_warnings(column_meta: dict, total_rows: int) -> list[str]:
    """Detect data quality warnings."""
    warnings = []
    for col, meta in column_meta.items():
        null_count = meta.get("nullCount", 0)
        if total_rows > 0 and null_count / total_rows > 0.2:
            pct = round(null_count / total_rows * 100, 0)
            warnings.append(f'Column "{col}" has {pct:.0f}% missing values')
    if total_rows < 10:
        warnings.append("Very small dataset — results may not be statistically meaningful")
    return warnings


def heuristic_analyze(req: AnalyzeRequest) -> dict:
    """Analyze dataset using rule-based heuristics (no AI needed)."""
    sector, sector_conf, sector_reason = _detect_sector(req.headers, req.column_meta)
    org_type, org_conf, org_reason = _detect_org_type(req.headers, sector)
    currency = _detect_currency(req.column_meta)
    time_col = _detect_time_column(req.column_meta)
    kpis = _suggest_kpis(req.headers, req.column_meta, req.total_rows)
    warnings = _detect_warnings(req.column_meta, req.total_rows)

    numeric_cols = [h for h in req.headers if req.column_meta.get(h, {}).get("type") == "numeric"]
    string_cols = [h for h in req.headers if req.column_meta.get(h, {}).get("type") == "string"]

    summary = (
        f"This dataset contains {req.total_rows:,} records across {len(req.headers)} columns. "
        f"It includes {len(numeric_cols)} numeric field{'s' if len(numeric_cols) != 1 else ''} "
        f"and {len(string_cols)} text field{'s' if len(string_cols) != 1 else ''}."
    )
    if time_col:
        summary += f" Time-series data is available in the '{time_col}' column."

    return {
        "sector": sector,
        "sector_confidence": sector_conf,
        "sector_reason": sector_reason,
        "org_type": org_type,
        "org_type_confidence": org_conf,
        "org_type_reason": org_reason,
        "suggested_kpis": kpis,
        "data_quality_warnings": warnings,
        "currency": currency,
        "has_time_series": time_col is not None,
        "time_column": time_col,
        "summary": summary,
    }


def _group_by(rows: list[dict], cat_col: str, num_col: str) -> dict[str, list[float]]:
    """Group rows by a categorical column and collect numeric values."""
    groups: dict[str, list[float]] = {}
    for row in rows:
        cat_val = str(row.get(cat_col, "")).strip()
        if not cat_val or cat_val.lower() in ("none", "null", "nan", ""):
            continue
        n = _to_number(row.get(num_col))
        if n is not None:
            groups.setdefault(cat_val, []).append(n)
    return groups


def _make_plotly_layout(title: str, xaxis_title: str = "", yaxis_title: str = "") -> dict:
    """Create a consistent Plotly layout dict."""
    layout = {
        "title": {"text": title, "font": {"size": 16}},
        "paper_bgcolor": "rgba(0,0,0,0)",
        "plot_bgcolor": "rgba(0,0,0,0)",
        "font": {"color": "#334155"},
        "margin": {"l": 60, "r": 30, "t": 50, "b": 60},
    }
    if xaxis_title:
        layout["xaxis"] = {"title": xaxis_title, "gridcolor": "#E2E8F0"}
    if yaxis_title:
        layout["yaxis"] = {"title": yaxis_title, "gridcolor": "#E2E8F0"}
    return layout


CHART_COLORS = ["#4F46E5", "#818CF8", "#06B6D4", "#10B981", "#F59E0B", "#F43F5E", "#8B5CF6", "#EC4899"]


def heuristic_dashboard(req: DashboardRequest) -> dict:
    """Generate dashboard charts using rule-based heuristics (no AI needed)."""
    charts = []
    chart_id = 1

    numeric_cols = [h for h in req.headers if req.column_meta.get(h, {}).get("type") == "numeric"]
    categorical_cols = [
        h for h in req.headers
        if req.column_meta.get(h, {}).get("type") == "string"
        and req.column_meta.get(h, {}).get("uniqueCount", 0) < 20
        and req.column_meta.get(h, {}).get("uniqueCount", 0) > 1
    ]

    # Chart 1: Bar chart — top categorical vs first numeric (sum)
    if categorical_cols and numeric_cols:
        cat = categorical_cols[0]
        num = numeric_cols[0]
        groups = _group_by(req.sample_rows, cat, num)
        if groups:
            sorted_groups = sorted(groups.items(), key=lambda x: -sum(x[1]))[:10]
            labels = [g[0] for g in sorted_groups]
            values = [round(sum(g[1]), 2) for g in sorted_groups]
            charts.append({
                "id": f"chart_{chart_id}",
                "title": f"{num.replace('_', ' ').title()} by {cat.replace('_', ' ').title()}",
                "chart_type": "bar",
                "description": f"Shows total {num} broken down by {cat}",
                "plotly_data": [{
                    "type": "bar",
                    "x": labels,
                    "y": values,
                    "marker": {"color": CHART_COLORS[0]},
                }],
                "plotly_layout": _make_plotly_layout(
                    f"{num.replace('_', ' ').title()} by {cat.replace('_', ' ').title()}",
                    cat.replace("_", " ").title(),
                    num.replace("_", " ").title(),
                ),
                "source_columns": [cat, num],
            })
            chart_id += 1

    # Chart 2: Pie chart — distribution of first categorical
    if categorical_cols:
        cat = categorical_cols[0]
        counts: dict[str, int] = {}
        for row in req.sample_rows:
            val = str(row.get(cat, "")).strip()
            if val and val.lower() not in ("none", "null", "nan", ""):
                counts[val] = counts.get(val, 0) + 1
        if counts:
            sorted_counts = sorted(counts.items(), key=lambda x: -x[1])[:8]
            labels = [c[0] for c in sorted_counts]
            values = [c[1] for c in sorted_counts]
            charts.append({
                "id": f"chart_{chart_id}",
                "title": f"Distribution of {cat.replace('_', ' ').title()}",
                "chart_type": "pie",
                "description": f"Shows the proportion of records across different {cat} categories",
                "plotly_data": [{
                    "type": "pie",
                    "labels": labels,
                    "values": values,
                    "marker": {"colors": CHART_COLORS[:len(labels)]},
                    "hole": 0.4,
                }],
                "plotly_layout": _make_plotly_layout(
                    f"Distribution of {cat.replace('_', ' ').title()}"
                ),
                "source_columns": [cat],
            })
            chart_id += 1

    # Chart 3: Line chart — time series if available
    if req.time_column and numeric_cols:
        num = numeric_cols[0]
        ts: dict[str, float] = {}
        for row in req.sample_rows:
            dv = str(row.get(req.time_column, "")).strip()
            if not dv:
                continue
            n = _to_number(row.get(num))
            if n is not None:
                ts[dv] = ts.get(dv, 0) + n
        if ts:
            sorted_ts = sorted(ts.items())[:30]
            x_vals = [t[0] for t in sorted_ts]
            y_vals = [round(t[1], 2) for t in sorted_ts]
            charts.append({
                "id": f"chart_{chart_id}",
                "title": f"{num.replace('_', ' ').title()} Over Time",
                "chart_type": "line",
                "description": f"Tracks how {num} changes over time",
                "plotly_data": [{
                    "type": "scatter",
                    "mode": "lines+markers",
                    "x": x_vals,
                    "y": y_vals,
                    "line": {"color": CHART_COLORS[0], "width": 2},
                    "marker": {"size": 6},
                }],
                "plotly_layout": _make_plotly_layout(
                    f"{num.replace('_', ' ').title()} Over Time",
                    req.time_column.replace("_", " ").title(),
                    num.replace("_", " ").title(),
                ),
                "source_columns": [req.time_column, num],
            })
            chart_id += 1

    # Chart 4: Bar chart — second categorical x second numeric (if available)
    if len(categorical_cols) > 1 and len(numeric_cols) > 1:
        cat = categorical_cols[1] if len(categorical_cols) > 1 else categorical_cols[0]
        num = numeric_cols[1] if len(numeric_cols) > 1 else numeric_cols[0]
        groups = _group_by(req.sample_rows, cat, num)
        if groups:
            sorted_groups = sorted(groups.items(), key=lambda x: -sum(x[1]))[:10]
            labels = [g[0] for g in sorted_groups]
            values = [round(sum(g[1]) / len(g[1]), 2) for g in sorted_groups]
            charts.append({
                "id": f"chart_{chart_id}",
                "title": f"Average {num.replace('_', ' ').title()} by {cat.replace('_', ' ').title()}",
                "chart_type": "bar",
                "description": f"Compares average {num} across {cat} categories",
                "plotly_data": [{
                    "type": "bar",
                    "x": labels,
                    "y": values,
                    "marker": {"color": CHART_COLORS[2]},
                }],
                "plotly_layout": _make_plotly_layout(
                    f"Average {num.replace('_', ' ').title()} by {cat.replace('_', ' ').title()}",
                    cat.replace("_", " ").title(),
                    f"Avg {num.replace('_', ' ').title()}",
                ),
                "source_columns": [cat, num],
            })
            chart_id += 1

    # Chart 5: Scatter — two numeric columns
    if len(numeric_cols) >= 2:
        col_x, col_y = numeric_cols[0], numeric_cols[1]
        x_vals, y_vals = [], []
        for row in req.sample_rows[:200]:
            xn = _to_number(row.get(col_x))
            yn = _to_number(row.get(col_y))
            if xn is not None and yn is not None:
                x_vals.append(xn)
                y_vals.append(yn)
        if x_vals:
            charts.append({
                "id": f"chart_{chart_id}",
                "title": f"{col_x.replace('_', ' ').title()} vs {col_y.replace('_', ' ').title()}",
                "chart_type": "scatter",
                "description": f"Explores the relationship between {col_x} and {col_y}",
                "plotly_data": [{
                    "type": "scatter",
                    "mode": "markers",
                    "x": x_vals,
                    "y": y_vals,
                    "marker": {"color": CHART_COLORS[3], "size": 8, "opacity": 0.7},
                }],
                "plotly_layout": _make_plotly_layout(
                    f"{col_x.replace('_', ' ').title()} vs {col_y.replace('_', ' ').title()}",
                    col_x.replace("_", " ").title(),
                    col_y.replace("_", " ").title(),
                ),
                "source_columns": [col_x, col_y],
            })
            chart_id += 1

    # Chart 6: Horizontal bar — top values for another combo
    if len(categorical_cols) >= 1 and len(numeric_cols) >= 2:
        cat = categorical_cols[0]
        num = numeric_cols[1] if len(numeric_cols) > 1 else numeric_cols[0]
        # skip if same as chart 1
        if not (charts and charts[0].get("source_columns") == [cat, num]):
            groups = _group_by(req.sample_rows, cat, num)
            if groups:
                sorted_groups = sorted(groups.items(), key=lambda x: -sum(x[1]))[:8]
                labels = [g[0] for g in sorted_groups]
                values = [round(sum(g[1]), 2) for g in sorted_groups]
                charts.append({
                    "id": f"chart_{chart_id}",
                    "title": f"Top {cat.replace('_', ' ').title()} by {num.replace('_', ' ').title()}",
                    "chart_type": "bar",
                    "description": f"Rankings of {cat} by total {num}",
                    "plotly_data": [{
                        "type": "bar",
                        "x": values,
                        "y": labels,
                        "orientation": "h",
                        "marker": {"color": CHART_COLORS[4]},
                    }],
                    "plotly_layout": _make_plotly_layout(
                        f"Top {cat.replace('_', ' ').title()} by {num.replace('_', ' ').title()}",
                        num.replace("_", " ").title(),
                        "",
                    ),
                    "source_columns": [cat, num],
                })
                chart_id += 1

    # Ensure at least 2 charts exist — add a numeric histogram if needed
    if len(charts) < 2 and numeric_cols:
        col = numeric_cols[0]
        vals = _extract_column(req.sample_rows, col)
        if vals:
            charts.append({
                "id": f"chart_{chart_id}",
                "title": f"Distribution of {col.replace('_', ' ').title()}",
                "chart_type": "bar",
                "description": f"Histogram showing the distribution of {col} values",
                "plotly_data": [{
                    "type": "histogram",
                    "x": vals[:500],
                    "marker": {"color": CHART_COLORS[1]},
                    "nbinsx": 20,
                }],
                "plotly_layout": _make_plotly_layout(
                    f"Distribution of {col.replace('_', ' ').title()}",
                    col.replace("_", " ").title(),
                    "Frequency",
                ),
                "source_columns": [col],
            })

    return {
        "dashboard_title": "Data Dashboard",
        "charts": charts[:6],
    }


def heuristic_chat(req: ChatRequest) -> dict:
    """Answer chat questions using basic statistics (no AI needed)."""
    question = req.question.lower()
    numeric_cols = [h for h in req.headers if req.column_meta.get(h, {}).get("type") == "numeric"]
    categorical_cols = [
        h for h in req.headers
        if req.column_meta.get(h, {}).get("type") == "string"
        and req.column_meta.get(h, {}).get("uniqueCount", 0) < 50
    ]

    items = []
    follow_ups = []

    # Check if question mentions a specific column
    mentioned_col = None
    for h in req.headers:
        if h.lower() in question or h.lower().replace("_", " ") in question:
            mentioned_col = h
            break

    # ── "Summary" / "overview" / generic questions ──
    if any(kw in question for kw in ["summary", "overview", "tell me about", "describe", "what is this"]):
        text = f"Your dataset has {req.total_rows:,} records across {len(req.headers)} columns. "
        if numeric_cols:
            col = numeric_cols[0]
            vals = _extract_column(req.sample_rows, col)
            if vals:
                text += f"The {col} column ranges from {min(vals):,.2f} to {max(vals):,.2f} "
                text += f"with an average of {sum(vals)/len(vals):,.2f}. "
        if categorical_cols:
            col = categorical_cols[0]
            unique = req.column_meta.get(col, {}).get("uniqueCount", 0)
            text += f"There are {unique} unique {col} values."
        items.append({"type": "text", "content": text})
        follow_ups = [
            f"What are the top {categorical_cols[0]} values?" if categorical_cols else "What columns are available?",
            f"What is the average {numeric_cols[0]}?" if numeric_cols else "Show me the data distribution",
            "Are there any trends over time?",
        ]

    # ── "Top" / "highest" / "best" / "rank" ──
    elif any(kw in question for kw in ["top", "highest", "best", "most", "rank", "largest", "biggest"]):
        target_col = mentioned_col
        if not target_col and categorical_cols:
            target_col = categorical_cols[0]
        if target_col and target_col in categorical_cols and numeric_cols:
            num = numeric_cols[0]
            groups = _group_by(req.sample_rows, target_col, num)
            if groups:
                sorted_g = sorted(groups.items(), key=lambda x: -sum(x[1]))[:10]
                table_headers = [target_col, f"Total {num}", "Count"]
                table_rows = [[g[0], f"{sum(g[1]):,.2f}", str(len(g[1]))] for g in sorted_g]
                text = f"Here are the top {target_col} values ranked by total {num}. "
                text += f"{sorted_g[0][0]} leads with a total of {sum(sorted_g[0][1]):,.2f}."
                items.append({"type": "text", "content": text})
                items.append({"type": "table", "table_data": {"headers": table_headers, "rows": table_rows}})
                # Bar chart
                items.append({"type": "chart", "chart_spec": {
                    "title": f"Top {target_col} by {num}",
                    "plotly_data": [{
                        "type": "bar",
                        "x": [g[0] for g in sorted_g],
                        "y": [round(sum(g[1]), 2) for g in sorted_g],
                        "marker": {"color": CHART_COLORS[0]},
                    }],
                    "plotly_layout": _make_plotly_layout(
                        f"Top {target_col} by {num}",
                        target_col, num
                    ),
                }})
            else:
                items.append({"type": "text", "content": f"I couldn't find grouped data for {target_col}."})
        elif target_col and numeric_cols:
            vals = _extract_column(req.sample_rows, target_col if target_col in numeric_cols else numeric_cols[0])
            col_name = target_col if target_col in numeric_cols else numeric_cols[0]
            if vals:
                top_vals = sorted(vals, reverse=True)[:10]
                text = f"The highest {col_name} values are: {', '.join(f'{v:,.2f}' for v in top_vals[:5])}."
                items.append({"type": "text", "content": text})
            else:
                items.append({"type": "text", "content": "I couldn't extract numeric data for that column."})
        else:
            items.append({"type": "text", "content": "I couldn't determine which column to rank. Try asking about a specific column."})
        follow_ups = [
            f"What about the bottom {categorical_cols[0]} values?" if categorical_cols else "Show me the data distribution",
            f"How does {numeric_cols[0]} compare across categories?" if numeric_cols and categorical_cols else "Show me a summary",
            "What is the overall trend?",
        ]

    # ── "Average" / "mean" / "typical" ──
    elif any(kw in question for kw in ["average", "mean", "typical", "avg"]):
        target = mentioned_col if mentioned_col and mentioned_col in numeric_cols else (numeric_cols[0] if numeric_cols else None)
        if target:
            vals = _extract_column(req.sample_rows, target)
            if vals:
                avg = sum(vals) / len(vals)
                med = _median(vals)
                std = _std(vals)
                text = (
                    f"The average {target} is {avg:,.2f}. "
                    f"The median is {med:,.2f} and the standard deviation is {std:,.2f}. "
                    f"Based on {len(vals):,} data points."
                )
                items.append({"type": "text", "content": text})
            else:
                items.append({"type": "text", "content": f"No numeric data found for {target}."})
        else:
            items.append({"type": "text", "content": "No numeric columns found to calculate an average."})
        follow_ups = [
            f"What is the maximum {target}?" if target else "Show me the data summary",
            "How does this break down by category?",
            "Is there a trend over time?",
        ]

    # ── "Trend" / "over time" / "growth" ──
    elif any(kw in question for kw in ["trend", "over time", "growth", "change", "time series", "timeline"]):
        time_col = _detect_time_column(req.column_meta)
        target = mentioned_col if mentioned_col and mentioned_col in numeric_cols else (numeric_cols[0] if numeric_cols else None)
        if time_col and target:
            ts: dict[str, float] = {}
            for row in req.sample_rows:
                dv = str(row.get(time_col, "")).strip()
                if not dv:
                    continue
                n = _to_number(row.get(target))
                if n is not None:
                    ts[dv] = ts.get(dv, 0) + n
            if ts:
                sorted_ts = sorted(ts.items())[:30]
                x_vals = [t[0] for t in sorted_ts]
                y_vals = [round(t[1], 2) for t in sorted_ts]
                first_val = y_vals[0] if y_vals else 0
                last_val = y_vals[-1] if y_vals else 0
                direction = "increased" if last_val > first_val else "decreased"
                text = (
                    f"{target} has {direction} over the period. "
                    f"It started at {first_val:,.2f} and the most recent value is {last_val:,.2f}."
                )
                items.append({"type": "text", "content": text})
                items.append({"type": "chart", "chart_spec": {
                    "title": f"{target} Over Time",
                    "plotly_data": [{
                        "type": "scatter",
                        "mode": "lines+markers",
                        "x": x_vals,
                        "y": y_vals,
                        "line": {"color": CHART_COLORS[0], "width": 2},
                    }],
                    "plotly_layout": _make_plotly_layout(f"{target} Over Time", time_col, target),
                }})
            else:
                items.append({"type": "text", "content": "Couldn't build a time series from the available data."})
        else:
            items.append({"type": "text", "content": "No time column detected in the dataset to analyze trends."})
        follow_ups = [
            "What is the overall average?",
            f"Which {categorical_cols[0]} is growing fastest?" if categorical_cols else "Show me a summary",
            "What was the peak value?",
        ]

    # ── "Compare" / "breakdown" / "by" / "distribution" ──
    elif any(kw in question for kw in ["compare", "breakdown", "by", "distribution", "split", "across", "between"]):
        cat = None
        for c in categorical_cols:
            if c.lower() in question or c.lower().replace("_", " ") in question:
                cat = c
                break
        if not cat and categorical_cols:
            cat = categorical_cols[0]
        num = mentioned_col if mentioned_col and mentioned_col in numeric_cols else (numeric_cols[0] if numeric_cols else None)
        if cat and num:
            groups = _group_by(req.sample_rows, cat, num)
            if groups:
                sorted_g = sorted(groups.items(), key=lambda x: -sum(x[1]))[:10]
                text = f"Here's how {num} breaks down by {cat}. "
                text += f"The highest is {sorted_g[0][0]} with {sum(sorted_g[0][1]):,.2f} total."
                items.append({"type": "text", "content": text})
                items.append({"type": "chart", "chart_spec": {
                    "title": f"{num} by {cat}",
                    "plotly_data": [{
                        "type": "bar",
                        "x": [g[0] for g in sorted_g],
                        "y": [round(sum(g[1]), 2) for g in sorted_g],
                        "marker": {"color": CHART_COLORS[0]},
                    }],
                    "plotly_layout": _make_plotly_layout(f"{num} by {cat}", cat, num),
                }})
            else:
                items.append({"type": "text", "content": f"No grouped data found for {cat} and {num}."})
        else:
            items.append({"type": "text", "content": "I need both a category and a numeric column to compare. Try specifying column names."})
        follow_ups = [
            f"What are the top {cat} values?" if cat else "Show me a summary",
            f"What is the trend of {num} over time?" if num else "What columns are available?",
            "Show me the data distribution",
        ]

    # ── "Count" / "how many" ──
    elif any(kw in question for kw in ["count", "how many", "number of", "total records"]):
        if mentioned_col and mentioned_col in categorical_cols:
            counts: dict[str, int] = {}
            for row in req.sample_rows:
                val = str(row.get(mentioned_col, "")).strip()
                if val and val.lower() not in ("none", "null", "nan", ""):
                    counts[val] = counts.get(val, 0) + 1
            sorted_c = sorted(counts.items(), key=lambda x: -x[1])[:15]
            text = f"There are {len(counts)} unique {mentioned_col} values across {req.total_rows:,} records. "
            if sorted_c:
                text += f"The most common is '{sorted_c[0][0]}' with {sorted_c[0][1]} occurrences."
            items.append({"type": "text", "content": text})
            if sorted_c:
                items.append({"type": "table", "table_data": {
                    "headers": [mentioned_col, "Count"],
                    "rows": [[c[0], str(c[1])] for c in sorted_c],
                }})
        else:
            text = f"The dataset has {req.total_rows:,} total records with {len(req.headers)} columns."
            items.append({"type": "text", "content": text})
        follow_ups = [
            "Show me the data distribution",
            f"What is the average {numeric_cols[0]}?" if numeric_cols else "Show me a summary",
            "Which category has the most records?",
        ]

    # ── "Column" / "what columns" / "fields" ──
    elif any(kw in question for kw in ["column", "field", "what data", "available", "what can"]):
        col_lines = []
        for h in req.headers:
            meta = req.column_meta.get(h, {})
            col_lines.append(f"- **{h}**: {meta.get('type', 'unknown')} ({meta.get('uniqueCount', 0)} unique values)")
        text = f"Your dataset has {len(req.headers)} columns:\n\n" + "\n".join(col_lines)
        items.append({"type": "text", "content": text})
        follow_ups = [
            "Give me a summary of the data",
            f"What is the average {numeric_cols[0]}?" if numeric_cols else "How many records are there?",
            "Show me the top values",
        ]

    # ── Default / general question ──
    else:
        text = f"Here's a quick overview of your data: {req.total_rows:,} records across {len(req.headers)} columns. "
        if numeric_cols:
            col = numeric_cols[0]
            vals = _extract_column(req.sample_rows, col)
            if vals:
                text += f"The {col} ranges from {min(vals):,.2f} to {max(vals):,.2f} (average: {sum(vals)/len(vals):,.2f}). "
        if categorical_cols:
            col = categorical_cols[0]
            unique = req.column_meta.get(col, {}).get("uniqueCount", 0)
            text += f"There are {unique} unique {col} categories."

        items.append({"type": "text", "content": text})

        # Add a table with basic stats for numeric columns
        if numeric_cols:
            table_headers = ["Column", "Min", "Max", "Average", "Count"]
            table_rows = []
            for col in numeric_cols[:10]:
                vals = _extract_column(req.sample_rows, col)
                if vals:
                    table_rows.append([
                        col,
                        f"{min(vals):,.2f}",
                        f"{max(vals):,.2f}",
                        f"{sum(vals)/len(vals):,.2f}",
                        str(len(vals)),
                    ])
            if table_rows:
                items.append({"type": "table", "table_data": {"headers": table_headers, "rows": table_rows}})

        follow_ups = [
            "Show me the top categories" if categorical_cols else "What columns are available?",
            f"What is the trend of {numeric_cols[0]} over time?" if numeric_cols else "Give me a summary",
            "How does the data break down by category?",
        ]

    if not items:
        items.append({"type": "text", "content": "I analyzed your question but couldn't find specific data to answer it. Try asking about trends, averages, comparisons, or top values."})
        follow_ups = ["Give me a summary", "What columns are available?", "Show me the top values"]

    return {"items": items, "follow_ups": follow_ups[:3]}


# ── Gemini API Call (zero external dependencies) ─────────────────────────────


def _http_post(url: str, payload: dict, headers: dict) -> dict:
    """Make an HTTP POST request and return parsed JSON."""
    req_data = json.dumps(payload).encode("utf-8")
    http_req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
    with urllib.request.urlopen(http_req, timeout=55) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _call_groq(system_prompt: str, user_message: str) -> str:
    """Call Groq API, return raw text response."""
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        "max_tokens": 4096,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GROQ_API_KEY}",
    }
    body = _http_post(GROQ_URL, payload, headers)
    return body["choices"][0]["message"]["content"]


def _call_gemini(system_prompt: str, user_message: str) -> str:
    """Call Gemini API with model fallback, return raw text response."""
    payload = {
        "contents": [{"role": "user", "parts": [{"text": user_message}]}],
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }
    headers = {"Content-Type": "application/json"}

    for model in GEMINI_MODELS:
        try:
            url = f"{GEMINI_BASE}/{model}:generateContent?key={GEMINI_API_KEY}"
            body = _http_post(url, payload, headers)
            return body["candidates"][0]["content"]["parts"][0]["text"]
        except urllib.error.HTTPError as e:
            if e.code == 404:
                continue  # Try next model
            raise
    raise Exception("All Gemini models failed")


def _parse_ai_text(text: str) -> dict:
    """Parse AI response text into JSON dict."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3]
        elif "```" in text:
            text = text[: text.rfind("```")]
    return json.loads(text.strip())


def call_ai(system_prompt: str, user_message: str) -> dict | None:
    """Call AI with auto-provider detection, retry, and fallback.
    Returns None if all providers fail (caller should use heuristics)."""
    providers = []
    if GROQ_API_KEY:
        providers.append(("Groq", _call_groq))
    if GEMINI_API_KEY:
        providers.append(("Gemini", _call_gemini))

    if not providers:
        return None  # No providers — use heuristics

    for provider_name, provider_fn in providers:
        for attempt in range(3):
            try:
                raw_text = provider_fn(system_prompt, user_message)
                return _parse_ai_text(raw_text)
            except urllib.error.HTTPError as e:
                try:
                    e.read()
                except Exception:
                    pass
                if e.code == 429:
                    time.sleep(2 * (attempt + 1))
                    continue
                else:
                    break  # Try next provider
            except urllib.error.URLError:
                break
            except json.JSONDecodeError:
                if attempt < 2:
                    time.sleep(1)
                    continue
                break
            except (KeyError, IndexError):
                break
            except Exception:
                break

    return None  # All providers failed — use heuristics


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
        if result is not None:
            return result

        # AI unavailable — use heuristic analysis
        return heuristic_analyze(req)
    except HTTPException:
        raise
    except Exception:
        # Even if something crashes, try heuristics as last resort
        try:
            return heuristic_analyze(req)
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
        if result is not None:
            result["kpi_cards"] = kpi_cards
            return result

        # AI unavailable — use heuristic dashboard
        result = heuristic_dashboard(req)
        result["kpi_cards"] = kpi_cards
        return result
    except HTTPException:
        raise
    except Exception:
        try:
            kpi_cards = compute_kpis(req.sample_rows, req.confirmed_kpis, req.time_column)
            result = heuristic_dashboard(req)
            result["kpi_cards"] = kpi_cards
            return result
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
        if result is not None:
            return result

        # AI unavailable — use heuristic chat
        return heuristic_chat(req)
    except HTTPException:
        raise
    except Exception:
        try:
            return heuristic_chat(req)
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="I couldn't process your question right now. Please try again.",
            )


@app.get("/api/health")
async def health():
    providers = []
    if GROQ_API_KEY:
        providers.append("groq")
    if GEMINI_API_KEY:
        providers.append("gemini")
    return {
        "status": "ok",
        "providers": providers or ["none (using built-in heuristics)"],
        "fallback": "heuristic analysis always available",
    }
