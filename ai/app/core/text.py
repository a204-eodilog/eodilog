"""이름 비교에 쓰는 문자열 정규화."""

import unicodedata


def normalize(text: str) -> str:
    folded = unicodedata.normalize("NFKC", text).casefold()
    return "".join(char for char in folded if char.isalnum())
