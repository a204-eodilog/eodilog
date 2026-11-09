package com.eodilog.itinerary.service;

import com.eodilog.global.id.UuidV7;
import com.eodilog.itinerary.domain.Itinerary;
import com.eodilog.itinerary.domain.ItineraryItem;
import com.eodilog.itinerary.domain.RouteLeg;
import com.eodilog.itinerary.domain.RouteLegStatus;
import com.eodilog.itinerary.domain.TransportMode;
import com.eodilog.itinerary.repository.ItineraryItemRepository;
import com.eodilog.itinerary.repository.RouteLegRepository;
import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 코스 항목·구간을 통째로 바꾸는 공통 쓰기. 전체 교체(PUT)와 AI 제안 적용·되돌리기가 함께 쓴다
// 여행·코스 행 잠금과 version 검사는 부르는 쪽이 먼저 끝낸다. version 증가와 알림도 부르는 쪽이 한다
@Component
@RequiredArgsConstructor
public class CourseWriter {

	private final ItineraryItemRepository itineraryItemRepository;
	private final RouteLegRepository routeLegRepository;
	private final EntityManager entityManager;
	private final JdbcTemplate jdbcTemplate;

	// 새로 쓸 항목. id가 있으면 그 기존 항목을 유지하고, 없으면 새로 만든다
	public record CourseItem(UUID id, UUID placeId, int day, int order, String startTime, Integer stayMinutes) {
	}

	// 새로 쓸 구간. 날짜·순서로 항목을 가리킨다. UNAVAILABLE이면 시간·거리는 저장하지 않는다
	public record CourseLeg(int day, int fromOrder, int toOrder, TransportMode transportMode, Integer durationSeconds,
			Integer distanceMeters, RouteLegStatus status, Instant queriedAt) {
	}

	// 되돌리기용으로 보관하는 코스 한 벌. 항목 ID와 구간 결과(지도선 포함)까지 그대로 담는다
	public record CourseSnapshot(List<SnapshotItem> items, List<SnapshotLeg> legs) {

		public CourseSnapshot {
			items = List.copyOf(items);
			legs = List.copyOf(legs);
		}

	}

	public record SnapshotItem(UUID id, UUID placeId, int day, int order, String startTime, Integer stayMinutes) {
	}

	public record SnapshotLeg(UUID fromItemId, UUID toItemId, TransportMode transportMode, Integer durationSeconds,
			Integer distanceMeters, String geometryJson, RouteLegStatus status, Instant queriedAt) {
	}

	// 전체 교체(C-2). existing은 이 코스의 현재 항목 전체다. 요청에 없는 기존 항목은 지우고, id를 보낸 항목은 유지한다
	public void replace(Itinerary itinerary, List<ItineraryItem> existing, List<CourseItem> items,
			List<CourseLeg> legs) {
		Map<UUID, ItineraryItem> existingById = existing.stream()
				.collect(Collectors.toMap(ItineraryItem::getId, Function.identity()));
		// 구간은 항목을 가리키므로 먼저 지운다. 남는 항목끼리 순서를 맞바꿀 수 있어 (day, sequence) 유일 제약은 커밋 때 검사한다
		routeLegRepository.deleteAllByItineraryId(itinerary.getId());
		Set<UUID> keptIds = items.stream().map(CourseItem::id).filter(Objects::nonNull).collect(Collectors.toSet());
		itineraryItemRepository.deleteAll(existing.stream().filter(item -> !keptIds.contains(item.getId())).toList());
		entityManager.flush();

		Map<DayOrder, ItineraryItem> placed = new HashMap<>();
		for (CourseItem courseItem : items) {
			ItineraryItem item;
			if (courseItem.id() != null) {
				item = existingById.get(courseItem.id());
				if (item == null) {
					throw new IllegalStateException("이 코스의 항목이 아닙니다: " + courseItem.id());
				}
				item.replace(courseItem.placeId(), courseItem.day(), courseItem.order(), courseItem.startTime(),
						courseItem.stayMinutes());
			} else {
				item = itineraryItemRepository.save(ItineraryItem.of(itinerary.getId(), courseItem.placeId(),
						courseItem.day(), courseItem.order(), courseItem.startTime(), courseItem.stayMinutes()));
			}
			placed.put(new DayOrder(courseItem.day(), courseItem.order()), item);
		}
		entityManager.flush();

		for (CourseLeg leg : legs) {
			routeLegRepository.save(RouteLeg.withResult(itinerary.getId(),
					placed.get(new DayOrder(leg.day(), leg.fromOrder())).getId(),
					placed.get(new DayOrder(leg.day(), leg.toOrder())).getId(), leg.transportMode(),
					leg.durationSeconds(), leg.distanceMeters(), leg.status(), leg.queriedAt()));
		}
	}

