package com.eodilog.itinerary.route;

import com.eodilog.itinerary.domain.RouteLegStatus;
import com.eodilog.itinerary.domain.TransportMode;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * ROUTE_RECALCULATION 결과(명세 §9 `{baseVersion, legs:RouteLeg[]}`). 저장·공개 모두 이 모양만 쓴다.
 * AI 응답은 보낸 구간과 같은 순서·같은 day·order여야 하고, 수단은 보낸 그대로이거나 TRANSIT→WALK만 받는다.
 */
record RouteRecalculationResult(long baseVersion, List<Leg> legs) {

	record Leg(UUID fromItemId, UUID toItemId, TransportMode transportMode, Integer durationSeconds,
			Integer distanceMeters, RouteLegStatus status, Instant queriedAt) {
	}

	/** AI 응답을 검사해 결과로 바꾼다. 약속과 다르면 빈 값(작업 실패) */
	static Optional<RouteRecalculationResult> fromAi(JsonNode data, JsonNode input) {
		JsonNode sent = input.path("legs");
		JsonNode got = data == null ? null : data.path("legs");
		if (got == null || !got.isArray() || got.size() != sent.size()) return Optional.empty();
		List<Leg> legs = new ArrayList<>();
		for (int i = 0; i < sent.size(); i++) {
			JsonNode q = sent.get(i);
			JsonNode r = got.get(i);
			if (!sameInt(r, q, "day") || !sameInt(r, q, "fromOrder") || !sameInt(r, q, "toOrder")) return Optional.empty();
			TransportMode requested = TransportMode.valueOf(q.get("transportMode").asString());
			Optional<TransportMode> returned = mode(r.path("transportMode"));
			Optional<RouteLegStatus> status = status(r.path("status"));
			Optional<Instant> queriedAt = instant(r.path("queriedAt"));
			if (returned.isEmpty() || status.isEmpty() || queriedAt.isEmpty()) return Optional.empty();
			// 가까운 구간은 대중교통 대신 도보로 구해 올 수 있다(AI spec §5.1). 그 밖의 수단 변경은 약속 위반이다
			if (returned.get() != requested && !(requested == TransportMode.TRANSIT && returned.get() == TransportMode.WALK)) {
				return Optional.empty();
			}
			UUID from = UUID.fromString(q.get("fromItemId").asString());
			UUID to = UUID.fromString(q.get("toItemId").asString());
			if (status.get() == RouteLegStatus.AVAILABLE) {
				Optional<Integer> duration = nonNegative(r.path("durationSeconds"));
				JsonNode distanceNode = r.path("distanceMeters");
				boolean noDistance = distanceNode.isMissingNode() || distanceNode.isNull();
				Optional<Integer> distance = noDistance ? Optional.empty() : nonNegative(distanceNode);
				if (duration.isEmpty() || (!noDistance && distance.isEmpty())) return Optional.empty();
				legs.add(new Leg(from, to, returned.get(), duration.get(), distance.orElse(null), RouteLegStatus.AVAILABLE,
						queriedAt.get()));
			} else {
				if (!absent(r.path("durationSeconds")) || !absent(r.path("distanceMeters"))) return Optional.empty();
				// 못 구한 구간은 코스를 바꾸지 않으므로 보낸 수단 그대로 둔다
				legs.add(new Leg(from, to, requested, null, null, RouteLegStatus.UNAVAILABLE, queriedAt.get()));
			}
		}
		return Optional.of(new RouteRecalculationResult(input.get("expectedVersion").asLong(), List.copyOf(legs)));
	}

	/** 저장한 결과를 같은 규칙으로 다시 읽는다. 공개 직전에 허용 필드만 남기는 데 쓴다 */
	static Optional<RouteRecalculationResult> parseStored(JsonNode stored) {
		try {
			JsonNode legsNode = stored.get("legs");
			if (!stored.path("baseVersion").canConvertToLong() || legsNode == null || !legsNode.isArray()) {
				return Optional.empty();
			}
			List<Leg> legs = new ArrayList<>();
			for (JsonNode n : legsNode) {
				RouteLegStatus status = RouteLegStatus.valueOf(n.get("status").asString());
				Integer duration = n.path("durationSeconds").isNull() ? null : n.get("durationSeconds").asInt();
				Integer distance = n.path("distanceMeters").isNull() ? null : n.get("distanceMeters").asInt();
				legs.add(new Leg(UUID.fromString(n.get("fromItemId").asString()), UUID.fromString(n.get("toItemId").asString()),
						TransportMode.valueOf(n.get("transportMode").asString()), duration, distance, status,
						Instant.parse(n.get("queriedAt").asString())));
			}
			return Optional.of(new RouteRecalculationResult(stored.get("baseVersion").asLong(), List.copyOf(legs)));
		} catch (RuntimeException ex) {
			return Optional.empty();
		}
	}

	ObjectNode toJson(JsonMapper jsonMapper) {
		ObjectNode node = jsonMapper.createObjectNode().put("baseVersion", baseVersion);
		ArrayNode array = node.putArray("legs");
		for (Leg leg : legs) {
			ObjectNode n = array.addObject()
					.put("fromItemId", leg.fromItemId().toString())
					.put("toItemId", leg.toItemId().toString())
					.put("transportMode", leg.transportMode().name());
			if (leg.durationSeconds() == null) n.putNull("durationSeconds"); else n.put("durationSeconds", leg.durationSeconds());
			if (leg.distanceMeters() == null) n.putNull("distanceMeters"); else n.put("distanceMeters", leg.distanceMeters());
			// 지도선은 이 공급자 응답에 없다(명세 RouteLeg: 조회 실패·AI 결과는 null)
			n.putNull("geometry");
			n.put("status", leg.status().name()).put("queriedAt", leg.queriedAt().toString());
		}
		return node;
	}

	private static boolean sameInt(JsonNode a, JsonNode b, String field) {
		JsonNode x = a.path(field);
		return x.isIntegralNumber() && x.canConvertToInt() && x.asInt() == b.get(field).asInt();
	}

	private static Optional<TransportMode> mode(JsonNode node) {
		try {
			return node.isString() ? Optional.of(TransportMode.valueOf(node.asString())) : Optional.empty();
		} catch (IllegalArgumentException ex) {
			return Optional.empty();
		}
	}

	private static Optional<RouteLegStatus> status(JsonNode node) {
		try {
			return node.isString() ? Optional.of(RouteLegStatus.valueOf(node.asString())) : Optional.empty();
		} catch (IllegalArgumentException ex) {
			return Optional.empty();
		}
	}

	// DB(timestamptz)에 저장되는 정밀도로 맞춰 결과와 코스 값이 같게 한다
	private static Optional<Instant> instant(JsonNode node) {
		try {
			return node.isString() ? Optional.of(Instant.parse(node.asString()).truncatedTo(ChronoUnit.MICROS))
					: Optional.empty();
		} catch (DateTimeParseException ex) {
			return Optional.empty();
		}
	}

	private static Optional<Integer> nonNegative(JsonNode node) {
		return node.isIntegralNumber() && node.canConvertToInt() && node.asInt() >= 0 ? Optional.of(node.asInt())
				: Optional.empty();
	}

	private static boolean absent(JsonNode node) {
		return node.isMissingNode() || node.isNull();
	}

}
