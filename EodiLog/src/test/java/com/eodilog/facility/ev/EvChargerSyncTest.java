package com.eodilog.facility.ev;

import static org.assertj.core.api.Assertions.assertThat;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.facility.ev.EvChargerClient.ChargerInfo;
import com.eodilog.facility.ev.EvChargerClient.ChargerStatus;
import com.eodilog.facility.ev.EvChargerClient.Page;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** 충전소 적재·상태 갱신 규칙(EODI-304). 공급자는 가짜로 바꾸고 실제 DB에 쓴다 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class EvChargerSyncTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired EvChargerStore store;

	FakeClient client;
	MutableClock clock;
	EvChargerSync sync;

	@BeforeEach
	void setUp() {
		jdbc.update("DELETE FROM ev_chargers");
		jdbc.update("DELETE FROM ev_stations");
		jdbc.update("UPDATE ev_sync_state SET full_completed_at = NULL, status_synced_at = NULL, status_valid = false,"
				+ " full_attempt_day = NULL, full_attempts = 0, lease_owner = NULL, lease_until = NULL WHERE id = 1");
		client = new FakeClient();
		clock = new MutableClock(Instant.parse("2026-11-11T03:00:00Z"));
		sync = new EvChargerSync(client, store, properties("key", 2, 3), clock);
	}

	@Test
	void firstTickLoadsEveryPageAndSkipsDeletedOrInvalidRows() {
		client.info = List.of(info("A", "01", "2", "2026-11-11T02:00:00Z"), info("A", "02", "3", "2026-11-11T02:00:00Z"),
				info("B", "01", "2", "2026-11-11T02:00:00Z"), deleted("C", "01"), noCoordinates("D", "01"));
		sync.tick();
		assertThat(client.infoCalls).isEqualTo(3); // 5줄 ÷ 2줄씩
		assertThat(stations()).containsExactly("A", "B");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM ev_chargers", Integer.class)).isEqualTo(3);
		var state = store.state();
		assertThat(state.fullCompletedAt()).isEqualTo(clock.instant());
		assertThat(state.statusValid()).isTrue();
		// 전국 수신 직후 변경분도 바로 받는다
		assertThat(client.statusCalls).isEqualTo(1);
	}

	@Test
	void statusChangesApplyOnlyWhenNewer() {
		client.info = List.of(info("A", "01", "2", "2026-11-11T02:00:00Z"), info("A", "02", "2", "2026-11-11T02:00:00Z"));
		sync.tick();
		client.status = List.of(status("A", "01", "3", "2026-11-11T02:30:00Z"), status("A", "02", "3", "2026-11-11T01:00:00Z"),
				status("Z", "09", "3", "2026-11-11T02:30:00Z"));
		clock.advance(Duration.ofMinutes(5));
		sync.tick();
		assertThat(charger("A", "01")).isEqualTo("3");
		assertThat(charger("A", "02")).isEqualTo("2"); // 저장된 것보다 오래된 변경
		assertThat(store.state().statusSyncedAt()).isEqualTo(clock.instant());
		assertThat(client.infoCalls).isEqualTo(1);
	}

	@Test
	void gapLongerThanLimitReloadsEverythingUpToDailyLimit() {
		client.info = List.of(info("A", "01", "2", "2026-11-11T02:00:00Z"));
		sync.tick(); // 시도 1
		clock.advance(Duration.ofMinutes(11));
		sync.tick(); // 빈틈 → 시도 2
		assertThat(client.infoCalls).isEqualTo(2);
		clock.advance(Duration.ofMinutes(11));
		sync.tick(); // 빈틈 → 시도 3(상한 3)
		clock.advance(Duration.ofMinutes(11));
		sync.tick(); // 상한이라 전국 수신 없이 변경분만 받고 상태를 숨긴다
		assertThat(client.infoCalls).isEqualTo(3);
		var state = store.state();
		assertThat(state.statusValid()).isFalse();
		assertThat(state.statusSyncedAt()).isEqualTo(clock.instant());
		// 다음 날 하루 한 번 수신이 성공하면 다시 보여 준다
		clock.advance(Duration.ofDays(1));
		sync.dailyRefresh();
		assertThat(store.state().statusValid()).isTrue();
	}

	@Test
	void unfinishedReloadDeletesNothingAndFinishedReloadDropsMissingStations() {
		client.info = List.of(info("A", "01", "2", "2026-11-11T02:00:00Z"), info("B", "01", "2", "2026-11-11T02:00:00Z"));
		sync.tick();
		Instant firstDone = store.state().fullCompletedAt();
		// 두 번째 쪽에서 실패: B가 응답에 없어도 지우지 않는다
		client.info = List.of(info("A", "01", "2", "2026-11-11T02:10:00Z"), info("A", "02", "2", "2026-11-11T02:10:00Z"),
				info("C", "01", "2", "2026-11-11T02:10:00Z"));
		client.failInfoPage = 2;
		clock.advance(Duration.ofHours(1));
		sync.dailyRefresh();
		assertThat(stations()).containsExactly("A", "B");
		assertThat(store.state().fullCompletedAt()).isEqualTo(firstDone);
		// 끝까지 받으면 없어진 B를 지운다
		client.failInfoPage = 0;
		clock.advance(Duration.ofMinutes(1));
		sync.dailyRefresh();
		assertThat(stations()).containsExactly("A", "C");
	}

	@Test
	void anotherServerHoldingTheLeaseSkipsThisTickAndNoKeyDoesNothing() {
		client.info = List.of(info("A", "01", "2", "2026-11-11T02:00:00Z"));
		assertThat(store.tryLease(UUID.randomUUID(), clock.instant(), clock.instant().plus(Duration.ofMinutes(30)))).isTrue();
		sync.tick();
		assertThat(client.infoCalls).isZero();
		jdbc.update("UPDATE ev_sync_state SET lease_owner = NULL, lease_until = NULL WHERE id = 1");
		new EvChargerSync(client, store, properties("", 2, 3), clock).tick();
		assertThat(client.infoCalls).isZero();
		sync.tick();
		assertThat(client.infoCalls).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT lease_owner FROM ev_sync_state WHERE id = 1", UUID.class)).isNull();
	}

	@Test
	void failedStatusSyncLeavesTheOldSyncTime() {
		client.info = List.of(info("A", "01", "2", "2026-11-11T02:00:00Z"));
		sync.tick();
		Instant synced = store.state().statusSyncedAt();
		client.failStatus = true;
		clock.advance(Duration.ofMinutes(5));
		sync.tick();
		assertThat(store.state().statusSyncedAt()).isEqualTo(synced);
	}

	// 전국 수신 중 한 쪽이 잠깐 실패하면 그 쪽만 다시 불러 끝까지 받는다. 처음부터 다시 받지 않고 하루 횟수도 한 번만 쓴다
	@Test
	void pageThatFailsBrieflyIsRetriedAndTheReloadFinishes() {
		client.info = List.of(info("A", "01", "2", "2026-11-11T02:00:00Z"), info("B", "01", "2", "2026-11-11T02:00:00Z"),
				info("C", "01", "2", "2026-11-11T02:00:00Z"));
		client.failInfoPage = 2;
		client.failInfoPageTimes = 2;
		sync.tick();
		assertThat(client.infoCalls).isEqualTo(4); // 1쪽, 2쪽 실패 두 번, 2쪽 성공
		assertThat(stations()).containsExactly("A", "B", "C");
		assertThat(store.state().fullCompletedAt()).isEqualTo(clock.instant());
		assertThat(jdbc.queryForObject("SELECT full_attempts FROM ev_sync_state WHERE id = 1", Integer.class)).isEqualTo(1);
	}

	// 한 쪽이 pageAttempts번(여기서는 3번) 모두 실패하면 이번 전국 수신을 그만둔다. 받은 쪽은 남고 완료로 적지 않는다
	@Test
	void pageThatKeepsFailingStopsTheReloadAfterItsAttempts() {
		client.info = List.of(info("A", "01", "2", "2026-11-11T02:00:00Z"), info("B", "01", "2", "2026-11-11T02:00:00Z"),
				info("C", "01", "2", "2026-11-11T02:00:00Z"));
		client.failInfoPage = 2;
		sync.tick();
		assertThat(client.infoCalls).isEqualTo(4); // 1쪽, 2쪽 세 번
		assertThat(stations()).containsExactly("A", "B");
		assertThat(store.state().fullCompletedAt()).isNull();
		assertThat(client.statusCalls).isZero();
	}

	// 포털이 잠깐 503을 주면 다시 시도하고, 마지막 갱신 뒤 지난 시간만큼 받는 범위를 늘린다(최대 10분)
	@Test
	void briefOutageIsRetriedAndWindowCoversTheGap() {
		client.info = List.of(info("A", "01", "2", "2026-11-11T02:00:00Z"));
		sync.tick();
		assertThat(client.periods).containsExactly(6);
		client.failStatusTimes = 2;
		clock.advance(Duration.ofMinutes(8));
		sync.tick();
		// 두 번 실패하고 세 번째에 성공. 8분 지났으니 9분을 받는다. 전국 수신은 다시 하지 않는다
		assertThat(client.periods).containsExactly(6, 9, 9, 9);
		assertThat(client.infoCalls).isEqualTo(1);
		assertThat(store.state().statusSyncedAt()).isEqualTo(clock.instant());
		assertThat(store.state().statusValid()).isTrue();
	}

	private List<String> stations() {
		return jdbc.queryForList("SELECT id FROM ev_stations ORDER BY id", String.class);
	}

	private String charger(String station, String charger) {
		return jdbc.queryForObject("SELECT status FROM ev_chargers WHERE station_id = ? AND charger_id = ?", String.class, station, charger);
	}

	static EvChargerProperties properties(String key, int pageSize, int maxFull) {
		return new EvChargerProperties(key, "https://example.invalid", true, pageSize, 6, Duration.ofMinutes(5), 3, Duration.ZERO,
				Duration.ofMinutes(10),
				Duration.ofMinutes(20), maxFull, "0 0 4 * * *", Duration.ofMinutes(30), Duration.ofSeconds(5), Duration.ofSeconds(60),
				3, Duration.ZERO);
	}

	private static ChargerInfo info(String station, String charger, String stat, String updated) {
		return new ChargerInfo(station, "충전소 " + station, "주소", 37.5, 127.0, "운영사", "24시간", charger, "04", 50, stat,
				Instant.parse(updated), false);
	}

	private static ChargerInfo deleted(String station, String charger) {
		return new ChargerInfo(station, "삭제", null, 37.5, 127.0, null, null, charger, "04", 50, "2", null, true);
	}

	private static ChargerInfo noCoordinates(String station, String charger) {
		return new ChargerInfo(station, "좌표 없음", null, Double.NaN, Double.NaN, null, null, charger, "04", 50, "2", null, false);
	}

	private static ChargerStatus status(String station, String charger, String stat, String updated) {
		return new ChargerStatus(station, charger, stat, Instant.parse(updated));
	}

	static class FakeClient implements EvChargerClient {
		List<ChargerInfo> info = List.of();
		List<ChargerStatus> status = List.of();
		int infoCalls, statusCalls, failInfoPage, failInfoPageTimes, failStatusTimes;
		boolean failStatus;
		List<Integer> periods = new ArrayList<>();

		// failInfoPageTimes가 0이면 failInfoPage 쪽은 계속 실패하고, 양수면 그 횟수만큼만 실패한다
		@Override
		public Page<ChargerInfo> infoPage(int pageNo, int rows) {
			infoCalls++;
			if (pageNo == failInfoPage && failInfoPageTimes > 0) {
				if (--failInfoPageTimes == 0) failInfoPage = 0;
				throw new EvChargerUnavailableException("fake 504");
			}
			if (pageNo == failInfoPage) throw new EvChargerUnavailableException("fake failure");
			return slice(info, pageNo, rows);
		}

		@Override
		public Page<ChargerStatus> statusPage(int pageNo, int rows, int periodMinutes) {
			statusCalls++;
			periods.add(periodMinutes);
			if (failStatus) throw new EvChargerUnavailableException("fake failure");
			if (failStatusTimes > 0) {
				failStatusTimes--;
				throw new EvChargerUnavailableException("fake 503");
			}
			return slice(status, pageNo, rows);
		}

		private static <T> Page<T> slice(List<T> all, int pageNo, int rows) {
			int from = Math.min(all.size(), (pageNo - 1) * rows);
			return new Page<>(all.size(), new ArrayList<>(all.subList(from, Math.min(all.size(), from + rows))));
		}
	}

	static class MutableClock extends Clock {
		private Instant now;

		MutableClock(Instant now) {
			this.now = now;
		}

		void advance(Duration duration) {
			now = now.plus(duration);
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			MutableClock outer = this;
			return new Clock() {
				@Override
				public ZoneId getZone() {
					return zone;
				}

				@Override
				public Clock withZone(ZoneId other) {
					return outer.withZone(other);
				}

				@Override
				public Instant instant() {
					return outer.instant();
				}
			};
		}

		@Override
		public Instant instant() {
			return now;
		}
	}
}
