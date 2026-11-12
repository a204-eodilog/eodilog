"""받아쓴 글에서 금액 표현을 읽는다. LLM이 말하지 않은 금액을 만들었는지 확인하는 데만 쓴다.

'2만4천', '2만 4천', '만 2천', '만이천', '12,000', '1.5만', '3천5백'을 원 단위 정수로 읽는다.
조사 '이'처럼 숫자로 읽히는 글자도 후보에 들어가지만, 후보는 '말한 적이 있는 금액인가'를
볼 때만 쓰여 허용 범위가 조금 넓어질 뿐이다.
"""

import re

_DIGITS = {"일": 1, "이": 2, "삼": 3, "사": 4, "오": 5, "육": 6, "칠": 7, "팔": 8, "구": 9}
_SMALL = {"십": 10, "백": 100, "천": 1000}
_BIG = {"만": 10_000, "억": 100_000_000}
_RUN = re.compile(r"(?:\d[\d,]*(?:\.\d+)?|[일이삼사오육칠팔구십백천만억])+")
_TOKEN = re.compile(r"\d+(?:\.\d+)?|[일이삼사오육칠팔구십백천만억]")


def amounts_in(text: str) -> set[int]:
    runs = [(m.start(), m.end(), m.group()) for m in _RUN.finditer(text)]
    found: set[int] = set()
    joined = ""
    for i, (start, _end, run) in enumerate(runs):
        # '2만 4천', '만 2천'처럼 만·억 뒤 띄어쓰기는 한 금액으로 잇는다
        previous_end = runs[i - 1][1] if i else None
        if joined and previous_end is not None and not text[previous_end:start].strip():
            if joined[-1] in _BIG:
                joined += run
            else:
                joined = run
        else:
            joined = run
        for candidate in {run, joined}:
            value = _value(candidate)
            if value:
                found.add(value)
    return found


def _value(expression: str) -> int | None:
    total = 0.0
    section = 0.0
    current: float | None = None
    for token in _TOKEN.findall(expression.replace(",", "")):
        if token in _DIGITS:
            current = _DIGITS[token]
        elif token in _SMALL:
            section += (1 if current is None else current) * _SMALL[token]
            current = None
        elif token in _BIG:
            section += current or 0
            total += (section or 1) * _BIG[token]
            section, current = 0.0, None
        else:
            current = float(token)
    total += section + (current or 0)
    return int(total) if total > 0 and total == int(total) else None
