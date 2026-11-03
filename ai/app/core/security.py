import secrets

from fastapi import Header, Request

from app.core.schemas import ApiError


async def require_internal_token(
    request: Request,
    x_internal_token: str | None = Header(default=None),
) -> None:
    settings = request.app.state.settings
    expected = settings.internal_api_token.strip()
    if not expected and settings.allow_no_internal_token:
        return
    # 설정이 비어 있으면 어떤 값도 통과시키지 않는다
    if not expected:
        raise ApiError(401, "UNAUTHENTICATED", "내부 토큰이 필요합니다.")
    # 문자열로 비교하면 ASCII가 아닌 값에서 TypeError가 나므로 바이트로 비교한다
    if not x_internal_token or not secrets.compare_digest(
        x_internal_token.encode(), expected.encode()
    ):
        raise ApiError(401, "UNAUTHENTICATED", "내부 토큰이 필요합니다.")
