FROM python:3.11-slim AS build

ENV UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    HF_HOME=/opt/hf

RUN pip install --no-cache-dir uv==0.12.5

WORKDIR /srv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --extra vision

COPY app ./app
# 모델을 이미지에 넣어 서버 시작 때 외부에서 받지 않는다.
# 파인튜닝 파일이 모델과 맞지 않으면 여기서 빌드를 멈춘다 (spec AS-20)
RUN .venv/bin/python -c "\
from app.core.config import Settings; \
from app.features.photo_classification.embedder import SiglipEmbedder; \
from app.features.photo_classification.finetune import FINETUNE_PATH, load_finetune; \
s = Settings(_env_file=None); \
ft = load_finetune(FINETUNE_PATH, model_name=s.clip_model); \
assert ft is not None, 'photo_finetune.safetensors not usable'; \
SiglipEmbedder(model_name=s.clip_model, pretrained=s.clip_pretrained, visual_weights=ft.visual).embed_texts(['ok'])"


FROM python:3.11-slim

ENV PATH=/srv/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/opt/hf \
    HF_HUB_OFFLINE=1 \
    PHOTO_MODEL_PRELOAD=true

RUN useradd --create-home --uid 1000 app

COPY --from=build /srv /srv
COPY --from=build /opt/hf /opt/hf

WORKDIR /srv
USER app
EXPOSE 8000

# 모델을 올리는 동안은 포트가 열리지 않는다
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/ai/v1/health', timeout=4)"

# 프로세스마다 모델을 따로 올리므로 worker는 하나만 둔다
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
