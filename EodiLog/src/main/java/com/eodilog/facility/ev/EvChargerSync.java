package com.eodilog.facility.ev;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 충전소 적재와 상태 갱신(EODI-304).
 *
 * <ul>
 * <li>{@link #tick()}: 5분마다. 아직 전국을 받은 적이 없으면 전국 수신, 마지막 갱신이 {@code gapLimit}보다 오래됐으면
 * (서버가 꺼져 있었다) 놓친 변경을 메우려 전국 수신, 아니면 최근 {@code statusPeriodMinutes}분 변경분 수신</li>
 * <li>{@link #dailyRefresh()}: 하루 한 번 전국 수신. 새로 생기거나 없어진 충전소를 맞춘다</li>
 * </ul>
 *
 * 전국 수신은 하루 {@code maxFullRefreshesPerDay}번까지만 한다. 빈틈을 메우지 못하면 다음 전국 수신까지 상태를 숨긴다.
 * 서버가 여러 대면 임대를 잡은 한 대만 갱신한다
 */
@Slf4j
@Service
public class EvChargerSync {

	private static final ZoneId KST = ZoneId.of("Asia/Seoul");
	// 공급자 변경분 조회(period)의 최대 분
	private static final int MAX_STATUS_PERIOD = 10;

	private final EvChargerClient client;
	private final EvChargerStore store;
	private final EvChargerProperties properties;
	private final Clock clock;
	private final UUID owner = UUID.randomUUID();

	public EvChargerSync(EvChargerClient client, EvChargerStore store, EvChargerProperties properties, Clock clock) {
		this.client = client;
		this.store = store;
		this.properties = properties;
		this.clock = clock;
	}

	public void tick() {
		withLease(() -> {
			var state = store.state();
			if (state.fullCompletedAt() == null) {
				fullRefresh();
				return;
			}
			Instant now = clock.instant();
			if (state.statusSyncedAt() == null || Duration.between(state.statusSyncedAt(), now).compareTo(properties.gapLimit()) > 0) {
				if (fullRefresh()) return;
				// 빈틈을 메우지 못했다. 그사이 바뀐 상태를 모르므로 다음 전국 수신까지 상태를 보여 주지 않는다
				store.markStatusInvalid();
			}
			statusSync();
		});
	}

	public void dailyRefresh() {
		withLease(this::fullRefresh);
	}

	/** 전국 수신. 끝까지 받았을 때만 보이지 않은 충전소를 지우고 완료로 적는다 */
	boolean fullRefresh() {
		if (!store.countFullAttempt(LocalDate.now(clock.withZone(KST)), properties.maxFullRefreshesPerDay())) {
			log.warn("EV charger full refresh skipped: daily limit {} reached", properties.maxFullRefreshesPerDay());
			return false;
		}
		Instant runStart = clock.instant();
		try {
			long total;
			int page = 0;
			long chargers = 0;
			do {
				page++;
				var result = client.infoPage(page, properties.pageSize());
				total = result.totalCount();
				if (total > 0 && result.items().isEmpty()) throw new EvChargerUnavailableException("EV charger page " + page + " is empty");
				chargers += store.upsertInfo(result.items(), runStart);
			} while ((long) page * properties.pageSize() < total);
			store.deleteUnseen(runStart);
			store.markFullCompleted(clock.instant());
			store.analyze();
			log.info("EV charger full refresh done: {} pages, {} chargers", page, chargers);
			// 전국 수신에 걸린 몇 분 사이의 변경을 바로 메운다
			statusSync();
			return true;
		} catch (EvChargerUnavailableException e) {
			log.warn("EV charger full refresh failed: {}", e.getMessage());
			return false;
		}
	}

	/**
	 * 최근 변경분 수신. 받는 범위는 마지막 갱신 뒤 지난 시간을 덮도록 늘린다(최소 statusPeriodMinutes, 공급자 최대 10분).
	 * 포털이 잠깐 503을 주는 일이 있어(2026-11-11 실측) 실패하면 statusRetryDelay 뒤 다시 시도한다. 끝내 실패하면 갱신 시각을
	 * 남기지 않아, 빈틈이 길어지면 다음 차례에 전국 수신으로 메운다
	 */
	void statusSync() {
		for (int attempt = 1; ; attempt++) {
			try {
				int period = statusPeriod(store.state().statusSyncedAt());
				long total;
				int page = 0;
				do {
					page++;
					var result = client.statusPage(page, properties.pageSize(), period);
					total = result.totalCount();
					store.applyStatus(result.items());
				} while ((long) page * properties.pageSize() < total);
				store.markStatusSynced(clock.instant());
				return;
			} catch (EvChargerUnavailableException e) {
				log.warn("EV charger status sync failed ({}/{}): {}", attempt, properties.statusAttempts(), e.getMessage());
				if (attempt >= properties.statusAttempts() || !pause(properties.statusRetryDelay())) return;
			}
		}
	}

	private int statusPeriod(Instant lastSynced) {
		if (lastSynced == null) return MAX_STATUS_PERIOD;
		long minutes = (Duration.between(lastSynced, clock.instant()).toSeconds() + 59) / 60 + 1;
		return (int) Math.max(properties.statusPeriodMinutes(), Math.min(MAX_STATUS_PERIOD, minutes));
	}

	private static boolean pause(Duration delay) {
		if (delay.isZero() || delay.isNegative()) return true;
		try {
			Thread.sleep(delay);
			return true;
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			return false;
		}
	}

	private void withLease(Runnable work) {
		if (!properties.hasKey()) return;
		Instant now = clock.instant();
		if (!store.tryLease(owner, now, now.plus(properties.lease()))) return;
		try {
			work.run();
		} catch (RuntimeException e) {
			log.warn("EV charger sync failed ({})", e.getClass().getSimpleName());
		} finally {
			store.releaseLease(owner);
		}
	}

}
