"""이미지 검사와 LLM 전송용 변환 (spec §2, §8).

CPU를 쓰므로 호출하는 쪽에서 `asyncio.to_thread`로 돌린다.
"""

import io

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

# 백엔드 확정: 캡처는 JPG·PNG, 여행 사진은 JPG·PNG·HEIC
CAPTURE_FORMATS = frozenset({"JPEG", "PNG"})
PHOTO_FORMATS = frozenset({"JPEG", "PNG", "HEIF"})

LLM_MAX_SIDE = 1600
# 작은 파일이 큰 메모리로 풀리는 압축 폭탄을 막는다
MAX_PIXELS = 100_000_000


class ImageDecodeError(Exception):
    """깨진 파일. 그 파일만 실패로 처리한다."""


class UnsupportedImage(Exception):
    """지원하지 않는 형식. 422 UNSUPPORTED_INPUT으로 돌려준다."""


def open_image(data: bytes, allowed: frozenset[str], *, min_side: int | None = None) -> Image.Image:
    """`min_side`를 주면 JPEG를 짧은 변이 그 이상인 크기까지만 풀어 디코딩 시간을 줄인다."""
    # Pillow는 깨진 파일에 다양한 예외를 던지므로 신뢰할 수 없는 입력에서는 모두 깨진 파일로 본다
    try:
        image = Image.open(io.BytesIO(data))
    except Exception as e:
        raise ImageDecodeError("이미지를 열 수 없습니다.") from e
    # 여기까지는 머리글만 읽었다. 허용한 형식과 크기만 실제로 디코딩한다
    if image.format not in allowed:
        raise UnsupportedImage(f"지원하지 않는 형식: {image.format}")
    if image.width * image.height > MAX_PIXELS:
        raise ImageDecodeError("이미지가 너무 큽니다.")
    try:
        if min_side is not None:
            image.draft("RGB", (min_side, min_side))
        image.load()
    except Exception as e:
        raise ImageDecodeError("이미지를 열 수 없습니다.") from e
    return image


def to_llm_jpeg(data: bytes) -> bytes:
    """캡처를 1600px JPEG로 바꾼다. 위치 등 메타데이터는 모두 버린다."""
    image = open_image(data, CAPTURE_FORMATS)
    try:
        # 회전 정보도 지워지므로 지우기 전에 픽셀에 반영한다
        rotated = ImageOps.exif_transpose(image)
        flattened = Image.alpha_composite(
            Image.new("RGBA", rotated.size, "white"), rotated.convert("RGBA")
        ).convert("RGB")
        flattened.thumbnail((LLM_MAX_SIDE, LLM_MAX_SIDE))
        out = io.BytesIO()
        flattened.save(out, format="JPEG", quality=85)
    except Exception as e:
        raise ImageDecodeError("이미지를 변환할 수 없습니다.") from e
    return out.getvalue()
