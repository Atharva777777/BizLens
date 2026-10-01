"""
BizLens Backend — Analytics API Router.

Exposes the deterministic MetricsEngine, InsightsEngine, and VerificationEngine
through authenticated HTTP endpoints.  All calculations are performed by the
respective engines; this router is a thin HTTP layer that enforces authentication
and file ownership, then delegates.

Architecture:
  ANALYTICS COMPUTES     ← MetricsEngine (/{file_id})
  LLM EXPLAINS           ← GeminiService (/{file_id}/brief)
  VERIFICATION VALIDATES ← VerificationEngine (/{file_id}/verify, /{file_id}/verification)
  EVIDENCE PROVES        ← NormalizedFact (/{file_id}/evidence/{canonical_name})
"""

import uuid
import logging

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import AuthenticatedUser, DbSession
from app.modules.analytics.insights import InsightsEngine
from app.modules.analytics.metrics import MetricsEngine
from app.modules.analytics.models import VerificationRecord
from app.modules.analytics.schemas import (
    AIBusinessBriefResponse,
    FileInsightsResponse,
    FileMetricsResponse,
    InsightResponse,
    NormalizedFactResponse,
    VerificationRecordResponse,
)
from app.modules.analytics.verification import VerificationEngine
from app.modules.ingestion.models import FileRecord
from app.shared.enums import ProcessingStatus

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Analytics"])


def _get_completed_file(
    file_id: uuid.UUID,
    user_id: str,
    db: DbSession,
) -> FileRecord:
    """
    Shared ownership + status guard used by all analytics endpoints.

    Returns the FileRecord when:
      - It exists AND belongs to the authenticated user.
      - Its processing status is COMPLETED.

    Raises:
      HTTP 404 — file does not exist or belongs to a different user.
      HTTP 409 — file exists and is owned by the user but is not yet COMPLETED.
    """
    record = (
        db.query(FileRecord)
        .filter(FileRecord.id == file_id, FileRecord.owner_id == user_id)
        .first()
    )

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found.",
        )

    if record.status != ProcessingStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"File is not ready for analysis. "
                f"Current status: {record.status}. "
                "Analytics are available only after processing completes."
            ),
        )

    return record


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/{file_id}
# ---------------------------------------------------------------------------

@router.get("/{file_id}", response_model=FileMetricsResponse)
def get_file_metrics(
    file_id: uuid.UUID,
    user_id: AuthenticatedUser,
    db: DbSession,
) -> FileMetricsResponse:
    """
    Return deterministic business metrics for a completed file.

    Metrics are calculated exclusively by MetricsEngine from NormalizedFact
    records.  No LLM or heuristic is involved.

    Returns:
        FileMetricsResponse with revenue, expense, profit, and margin.

    Raises:
        401 — missing or invalid JWT.
        404 — file not found or belongs to a different user.
        409 — file exists but has not finished processing.
    """
    _get_completed_file(file_id, user_id, db)

    engine = MetricsEngine(db, file_id)
    result = engine.calculate()

    logger.info(
        "Metrics calculated for file_id=%s user_id=%s revenue=%.2f expense=%.2f",
        file_id,
        user_id,
        result.total_revenue,
        result.total_expense,
    )

    return FileMetricsResponse.model_validate(result)


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/{file_id}/evidence/{canonical_name}
# ---------------------------------------------------------------------------

@router.get(
    "/{file_id}/evidence/{canonical_name}",
    response_model=list[NormalizedFactResponse],
)
def get_contributing_facts(
    file_id: uuid.UUID,
    canonical_name: str,
    user_id: AuthenticatedUser,
    db: DbSession,
) -> list[NormalizedFactResponse]:
    """
    Return the individual NormalizedFact records that contribute to a metric.

    This provides full provenance tracing: each fact carries its source row
    number and the UUID of the ExtractedRow that contains the original CSV data.

    Currently supported canonical_name values: "revenue", "expense".
    For an unrecognised canonical_name the query finds no facts and returns [].

    Returns:
        List of NormalizedFactResponse (may be empty).

    Raises:
        401 — missing or invalid JWT.
        404 — file not found or belongs to a different user.
        409 — file exists but has not finished processing.
    """
    _get_completed_file(file_id, user_id, db)

    engine = MetricsEngine(db, file_id)
    facts = engine.get_contributing_facts_query(canonical_name).all()

    logger.info(
        "Evidence query: file_id=%s canonical_name=%s facts_returned=%d",
        file_id,
        canonical_name,
        len(facts),
    )

    return [NormalizedFactResponse.model_validate(f) for f in facts]


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/{file_id}/insights  (Phase 3A)
# ---------------------------------------------------------------------------

