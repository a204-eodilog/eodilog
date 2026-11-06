"""LLM 기능 평가의 채점 규칙. 채점이 틀리면 보고서 수치 전체가 틀린다."""

from scripts.eval_features import (
    check_checklist,
    check_place,
    check_preference,
    fixture_html,
    percentile,
)


def test_preference_exact_and_exclusion():
    case = {"expect": {"status": 200, "exact": ["카페"]}}
    request = {"explicitItems": [{"key": "바다", "value": "바다"}], "rejectedKeys": []}
    ok = {"data": {"inferredItems": [{"key": "카페", "value": "카페"}]}}
    bad = {"data": {"inferredItems": [{"key": "바다", "value": "바다"}]}}
    assert all(check_preference(case, request, 200, ok).values())
    checks = check_preference(case, request, 200, bad)
    assert checks["excluded_keys"] is False and checks["expected_exact"] is False


def test_preference_error_case_checks_code():
    case = {"expect": {"status": 422, "error_code": "INSUFFICIENT_DATA"}}
    body = {"error": {"code": "INSUFFICIENT_DATA"}}
    assert check_preference(case, {}, 422, body) == {"http_status": True, "error_code": True}


def _item(label, reason="이유", job="eval-job-X"):
    return {"label": label, "reason": reason, "sourceJobId": job}


def test_checklist_flags_overlap_with_deleted_and_forbidden_synonym():
    case = {
        "category": "adversarial",
        "spec": "T-07-5",
        "expect": {"status": 200, "rule_labels": ["신분증"], "forbidden": ["자외선"]},
    }
    request = {"jobId": "eval-job-X", "existingItems": [], "deletedLabels": ["선크림"]}
    body = {"data": {"items": [_item("신분증"), _item("선크림 50ml"), _item("자외선 차단제")]}}
    checks = check_checklist(case, request, 200, body)
    assert checks["rule_labels"] is True
    assert checks["no_user_overlap"] is False
    assert checks["forbidden_free"] is False


def test_checklist_rejects_wrong_job_id():
    case = {"category": "normal", "spec": "", "expect": {"status": 200, "rule_labels": []}}
    body = {"data": {"items": [_item("우산", job="other")]}}
    assert check_checklist(case, {"jobId": "eval-job-X"}, 200, body)["schema"] is False


def test_place_grounded_and_mentions_use_normalized_names():
    case = {
        "expect": {
            "status": 200,
            "status_any": ["MULTIPLE_CANDIDATES"],
            "mentions": [["광안리해수욕장"]],
            "forbidden": ["에펠탑"],
        }
    }
    candidate = {
        "name": "광안리 해수욕장",
        "place": None,
        "evidence": "게시물 글에서 찾았어요",
        "confidence": None,
    }
    body = {"data": {"resultStatus": "MULTIPLE_CANDIDATES", "candidates": [candidate]}}
    assert all(check_place(case, "오늘은광안리해수욕장에다녀왔다", 200, body, None).values())
    invented = {**candidate, "name": "에펠탑"}
    body["data"]["candidates"] = [invented]
    checks = check_place(case, "오늘은광안리해수욕장에다녀왔다", 200, body, None)
    assert checks["grounded"] is False and checks["forbidden_free"] is False


def test_place_confidence_must_be_null_without_place():
    case = {"expect": {"status": 200, "status_any": ["MULTIPLE_CANDIDATES"]}}
    candidate = {"name": "가", "place": None, "evidence": "메모에서 찾았어요", "confidence": 1.0}
    body = {"data": {"resultStatus": "MULTIPLE_CANDIDATES", "candidates": [candidate]}}
    assert check_place(case, "가", 200, body, None)["schema"] is False


def test_percentile_nearest_rank_and_fixture_escapes():
    assert percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95) == 10
    assert percentile([5], 0.95) == 5
    page = fixture_html({"title": 'a"b', "description": "<x>"})
    assert 'content="a&quot;b"' in page and "&lt;x&gt;" in page
