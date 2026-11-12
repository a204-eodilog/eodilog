"""사진 분류 (spec §8.1, T-08-1 ~ T-08-6).

실제 이미지 디코딩과 앱 전체를 거치고 모델만 가짜로 바꾼다. 가짜 모델의 벡터는 평균 색으로 정해진다:
초록=풍경, 빨강=음식, 파랑=사람, 회색=기타. 비슷한 색은 코사인 유사도가 높다.
"""

import io
import json
import sys
import threading
import time
import uuid
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.clients import images as image_module
from app.core.config import Settings
from app.features.photo_classification import service as service_module
from app.features.photo_classification.service import (
    TOPIC_HEAD_PATH,
    TOPICS,
    PhotoClassifier,
    TopicHead,
    group_similar,
    load_topic_head,
)
from app.main import create_app

PATH = "/ai/v1/photo-classifications"
TOKEN = "secret-token"
ORIENTATION = 0x0112
ROTATE_90_CW = 6
MEGABYTES_15 = 15 * 1024 * 1024

GREEN = (20, 200, 20)
GREEN_NEAR = (30, 190, 30)
RED = (200, 20, 20)
BLUE = (20, 20, 200)
GRAY = (100, 100, 100)

AXIS = {"LANDSCAPE": 0, "FOOD": 1, "PEOPLE": 2, "OTHER": 3}


def unit(vector) -> np.ndarray:
    array = np.asarray(vector, dtype=np.float64)
    return array / np.linalg.norm(array)


class FakeEmbedder:
    def __init__(self, error: Exception | None = None):
        self.error = error
        self.seen: list[Image.Image] = []
        self.text_calls = 0
        self._axis = {
            sentence: AXIS[topic] for topic, sentences in TOPICS.items() for sentence in sentences
        }

    def embed_images(self, images: list[Image.Image]) -> np.ndarray:
        if self.error:
            raise self.error
        self.seen.extend(images)
        vectors = []
        for image in images:
            r, g, b = np.asarray(image, dtype=np.float64).reshape(-1, 3).mean(axis=0)
            vectors.append(unit([g, r, b, 3 * min(r, g, b)]))
        return np.stack(vectors)

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        if self.error:
            raise self.error
        self.text_calls += 1
        return np.stack([np.eye(4)[self._axis[text]] for text in texts])


def make_client(embedder=None, **settings) -> TestClient:
    app = create_app(Settings(_env_file=None, internal_api_token=TOKEN, **settings))
    if embedder is not None:
        app.state.photo_classifier = PhotoClassifier(
            embedder=embedder,
            similarity_threshold=app.state.settings.photo_similarity_threshold,
        )
    client = TestClient(app, raise_server_exceptions=False)
    client.headers["X-Internal-Token"] = TOKEN
    return client


@pytest.fixture
def embedder() -> FakeEmbedder:
    return FakeEmbedder()


@pytest.fixture
def client(embedder) -> TestClient:
    return make_client(embedder)


def encode(color=GREEN, fmt="JPEG", size=(32, 32), **options) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, format=fmt, **options)
    return out.getvalue()


def post(client: TestClient, blobs: list[bytes], ids: list[str] | None = None):
    ids = [f"p{i}" for i in range(len(blobs))] if ids is None else ids
    return client.post(
        PATH,
        data={"meta": json.dumps({"photoIds": ids})},
        files=[("files", (f"{i}.jpg", blob, "image/jpeg")) for i, blob in enumerate(blobs)],
    )


def photos(response) -> list[dict]:
    assert response.status_code == 200, response.text
    return response.json()["data"]["photos"]


def error(response) -> dict:
    return response.json()["error"]


def test_T08_1_broken_photo_fails_alone(client):
    result = photos(post(client, [encode(GREEN), b"not an image", encode(RED)]))

    assert result[0] == {
        "photoId": "p0",
        "status": "SUCCEEDED",
        "topics": ["LANDSCAPE"],
        "groupId": None,
        "errorCode": None,
    }
    assert result[1] == {
        "photoId": "p1",
        "status": "FAILED",
        "topics": [],
        "groupId": None,
        "errorCode": "IMAGE_DECODE_FAILED",
    }
    assert result[2]["status"] == "SUCCEEDED"
    assert result[2]["topics"] == ["FOOD"]


