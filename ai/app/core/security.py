import secrets

from fastapi import Header, Request

from app.core.schemas import ApiError


async def require_internal_token(
    request: Request,
    x_internal_token: str | None = Header(default=None),
) -> None:
    expected = request.app.state.settings.internal_api_token
    if not expected:
        return
    # 문자열로 비교하면 ASCII가 아닌 값에서 TypeError가 나므로 바이트로 비교한다
    if not x_internal_token or not secrets.compare_digest(
        x_internal_token.encode(), expected.encode()
    ):
        raise ApiError(401, "UNAUTHENTICATED", "내부 토큰이 필요합니다.")
