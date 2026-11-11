"""파인튜닝한 사진 인코더 (spec AS-20).

기본 SigLIP2에서 학습으로 바뀐 사진 인코더 텐서와, 함께 학습한 주제 분류기를 한 파일에 둔다.
파일이 없거나 지금 모델·주제와 맞지 않으면 None을 돌려준다.
그때는 기본 모델과 topic_head.npz로 동작한다.
인코더 텐서와 분류기는 짝이라서 반드시 같이 쓴다.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from app.features.photo_classification.service import TOPICS, TopicHead

log = logging.getLogger("ai")

FINETUNE_PATH = Path(__file__).with_name("photo_finetune.safetensors")
VISUAL_PREFIX = "visual."


@dataclass(frozen=True)
class PhotoFinetune:
    # model.visual.state_dict() 이름 그대로. 여기 없는 텐서는 기본 모델 값을 쓴다
    visual: dict[str, np.ndarray]
    head: TopicHead


def load_finetune(path: Path, *, model_name: str) -> PhotoFinetune | None:
    try:
        from safetensors import safe_open
        from safetensors.numpy import load_file
    except ImportError:
        return None
    if not path.is_file():
        return None
    try:
        with safe_open(str(path), framework="np") as opened:
            metadata = opened.metadata() or {}
        tensors = load_file(str(path))
    except Exception as e:  # 깨진 파일은 라이브러리마다 다른 예외를 낸다
        log.warning("photo_finetune_rejected reason=unreadable error=%s", type(e).__name__)
        return None
    names = metadata.get("names", "").split(",")
    if metadata.get("model") != model_name or names != list(TOPICS):
        log.warning("photo_finetune_rejected reason=model_or_topics")
        return None
    weight, bias = tensors.get("head.weight"), tensors.get("head.bias")
    visual = {
        key.removeprefix(VISUAL_PREFIX): value.astype(np.float32)
        for key, value in tensors.items()
        if key.startswith(VISUAL_PREFIX)
    }
    if weight is None or bias is None or weight.ndim != 2 or weight.shape[0] != len(TOPICS):
        log.warning("photo_finetune_rejected reason=head")
        return None
    if bias.shape != (len(TOPICS),) or not visual:
        log.warning("photo_finetune_rejected reason=head_or_encoder")
        return None
    head = TopicHead(weight=weight.astype(np.float32), bias=bias.astype(np.float32))
    return PhotoFinetune(visual=visual, head=head)


def apply_visual_weights(module: Any, weights: dict[str, np.ndarray]) -> None:
    """이름과 모양이 모두 맞을 때만 덮어쓴다. 하나라도 어긋나면 아무것도 바꾸지 않고 ValueError."""
    import torch

    current = module.state_dict()
    for key, value in weights.items():
        if key not in current or tuple(current[key].shape) != value.shape:
            raise ValueError(f"photo finetune tensor does not fit the model: {key}")
    update = {
        key: torch.from_numpy(value).to(dtype=current[key].dtype) for key, value in weights.items()
    }
    module.load_state_dict(update, strict=False)
