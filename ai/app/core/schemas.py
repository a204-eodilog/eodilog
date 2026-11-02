"""백엔드 공통 계약에 맞춘 응답·오류 형식 (spec §1, 백엔드 api-spec §2).

성공: {"data": ...}
실패: {"error": {"code", "message", "fields": [{"field", "message"}], "traceId"}}
"""

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class CamelModel(BaseModel):
    """JSON은 camelCase, 파이썬 코드는 snake_case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Data(CamelModel, Generic[T]):
    data: T


class ErrorField(CamelModel):
    field: str
    message: str


class ApiError(Exception):
    """처리 실패. 백엔드 오류 형식과 HTTP 상태로 바뀐다."""

    def __init__(
        self, status: int, code: str, message: str, fields: list[ErrorField] | None = None
    ):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields or []
