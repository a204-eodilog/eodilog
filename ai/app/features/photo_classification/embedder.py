"""로컬 SigLIP2 임베딩. 사진을 외부로 보내지 않는다 (spec §8.1).

`vision` 선택 설치라 torch와 open_clip은 처음 쓸 때 불러온다. 모델도 첫 요청에 한 번 올리고,
실패하면 기억하지 않아 다음 요청에서 다시 시도한다.
CPU·GPU 작업이라 호출하는 쪽에서 스레드로 돌린다.
"""

import logging
import threading
from typing import Any, Protocol

import numpy as np
from PIL import Image

log = logging.getLogger("ai")

# 사진 50장을 한 번에 올리면 메모리가 크게 튄다
IMAGE_BATCH_SIZE = 16


class PhotoEmbedder(Protocol):
    """행마다 길이 1로 정규화한 벡터를 돌려준다."""

    def embed_images(self, images: list[Image.Image]) -> np.ndarray: ...

    def embed_texts(self, texts: list[str]) -> np.ndarray: ...


class SiglipEmbedder:
    def __init__(
        self,
        *,
        model_name: str,
        pretrained: str,
        visual_weights: dict[str, np.ndarray] | None = None,
    ):
        self._model_name = model_name
        self._pretrained = pretrained
        # 파인튜닝으로 바뀐 사진 인코더 텐서 (finetune.py). 없으면 기본 모델 그대로
        self._visual_weights = visual_weights
        self._lock = threading.Lock()
        self._loaded: tuple[Any, Any, Any, str] | None = None

    def embed_images(self, images: list[Image.Image]) -> np.ndarray:
        import torch

        model, preprocess, _, device = self._load()
        batches = []
        for start in range(0, len(images), IMAGE_BATCH_SIZE):
            pixels = [preprocess(image) for image in images[start : start + IMAGE_BATCH_SIZE]]
            with torch.inference_mode():
                batches.append(_normalized(model.encode_image(torch.stack(pixels).to(device))))
        return np.concatenate(batches)

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        import torch

        model, _, tokenizer, device = self._load()
        with torch.inference_mode():
            return _normalized(model.encode_text(tokenizer(texts).to(device)))

    def _load(self) -> tuple[Any, Any, Any, str]:
        with self._lock:
            if self._loaded is None:
                import open_clip
                import torch

                device = "cuda" if torch.cuda.is_available() else "cpu"
                model, _, preprocess = open_clip.create_model_and_transforms(
                    self._model_name, pretrained=self._pretrained, device=device
                )
                if self._visual_weights:
                    from app.features.photo_classification.finetune import apply_visual_weights

                    apply_visual_weights(model.visual, self._visual_weights)
                model.eval()
                tokenizer = open_clip.get_tokenizer(self._model_name)
                self._loaded = (model, preprocess, tokenizer, device)
                log.info(
                    "photo_model_loaded model=%s device=%s finetuned=%s",
                    self._model_name,
                    device,
                    bool(self._visual_weights),
                )
            return self._loaded


def _normalized(features: Any) -> np.ndarray:
    return (features / features.norm(dim=-1, keepdim=True)).float().cpu().numpy()