@router.get("/{file_id}/insights", response_model=FileInsightsResponse)
def get_file_insights(
    file_id: uuid.UUID,
    user_id: AuthenticatedUser,
    db: DbSession,
) -> FileInsightsResponse:
    """
    Return deterministic business insights for a completed file.

    Insights are generated by InsightsEngine from MetricsEngine output.
    No LLM is involved — all observations are template-driven and reproducible.

    Returns:
        FileInsightsResponse containing the file_id and a list of insights.

    Raises:
        401 — missing or invalid JWT.
        404 — file not found or belongs to a different user.
        409 — file not yet COMPLETED.
    """
    _get_completed_file(file_id, user_id, db)

    metrics_result = MetricsEngine(db, file_id).calculate()
    insights = InsightsEngine(metrics_result).generate()

    logger.info(
        "Insights generated for file_id=%s user_id=%s count=%d",
        file_id,
        user_id,
        len(insights),
    )

    return FileInsightsResponse(
        file_id=file_id,
        insights=[InsightResponse(**vars(i)) for i in insights],
    )


# ---------------------------------------------------------------------------
# POST /api/v1/analytics/{file_id}/verify  (Phase 3B — triggers verification)
# ---------------------------------------------------------------------------

@router.post("/{file_id}/verify", response_model=list[VerificationRecordResponse])
def run_verification(
    file_id: uuid.UUID,
    user_id: AuthenticatedUser,
    db: DbSession,
) -> list[VerificationRecordResponse]:
    """
    Run the VerificationEngine for a completed file and return the results.

    This endpoint:
      1. Generates insights from MetricsEngine output (same as /insights).
      2. Runs VerificationEngine, which independently re-queries NormalizedFact.
      3. Replaces any existing VerificationRecord rows for this file.
      4. Persists and returns the new verification records.

    The operation is idempotent: calling it multiple times produces the same
    result without accumulating duplicate records.

    Returns:
        List of VerificationRecordResponse.

    Raises:
        401 — missing or invalid JWT.
        404 — file not found or belongs to a different user.
        409 — file not yet COMPLETED.
    """
    _get_completed_file(file_id, user_id, db)

    metrics_result = MetricsEngine(db, file_id).calculate()
    insights = InsightsEngine(metrics_result).generate()

    verification_engine = VerificationEngine(db, file_id)
    records = verification_engine.verify_all(insights)
    db.commit()

    logger.info(
        "Verification run for file_id=%s user_id=%s records=%d",
        file_id,
        user_id,
        len(records),
    )

    # Refresh so created_at and id are populated from the DB.
    for r in records:
        db.refresh(r)

    return [VerificationRecordResponse.model_validate(r) for r in records]


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/{file_id}/verification  (Phase 3B — read-only)
# ---------------------------------------------------------------------------

@router.get("/{file_id}/verification", response_model=list[VerificationRecordResponse])
def get_verification_records(
    file_id: uuid.UUID,
    user_id: AuthenticatedUser,
    db: DbSession,
) -> list[VerificationRecordResponse]:
    """
    Return previously persisted VerificationRecord rows for a completed file.

    Does NOT recompute — returns whatever was last stored by the /verify endpoint.
    Returns an empty list if no verification has been run yet.

    Returns:
        List of VerificationRecordResponse (may be empty).

    Raises:
        401 — missing or invalid JWT.
        404 — file not found or belongs to a different user.
        409 — file not yet COMPLETED.
    """
    _get_completed_file(file_id, user_id, db)

    records = (
        db.query(VerificationRecord)
        .filter(VerificationRecord.file_id == file_id)
        .order_by(VerificationRecord.created_at)
        .all()
    )

    logger.info(
        "Verification GET for file_id=%s user_id=%s records=%d",
        file_id,
        user_id,
        len(records),
    )

    return [VerificationRecordResponse.model_validate(r) for r in records]


