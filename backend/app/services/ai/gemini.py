"""
BizLens Backend — Gemini AI Service.

Architecture:
  ANALYTICS COMPUTES   ← MetricsEngine
  LLM EXPLAINS         ← this module
  VERIFICATION VALIDATES ← VerificationEngine
  EVIDENCE PROVES      ← NormalizedFact records

Gemini receives ONLY a controlled, pre-computed context assembled from
deterministic BizLens analytics output.  It never accesses the database,
never receives secrets, and never becomes the source of numerical truth.

The service validates all Gemini output with Pydantic before returning it.
Malformed or missing AI output raises a controlled GeminiServiceError.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Error types
# ---------------------------------------------------------------------------


class GeminiServiceError(Exception):
    """Raised for any Gemini-layer failure (config, API, parsing)."""


class GeminiConfigError(GeminiServiceError):
    """Raised when the GEMINI_API_KEY environment variable is missing."""


class GeminiAPIError(GeminiServiceError):
    """Raised when the Gemini API returns an error or times out."""


class GeminiParseError(GeminiServiceError):
    """Raised when the Gemini response cannot be validated as an AIBusinessBrief."""


# ---------------------------------------------------------------------------
# Context data-classes — structured input to Gemini (never raw DB objects)
# ---------------------------------------------------------------------------


@dataclass
class MetricContext:
    name: str
    label: str
    value: float
    unit: str  # e.g. "USD", "%"


@dataclass
class InsightContext:
    metric: str
    label: str
    observation: str
    supporting_value: Optional[float]


@dataclass
class VerificationContext:
    metric: str
    status: str           # VERIFIED / NEEDS_REVIEW / UNABLE_TO_VERIFY
    claimed_value: float
    verified_value: float


@dataclass
class BizLensAnalyticsContext:
    """
    The ONLY thing Gemini ever sees.

    Assembled exclusively from deterministic engine output; no raw DB rows,
    no user PII, no credentials.
    """

    filename: str
    metrics: list[MetricContext]
    insights: list[InsightContext]
    verifications: list[VerificationContext]
    revenue_fact_count: int
    expense_fact_count: int


# ---------------------------------------------------------------------------
# AI Business Brief schema (Pydantic) — mirrors AIBusinessBriefResponse
# ---------------------------------------------------------------------------

from pydantic import BaseModel, field_validator  # noqa: E402


class AIBusinessBrief(BaseModel):
    """Validated structured output from Gemini."""

    executive_summary: str
    key_takeaways: list[str]
    needs_attention: list[str]
    decision_context: str

    @field_validator("executive_summary", "decision_context")
    @classmethod
    def must_be_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Field must not be blank")
        return v.strip()

    @field_validator("key_takeaways", "needs_attention")
    @classmethod
    def must_have_items(cls, v: list[str]) -> list[str]:
        cleaned = [item.strip() for item in v if item.strip()]
        if not cleaned:
            raise ValueError("List must contain at least one non-empty item")
        return cleaned


# ---------------------------------------------------------------------------
# Prompt builder — converts BizLensAnalyticsContext → prompt string
# ---------------------------------------------------------------------------


def _build_prompt(ctx: BizLensAnalyticsContext) -> str:
    """
    Construct the controlled Gemini prompt from deterministic context.

    The prompt instructs Gemini to act as a business analyst explaining
    the analytics in plain language.  It explicitly prohibits Gemini from
    inventing numbers, trends, or evidence.
    """
    lines: list[str] = [
        "You are a business intelligence assistant.",
        "Below is deterministic financial analytics extracted from a business dataset.",
        "Your task is to explain what this data means in plain business language.",
        "",
        "STRICT RULES:",
        "- Do NOT invent numbers, percentages, or trends not shown below.",
        "- Do NOT make up evidence, citations, or comparisons.",
        "- Do NOT claim information about time periods or history unless stated.",
        "- Base all statements solely on the provided data.",
        "- If data is insufficient, say so honestly in the executive summary.",
        "",
        f"DATASET: {ctx.filename}",
        f"Revenue records: {ctx.revenue_fact_count}",
        f"Expense records: {ctx.expense_fact_count}",
        "",
        "METRICS:",
    ]

    for m in ctx.metrics:
        lines.append(f"  {m.label}: {m.value:,.2f} {m.unit}")

    if ctx.insights:
        lines.append("")
        lines.append("DETERMINISTIC INSIGHTS:")
        for ins in ctx.insights:
            lines.append(f"  [{ins.label}] {ins.observation}")

    if ctx.verifications:
        lines.append("")
        lines.append("VERIFICATION RESULTS:")
        for v in ctx.verifications:
            lines.append(
                f"  {v.metric}: claimed={v.claimed_value:,.2f}, "
                f"verified={v.verified_value:,.2f}, status={v.status}"
            )

    lines.extend([
        "",
        "Respond ONLY with a JSON object matching this exact schema (no markdown, no code fences):",
        '{',
        '  "executive_summary": "<2-4 sentence summary of the business financial position>",',
        '  "key_takeaways": ["<concise finding 1>", "<concise finding 2>", ...],',
        '  "needs_attention": ["<area needing attention 1>", ...],',
        '  "decision_context": "<1-2 sentences on what a decision-maker should consider>"',
        '}',
    ])

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Gemini service
# ---------------------------------------------------------------------------


def generate_business_brief(ctx: BizLensAnalyticsContext) -> AIBusinessBrief:
    """
    Call Gemini with a controlled context and return a validated AIBusinessBrief.

    Raises:
        GeminiConfigError   — GEMINI_API_KEY is missing or blank.
        GeminiAPIError      — Gemini SDK raised an exception (network, quota, etc.).
        GeminiParseError    — Response was not valid JSON or failed Pydantic validation.
    """
    try:
        from google import genai
        from google.genai import types  # type: ignore[import-not-found]
    except ImportError as exc:
        raise GeminiConfigError(
            "google-genai package is not installed. "
            "Run: pip install google-genai"
        ) from exc

    from app.core.config import settings  # local import to avoid circular deps

    api_key: str = getattr(settings, "gemini_api_key", "")
    if not api_key:
        raise GeminiConfigError(
            "GEMINI_API_KEY is not configured. "
            "Set the GEMINI_API_KEY environment variable on the backend."
        )

    client = genai.Client(api_key=api_key)    

    prompt = _build_prompt(ctx)

    logger.info(
        "Calling Gemini for file=%s metrics=%d insights=%d verifications=%d",
        ctx.filename,
        len(ctx.metrics),
        len(ctx.insights),
        len(ctx.verifications),
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=1024,
                response_mime_type="application/json",
                response_schema=AIBusinessBrief,
            ),
        )
    except Exception as exc:
        logger.error("Gemini API call failed: %s", exc)
        raise GeminiAPIError(f"Gemini API request failed: {exc}") from exc

    raw_text = ""
    try:
        raw_text = response.text
    except Exception as exc:
        raise GeminiAPIError(f"Could not read Gemini response text: {exc}") from exc

    # Strip markdown code fences if Gemini added them despite instructions
    text = raw_text.strip()
    if text.startswith("```"):
        text = "\n".join(text.split("\n")[1:])
        text = text.rstrip("`").strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("Gemini returned non-JSON: %s", raw_text[:300])
        raise GeminiParseError(
            f"Gemini response was not valid JSON: {exc}"
        ) from exc

    try:
        brief = AIBusinessBrief.model_validate(data)
    except Exception as exc:
        logger.error("Gemini response failed Pydantic validation: %s", data)
        raise GeminiParseError(
            f"Gemini response failed schema validation: {exc}"
        ) from exc

    logger.info("Gemini brief generated successfully for file=%s", ctx.filename)
    return brief
