package com.eodilog.weather.alternative;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// WEATHER_ALTERNATIVES result(명세 §10 {alternatives, weather, baseVersion}, 정책 W-21·W-22)
// AI 응답을 입력 스냅샷과 대조해 하나라도 어긋나면 버린다. 장소는 AI 값이 아니라 입력의 장소로, 날씨는 입력에 고정한 값으로 바꾼다
public final class WeatherAlternativeResult {

	static final int MAX_ALTERNATIVES = 10;
	// AI는 activity에 장소 이름(places.name 최대 255자)을 그대로 넣거나 짧은 동작 문구를 덧붙인다
	static final int ACTIVITY_MAX_LENGTH = 300;
	static final int REASON_MAX_LENGTH = 200;
	private static final Pattern START_TIME = Pattern.compile("^([01][0-9]|2[0-3]):[0-5][0-9]$");
	private static final Set<String> TYPES = Set.of("TIME_SHIFT", "PLACE_SWAP", "INFO");
	// 공개 Place 필드. 실내 판단용 category는 AI 입력에만 쓰고 결과에는 싣지 않는다
	private static final Set<String> PLACE_FIELDS = Set.of("id", "name", "address", "latitude", "longitude",
			"regionId", "provider", "providerPlaceId", "source");

	private WeatherAlternativeResult() {
	}

	public static Optional<ObjectNode> fromAi(JsonNode data, JsonNode input, JsonMapper jsonMapper) {
		try {
			if (data == null || !data.isObject() || !data.path("baseVersion").isIntegralNumber()
					|| data.get("baseVersion").asLong() != input.get("expectedVersion").asLong()) {
				return Optional.empty();
			}
			JsonNode alternatives = data.get("alternatives");
			if (alternatives == null || !alternatives.isArray() || alternatives.size() > MAX_ALTERNATIVES) {
				return Optional.empty();
			}
			String placeId = input.get("placeId").asString();
			String targetItemId = null;
			for (JsonNode item : input.get("dayItems")) {
				if (placeId.equals(item.get("place").get("id").asString())) {
					targetItemId = item.get("id").asString();
					break;
				}
			}
			Map<String, JsonNode> pool = new HashMap<>();
			for (JsonNode entry : input.get("alternativePool")) {
				pool.put(entry.get("place").get("id").asString(), entry.get("place"));
			}

			ObjectNode result = jsonMapper.createObjectNode();
			ArrayNode out = result.putArray("alternatives");
			Set<UUID> seen = new HashSet<>();
			for (JsonNode node : alternatives) {
				Optional<ObjectNode> alternative = alternative(node, targetItemId, pool, seen, jsonMapper);
				if (alternative.isEmpty()) {
					return Optional.empty();
				}
				out.add(alternative.get());
			}
			result.set("weather", input.get("weather").deepCopy());
			result.put("baseVersion", input.get("expectedVersion").asLong());
			return Optional.of(result);
		} catch (RuntimeException ex) {
			return Optional.empty();
		}
	}

	private static Optional<ObjectNode> alternative(JsonNode node, String targetItemId, Map<String, JsonNode> pool,
			Set<UUID> seen, JsonMapper jsonMapper) {
		if (!node.isObject()) {
			return Optional.empty();
		}
		UUID id = UUID.fromString(text(node.get("alternativeId")));
		String type = text(node.get("type"));
		String activity = text(node.get("activity"));
		String reason = text(node.get("reason"));
		if (!seen.add(id) || type == null || !TYPES.contains(type) || activity == null || activity.isBlank()
				|| activity.length() > ACTIVITY_MAX_LENGTH || reason == null || reason.isBlank()
				|| reason.length() > REASON_MAX_LENGTH) {
			return Optional.empty();
		}
		JsonNode placeNode = node.get("place");
		String itemId = text(node.get("itemId"));
		String targetStartTime = text(node.get("targetStartTime"));
		JsonNode place = null;
		switch (type) {
			case "TIME_SHIFT" -> {
				if (!isNull(placeNode) || targetItemId == null || !targetItemId.equals(itemId)
						|| targetStartTime == null || !START_TIME.matcher(targetStartTime).matches()) {
					return Optional.empty();
				}
			}
			case "PLACE_SWAP" -> {
				String placeId = placeNode == null || !placeNode.isObject() ? null : text(placeNode.get("id"));
				place = placeId == null ? null : pool.get(placeId);
				if (place == null || targetItemId == null || !targetItemId.equals(itemId)
						|| targetStartTime != null) {
					return Optional.empty();
				}
			}
			default -> {
				if (!isNull(placeNode) || itemId != null || targetStartTime != null) {
					return Optional.empty();
				}
			}
		}
		ObjectNode out = jsonMapper.createObjectNode();
		out.put("alternativeId", id.toString());
		out.put("type", type);
		if (place == null) {
			out.putNull("place");
		} else {
			out.set("place", publicPlace(place, jsonMapper));
		}
		out.put("itemId", itemId);
		out.put("targetStartTime", targetStartTime);
		out.put("activity", activity);
		out.put("reason", reason);
		return Optional.of(out);
	}

	// 저장값을 공개할 때 허용 필드만 다시 고른다
	public static ObjectNode project(JsonNode stored, JsonMapper jsonMapper) {
		ObjectNode result = jsonMapper.createObjectNode();
		ArrayNode out = result.putArray("alternatives");
		for (JsonNode node : stored.get("alternatives")) {
			ObjectNode alternative = out.addObject();
			for (String field : new String[] {"alternativeId", "type", "itemId", "targetStartTime", "activity",
					"reason"}) {
				alternative.set(field, node.get(field));
			}
			alternative.set("place", isNull(node.get("place")) ? jsonMapper.nullNode()
					: publicPlace(node.get("place"), jsonMapper));
		}
		result.set("weather", stored.get("weather"));
		result.put("baseVersion", stored.get("baseVersion").asLong());
		return result;
	}

	// 저장된 결과에서 고른 대안. 없으면 빈 값
	public static Optional<JsonNode> find(JsonNode stored, UUID alternativeId) {
		for (JsonNode node : stored.path("alternatives")) {
			if (alternativeId.toString().equals(node.path("alternativeId").asString(""))) {
				return Optional.of(node);
			}
		}
		return Optional.empty();
	}

	private static ObjectNode publicPlace(JsonNode place, JsonMapper jsonMapper) {
		ObjectNode out = jsonMapper.createObjectNode();
		PLACE_FIELDS.stream().sorted().forEach(field -> out.set(field, place.get(field)));
		return out;
	}

	private static boolean isNull(JsonNode node) {
		return node == null || node.isNull();
	}

	private static String text(JsonNode node) {
		return node == null || !node.isString() ? null : node.asString();
	}

}
