"""말로 새 여행 작업(실험).

10분 녹음은 받아쓰기·정리에 30초~1분이 걸려 요청 한 번(45초 상한)에 끝내지 않는다.

POST로 작업을 만들고 바로 돌려준 뒤, 앱이 GET으로 단계를 본다. 작업은 이 서버 메모리에만 30분 둔다.
DEV에 넣으면 이 일은 백엔드 작업(Job)과 알림으로 옮긴다.
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from app.clients.errors import ProviderUnavailable
from app.core.schemas import CamelModel
from app.features.voice_trip.service import TripDraft, VoiceTripMaker

log = logging.getLogger("ai")

KEEP_SECONDS = 30 * 60
MAX_JOBS = 100
# 서울은 서머타임이 없어 +9 고정으로 둔다(윈도에는 tzdata가 없을 수 있다)
SEOUL = timezone(timedelta(hours=9))

Status = Literal["RUNNING", "SUCCEEDED", "FAILED"]
Step = Literal["TRANSCRIBING", "UNDERSTANDING", "SEARCHING", "DONE"]


class JobError(CamelModel):
    code: str
    message: str


class TripJobView(CamelModel):
    job_id: str
    status: Status
    step: Step
    # 장소 찾기 진행(찾은 수 / 찾을 수)
    searched: int = 0
    to_search: int = 0
    audio_seconds: float | None = None
    draft: TripDraft | None = None
    error: JobError | None = None


@dataclass
class _Job:
    view: TripJobView
    created: float = field(default_factory=time.monotonic)


def seoul_today() -> date:
    return datetime.now(SEOUL).date()


class TripJobs:
    def __init__(self):
        self._jobs: dict[str, _Job] = {}
        # 돌고 있는 작업이 가비지 컬렉션으로 사라지지 않게 붙잡아 둔다
        self._tasks: set[asyncio.Task] = set()

    def get(self, job_id: str) -> TripJobView | None:
        self._prune()
        job = self._jobs.get(job_id)
        return job.view if job else None

    def start(self, *, audio: bytes | None, text: str | None, stt, maker: VoiceTripMaker) -> str:
        self._prune()
        job_id = uuid.uuid4().hex
        view = TripJobView(
            job_id=job_id, status="RUNNING", step="TRANSCRIBING" if audio else "UNDERSTANDING"
        )
        self._jobs[job_id] = _Job(view)
        # 요청 예산(45초) 밖에서 돈다. 응답을 보낸 뒤에도 끊기지 않는다
        task = asyncio.create_task(self._run(view, audio, text, stt, maker))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return job_id

    async def _run(self, view: TripJobView, audio, text, stt, maker: VoiceTripMaker) -> None:
        started = time.perf_counter()
        try:
            if audio is not None:
                heard = await stt.transcribe(audio, hints=[])
                # 원음은 받아쓴 뒤 바로 놓는다(저장하지 않는다)
                del audio
                view.audio_seconds = heard.duration_seconds
                text = heard.text.strip()
                if not text:
                    self._fail(view, "INSUFFICIENT_DATA", "말소리를 듣지 못했어요")
                    return
            view.step = "UNDERSTANDING"

            def on_search(done: int, total: int) -> None:
                view.step = "SEARCHING"
                view.searched, view.to_search = done, total

            view.draft = await maker.draft(text or "", today=seoul_today(), on_search=on_search)
            view.step = "DONE"
            view.status = "SUCCEEDED"
        except ProviderUnavailable:
            self._fail(view, "PROVIDER_UNAVAILABLE", "AI 서버가 잠시 답하지 않아요. 다시 해 주세요")
        except Exception:
            log.exception("voice_trip_job_failed")
            self._fail(view, "INTERNAL_ERROR", "정리하지 못했어요. 다시 해 주세요")
        finally:
            log.info(
                "voice_trip_job status=%s elapsed_ms=%d audio_seconds=%s",
                view.status,
                (time.perf_counter() - started) * 1000,
                view.audio_seconds,
            )

    @staticmethod
    def _fail(view: TripJobView, code: str, message: str) -> None:
        view.status = "FAILED"
        view.error = JobError(code=code, message=message)

    def _prune(self) -> None:
        now = time.monotonic()
        for job_id in [k for k, j in self._jobs.items() if now - j.created > KEEP_SECONDS]:
            del self._jobs[job_id]
        while len(self._jobs) >= MAX_JOBS:
            del self._jobs[next(iter(self._jobs))]
