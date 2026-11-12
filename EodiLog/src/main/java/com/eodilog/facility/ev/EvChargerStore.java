package com.eodilog.facility.ev;

import com.eodilog.facility.ev.EvChargerClient.ChargerInfo;
import com.eodilog.facility.ev.EvChargerClient.ChargerStatus;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 충전소·충전기·갱신 상태 표(ev_*)를 읽고 쓴다 */
@Repository
public class EvChargerStore {

	// 국내 충전소만 받는다. 좌표가 비었거나 0인 줄을 버린다
	private static final double MIN_LAT = 32.5, MAX_LAT = 39.5, MIN_LNG = 124.0, MAX_LNG = 132.5;

	private final JdbcTemplate jdbc;

	public EvChargerStore(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public record State(Instant fullCompletedAt, Instant statusSyncedAt, boolean statusValid) {
	}

	public State state() {
		return jdbc.queryForObject("SELECT full_completed_at, status_synced_at, status_valid FROM ev_sync_state WHERE id = 1",
				(rs, row) -> new State(instant(rs.getTimestamp(1)), instant(rs.getTimestamp(2)), rs.getBoolean(3)));
	}

	/** 다른 서버가 갱신 중이 아니면 임대를 잡는다 */
	public boolean tryLease(UUID owner, Instant now, Instant until) {
		return jdbc.update("UPDATE ev_sync_state SET lease_owner = ?, lease_until = ? WHERE id = 1"
				+ " AND (lease_until IS NULL OR lease_until < ? OR lease_owner = ?)", owner, ts(until), ts(now), owner) == 1;
	}

	public void releaseLease(UUID owner) {
		jdbc.update("UPDATE ev_sync_state SET lease_owner = NULL, lease_until = NULL WHERE id = 1 AND lease_owner = ?", owner);
	}

	/** 오늘(한국 날짜) 전국 수신 시도를 하나 센다. 상한에 닿았으면 false */
	public boolean countFullAttempt(LocalDate today, int max) {
		return jdbc.update("UPDATE ev_sync_state SET full_attempts = CASE WHEN full_attempt_day = ? THEN full_attempts + 1 ELSE 1 END,"
				+ " full_attempt_day = ? WHERE id = 1 AND (full_attempt_day IS DISTINCT FROM ? OR full_attempts < ?)",
				today, today, today, max) == 1;
	}

	/**
	 * 정보 한 쪽을 넣는다. 충전소는 이름·위치를, 충전기는 종류·출력을 덮어쓴다. 상태는 공급자가 바꾼 시각이
	 * 저장된 것보다 늦거나 같을 때만 덮어쓴다(변경분 수신이 먼저 반영했을 수 있다). 삭제 표시·좌표 없는 줄은 버린다
	 */
	public int upsertInfo(List<ChargerInfo> items, Instant seenAt) {
		Map<String, ChargerInfo> stations = new LinkedHashMap<>();
		List<ChargerInfo> chargers = new ArrayList<>();
		for (ChargerInfo item : items) {
			if (!valid(item)) continue;
			stations.putIfAbsent(item.stationId(), item);
			chargers.add(item);
		}
		Timestamp seen = ts(seenAt);
		jdbc.batchUpdate("INSERT INTO ev_stations (id, name, address, latitude, longitude, operator_name, use_time, seen_at)"
				+ " VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, address = excluded.address,"
				+ " latitude = excluded.latitude, longitude = excluded.longitude, operator_name = excluded.operator_name,"
				+ " use_time = excluded.use_time, seen_at = excluded.seen_at",
				stations.values().stream().map(s -> new Object[] { s.stationId(), cut(s.stationName(), 200), cut(s.address(), 500),
						s.latitude(), s.longitude(), cut(s.operatorName(), 100), cut(s.useTime(), 200), seen }).toList());
		jdbc.batchUpdate("INSERT INTO ev_chargers (station_id, charger_id, charger_type, output_kw, status, status_updated_at, seen_at)"
				+ " VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (station_id, charger_id) DO UPDATE SET charger_type = excluded.charger_type,"
				+ " output_kw = excluded.output_kw, seen_at = excluded.seen_at,"
				+ " status = CASE WHEN ev_chargers.status_updated_at IS NULL OR excluded.status_updated_at >= ev_chargers.status_updated_at"
				+ " THEN excluded.status ELSE ev_chargers.status END,"
				+ " status_updated_at = CASE WHEN ev_chargers.status_updated_at IS NULL OR excluded.status_updated_at >= ev_chargers.status_updated_at"
				+ " THEN excluded.status_updated_at ELSE ev_chargers.status_updated_at END",
				chargers.stream().map(c -> new Object[] { c.stationId(), c.chargerId(), cut(c.chargerType(), 4),
						c.outputKw() == null || c.outputKw() < 0 ? null : c.outputKw(), cut(c.status(), 2), ts(c.statusUpdatedAt()), seen })
						.toList());
		return chargers.size();
	}

	/** 끝까지 받은 전국 수신에서 보이지 않은 충전기·충전소를 지운다 */
	public void deleteUnseen(Instant runStart) {
		jdbc.update("DELETE FROM ev_chargers WHERE seen_at < ?", ts(runStart));
		jdbc.update("DELETE FROM ev_stations s WHERE NOT EXISTS (SELECT 1 FROM ev_chargers c WHERE c.station_id = s.id)");
	}

	/** 변경분을 반영한다. 저장된 상태보다 늦거나 같은 변경만 덮어쓴다. 모르는 충전기(아직 적재 전)는 건너뛴다 */
	public int applyStatus(List<ChargerStatus> items) {
		List<Object[]> rows = items.stream()
				.filter(s -> s.stationId() != null && s.chargerId() != null && s.status() != null && s.statusUpdatedAt() != null)
				.map(s -> new Object[] { cut(s.status(), 2), ts(s.statusUpdatedAt()), s.stationId(), s.chargerId(), ts(s.statusUpdatedAt()) })
				.toList();
		jdbc.batchUpdate("UPDATE ev_chargers SET status = ?, status_updated_at = ? WHERE station_id = ? AND charger_id = ?"
				+ " AND (status_updated_at IS NULL OR status_updated_at <= ?)", rows);
		return rows.size();
	}

	public void markFullCompleted(Instant at) {
		jdbc.update("UPDATE ev_sync_state SET full_completed_at = ?, status_synced_at = ?, status_valid = true WHERE id = 1", ts(at), ts(at));
	}

	public void markStatusSynced(Instant at) {
		jdbc.update("UPDATE ev_sync_state SET status_synced_at = ? WHERE id = 1", ts(at));
	}

	public void markStatusInvalid() {
		jdbc.update("UPDATE ev_sync_state SET status_valid = false WHERE id = 1");
	}

	// 수십만 줄을 새로 넣은 뒤 통계가 없으면 조회 계획이 나빠진다(EODI-288)
	public void analyze() {
		jdbc.execute("ANALYZE ev_stations");
		jdbc.execute("ANALYZE ev_chargers");
	}

	private static boolean valid(ChargerInfo item) {
		return !item.deleted() && item.stationId() != null && item.stationId().length() <= 20 && item.chargerId() != null
				&& item.chargerId().length() <= 10 && item.stationName() != null && item.latitude() >= MIN_LAT
				&& item.latitude() <= MAX_LAT && item.longitude() >= MIN_LNG && item.longitude() <= MAX_LNG;
	}

	private static String cut(String value, int max) {
		return value == null || value.length() <= max ? value : value.substring(0, max);
	}

	private static Timestamp ts(Instant value) {
		return value == null ? null : Timestamp.from(value);
	}

	private static Instant instant(Timestamp value) {
		return value == null ? null : value.toInstant();
	}

}
