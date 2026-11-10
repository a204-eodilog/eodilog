package com.eodilog.place.service;

import com.eodilog.place.dto.PlaceView;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 장소 검색 단계별 조회(EODI-270). 일치하는 장소 전체를 줄 세우지 않고, 단계마다 인덱스 순서로 읽다가 남은 자리만큼만 가져온다.
 *
 * <p>near 있음: 0 이름 완전 일치(가까운 순) → 1 반경 안 포함(가까운 순) → 2 반경 밖 포함(id 순).
 * 1단계는 near에서 가까운 장소 {@code probeSize}곳만 거리순으로 훑어 채운다. 그 안에서 다 채우면 그것이 정확한 가까운 순이다.
 * 못 채우면 훑은 범위가 반경을 다 덮었는지, 반경 안 장소가 많은 밀집 지역인지 보고 이어서 읽을 방법을 고른다.
 *
 * <p>near 없음: 0 완전 일치(id 순) → 1 앞부분 일치(이름 키 순) → 2 그 밖의 포함(id 순).
 * 이름 키는 {@code lower(btrim(name)) COLLATE "C"}이고 idx_places_name_key로 읽는다. 거리는 구 기준 직선 거리({@code <->})다.
 */
@Repository
class PlaceSearchReader {

	static final int RADIUS_METERS = 30_000;

	private static final String GEO = "ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography";
	private static final String POINT = "ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography";
	private static final String DISTANCE = "(" + GEO + " <-> " + POINT + ")";
	private static final String KEY = "(lower(btrim(name)) COLLATE \"C\")";
	private static final String TRIGRAM_MATCH = "lower(name) LIKE :contains";
	// 같은 LIKE지만 식이 달라 trigram 인덱스를 타지 않는다. LIKE 결과는 정렬 규칙과 상관없이 같다
	private static final String SCAN_MATCH = "(lower(name) COLLATE \"C\") LIKE :contains";
	private static final String NOT_EXACT = KEY + " <> :exact";
	// 반경 안은 거리로 정한다. ST_DWithin은 좌표 인덱스를 타기 위한 보조 조건이라 1m 넉넉히 준다
	private static final String INSIDE = "ST_DWithin(" + GEO + ", " + POINT + ", :radius + 1, false) AND " + DISTANCE + " <= :radius";
	private static final String SELECT_NEAR = "SELECT " + JdbcPlaceReader.COLUMNS + ", " + DISTANCE + " AS distance FROM places WHERE ";
	private static final String SELECT_PLAIN = "SELECT " + JdbcPlaceReader.COLUMNS + ", lower(btrim(name)) AS name_key FROM places WHERE ";

	private final NamedParameterJdbcTemplate jdbc;
	private final int probeSize;
	private final long denseEstimate;
	private final int idBudget;

	@Autowired
	PlaceSearchReader(NamedParameterJdbcTemplate jdbc) {
		this(jdbc, 5_000, 100_000, 10_000);
	}

	// 테스트가 작은 자료로 밀집·한적·전체 읽기 경로를 고르게 할 때 쓴다
	PlaceSearchReader(NamedParameterJdbcTemplate jdbc, int probeSize, long denseEstimate, int idBudget) {
		this.jdbc = jdbc;
		this.probeSize = probeSize;
		this.denseEstimate = denseEstimate;
		this.idBudget = idBudget;
	}

	/** 검색 조건. query는 앞뒤 공백을 빼고 소문자로 바꾼 값이다 */
	record Search(String query, Double latitude, Double longitude, UUID regionId) {
		boolean near() {
			return latitude != null;
		}
	}

	/** 한 줄과 그 줄의 정렬 위치. 커서를 만들 때 쓴다 */
	record Hit(PlaceView place, int tier, double distance, String nameKey) {
	}

	/** after 다음부터 최대 want곳. after가 null이면 처음부터. 호출하는 쪽 트랜잭션 안에서 부른다 */
	List<Hit> read(Search search, PlaceSearchCursor after, int want) {
		// JDBC가 같은 문장을 여러 번 실행하면 서버 준비 문장의 일반 계획으로 바뀔 수 있다. 일반 계획은 검색어가 얼마나 흔한지 몰라
		// 드문 검색어도 id 순 전체 읽기를 골라(측정 6ms → 1.5초) 이 트랜잭션에서는 매번 검색어를 보고 계획을 세우게 한다
		jdbc.getJdbcTemplate().execute("SET LOCAL plan_cache_mode = force_custom_plan");
		var params = params(search);
		var filter = new Filter(region(search), nameMatch(search.query()));
		return search.near() ? near(params, filter, after, want) : plain(params, filter, after, want);
	}

