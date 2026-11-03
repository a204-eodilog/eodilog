"""장소 추출 평가의 채점 규칙. 채점이 틀리면 정확도 수치 전체가 틀린다."""

from scripts.eval_places import rescore, score_image, summarize

POSITIVE = {"expected": ["강릉교동짬뽕본가", "강릉교동짬뽕"], "also_visible": ["노래"]}
NEGATIVE = {"expected": [], "also_visible": []}


def row(label, mentions, *, error=None, seconds=1.0, uncertain=False):
    return {
        **score_image({**label, "uncertain": uncertain}, mentions),
        "mentions": mentions,
        "error": error,
        "seconds": seconds,
    }


def test_alias_match_ignores_spacing_and_case():
    assert score_image(POSITIVE, ["강릉 교동 짬뽕"])["correct"] is True
    assert score_image({"expected": ["OVERTHEMOON"], "also_visible": []}, ["Over the Moon"])[
        "correct"
    ]


def test_misread_name_is_wrong_and_flagged_for_review():
    scored = score_image(POSITIVE, ["강릉교동짜장"])
    assert scored["correct"] is False
    assert scored["unexpected"] == ["강릉교동짜장"]


def test_partial_name_is_not_a_match():
    assert score_image(POSITIVE, ["교동"])["correct"] is False


def test_also_visible_sign_is_not_unexpected_but_does_not_score():
    scored = score_image(POSITIVE, ["노래"])
    assert scored["correct"] is False
    assert scored["unexpected"] == []


def test_negative_photo_is_correct_only_when_nothing_is_found():
    assert score_image(NEGATIVE, [])["correct"] is True
    scored = score_image(NEGATIVE, ["해운대 해변"])
    assert scored["correct"] is False
    assert scored["unexpected"] == ["해운대 해변"]


def test_summary_separates_positive_negative_and_uncertain():
    rows = [
        row(POSITIVE, ["강릉교동짬뽕"], seconds=2.0),
        row(POSITIVE, ["틀린이름"], seconds=4.0),
        row(POSITIVE, ["틀린이름"], seconds=6.0, uncertain=True),
        row(NEGATIVE, [], seconds=8.0),
        row(NEGATIVE, ["가짜"], seconds=10.0),
    ]
    summary = summarize(rows)
    assert summary["positive_correct"] == 1
    assert summary["positive_total"] == 3
    assert summary["confirmed_correct"] == 1
    assert summary["confirmed_total"] == 2
    assert summary["negative_clean"] == 1
    assert summary["negative_total"] == 2
    assert summary["unexpected_images"] == 3
    assert summary["median_seconds"] == 6.0
    assert summary["max_seconds"] == 10.0


def test_failed_call_counts_as_wrong_and_is_excluded_from_latency():
    rows = [
        row(POSITIVE, [], error="LLMUnavailable", seconds=30.0),
        row(POSITIVE, ["강릉교동짬뽕"]),
    ]
    summary = summarize(rows)
    assert summary["errors"] == 1
    assert summary["positive_correct"] == 1
    assert summary["positive_total"] == 2
    assert summary["max_seconds"] == 1.0


def test_real_text_on_negative_photo_is_not_counted_as_invented():
    label = {"expected": [], "also_visible": ["한양대학교"]}
    assert score_image(label, ["한양대학교"])["correct"] is True
    assert score_image(label, ["부산은행"])["correct"] is False


def test_rescore_uses_current_labels_without_changing_recorded_answers():
    old = {"file": "a.jpg", "mentions": ["강릉교동짬뽕본점"], "error": None, "seconds": 1.0}
    rescored = rescore(old, {"expected": ["강릉교동짬뽕본점"], "also_visible": []})
    assert rescored["correct"] is True
    assert rescored["mentions"] == ["강릉교동짬뽕본점"]
    assert rescored["seconds"] == 1.0
