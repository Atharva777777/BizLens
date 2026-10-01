"""
BizLens Backend — Tests for POST /api/v1/analytics/{file_id}/brief (Phase 5).

All tests mock the Gemini service — the real API is NEVER called.
Tests cover:
  - authenticated request succeeds
  - unauthenticated request returns 401
  - ownership isolation (other user's file → 404)
  - nonexistent file → 404
  - incomplete (PENDING) file → 409
  - missing GEMINI_API_KEY → 503
  - Gemini API failure → 502
  - malformed Gemini JSON response → 502
  - Pydantic validation failure (invalid schema) → 502
  - successful response structure
  - zero facts (no revenue, no expense) — still returns brief
  - verification records are NOT mutated
"""

from __future__ import annotations

import uuid
from datetime import date
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.dependencies import get_current_user_id, get_db
from app.core.database import Base
from app.main import app
from app.modules.analytics.models import VerificationRecord
from app.modules.ingestion.models import ExtractedRow, FileRecord, NormalizedFact
from app.services.ai.gemini import (
    AIBusinessBrief,
    GeminiAPIError,
    GeminiConfigError,
    GeminiParseError,
)
from app.shared.enums import ProcessingStatus, VerificationStatus

# ---------------------------------------------------------------------------
# SQLite in-memory engine
# ---------------------------------------------------------------------------

_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


@pytest.fixture(scope="module", autouse=True)
def _create_tables():
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture()
def db_session():
    db = _TestingSessionLocal()
    db.query(VerificationRecord).delete()
    db.query(NormalizedFact).delete()
    db.query(ExtractedRow).delete()
    db.query(FileRecord).delete()
    db.commit()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_OWNER = "brief-owner-abc"
_OTHER = "brief-other-xyz"

_GOOD_BRIEF = AIBusinessBrief(
    executive_summary="The business is profitable with strong margins.",
    key_takeaways=["Revenue exceeds expenses.", "Operating margin is healthy."],
    needs_attention=["No historical comparison available."],
    decision_context="Consider this dataset as a snapshot for the current period.",
)


