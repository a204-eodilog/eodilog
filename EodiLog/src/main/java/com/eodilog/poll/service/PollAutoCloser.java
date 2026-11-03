package com.eodilog.poll.service;

import com.eodilog.global.common.error.ExceptionDiagnostics;
import com.eodilog.poll.repository.PollTallyRepository;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

// 아무도 조회하지 않아도 마감 시각이 지난 투표를 마감한다(V-12 ② 주기 마감). 여행마다 따로 커밋해 한 여행의 실패가 다른 여행을 막지 않는다
// 여러 서버가 동시에 돌아도 PollCloser가 여행 행을 잠근 뒤 OPEN인지 다시 확인하므로 한 번만 마감한다
@Slf4j
@Service
public class PollAutoCloser {

	static final int BATCH_SIZE = 100;

	private final PollTallyRepository pollTallyRepository;
	private final PollCloser pollCloser;
	private final Clock clock;

	public PollAutoCloser(PollTallyRepository pollTallyRepository, PollCloser pollCloser, Clock clock) {
		this.pollTallyRepository = pollTallyRepository;
		this.pollCloser = pollCloser;
		this.clock = clock;
	}

	// 마감한 여행 수. 한 번에 BATCH_SIZE개 여행까지만 처리하고 나머지는 다음 주기에 한다
	public int closeDuePolls() {
		List<UUID> tripIds = pollTallyRepository.tripIdsWithDuePolls(clock.instant(), BATCH_SIZE);
		int closed = 0;
		for (UUID tripId : tripIds) {
			try {
				pollCloser.closeDuePollsNow(tripId);
				closed++;
			} catch (RuntimeException ex) {
				// 예외 메시지는 SQL을 담을 수 있어 남기지 않는다. 다음 주기에 다시 시도한다
				log.error("Poll auto-close failure tripId={} diagnostics={}", tripId, ExceptionDiagnostics.summarize(ex));
			}
		}
		return closed;
	}

}
