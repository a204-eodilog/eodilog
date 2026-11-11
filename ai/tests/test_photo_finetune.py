"""파인튜닝한 사진 인코더 가중치 파일 (spec AS-20)."""

import numpy as np
import pytest

from app.core.config import Settings
from app.features.photo_classification.finetune import (
    FINETUNE_PATH,
    apply_visual_weights,
    load_finetune,
)
from app.features.photo_classification.service import TOPICS

safetensors_numpy = pytest.importorskip("safetensors.numpy")

MODEL = "ViT-B-32-SigLIP2-256"


def save(path, *, names=None, model=MODEL, head_shape=(4, 8), visual=True):
    tensors = {
        "head.weight": np.ones(head_shape, dtype=np.float32),
        "head.bias": np.arange(head_shape[0], dtype=np.float32),
    }
    if visual:
        tensors["visual.trunk.norm.weight"] = np.full(8, 0.5, dtype=np.float16)
    metadata = {"names": ",".join(names or TOPICS), "model": model}
    safetensors_numpy.save_file(tensors, str(path), metadata=metadata)


def test_finetune_file_loads_encoder_weights_and_head(tmp_path):
    save(tmp_path / "ft.safetensors")

    finetune = load_finetune(tmp_path / "ft.safetensors", model_name=MODEL)

    assert list(finetune.visual) == ["trunk.norm.weight"]
    assert finetune.visual["trunk.norm.weight"].dtype == np.float32
    assert finetune.head.weight.shape == (4, 8)
    assert finetune.head.bias.tolist() == [0, 1, 2, 3]


def test_missing_finetune_file_means_none(tmp_path):
    assert load_finetune(tmp_path / "none.safetensors", model_name=MODEL) is None


def test_broken_finetune_file_means_none(tmp_path):
    (tmp_path / "ft.safetensors").write_bytes(b"not a tensor file")

    assert load_finetune(tmp_path / "ft.safetensors", model_name=MODEL) is None


def test_finetune_for_another_photo_model_is_rejected(tmp_path):
    save(tmp_path / "ft.safetensors", model="ViT-L-16-SigLIP2-256")

    assert load_finetune(tmp_path / "ft.safetensors", model_name=MODEL) is None


def test_finetune_with_topics_in_another_order_is_rejected(tmp_path):
    save(tmp_path / "ft.safetensors", names=["FOOD", "LANDSCAPE", "PEOPLE", "OTHER"])

    assert load_finetune(tmp_path / "ft.safetensors", model_name=MODEL) is None


def test_finetune_with_wrong_head_shape_is_rejected(tmp_path):
    save(tmp_path / "ft.safetensors", head_shape=(3, 8))

    assert load_finetune(tmp_path / "ft.safetensors", model_name=MODEL) is None


def test_finetune_without_encoder_weights_is_rejected(tmp_path):
    save(tmp_path / "ft.safetensors", visual=False)

    assert load_finetune(tmp_path / "ft.safetensors", model_name=MODEL) is None


def test_encoder_weights_replace_only_the_named_tensors():
    torch = pytest.importorskip("torch")
    module = torch.nn.Sequential(torch.nn.Linear(2, 2), torch.nn.Linear(2, 2))
    untouched = module[1].weight.detach().clone()

    apply_visual_weights(module, {"0.bias": np.array([3.0, 4.0], dtype=np.float32)})

    assert module[0].bias.tolist() == [3.0, 4.0]
    assert torch.equal(module[1].weight, untouched)


def test_encoder_weights_for_unknown_tensor_fail():
    torch = pytest.importorskip("torch")

    with pytest.raises(ValueError):
        apply_visual_weights(torch.nn.Linear(2, 2), {"missing": np.zeros(2, dtype=np.float32)})


def test_encoder_weights_with_wrong_shape_fail():
    torch = pytest.importorskip("torch")

    with pytest.raises(ValueError):
        apply_visual_weights(torch.nn.Linear(2, 2), {"bias": np.zeros(3, dtype=np.float32)})


def test_server_uses_the_shipped_finetune(caplog):
    from app.main import build_photo_classifier

    with caplog.at_level("INFO", logger="ai"):
        build_photo_classifier(Settings(_env_file=None))

    assert "photo_topic_model=finetune" in caplog.text


def test_server_falls_back_to_the_head_when_finetune_is_missing(caplog, monkeypatch, tmp_path):
    from app import main

    monkeypatch.setattr(main, "FINETUNE_PATH", tmp_path / "none.safetensors")
    with caplog.at_level("INFO", logger="ai"):
        main.build_photo_classifier(Settings(_env_file=None))

    assert "photo_topic_model=head" in caplog.text


def test_shipped_finetune_matches_the_topics_and_the_photo_model():
    settings = Settings(_env_file=None)

    finetune = load_finetune(FINETUNE_PATH, model_name=settings.clip_model)

    assert finetune is not None
    assert finetune.head.weight.shape == (len(TOPICS), 768)
    assert all(key.startswith("trunk.") for key in finetune.visual)