def test_truncated_jpeg_fails_alone(client):
    jpeg = encode(GREEN, size=(200, 200))
    result = photos(post(client, [jpeg[: len(jpeg) // 2], encode(RED)]))

    assert [photo["status"] for photo in result] == ["FAILED", "SUCCEEDED"]
    assert result[0]["errorCode"] == "IMAGE_DECODE_FAILED"


def test_too_many_pixels_fails_alone(client, monkeypatch):
    monkeypatch.setattr(image_module, "MAX_PIXELS", 100)
    result = photos(post(client, [encode(GREEN, size=(32, 32)), encode(RED, size=(5, 5))]))

    assert [photo["status"] for photo in result] == ["FAILED", "SUCCEEDED"]


def test_photo_that_breaks_after_opening_fails_alone(client, monkeypatch):
    original = service_module.ImageOps.exif_transpose
    calls = iter([ValueError("bad exif"), None])

    def flaky(image):
        failure = next(calls)
        if failure:
            raise failure
        return original(image)

    monkeypatch.setattr(service_module.ImageOps, "exif_transpose", flaky)

    result = photos(post(client, [encode(GREEN), encode(RED)]))

    assert [photo["status"] for photo in result] == ["FAILED", "SUCCEEDED"]


@pytest.mark.parametrize(
    ("color", "topic"),
    [(GREEN, "LANDSCAPE"), (RED, "FOOD"), (BLUE, "PEOPLE"), (GRAY, "OTHER")],
)
def test_each_photo_gets_its_highest_scoring_topic(client, color, topic):
    assert photos(post(client, [encode(color, "PNG")]))[0]["topics"] == [topic]


def test_results_keep_request_order_and_ids(client):
    result = photos(post(client, [encode(RED), b"x", encode(GREEN)], ["c", "a", "b"]))

    assert [photo["photoId"] for photo in result] == ["c", "a", "b"]
    assert [photo["topics"] for photo in result] == [["FOOD"], [], ["LANDSCAPE"]]


def test_T08_2_burst_shots_share_a_group(client):
    result = photos(post(client, [encode(GREEN), encode(GREEN_NEAR)]))

    assert result[0]["groupId"] == result[1]["groupId"]
    assert uuid.UUID(result[0]["groupId"])


def test_T08_3_different_photos_are_not_grouped(client):
    result = photos(post(client, [encode(GREEN), encode(RED), encode(BLUE)]))

    assert [photo["groupId"] for photo in result] == [None, None, None]


def test_separate_groups_get_separate_ids(client):
    result = photos(post(client, [encode(GREEN), encode(RED), encode(GREEN_NEAR), encode(RED)]))

    assert result[0]["groupId"] == result[2]["groupId"]
    assert result[1]["groupId"] == result[3]["groupId"]
    assert result[0]["groupId"] != result[1]["groupId"]


def test_failed_photos_are_never_grouped(client):
    result = photos(post(client, [encode(GREEN), b"x", b"x"]))

    assert [photo["groupId"] for photo in result] == [None, None, None]


def test_threshold_setting_reaches_grouping():
    strict = make_client(FakeEmbedder(), photo_similarity_threshold=1.0)
    loose = make_client(FakeEmbedder(), photo_similarity_threshold=0.1)

    strict_result = photos(post(strict, [encode(GREEN), encode(GREEN_NEAR)]))
    loose_result = photos(post(loose, [encode(GREEN), encode(RED)]))

    assert strict_result[0]["groupId"] is None
    assert loose_result[0]["groupId"] is not None
    assert loose_result[0]["groupId"] == loose_result[1]["groupId"]


def test_similarity_exactly_at_threshold_is_grouped():
    at_threshold = np.array([[1.0, 0.0], [0.94, np.sqrt(1 - 0.94**2)]])
    below = np.array([[1.0, 0.0], [0.93, np.sqrt(1 - 0.93**2)]])

    grouped = group_similar(at_threshold, 0.94)

    assert grouped[0] is not None
    assert grouped[0] == grouped[1]
    assert group_similar(below, 0.94) == [None, None]


def test_chained_photos_form_one_group():
    # A~B, B~C는 0.96이고 A~C는 2·0.96² - 1 = 0.8432로 기준 미만이다
    angle = np.arccos(0.96)
    chain = np.array(
        [
            [1.0, 0.0],
            [np.cos(angle), np.sin(angle)],
            [np.cos(2 * angle), np.sin(2 * angle)],
            [0.0, 1.0],
        ]
    )
    assert chain[0] @ chain[2] < 0.94

    grouped = group_similar(chain, 0.94)

    assert grouped[0] is not None
    assert grouped[0] == grouped[1] == grouped[2]
    assert grouped[3] is None


def post_named(client: TestClient, blob: bytes, filename: str, content_type: str):
    return client.post(
        PATH,
        data={"meta": json.dumps({"photoIds": ["p0", "p1"]})},
        files=[
            ("files", (filename, blob, content_type)),
            ("files", ("other.jpg", encode(RED), "image/jpeg")),
        ],
    )


@pytest.mark.parametrize("fmt", ["WEBP", "GIF", "BMP"])
def test_unsupported_format_fails_alone_even_when_labeled_as_jpeg(client, embedder, fmt):
    result = photos(post_named(client, encode(GREEN, fmt), "photo.jpg", "image/jpeg"))

    assert result[0] == {
        "photoId": "p0",
        "status": "FAILED",
        "topics": [],
        "groupId": None,
        "errorCode": "UNSUPPORTED_INPUT",
    }
    assert result[1]["status"] == "SUCCEEDED"
    assert len(embedder.seen) == 1


def test_supported_content_passes_even_when_labeled_as_webp(client):
    result = photos(post_named(client, encode(GREEN, "PNG"), "photo.webp", "image/webp"))

    assert [photo["status"] for photo in result] == ["SUCCEEDED", "SUCCEEDED"]
    assert result[0]["topics"] == ["LANDSCAPE"]


def padded(size: int, color=GREEN) -> bytes:
    """뒤에 빈 바이트를 붙인 정상 JPEG. Pillow는 끝의 빈 바이트를 무시한다."""
    jpeg = encode(color)
    return jpeg + b"\0" * (size - len(jpeg))


def test_photo_of_exactly_15mb_is_processed(client):
    assert photos(post(client, [padded(MEGABYTES_15)]))[0]["status"] == "SUCCEEDED"


def test_photo_over_15mb_fails_alone_before_decoding(client, embedder, monkeypatch):
    opened = []
    original = service_module.open_image

    def spying_open(data, allowed, **options):
        opened.append(len(data))
        return original(data, allowed, **options)

    monkeypatch.setattr(service_module, "open_image", spying_open)

    result = photos(post(client, [padded(MEGABYTES_15 + 1), encode(RED)]))

    assert result[0] == {
        "photoId": "p0",
        "status": "FAILED",
        "topics": [],
        "groupId": None,
        "errorCode": "INPUT_LIMIT_EXCEEDED",
    }
    assert result[1]["status"] == "SUCCEEDED"
    assert opened == [len(encode(RED))]
    assert len(embedder.seen) == 1


def test_only_oversized_photos_do_not_need_the_model():
    client = make_client(FakeEmbedder(RuntimeError("down")))

    result = photos(post(client, [padded(MEGABYTES_15 + 1)]))

    assert result[0]["errorCode"] == "INPUT_LIMIT_EXCEEDED"


def test_T08_4_heic_is_classified(client):
    assert photos(post(client, [encode(BLUE, "HEIF")]))[0]["topics"] == ["PEOPLE"]


def test_exif_rotation_is_applied_before_the_model(client, embedder):
    exif = Image.Exif()
    exif[ORIENTATION] = ROTATE_90_CW
    photos(post(client, [encode(GREEN, size=(40, 20), exif=exif)]))

    assert embedder.seen[0].size == (20, 40)


def test_large_photo_is_shrunk_before_the_model(client, embedder):
    photos(post(client, [encode(GREEN, size=(3000, 2000))]))

    assert max(embedder.seen[0].size) < 1000


@pytest.mark.parametrize("mode", ["RGBA", "L", "P", "LA"])
def test_non_rgb_png_reaches_the_model_as_rgb(client, embedder, mode):
    out = io.BytesIO()
    Image.new("RGB", (8, 8), GREEN).convert(mode).save(out, format="PNG")

    assert photos(post(client, [out.getvalue()]))[0]["status"] == "SUCCEEDED"
    assert embedder.seen[0].mode == "RGB"


def test_T08_5_51_photos_is_rejected_without_calling_the_model(client, embedder):
    response = post(client, [encode()] * 51)

    assert response.status_code == 422
    assert error(response)["code"] == "INPUT_LIMIT_EXCEEDED"
    assert embedder.text_calls == 0
    assert embedder.seen == []


def test_50_photos_are_accepted(client):
    assert len(photos(post(client, [encode()] * 50))) == 50


def test_T08_6_model_failure_is_503_without_details():
    response = post(make_client(FakeEmbedder(RuntimeError("CUDA out of memory"))), [encode()])

    assert response.status_code == 503
    assert error(response)["code"] == "PROVIDER_UNAVAILABLE"
    assert "CUDA" not in response.text


@pytest.mark.parametrize("missing", ["open_clip", "torch"])
def test_T08_6_missing_vision_dependency_is_503(monkeypatch, missing):
    monkeypatch.setitem(sys.modules, missing, None)

    response = post(make_client(), [encode()])

    assert response.status_code == 503
    assert error(response)["code"] == "PROVIDER_UNAVAILABLE"


def test_failed_model_load_is_retried_on_the_next_request(monkeypatch):
    attempts = []

    def failing_load(*args, **kwargs):
        attempts.append(args)
        raise OSError("weights download failed")

    monkeypatch.setitem(
        sys.modules,
        "torch",
        SimpleNamespace(
            cuda=SimpleNamespace(is_available=lambda: False), set_num_threads=lambda count: None
        ),
    )
    monkeypatch.setitem(
        sys.modules,
        "open_clip",
        SimpleNamespace(create_model_and_transforms=failing_load),
    )
    client = make_client()

    assert post(client, [encode()]).status_code == 503
    assert post(client, [encode()]).status_code == 503
    assert len(attempts) == 2


def test_all_broken_photos_do_not_need_the_model():
    result = photos(post(make_client(FakeEmbedder(RuntimeError("down"))), [b"x", b"y"]))

    assert [photo["status"] for photo in result] == ["FAILED", "FAILED"]


def test_topic_sentences_are_embedded_only_once(client, embedder):
    photos(post(client, [encode()]))
    calls_after_first = embedder.text_calls
    photos(post(client, [encode()]))

    assert calls_after_first > 0
    assert embedder.text_calls == calls_after_first


def test_indoor_scenes_are_other_and_landscape_is_outdoor():
    # 음식·사람이 주인공이 아닌 실내(호텔 객실, 박물관 홀 등)는 기타다 (spec §8.1)
    indoor_words = ("indoor", "interior", "room")

    assert any(word in s for s in TOPICS["OTHER"] for word in indoor_words)
    assert not any(word in s for s in TOPICS["LANDSCAPE"] for word in indoor_words)
    assert all("outdoor" in sentence for sentence in TOPICS["LANDSCAPE"])


def test_slow_model_does_not_block_the_request_budget():
    release = threading.Event()

    class Stuck(FakeEmbedder):
        def embed_images(self, images):
            release.wait(timeout=5)
            return super().embed_images(images)

    # with로 루프를 유지한다. 요청마다 루프를 닫으면 남은 스레드를 기다리느라 응답 시간을 잴 수 없다
    with make_client(Stuck(), request_budget_seconds=0.1) as client:
        started = time.perf_counter()
        try:
            response = post(client, [encode()])
            elapsed = time.perf_counter() - started
        finally:
            release.set()

    assert response.status_code == 503
    assert elapsed < 3


@pytest.mark.parametrize(
    "meta",
    ["not json", "[]", "{}", json.dumps({"photoIds": "p0"}), json.dumps({"photoIds": [1]})],
)
def test_invalid_meta_is_400(client, meta):
    response = client.post(
        PATH, data={"meta": meta}, files=[("files", ("0.jpg", encode(), "image/jpeg"))]
    )

    assert response.status_code == 400
    assert error(response)["code"] == "VALIDATION_ERROR"
    assert error(response)["fields"][0]["field"].startswith("meta")


@pytest.mark.parametrize("ids", [["a"], ["a", "b", "c"]])
def test_id_and_file_count_mismatch_is_400(client, embedder, ids):
    response = post(client, [encode(), encode()], ids)

    assert response.status_code == 400
    assert error(response)["code"] == "VALIDATION_ERROR"
    assert embedder.seen == []


def test_missing_files_is_400(client):
    response = client.post(PATH, data={"meta": json.dumps({"photoIds": []})})

    assert response.status_code == 400
    assert error(response)["code"] == "VALIDATION_ERROR"


def test_requires_internal_token(client):
    del client.headers["X-Internal-Token"]

    response = post(client, [encode()])

    assert response.status_code == 401
    assert error(response)["code"] == "UNAUTHENTICATED"


def test_model_is_not_loaded_at_startup_by_default(embedder):
    with make_client(embedder):
        assert embedder.text_calls == 0


def test_preload_prepares_the_model_before_serving(embedder):
    with make_client(embedder, photo_model_preload=True) as client:
        assert embedder.text_calls == len(TOPICS)
        assert post(client, [encode()]).status_code == 200
        assert embedder.text_calls == len(TOPICS)


def test_failed_preload_keeps_the_server_up_and_photos_retry(embedder):
    embedder.error = RuntimeError("no model")
    with make_client(embedder, photo_model_preload=True) as client:
        assert client.get("/ai/v1/health").status_code == 200
        assert post(client, [encode()]).status_code == 503
        embedder.error = None
        assert post(client, [encode()]).status_code == 200


def test_large_jpeg_is_not_fully_decoded(client, monkeypatch):
    sizes = []
    original = service_module.ImageOps.exif_transpose

    def spying(image):
        sizes.append(image.size)
        return original(image)

    monkeypatch.setattr(service_module.ImageOps, "exif_transpose", spying)
    assert post(client, [encode(GREEN, size=(4000, 3000))]).status_code == 200

    assert sizes == [(1000, 750)]


def head_client(weight, bias=(0, 0, 0, 0), embedder=None) -> TestClient:
    app = create_app(Settings(_env_file=None, internal_api_token=TOKEN))
    app.state.photo_classifier = PhotoClassifier(
        embedder=embedder or FakeEmbedder(),
        similarity_threshold=app.state.settings.photo_similarity_threshold,
        topic_head=TopicHead(weight=np.asarray(weight, dtype=np.float64), bias=np.asarray(bias)),
    )
    client = TestClient(app, raise_server_exceptions=False)
    client.headers["X-Internal-Token"] = TOKEN
    return client


def test_trained_head_decides_the_topic_instead_of_topic_sentences():
    # 문장 비교라면 초록은 풍경이다. 학습한 분류기는 초록 축을 사람으로 보도록 만들었다
    green_is_people = [[0, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0], [0, 0, 0, 0]]
    embedder = FakeEmbedder()

    result = photos(post(head_client(green_is_people, embedder=embedder), [encode(GREEN)]))

    assert result[0]["topics"] == ["PEOPLE"]
    assert embedder.text_calls == 0


def test_trained_head_bias_can_change_the_topic():
    no_preference = np.zeros((4, 4))

    result = photos(post(head_client(no_preference, bias=(0, 0, 0, 1)), [encode(GREEN)]))

    assert result[0]["topics"] == ["OTHER"]


def test_trained_head_keeps_grouping_similar_photos():
    client = head_client(np.eye(4))

    result = photos(post(client, [encode(GREEN), encode(GREEN_NEAR), encode(RED)]))

    assert result[0]["groupId"] is not None
    assert result[0]["groupId"] == result[1]["groupId"]
    assert result[2]["groupId"] is None


def save_head(path, names, weight=None):
    np.savez(
        path,
        names=np.array(names),
        weight=np.eye(4) if weight is None else weight,
        bias=np.zeros(4),
    )


def test_missing_head_file_means_no_head(tmp_path):
    assert load_topic_head(tmp_path / "none.npz") is None


def test_head_with_topics_in_another_order_is_rejected(tmp_path):
    save_head(tmp_path / "head.npz", ["FOOD", "LANDSCAPE", "PEOPLE", "OTHER"])

    assert load_topic_head(tmp_path / "head.npz") is None


def test_head_with_wrong_shape_is_rejected(tmp_path):
    save_head(tmp_path / "head.npz", list(TOPICS), weight=np.zeros((3, 4)))

    assert load_topic_head(tmp_path / "head.npz") is None


def test_head_file_loads(tmp_path):
    save_head(tmp_path / "head.npz", list(TOPICS))

    head = load_topic_head(tmp_path / "head.npz")

    assert head.weight.shape == (4, 4)
    assert head.bias.shape == (4,)


def test_shipped_head_matches_the_topics_and_the_photo_model():
    head = load_topic_head(TOPIC_HEAD_PATH)

    assert head is not None
    assert head.weight.shape == (len(TOPICS), 768)