	/** 지역 조건과 이름 포함 조건. 이름 조건은 검색어에 따라 trigram 인덱스를 쓸지 정한다 */
	private record Filter(String region, String match) {
	}

	private List<Hit> near(MapSqlParameterSource params, Filter f, PlaceSearchCursor after, int want) {
		List<Hit> hits = new ArrayList<>();
		int tier = after == null ? 0 : after.rank();
		if (tier == 0) {
			String seek = after == null ? "" : " AND (" + DISTANCE + ", id) > (:afterDistance, :afterId)";
			hits.addAll(query(SELECT_NEAR + KEY + " = :exact" + f.region() + seek + " ORDER BY distance, id LIMIT :n",
					seekParams(params, after), want, 0));
			if (hits.size() >= want) return hits;
			after = null;
			tier = 1;
		}
		if (tier == 1) {
			if (after != null) return concat(hits, rest(params, f, after, want - hits.size()));
			Probe probe = probe(params, f, want - hits.size());
			hits.addAll(probe.hits());
			if (hits.size() >= want) return hits;
			PlaceSearchCursor last = probe.hits().isEmpty() ? null : position(probe.hits().getLast());
			Double reach = probe.reach();
			if (reach != null && reach <= RADIUS_METERS) {
				double estimate = probeSize * Math.pow(RADIUS_METERS / Math.max(reach, 1.0), 2);
				if (estimate > denseEstimate) return concat(hits, rest(params, f, last, want - hits.size()));
				hits.addAll(radius(params, f, last, want - hits.size()));
				if (hits.size() >= want) return hits;
			}
			after = null;
		}
		hits.addAll(byId(f, f.match() + " AND " + NOT_EXACT + " AND NOT (" + INSIDE + ")" + f.region(), params, after, want - hits.size()));
		return hits;
	}

	// 2단계(id 순)를 읽는다. trigram 인덱스를 쓸 수 있는 검색어는 DB가 흔한 정도를 알아 id 순 읽기와 인덱스 중 알맞게 고른다.
	// 짧은 검색어는 DB가 흔한 정도를 몰라 일찍 멈출 줄 알고 기본 키 순 전체 읽기를 고르므로(드문 검색어 측정 2.1초) 나눠 읽는다.
	// 먼저 id 순으로 idBudget곳만 읽으며 채운다. 흔한 검색어는 여기서 끝난다. 못 채우면 읽은 곳 다음부터는 id 순 읽기를 막고
	// (OFFSET 0 울타리) 병렬 전체 읽기로 고른 뒤 id로 줄 세운다(측정 0.3초)
	private List<Hit> byId(Filter f, String condition, MapSqlParameterSource params, PlaceSearchCursor after, int want) {
		if (want <= 0) return List.of();
		if (!SCAN_MATCH.equals(f.match())) {
			String seek = after == null ? "" : " AND id > :afterId";
			return query("SELECT " + JdbcPlaceReader.COLUMNS + " FROM places WHERE " + condition + seek + " ORDER BY id LIMIT :n",
					seekParams(params, after), want, 2);
		}
		String scan = "SELECT * FROM (SELECT b.*, row_number() OVER () AS rn FROM (SELECT " + JdbcPlaceReader.COLUMNS + ", ("
				+ condition + ") AS hit FROM places" + (after == null ? "" : " WHERE id > :afterId") + " ORDER BY id LIMIT :budget) b) w"
				+ " WHERE w.hit OR w.rn = :budget LIMIT :n";
		var p = seekParams(params, after).addValue("budget", idBudget).addValue("n", want);
		List<Hit> hits = new ArrayList<>();
		UUID[] scanned = { null };
		jdbc.query(scan, p, rs -> {
			PlaceView place = JdbcPlaceReader.map(rs, 0);
			if (rs.getLong("rn") == idBudget) scanned[0] = place.id();
			if (rs.getBoolean("hit")) hits.add(new Hit(place, 2, 0.0, null));
		});
		if (hits.size() >= want || scanned[0] == null) return hits.subList(0, Math.min(hits.size(), want));
		String full = "SELECT * FROM (SELECT " + JdbcPlaceReader.COLUMNS + " FROM places WHERE " + condition
				+ " AND id > :scanned OFFSET 0) s ORDER BY id LIMIT :n";
		var rest = new MapSqlParameterSource(params.getValues()).addValue("scanned", scanned[0]).addValue("n", want - hits.size());
		hits.addAll(jdbc.query(full, rest, (rs, row) -> new Hit(JdbcPlaceReader.map(rs, row), 2, 0.0, null)));
		return hits;
	}

