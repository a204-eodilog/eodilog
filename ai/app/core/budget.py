"""요청 시간 예산 (spec §1.0): 요청 하나를 정해진 시간 안에 끝내거나 503을 돌려준다.

BaseHTTPMiddleware는 응답을 보낸 뒤에도 엔드포인트가 끝나기를 기다리므로 ASGI로 직접 감싸 취소한다.
동기 `def` 엔드포인트의 스레드는 취소되지 않아 503이 늦어진다. 오래 걸리는 CPU 작업은
`async def` 안에서 `asyncio.to_thread`로 돌린다. 이때 503은 제때 나가지만 스레드는 끝까지 돈다.
"""

import asyncio
import logging

from fastapi import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import unavailable_response

log = logging.getLogger("ai")


class RequestBudgetMiddleware:
    def __init__(self, app: ASGIApp, seconds: float):
        self._app = app
        self._seconds = seconds

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        response_started = False

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            response_started = response_started or message["type"] == "http.response.start"
            await send(message)

        try:
            async with asyncio.timeout(self._seconds) as budget:
                await self._app(scope, receive, tracking_send)
        except TimeoutError:
            # 엔드포인트가 직접 던진 TimeoutError는 예산 초과가 아니라 내부 오류(500)다
            if not budget.expired() or response_started:
                raise
            log.warning("request_over_budget path=%s", scope["path"])
            await unavailable_response(Request(scope))(scope, receive, send)
