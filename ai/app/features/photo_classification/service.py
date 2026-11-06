"""사진 주제 분류와 비슷한 사진 묶기 (spec §8.1, 화면 S31·S32)."""

import asyncio
import logging
import uuid
from dataclasses import dataclass
from typing import Literal

import numpy as np
from PIL import Image, ImageOps

from app.clients.errors import ProviderUnavailable
from app.clients.images import PHOTO_FORMATS, UnsupportedImage, open_image
from app.core.schemas import CamelModel
from app.features.photo_classification.embedder import PhotoEmbedder

log = logging.getLogger("ai")

# 모델 입력보다 크게 유지할 이유가 없고, 디코딩한 원본을 50장 들고 있으면 메모리가 부족하다
MAX_SIDE = 448
MAX_PHOTO_BYTES = 15 * 1024 * 1024

# 주제 문장 (AS-7). 평가 사진 60장으로 고르고 실내 문장을 더했다 (verification.md)
TOPICS: dict[str, list[str]] = {
    "LANDSCAPE": [
        # 실내가 "건물"에 끌려 풍경으로 가지 않도록 바깥 풍경임을 밝힌다
        "an outdoor photo of a landscape",
        "an outdoor photo of scenery with sky, sea or mountains",
        "an outdoor photo of a city street and buildings",
    ],
    "FOOD": [
        "a close-up photo of a dish of food",
        "a photo of a meal on a table",
        "a photo of coffee and dessert",
    ],
    "PEOPLE": [
        "a photo of people",
        "a selfie of a person",
        "a group photo of friends",
        # 음식이 함께 보여도 사람이 주인공이면 사람
        "a photo of people eating together at a table",
        "a selfie of a person holding food",
    ],
    "OTHER": [
        "a photo of a receipt or document",
        "a screenshot of a phone screen",
        "a photo of a ticket or sign",
        # 메뉴판·안내판은 음식·풍경으로 새기 쉽다
        "a photo of a restaurant menu with prices",
        "a photo of a sign with printed text",
        # 음식·사람이 주인공이 아닌 실내는 기타다 (spec §8.1)
        "a photo of an indoor room interior",
        "a photo of a hotel room interior",
        "a photo of a museum or gallery interior",
        "a photo of the interior of a shop, cafe or train",
    ],
}


class PhotoModelUnavailable(ProviderUnavailable):
    """사진 모델을 쓸 수 없다. 503 PROVIDER_UNAVAILABLE로 돌려준다."""


class PhotoResult(CamelModel):
    photo_id: str
    status: Literal["SUCCEEDED", "FAILED"]
    topics: list[str]
    group_id: str | None
    error_code: str | None


class ClassificationResult(CamelModel):
    photos: list[PhotoResult]


@dataclass(frozen=True)
class PhotoUpload:
    photo_id: str
    data: bytes


class PhotoClassifier:
    def __init__(self, *, embedder: PhotoEmbedder, similarity_threshold: float):
        self._embedder = embedder
        self._threshold = similarity_threshold
        self._topic_vectors: np.ndarray | None = None

    async def classify(self, uploads: list[PhotoUpload]) -> ClassificationResult:
        decoded = await asyncio.to_thread(_decode_all, uploads)
        images = [item for item in decoded if isinstance(item, Image.Image)]
        analyzed = iter(await self._analyze(images) if images else [])
        return ClassificationResult(
            photos=[
                _succeeded(upload, *next(analyzed))
                if isinstance(item, Image.Image)
                else _failed(upload, item)
                for upload, item in zip(uploads, decoded, strict=True)
            ]
        )

    async def _analyze(self, images: list[Image.Image]) -> list[tuple[str, str | None]]:
        # 예산 초과 503이 제때 나가도록 스레드로 돌린다
        try:
            return await asyncio.to_thread(self._analyze_sync, images)
        except Exception as e:
            # 메시지에 경로 등이 있을 수 있어 종류만 남긴다
            log.warning("photo_model_failed error=%s", type(e).__name__)
            raise PhotoModelUnavailable("사진 모델을 사용할 수 없습니다.") from e

    def _analyze_sync(self, images: list[Image.Image]) -> list[tuple[str, str | None]]:
        vectors = self._embedder.embed_images(images)
        # 점수는 sigmoid(scale·유사도 + bias)이고 주제마다 scale·bias가 같다.
        # 순서가 유사도와 같으므로 가장 높은 점수의 주제는 유사도만으로 고를 수 있다
        best = (vectors @ self._topics().T).argmax(axis=1)
        names = list(TOPICS)
        groups = group_similar(vectors, self._threshold)
        return [(names[index], group) for index, group in zip(best, groups, strict=True)]

    def _topics(self) -> np.ndarray:
        if self._topic_vectors is None:
            means = [self._embedder.embed_texts(texts).mean(axis=0) for texts in TOPICS.values()]
            self._topic_vectors = np.stack([mean / np.linalg.norm(mean) for mean in means])
        return self._topic_vectors


def group_similar(vectors: np.ndarray, threshold: float) -> list[str | None]:
    """유사도가 기준 이상인 사진끼리 연결한다. 2장 이상 묶음에만 새 ID를 준다."""
    count = len(vectors)
    parents = list(range(count))

    def root(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    similar = vectors @ vectors.T >= threshold
    for left in range(count):
        for right in range(left + 1, count):
            if similar[left, right]:
                parents[root(left)] = root(right)

    roots = [root(index) for index in range(count)]
    group_ids = {value: str(uuid.uuid4()) for value in roots if roots.count(value) > 1}
    return [group_ids.get(value) for value in roots]


def _decode_all(uploads: list[PhotoUpload]) -> list[Image.Image | str]:
    return [_decode(upload.data) for upload in uploads]


def _decode(data: bytes) -> Image.Image | str:
    """줄인 사진이나 실패한 이유(errorCode)를 돌려준다. 형식은 파일 내용으로 판단한다."""
    if len(data) > MAX_PHOTO_BYTES:
        return "INPUT_LIMIT_EXCEEDED"
    try:
        image = ImageOps.exif_transpose(open_image(data, PHOTO_FORMATS)).convert("RGB")
        image.thumbnail((MAX_SIDE, MAX_SIDE))
    except UnsupportedImage:
        return "UNSUPPORTED_INPUT"
    except Exception:
        # Pillow는 깨진 파일에 다양한 예외를 던진다 (app.clients.images와 같은 판단)
        log.info("photo_decode_failed")
        return "IMAGE_DECODE_FAILED"
    return image


def _succeeded(upload: PhotoUpload, topic: str, group_id: str | None) -> PhotoResult:
    return PhotoResult(
        photo_id=upload.photo_id,
        status="SUCCEEDED",
        topics=[topic],
        group_id=group_id,
        error_code=None,
    )


def _failed(upload: PhotoUpload, error_code: str) -> PhotoResult:
    return PhotoResult(
        photo_id=upload.photo_id,
        status="FAILED",
        topics=[],
        group_id=None,
        error_code=error_code,
    )
