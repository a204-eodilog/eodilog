"""캡처 평가의 장소 단위 채점 규칙."""

from scripts.score_captures import score_capture, summarize

LIST = {
    "type": "list",
    "places": [["태종대", "태종대유원지"], ["감천문화마을"], ["부산타워", "부산 타워"]],
    "also_visible": ["부산", "영도구", "지도앱"],
}
NEGATIVE = {"type": "negative", "places": [], "also_visible": ["해운대구"]}
SCREEN = ["태종대 관광명소", "감천문화마을", "부산타워 전망대", "부산 영도구 동삼동"]


def row(label, mentions, seconds=1.0, error=None):
    return {**score_capture(label, mentions, SCREEN), "mentions": mentions,
            "seconds": seconds, "error": error}


def test_each_expected_place_counts_once_with_any_alias():
    scored = score_capture(LIST, ["태종대유원지", "감천 문화 마을", "태종대"], SCREEN)
    assert scored["found_count"] == 2
    assert scored["missed"] == ["부산타워"]
    assert scored["exact"] is False


def test_all_found_without_extra_is_exact():
    assert score_capture(LIST, ["태종대", "감천문화마을", "부산 타워"], SCREEN)["exact"] is True


def test_region_text_is_non_place_not_invented_and_breaks_exact():
    scored = score_capture(LIST, ["태종대", "감천문화마을", "부산타워", "영도구"], SCREEN)
    assert scored["non_place"] == ["영도구"]
    assert scored["invented"] == []
    assert scored["exact"] is False


def test_unexpected_name_on_screen_is_misread_not_invented():
    scored = score_capture(LIST, ["감천", "해동용궁사"], SCREEN)
    assert scored["unexpected"] == ["감천", "해동용궁사"]
    assert scored["invented"] == ["해동용궁사"]


def test_summary_by_type_and_negative_clean():
    rows = [
        row(LIST, ["태종대", "감천문화마을", "부산타워"], seconds=2.0),
        row(LIST, ["태종대"], seconds=4.0),
        row(NEGATIVE, [], seconds=6.0),
        row(NEGATIVE, ["해운대구"], seconds=8.0),
        row(NEGATIVE, [], seconds=30.0, error="LLMUnavailable"),
    ]
    summary = summarize(rows)
    assert summary["by_type"]["list"]["expected_names"] == 6
    assert summary["by_type"]["list"]["found_names"] == 4
    assert summary["by_type"]["list"]["exact_images"] == 1
    assert summary["negative_clean"] == 2
    assert summary["negative_total"] == 3
    assert summary["all"]["errors"] == 1
    assert summary["median_seconds"] == 5.0
    assert summary["max_seconds"] == 8.0