	/** 훑기 결과. reach는 probeSize번째로 가까운 장소까지의 거리이고, 장소가 그보다 적으면 null(전부 훑었다) */
	private record Probe(List<Hit> hits, Double reach) {
	}

	// 가까운 probeSize곳을 거리순으로 읽으며 반경 안·이름 포함을 고른다. 자리가 차면 그 자리에서 멈춘다.
	// 못 채우면 probeSize번째 줄(rn)까지 읽게 되므로 그 줄을 함께 받아 훑은 거리를 안다
	private Probe probe(MapSqlParameterSource params, Filter f, int want) {
		String hit = "lower(k.name) LIKE :contains AND (lower(btrim(k.name)) COLLATE \"C\") <> :exact AND k.distance <= :radius"
				+ f.region().replace("region_id", "k.region_id");
		String sql = "SELECT * FROM (SELECT k.*, (" + hit + ") AS hit, row_number() OVER () AS rn FROM (SELECT "
				+ JdbcPlaceReader.COLUMNS + ", " + DISTANCE + " AS distance FROM places ORDER BY " + DISTANCE + ", id LIMIT :probe) k) w"
				+ " WHERE w.hit OR w.rn = :probe LIMIT :n";
		var p = new MapSqlParameterSource(params.getValues()).addValue("probe", probeSize).addValue("n", want);
		List<Hit> hits = new ArrayList<>();
		Double[] reach = { null };
		jdbc.query(sql, p, rs -> {
			if (rs.getLong("rn") == probeSize) reach[0] = rs.getDouble("distance");
			if (rs.getBoolean("hit")) hits.add(new Hit(JdbcPlaceReader.map(rs, 0), 1, rs.getDouble("distance"), null));
		});
		return new Probe(hits.subList(0, Math.min(hits.size(), want)), reach[0]);
	}

	// 한적한 지역: 반경 안 장소가 적어 좌표 인덱스로 반경 안만 읽고 줄 세운다.
	// 짧은 검색어는 이름 조건이 trigram 인덱스를 피하므로(nameMatch) 좌표 인덱스만 쓴다(측정 500ms → 68ms)
	private List<Hit> radius(MapSqlParameterSource params, Filter f, PlaceSearchCursor after, int want) {
		String seek = after == null ? "" : " AND (" + DISTANCE + ", id) > (:afterDistance, :afterId)";
		return query(SELECT_NEAR + f.match() + " AND " + NOT_EXACT + " AND " + INSIDE + f.region() + seek
				+ " ORDER BY distance, id LIMIT :n", seekParams(params, after), want, 1);
	}

	// 밀집 지역의 드문 검색어, 그리고 2쪽 이후: 반경 안·밖을 한 번에 읽고 일치한 행만 줄 세운다.
	// 거리를 한 번만 계산하도록 안쪽 조회를 울타리(OFFSET 0)로 막고 바깥에서 단계를 정한다
	private List<Hit> rest(MapSqlParameterSource params, Filter f, PlaceSearchCursor after, int want) {
		String sql = "SELECT * FROM (SELECT d.*, CASE WHEN d.distance <= :radius THEN 1 ELSE 2 END AS tier FROM (SELECT "
				+ JdbcPlaceReader.COLUMNS + ", " + DISTANCE + " AS distance FROM places WHERE " + f.match() + " AND " + NOT_EXACT
				+ f.region() + " OFFSET 0) d) s"
				+ (after == null ? "" : " WHERE (s.tier, CASE WHEN s.tier = 1 THEN s.distance ELSE 0 END, s.id)"
						+ " > (:afterTier, :afterDistance, :afterId)")
				+ " ORDER BY s.tier, CASE WHEN s.tier = 1 THEN s.distance ELSE 0 END, s.id LIMIT :n";
		var p = seekParams(params, after);
		if (after != null) p.addValue("afterTier", after.rank()).addValue("afterDistance", after.rank() == 1 ? after.distance() : 0.0);
		return query(sql, p, want, -1);
	}

