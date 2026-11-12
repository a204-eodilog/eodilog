"""녹음 파일이 M4A(MP4 컨테이너 + AAC)인지와 길이를 확인한다. MIME·확장자는 믿지 않는다.

외부 도구 없이 MP4 상자 구조만 읽는다: ftyp → moov/trak 중 소리 트랙(hdlr 'soun')의
mdhd 길이와 stsd 첫 항목('mp4a' + esds의 AAC 형식 번호).
"""

import struct
from dataclasses import dataclass

# esds의 objectTypeIndication. 0x40 MPEG-4 AAC, 0x66~0x68 MPEG-2 AAC. 0x6B(MP3) 등은 받지 않는다
AAC_OBJECT_TYPES = {0x40, 0x66, 0x67, 0x68}


class AudioInvalid(ValueError):
    pass


@dataclass(frozen=True)
class AudioInfo:
    duration_seconds: float


def inspect_m4a(data: bytes) -> AudioInfo:
    top = _boxes(data, 0, len(data))
    if not top or top[0][0] != b"ftyp":
        raise AudioInvalid("MP4 컨테이너가 아닙니다.")
    moov = _first(data, top, b"moov")
    for kind, start, end in _boxes(data, *moov):
        if kind == b"trak":
            info = _sound_track(data, start, end)
            if info is not None:
                return info
    raise AudioInvalid("소리 트랙이 없습니다.")


def _sound_track(data: bytes, start: int, end: int) -> AudioInfo | None:
    mdia = _first(data, _boxes(data, start, end), b"mdia")
    children = _boxes(data, *mdia)
    hdlr = _first(data, children, b"hdlr")
    if data[hdlr[0] + 8 : hdlr[0] + 12] != b"soun":
        return None
    duration = _mdhd_seconds(data, *_first(data, children, b"mdhd"))
    minf = _first(data, children, b"minf")
    stbl = _first(data, _boxes(data, *minf), b"stbl")
    stsd_start, stsd_end = _first(data, _boxes(data, *stbl), b"stsd")
    entries = _boxes(data, stsd_start + 8, stsd_end)
    if not entries or entries[0][0] != b"mp4a":
        raise AudioInvalid("AAC가 아닙니다.")
    _, entry_start, entry_end = entries[0]
    # AudioSampleEntry 고정 28바이트 뒤에 esds가 온다
    esds = _first(data, _boxes(data, entry_start + 28, entry_end), b"esds")
    if _object_type(data, *esds) not in AAC_OBJECT_TYPES:
        raise AudioInvalid("AAC가 아닙니다.")
    return AudioInfo(duration_seconds=duration)


def _boxes(data: bytes, start: int, end: int) -> list[tuple[bytes, int, int]]:
    """[start, end) 안의 상자들. 각 항목은 (종류, 내용 시작, 내용 끝)."""
    found = []
    offset = start
    while offset + 8 <= end:
        size, kind = struct.unpack_from(">I4s", data, offset)
        header = 8
        if size == 1:
            if offset + 16 > end:
                raise AudioInvalid("파일이 잘렸습니다.")
            size = struct.unpack_from(">Q", data, offset + 8)[0]
            header = 16
        elif size == 0:
            size = end - offset
        if size < header or offset + size > end:
            raise AudioInvalid("파일이 잘렸습니다.")
        found.append((kind, offset + header, offset + size))
        offset += size
    return found


def _first(data: bytes, boxes: list[tuple[bytes, int, int]], kind: bytes) -> tuple[int, int]:
    for found, start, end in boxes:
        if found == kind:
            return start, end
    raise AudioInvalid(f"{kind.decode(errors='replace')} 상자가 없습니다.")


def _mdhd_seconds(data: bytes, start: int, end: int) -> float:
    try:
        if data[start] == 1:
            timescale, duration = struct.unpack_from(">IQ", data, start + 20)
        else:
            timescale, duration = struct.unpack_from(">II", data, start + 12)
    except (struct.error, IndexError) as e:
        raise AudioInvalid("길이를 읽지 못했습니다.") from e
    if not timescale or start + 12 > end:
        raise AudioInvalid("길이를 읽지 못했습니다.")
    return duration / timescale


def _object_type(data: bytes, start: int, end: int) -> int:
    """esds(ES_Descriptor 0x03 → DecoderConfigDescriptor 0x04)의 첫 바이트."""
    offset = start + 4  # version·flags
    try:
        offset = _descriptor(data, offset, 0x03)
        flags = data[offset + 2]
        offset += 3
        if flags & 0x80:
            offset += 2
        if flags & 0x40:
            offset += 1 + data[offset]
        if flags & 0x20:
            offset += 2
        offset = _descriptor(data, offset, 0x04)
        if offset >= end:
            raise AudioInvalid("코덱 정보가 잘렸습니다.")
        return data[offset]
    except IndexError as e:
        raise AudioInvalid("코덱 정보가 잘렸습니다.") from e


def _descriptor(data: bytes, offset: int, tag: int) -> int:
    """태그를 확인하고 내용 시작 위치를 돌려준다. 길이는 7비트씩 최대 4바이트."""
    if data[offset] != tag:
        raise AudioInvalid("코덱 정보가 올바르지 않습니다.")
    offset += 1
    for _ in range(4):
        byte = data[offset]
        offset += 1
        if not byte & 0x80:
            break
    return offset