	// 현재 코스를 그대로 읽는다(정책 I-19). 같은 트랜잭션에서 바꾼 내용을 먼저 반영한다
	public CourseSnapshot capture(UUID itineraryId) {
		entityManager.flush();
		List<SnapshotItem> items = jdbcTemplate.query("""
				select id, place_id, day, sequence, start_time, stay_minutes from itinerary_items
				where itinerary_id = ? order by day, sequence""",
				(rs, n) -> new SnapshotItem(rs.getObject("id", UUID.class), rs.getObject("place_id", UUID.class),
						rs.getInt("day"), rs.getInt("sequence"), rs.getString("start_time"),
						rs.getObject("stay_minutes", Integer.class)),
				itineraryId);
		List<SnapshotLeg> legs = jdbcTemplate.query("""
				select l.from_item_id, l.to_item_id, l.transport_mode, l.duration_seconds, l.distance_meters,
				       l.geometry_json::text as geometry_json, l.status, l.queried_at
				from route_legs l join itinerary_items i on i.id = l.from_item_id
				where l.itinerary_id = ? order by i.day, i.sequence""",
				(rs, n) -> new SnapshotLeg(rs.getObject("from_item_id", UUID.class),
						rs.getObject("to_item_id", UUID.class), TransportMode.valueOf(rs.getString("transport_mode")),
						rs.getObject("duration_seconds", Integer.class), rs.getObject("distance_meters", Integer.class),
						rs.getString("geometry_json"), RouteLegStatus.valueOf(rs.getString("status")),
						rs.getTimestamp("queried_at").toInstant()),
				itineraryId);
		return new CourseSnapshot(items, legs);
	}

	// 보관한 코스로 되돌린다(정책 I-23). 항목 ID까지 원래대로 넣으려고 JPA 대신 SQL로 쓴다
	// 끝나면 영속성 컨텍스트를 비운다. 이 트랜잭션에서 미리 읽은 항목·구간 엔티티가 옛 값으로 남지 않게 하기 위해서다
	public void restore(UUID itineraryId, CourseSnapshot snapshot) {
		entityManager.flush();
		jdbcTemplate.update("delete from route_legs where itinerary_id = ?", itineraryId);
		jdbcTemplate.update("delete from itinerary_items where itinerary_id = ?", itineraryId);
		for (SnapshotItem item : snapshot.items()) {
			jdbcTemplate.update("""
					insert into itinerary_items (id, itinerary_id, place_id, day, sequence, start_time, stay_minutes)
					values (?, ?, ?, ?, ?, ?, ?)""",
					item.id(), itineraryId, item.placeId(), item.day(), item.order(), item.startTime(),
					item.stayMinutes());
		}
		for (SnapshotLeg leg : snapshot.legs()) {
			jdbcTemplate.update("""
					insert into route_legs (id, itinerary_id, from_item_id, to_item_id, transport_mode,
					                        duration_seconds, distance_meters, geometry_json, status, queried_at)
					values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)""",
					UuidV7.generate(), itineraryId, leg.fromItemId(), leg.toItemId(), leg.transportMode().name(),
					leg.durationSeconds(), leg.distanceMeters(), leg.geometryJson(), leg.status().name(),
					Timestamp.from(leg.queriedAt()));
		}
		entityManager.clear();
	}

	private record DayOrder(int day, int order) {
	}

}
