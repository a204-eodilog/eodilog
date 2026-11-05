package com.eodilog.poll.service;

import com.eodilog.global.common.error.ExceptionDiagnostics;
import com.eodilog.poll.domain.Poll;
import com.eodilog.poll.repository.PollRepository;
import com.eodilog.poll.repository.PollTallyRepository;
import com.eodilog.trip.repository.TripRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

// 마감까지 1시간 이하로 남은 OPEN 투표의 미투표 멤버에게 한 번 알린다(POLL_REMINDER). 주기 마감(PollAutoCloser)과 같은 틀이다
// 여행마다 따로 커밋해 한 여행의 실패가 다른 여행을 막지 않는다. 잠금은 여행 행 → 투표 행 순서이고, 잠근 뒤 다시 읽은 조건으로
// 판단하므로 여러 서버가 동시에 돌아도 한 번만 보낸다. 1시간이 안 남은 채로 열린 투표도 다음 주기에 바로 보낸다
@Slf4j
@Service
public class PollReminderSender {

	public static final Duration REMINDER_WINDOW = Duration.ofHours(1);
	static final int BATCH_SIZE = 100;

	private final PollTallyRepository pollTallyRepository;
	private final PollRepository pollRepository;
	private final TripRepository tripRepository;
	private final PollNotifier pollNotifier;
	private final Clock clock;
	private final TransactionTemplate transactionTemplate;

	public PollReminderSender(PollTallyRepository pollTallyRepository, PollRepository pollRepository,
			TripRepository tripRepository, PollNotifier pollNotifier, Clock clock,
			PlatformTransactionManager transactionManager) {
		this.pollTallyRepository = pollTallyRepository;
		this.pollRepository = pollRepository;
		this.tripRepository = tripRepository;
		this.pollNotifier = pollNotifier;
		this.clock = clock;
		this.transactionTemplate = new TransactionTemplate(transactionManager);
	}

	// 처리한 여행 수. 한 번에 BATCH_SIZE개 여행까지만 처리하고 나머지는 다음 주기에 한다
	public int sendDueReminders() {
		Instant now = now();
		List<UUID> tripIds = pollTallyRepository.tripIdsWithReminderDuePolls(now, now.plus(REMINDER_WINDOW),
				BATCH_SIZE);
		int processed = 0;
		for (UUID tripId : tripIds) {
			try {
				transactionTemplate.executeWithoutResult(status -> sendForTrip(tripId));
				processed++;
			} catch (RuntimeException ex) {
				// 예외 메시지는 SQL을 담을 수 있어 남기지 않는다. 다음 주기에 다시 시도한다
				log.error("Poll reminder failure tripId={} diagnostics={}", tripId, ExceptionDiagnostics.summarize(ex));
			}
		}
		return processed;
	}

	private void sendForTrip(UUID tripId) {
		// 나가기·초대 수락과 엇갈리지 않게 여행 행을 먼저 잠근다. 그 사이 삭제된 여행은 건너뛴다
		if (tripRepository.findActiveByIdForUpdate(tripId).isEmpty()) {
			return;
		}
		Instant now = now();
		for (Poll poll : pollRepository.findReminderDueForUpdate(tripId, now, now.plus(REMINDER_WINDOW))) {
			pollNotifier.reminder(poll, pollTallyRepository.activeNonVoterUserIds(tripId, poll.getId()));
			poll.markReminderSent(now);
		}
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

}