	private List<Hit> plain(MapSqlParameterSource params, Filter f, PlaceSearchCursor after, int want) {
		List<Hit> hits = new ArrayList<>();
		int tier = after == null ? 0 : after.rank();
		if (tier == 0) {
			String seek = after == null ? "" : " AND id > :afterId";
			hits.addAll(query(SELECT_PLAIN + KEY + " = :exact" + f.region() + seek + " ORDER BY " + KEY + ", id LIMIT :n",
					seekParams(params, after), want, 0));
			if (hits.size() >= want) return hits;
			after = null;
			tier = 1;
		}
		if (tier == 1) {
			// 앞부분 일치를 이름 키 범위로 읽는다. upper가 없으면(마지막 글자가 최댓값) LIKE만으로 거른다
			String range = KEY + " > :exact" + (params.getValue("upper") == null ? "" : " AND " + KEY + " < :upper")
					+ " AND " + KEY + " LIKE :prefix";
			String seek = after == null ? "" : " AND (" + KEY + ", id) > (CAST(:afterKey AS text) COLLATE \"C\", :afterId)";
			var p = seekParams(params, after);
			if (after != null) p.addValue("afterKey", after.name());
			hits.addAll(query(SELECT_PLAIN + range + f.region() + seek + " ORDER BY " + KEY + ", id LIMIT :n", p, want - hits.size(), 1));
			if (hits.size() >= want) return hits;
			after = null;
		}
		hits.addAll(byId(f, f.match() + " AND NOT (" + KEY + " LIKE :prefix)" + f.region(), params, after, want - hits.size()));
		return hits;
	}

	private List<Hit> query(String sql, MapSqlParameterSource params, int want, int tier) {
		if (want <= 0) return List.of();
		params.addValue("n", want);
		boolean near = sql.contains(" AS distance");
		return jdbc.query(sql, params, (rs, row) -> {
			PlaceView place = JdbcPlaceReader.map(rs, row);
			int t = tier >= 0 ? tier : rs.getInt("tier");
			return new Hit(place, t, near && t != 2 ? rs.getDouble("distance") : 0.0, !near && t == 1 ? rs.getString("name_key") : null);
		});
	}

	private static MapSqlParameterSource params(Search search) {
		String escaped = search.query().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
		var params = new MapSqlParameterSource().addValue("exact", search.query()).addValue("contains", "%" + escaped + "%")
				.addValue("prefix", escaped + "%").addValue("upper", upper(search.query()))
				.addValue("radius", RADIUS_METERS).addValue("regionId", search.regionId());
		if (search.near()) params.addValue("latitude", search.latitude()).addValue("longitude", search.longitude());
		return params;
	}

	// pg_trgm은 글자·숫자가 3개 이상 이어진 부분에서만 인덱스 조건을 만든다. 그보다 짧은 검색어("카페")는 trigram 인덱스가
	// 전체 행을 내놓는데 DB는 이를 모르고 고른다(측정 280ms → 850ms). 그런 검색어는 인덱스를 피해 그냥 읽게 한다
	static String nameMatch(String query) {
		int run = 0;
		for (int i = 0; i < query.length(); ) {
			int c = query.codePointAt(i);
			run = Character.isLetterOrDigit(c) ? run + 1 : 0;
			if (run >= 3) return TRIGRAM_MATCH;
			i += Character.charCount(c);
		}
		return SCAN_MATCH;
	}

	private static String region(Search search) {
		return search.regionId() == null ? "" : " AND region_id = :regionId";
	}

	private static MapSqlParameterSource seekParams(MapSqlParameterSource base, PlaceSearchCursor after) {
		var params = new MapSqlParameterSource(base.getValues());
		if (after != null) params.addValue("afterId", after.id()).addValue("afterDistance", after.distance());
		return params;
	}

	private static PlaceSearchCursor position(Hit hit) {
		return new PlaceSearchCursor(null, hit.tier(), hit.distance(), hit.nameKey(), hit.place().id());
	}

	private static List<Hit> concat(List<Hit> head, List<Hit> tail) {
		head.addAll(tail);
		return head;
	}

	/** 앞부분이 query인 이름 키의 상한(C 정렬). 마지막 글자 코드값에 1을 더한다. 더할 수 없으면 null */
	static String upper(String query) {
		int last = query.codePointBefore(query.length());
		if (last == Character.MAX_CODE_POINT) return null;
		int next = last + 1 >= Character.MIN_SURROGATE && last + 1 <= Character.MAX_SURROGATE ? Character.MAX_SURROGATE + 1 : last + 1;
		return query.substring(0, query.length() - Character.charCount(last)) + new String(Character.toChars(next));
	}
}