# ---------------------------------------------------------------------------
# POST /api/v1/analytics/{file_id}/brief  (Phase 5 — AI Business Brief)
# ---------------------------------------------------------------------------

@router.post("/{file_id}/brief", response_model=AIBusinessBriefResponse)
def generate_ai_brief(
    file_id: uuid.UUID,
    user_id: AuthenticatedUser,
    db: DbSession,
) -> AIBusinessBriefResponse:
    """
    Generate an AI Business Brief for a completed file.

    Architecture:
      1. Validates authentication and file ownership.
      2. Runs MetricsEngine and InsightsEngine (deterministic, no LLM).
      3. Reads persisted VerificationRecord rows (read-only, no mutation).
      4. Assembles a controlled BizLensAnalyticsContext (no raw DB objects).
      5. Calls the Gemini service with that context.
      6. Validates the structured response with Pydantic.
      7. Returns AIBusinessBriefResponse.

    Gemini NEVER accesses the database directly.
    Verification records are NOT mutated by this endpoint.
    The GEMINI_API_KEY is NEVER returned to the frontend.

    Returns:
        AIBusinessBriefResponse — validated AI-generated business brief.

    Raises:
        401 — missing or invalid JWT.
        404 — file not found or belongs to a different user.
        409 — file not yet COMPLETED.
        503 — GEMINI_API_KEY is not configured.
        502 — Gemini API call failed or returned an invalid response.
    """
    from app.services.ai.gemini import (
        BizLensAnalyticsContext,
        InsightContext,
        MetricContext,
        VerificationContext,
        GeminiConfigError,
        GeminiAPIError,
        GeminiParseError,
        generate_business_brief,
    )

    file_record = _get_completed_file(file_id, user_id, db)

    # 1. Deterministic analytics
    metrics = MetricsEngine(db, file_id).calculate()
    insights = InsightsEngine(metrics).generate()

    # 2. Persisted verification records (read-only, no mutation)
    verification_records = (
        db.query(VerificationRecord)
        .filter(VerificationRecord.file_id == file_id)
        .order_by(VerificationRecord.created_at)
        .all()
    )

    # 3. Build controlled context — no raw DB objects reach Gemini
    metric_list: list[MetricContext] = []
    if metrics.revenue_fact_count > 0:
        metric_list.append(MetricContext(name="total_revenue", label="Total Revenue", value=metrics.total_revenue, unit=None))
    if metrics.expense_fact_count > 0:
        metric_list.append(MetricContext(name="total_expense", label="Total Expense", value=metrics.total_expense, unit=None))
    if metrics.revenue_fact_count > 0 and metrics.expense_fact_count > 0:
        metric_list.append(MetricContext(name="net_profit", label="Net Profit", value=metrics.net_profit, unit=None))
    if metrics.operating_margin is not None:
        metric_list.append(MetricContext(name="operating_margin", label="Operating Margin", value=metrics.operating_margin, unit="%"))

    ctx = BizLensAnalyticsContext(
        filename=file_record.original_filename,
        metrics=metric_list,
        insights=[InsightContext(metric=i.metric, label=i.label, observation=i.observation, supporting_value=i.supporting_value) for i in insights],
        verifications=[VerificationContext(metric=v.metric, status=v.status, claimed_value=v.claimed_value, verified_value=v.verified_value) for v in verification_records],
        revenue_fact_count=metrics.revenue_fact_count,
        expense_fact_count=metrics.expense_fact_count,
    )

       # 4. Call Gemini (server-side only)
    try:
        brief = generate_business_brief(ctx)

    except GeminiConfigError as exc:
        logger.warning("Gemini not configured: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI analysis is not configured.",
        )

    except (GeminiAPIError, GeminiParseError) as exc:
        logger.error(
            "Gemini service error for file_id=%s: %s",
            file_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI analysis is temporarily unavailable.",
        )

    logger.info("AI brief generated for file_id=%s user_id=%s", file_id, user_id)

    return AIBusinessBriefResponse(
        executive_summary=brief.executive_summary,
        key_takeaways=brief.key_takeaways,
        needs_attention=brief.needs_attention,
        decision_context=brief.decision_context,
    )

