package com.eodilog.timeline;

import com.eodilog.global.common.response.PageResponse;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.timeline.TimelineDtos.*;
import com.eodilog.trip.domain.TripStatusPolicy;
import com.eodilog.trip.service.TripAccessChecker;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class TimelineQueryService {

	public static final int DEFAULT_LIMIT = 20;
	public static final int MAX_LIMIT = 100;

	// 현재 코스에서 필수 인접 쌍을 구해야 저장된 구간 자체가 누락된 경우도 검출한다.
	private static final String COURSE_SQL = """
			with course as (
			 select i.*, lead(i.id) over (partition by i.itinerary_id, i.day order by i.sequence) as next_id
			 from itinerary_items i join itineraries t on t.id=i.itinerary_id where t.trip_id=:tripId
			)
			select c.place_id, c.day, c.start_time, c.next_id,
			 case when r.status='AVAILABLE' then r.distance_meters end as distance
			from course c left join route_legs r on r.itinerary_id=c.itinerary_id
			 and r.from_item_id=c.id and r.to_item_id=c.next_id
			order by c.day, c.sequence
			""";
	private static final String LIVE_PHOTOS = """
			from photos p join assets a on a.id=p.asset_id
			where p.trip_id=:tripId and p.deleted_at is null and a.deleted_at is null and a.status='READY'
			""";

	private final NamedParameterJdbcTemplate jdbc;
	private final TripAccessChecker access;
	private final PlaceReader places;
	private final Clock clock;

	public PageResponse<TimelineItem> myTimeline(UUID userId, String cursor, int limit) {
		TimelineCursor after = cursor == null ? null : TimelineCursor.decode(cursor);
		var params = new MapSqlParameterSource("userId", userId).addValue("limit", limit + 1);
		String sql = """
				select t.id, t.start_date, t.end_date, (select f.id from feeds f where f.trip_id=t.id and f.deleted_at is null) as feed_id from trips t where t.deleted_at is null
				and exists (select 1 from trip_members m where m.trip_id=t.id and m.user_id=:userId and m.status='ACTIVE')
				""";
		if (after != null) {
			params.addValue("id", after.tripId());
			if (after.date() == null) {
				sql += " and t.start_date is null and t.id < :id";
			} else {
				params.addValue("date", after.date());
				sql += " and (t.start_date < :date or t.start_date is null or (t.start_date=:date and t.id < :id))";
			}
		}
		sql += " order by t.start_date desc nulls last, t.id desc limit :limit";
		LocalDate today = TripStatusPolicy.today(clock);
		List<TimelineItem> found = jdbc.query(sql, params, (rs, row) -> {
			LocalDate start = rs.getObject("start_date", LocalDate.class);
			return new TimelineItem(rs.getObject("id", UUID.class), rs.getObject("feed_id", UUID.class), start,
					start == null ? DateBasis.UNKNOWN : DateBasis.TRIP,
					TripStatusPolicy.resolve(start, rs.getObject("end_date", LocalDate.class), today));
		});
		boolean hasNext = found.size() > limit;
		List<TimelineItem> page = hasNext ? found.subList(0, limit) : found;
		String next = hasNext ? new TimelineCursor(page.getLast().date(), page.getLast().tripId()).encode() : null;
		return PageResponse.of(page, next, hasNext);
	}

	public PlaceTimeline tripTimeline(UUID userId, UUID tripId) {
		var trip = access.requireActiveMember(tripId, userId).trip();
		var params = Map.of("tripId", tripId);
		List<CourseItem> course = course(params);
		Map<UUID, Instant> visits = new LinkedHashMap<>();
		jdbc.query("""
				select place_id, min(visited_at) as visited_at from visits
				where trip_id=:tripId and deleted_at is null group by place_id order by min(visited_at), place_id
				""", params, (rs, row) -> {
			visits.put(rs.getObject("place_id", UUID.class), rs.getTimestamp("visited_at").toInstant());
			return rs.getObject("place_id", UUID.class);
		});
		Map<UUID, Long> photos = new LinkedHashMap<>();
		jdbc.query("select p.place_id, count(*) as count " + LIVE_PHOTOS + " and p.place_id is not null group by p.place_id",
				params, (rs, row) -> {
			photos.put(rs.getObject("place_id", UUID.class), rs.getLong("count"));
			return rs.getObject("place_id", UUID.class);
		});
		var ids = new LinkedHashSet<UUID>();
		course.forEach(item -> ids.add(item.placeId()));
		var plannedIds = new LinkedHashSet<>(ids);
		ids.addAll(visits.keySet());
		var placeViews = places.findAll(ids);
		List<PlaceTimelineItem> items = new ArrayList<>();
		for (CourseItem item : course) {
			Instant plannedAt = trip.getStartDate() == null || item.startTime() == null ? null
					: trip.getStartDate().plusDays(item.day() - 1L).atTime(LocalTime.parse(item.startTime()))
					.atZone(TripStatusPolicy.SERVICE_ZONE).toInstant();
			items.add(new PlaceTimelineItem(Objects.requireNonNull(placeViews.get(item.placeId())), plannedAt,
					visits.get(item.placeId()), visits.containsKey(item.placeId()) ? PlaceStatus.VISITED : PlaceStatus.PLANNED,
					photos.getOrDefault(item.placeId(), 0L), item.distance()));
		}
		for (var visit : visits.entrySet()) {
			if (!plannedIds.contains(visit.getKey())) {
				items.add(new PlaceTimelineItem(Objects.requireNonNull(placeViews.get(visit.getKey())), null,
						visit.getValue(), PlaceStatus.VISITED, photos.getOrDefault(visit.getKey(), 0L), null));
			}
		}
		return new PlaceTimeline(List.copyOf(items));
	}

	public TripSummary tripSummary(UUID userId, UUID tripId) {
		access.requireActiveMember(tripId, userId);
		var params = Map.of("tripId", tripId);
		long photoCount = jdbc.queryForObject("select count(*) " + LIVE_PHOTOS, params, Long.class);
		var counts = jdbc.queryForObject("""
				select count(distinct v.place_id), count(distinct p.region_id) from visits v
				join places p on p.id=v.place_id where v.trip_id=:tripId and v.deleted_at is null
				""", params, (rs, row) -> new long[] {rs.getLong(1), rs.getLong(2)});
		Long expenses = jdbc.queryForObject("select sum(amount_minor) from expenses where trip_id=:tripId and deleted_at is null",
				params, Long.class);
		List<CourseItem> required = course(params).stream().filter(item -> item.nextId() != null).toList();
		Long distance = required.isEmpty() || required.stream().anyMatch(item -> item.distance() == null) ? null
				: required.stream().mapToLong(CourseItem::distance).sum();
		return new TripSummary(tripId, photoCount, counts[0], counts[1], distance, null, expenses, "KRW");
	}

	private List<CourseItem> course(Map<String, UUID> params) {
		return jdbc.query(COURSE_SQL, params, (rs, row) -> new CourseItem(rs.getObject("place_id", UUID.class),
				rs.getInt("day"), rs.getString("start_time"), rs.getObject("next_id", UUID.class),
				rs.getObject("distance", Integer.class)));
	}

	private record CourseItem(UUID placeId, int day, String startTime, UUID nextId, Integer distance) { }
}