def _make_file(db, owner=_OWNER, status=ProcessingStatus.COMPLETED) -> FileRecord:
    f = FileRecord(
        id=uuid.uuid4(),
        owner_id=owner,
        original_filename="report.csv",
        storage_path=f"{owner}/{uuid.uuid4()}/report.csv",
        file_type="csv",
        mime_type="text/csv",
        file_size=1024,
        status=status,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _make_fact(db, file_id, canonical_name, value, row_num=1):
    row = ExtractedRow(file_id=file_id, row_number=row_num, row_data={})
    db.add(row)
    db.commit()
    fact = NormalizedFact(
        file_id=file_id,
        extracted_row_id=row.id,
        row_number=row_num,
        canonical_name=canonical_name,
        value_numeric=value,
        date_value=date(2024, 1, min(row_num, 28)),
        category="Test",
    )
    db.add(fact)
    db.commit()
    return fact


def _make_verification(db, file_id, metric="revenue", status=VerificationStatus.VERIFIED):
    v = VerificationRecord(
        file_id=file_id,
        metric=metric,
        claimed_value=10000.0,
        verified_value=10000.0,
        status=status,
        fact_count=1,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


# ---------------------------------------------------------------------------
# Fixtures — TestClient
# ---------------------------------------------------------------------------


@pytest.fixture()
def authed_client(db_session):
    app.dependency_overrides[get_current_user_id] = lambda: _OWNER
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def unauthed_client():
    app.dependency_overrides.clear()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Convenience
# ---------------------------------------------------------------------------

_BRIEF_URL = "/api/v1/analytics/{file_id}/brief"

_PATCH_TARGET = "app.services.ai.gemini.generate_business_brief"


# ---------------------------------------------------------------------------
# 1. Unauthenticated → 401
# ---------------------------------------------------------------------------


def test_brief_unauthenticated_returns_401(unauthed_client):
    r = unauthed_client.post(_BRIEF_URL.format(file_id=uuid.uuid4()))
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# 2. Nonexistent file → 404
# ---------------------------------------------------------------------------


def test_brief_nonexistent_file_returns_404(authed_client, db_session):
    with patch(_PATCH_TARGET, return_value=_GOOD_BRIEF):
        r = authed_client.post(_BRIEF_URL.format(file_id=uuid.uuid4()))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 3. Other user's file → 404 (ownership isolation)
# ---------------------------------------------------------------------------


def test_brief_other_owners_file_returns_404(authed_client, db_session):
    other_file = _make_file(db_session, owner=_OTHER)
    with patch(_PATCH_TARGET, return_value=_GOOD_BRIEF):
        r = authed_client.post(_BRIEF_URL.format(file_id=other_file.id))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 4. Incomplete (PENDING) file → 409
# ---------------------------------------------------------------------------


def test_brief_pending_file_returns_409(authed_client, db_session):
    pending = _make_file(db_session, status=ProcessingStatus.PENDING)
    with patch(_PATCH_TARGET, return_value=_GOOD_BRIEF):
        r = authed_client.post(_BRIEF_URL.format(file_id=pending.id))
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# 5. Missing GEMINI_API_KEY → 503
# ---------------------------------------------------------------------------


def test_brief_missing_api_key_returns_503(authed_client, db_session):
    f = _make_file(db_session)
    _make_fact(db_session, f.id, "revenue", 10000.0)
    _make_fact(db_session, f.id, "expense", 4000.0)

    with patch(_PATCH_TARGET, side_effect=GeminiConfigError("GEMINI_API_KEY not configured")):
        r = authed_client.post(_BRIEF_URL.format(file_id=f.id))
    assert r.status_code == 503
    assert r.json()["detail"] == "AI analysis is not configured."
    


# ---------------------------------------------------------------------------
# 6. Gemini API failure → 502
# ---------------------------------------------------------------------------


def test_brief_gemini_api_failure_returns_502(authed_client, db_session):
    f = _make_file(db_session)
    _make_fact(db_session, f.id, "revenue", 10000.0)

    with patch(_PATCH_TARGET, side_effect=GeminiAPIError("Network timeout")):
        r = authed_client.post(_BRIEF_URL.format(file_id=f.id))
    assert r.status_code == 502
    assert "temporarily unavailable" in r.json()["detail"]


# ---------------------------------------------------------------------------
# 7. Malformed / non-JSON Gemini response → 502
# ---------------------------------------------------------------------------


def test_brief_malformed_gemini_response_returns_502(authed_client, db_session):
    f = _make_file(db_session)
    _make_fact(db_session, f.id, "revenue", 10000.0)

    with patch(_PATCH_TARGET, side_effect=GeminiParseError("Not valid JSON")):
        r = authed_client.post(_BRIEF_URL.format(file_id=f.id))
    assert r.status_code == 502


# ---------------------------------------------------------------------------
# 8. Successful generation — correct response shape
# ---------------------------------------------------------------------------


def test_brief_successful_generation_returns_200(authed_client, db_session):
    f = _make_file(db_session)
    _make_fact(db_session, f.id, "revenue", 10000.0)
    _make_fact(db_session, f.id, "expense", 4000.0, row_num=2)

    with patch(_PATCH_TARGET, return_value=_GOOD_BRIEF):
        r = authed_client.post(_BRIEF_URL.format(file_id=f.id))

    assert r.status_code == 200
    data = r.json()
    assert "executive_summary" in data
    assert isinstance(data["key_takeaways"], list)
    assert len(data["key_takeaways"]) > 0
    assert isinstance(data["needs_attention"], list)
    assert "decision_context" in data


# ---------------------------------------------------------------------------
# 9. Zero facts — brief still generated (Gemini told data is missing)
# ---------------------------------------------------------------------------


def test_brief_zero_facts_still_calls_gemini(authed_client, db_session):
    """A file with no facts should still call Gemini (with empty context)."""
    f = _make_file(db_session)

    with patch(_PATCH_TARGET, return_value=_GOOD_BRIEF) as mock_gen:
        r = authed_client.post(_BRIEF_URL.format(file_id=f.id))

    assert r.status_code == 200
    mock_gen.assert_called_once()


# ---------------------------------------------------------------------------
# 10. Verification records are NOT mutated
# ---------------------------------------------------------------------------


def test_brief_does_not_mutate_verification_records(authed_client, db_session):
    f = _make_file(db_session)
    _make_fact(db_session, f.id, "revenue", 10000.0)
    v_before = _make_verification(db_session, f.id)
    count_before = db_session.query(VerificationRecord).filter(
        VerificationRecord.file_id == f.id
    ).count()

    with patch(_PATCH_TARGET, return_value=_GOOD_BRIEF):
        r = authed_client.post(_BRIEF_URL.format(file_id=f.id))

    assert r.status_code == 200
    count_after = db_session.query(VerificationRecord).filter(
        VerificationRecord.file_id == f.id
    ).count()
    assert count_before == count_after, "Verification records must not be mutated by /brief"
    v_after = db_session.get(VerificationRecord, v_before.id)
    assert v_after.status == VerificationStatus.VERIFIED


# ---------------------------------------------------------------------------
# 11. Response schema validation (Pydantic AIBusinessBrief)
# ---------------------------------------------------------------------------


def test_ai_business_brief_pydantic_validation_rejects_empty_summary():
    """AIBusinessBrief must reject blank executive_summary."""
    with pytest.raises(Exception):
        AIBusinessBrief(
            executive_summary="   ",
            key_takeaways=["one"],
            needs_attention=["none"],
            decision_context="consider this",
        )


def test_ai_business_brief_pydantic_validation_rejects_empty_list():
    """AIBusinessBrief must reject empty key_takeaways."""
    with pytest.raises(Exception):
        AIBusinessBrief(
            executive_summary="Good summary.",
            key_takeaways=[],
            needs_attention=["none"],
            decision_context="consider this",
        )


# ---------------------------------------------------------------------------
# 12. Dataset isolation — two different files produce independent briefs
# ---------------------------------------------------------------------------


def test_brief_dataset_isolation(authed_client, db_session):
    """Two files with different facts produce independent Gemini calls."""
    file_a = _make_file(db_session)
    _make_fact(db_session, file_a.id, "revenue", 50000.0)

    file_b = _make_file(db_session)
    _make_fact(db_session, file_b.id, "expense", 9999.0)

    brief_a = AIBusinessBrief(
        executive_summary="File A summary.",
        key_takeaways=["Revenue present."],
        needs_attention=["No expense data."],
        decision_context="Context A.",
    )
    brief_b = AIBusinessBrief(
        executive_summary="File B summary.",
        key_takeaways=["Only expenses."],
        needs_attention=["No revenue data."],
        decision_context="Context B.",
    )

    with patch(_PATCH_TARGET, side_effect=[brief_a, brief_b]):
        r_a = authed_client.post(_BRIEF_URL.format(file_id=file_a.id))
        r_b = authed_client.post(_BRIEF_URL.format(file_id=file_b.id))

    assert r_a.status_code == 200
    assert r_b.status_code == 200
    assert r_a.json()["executive_summary"] == "File A summary."
    assert r_b.json()["executive_summary"] == "File B summary."
    assert r_a.json() != r_b.json()
