"""이미지 처리 (spec §2 T-01-9·T-01-10, §8 T-08-4): 위치 정보 제거, 형식 구분, 깨진 파일 방어."""

import io

import pillow_heif
import pytest
from PIL import Image, ImageFile, PngImagePlugin

from app.clients import images
from app.clients.images import (
    CAPTURE_FORMATS,
    PHOTO_FORMATS,
    ImageDecodeError,
    UnsupportedImage,
    open_image,
    to_llm_jpeg,
)

GPS_IFD = 0x8825
ORIENTATION = 0x0112


def encode(image: Image.Image, fmt: str, **options) -> bytes:
    out = io.BytesIO()
    image.save(out, format=fmt, **options)
    return out.getvalue()


def solid(size=(10, 10), color=(200, 30, 30), mode="RGB") -> Image.Image:
    return Image.new(mode, size, color)


def reopen(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def test_output_is_jpeg():
    assert reopen(to_llm_jpeg(encode(solid(), "PNG"))).format == "JPEG"


def test_removes_location_and_other_metadata():
    exif = Image.Exif()
    exif.get_ifd(GPS_IFD)[2] = (35.0, 4.0, 0.0)
    exif[0x010F] = "SecretCamera"
    source = encode(solid(), "JPEG", exif=exif, comment=b"secret comment")
    assert Image.open(io.BytesIO(source)).getexif().get_ifd(GPS_IFD)

    output = to_llm_jpeg(source)

    assert not reopen(output).getexif()
    assert b"SecretCamera" not in output
    assert b"secret comment" not in output


def test_removes_png_text_metadata():
    text = PngImagePlugin.PngInfo()
    text.add_text("location", "secret place")

    output = to_llm_jpeg(encode(solid(), "PNG", pnginfo=text))

    assert b"secret place" not in output


def test_shrinks_long_side_to_1600_keeping_ratio():
    output = reopen(to_llm_jpeg(encode(solid((3200, 800)), "PNG")))

    assert output.size == (1600, 400)


def test_does_not_enlarge_small_image():
    assert reopen(to_llm_jpeg(encode(solid((100, 50)), "PNG"))).size == (100, 50)


def test_applies_orientation_before_removing_it():
    # 태그만 지우면 세로로 찍은 간판이 옆으로 누운 채 LLM에 전달된다
    exif = Image.Exif()
    exif[ORIENTATION] = 6

    output = reopen(to_llm_jpeg(encode(solid((200, 100)), "JPEG", exif=exif)))

    assert output.size == (100, 200)


def test_transparent_png_becomes_white_background():
    # 그대로 RGB로 바꾸면 투명 영역이 검게 되어 검은 글씨 캡처를 읽을 수 없다
    transparent = solid((10, 10), (0, 0, 0, 0), "RGBA")

    output = reopen(to_llm_jpeg(encode(transparent, "PNG")))

    assert min(output.getpixel((5, 5))) > 240


def test_palette_png_with_transparency_becomes_white_background():
    transparent = solid((10, 10), (0, 0, 0, 0), "RGBA").convert("P")

    output = reopen(to_llm_jpeg(encode(transparent, "PNG", transparency=0)))

    assert min(output.getpixel((5, 5))) > 240


@pytest.mark.parametrize("fmt", ["WEBP", "GIF", "BMP"])
def test_other_formats_are_unsupported(fmt):
    with pytest.raises(UnsupportedImage):
        to_llm_jpeg(encode(solid(), fmt))


def test_format_is_rejected_before_decoding(monkeypatch):
    # 지원하지 않는 형식의 디코더까지 공격 표면으로 만들지 않는다
    def fail_load(self):
        raise AssertionError("지원하지 않는 형식을 디코딩했다")

    data = encode(solid(), "BMP")
    monkeypatch.setattr(ImageFile.ImageFile, "load", fail_load)

    with pytest.raises(UnsupportedImage):
        open_image(data, CAPTURE_FORMATS)


@pytest.mark.parametrize(
    "data",
    [b"", b"not an image", encode(solid((500, 500)), "PNG")[:200]],
    ids=["empty", "garbage", "truncated"],
)
def test_broken_files_raise_decode_error(data):
    with pytest.raises(ImageDecodeError):
        to_llm_jpeg(data)


def test_decompression_bomb_raises_decode_error():
    bomb = encode(Image.new("1", (20000, 10000)), "PNG")

    with pytest.raises(ImageDecodeError):
        to_llm_jpeg(bomb)


def test_too_many_pixels_rejected_before_decoding(monkeypatch):
    monkeypatch.setattr(images, "MAX_PIXELS", 99)

    with pytest.raises(ImageDecodeError):
        to_llm_jpeg(encode(solid((10, 10)), "PNG"))


def heic_bytes() -> bytes:
    out = io.BytesIO()
    pillow_heif.from_pillow(solid((16, 16))).save(out, format="HEIF")
    return out.getvalue()


def test_heic_opens_as_photo():
    image = open_image(heic_bytes(), PHOTO_FORMATS)

    assert image.format == "HEIF"
    assert image.size == (16, 16)


def test_heic_is_not_a_capture_format():
    with pytest.raises(UnsupportedImage):
        to_llm_jpeg(heic_bytes())
