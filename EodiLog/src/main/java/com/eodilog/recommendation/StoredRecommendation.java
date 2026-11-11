package com.eodilog.recommendation;

import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * TRIP_RECOMMENDATION 저장 결과. 장소·지역은 ID만 저장하고, 내보낼 때 우리 DB의 공개 Place·Region으로 다시 읽는다
 * (AI 응답의 category 같은 내부 값과 AI가 바꾼 이름이 밖으로 나가지 않게 한다).
 * AI 응답(spec §4)은 보낸 지역·후보 장소 안에서만 받는다. 약속과 다르면 작업 실패다.
 */
record StoredRecommendation(List<Item> items, int sharedPlaceCount, int usedMemberCount, boolean insufficientData) {

	static final int MAX_ITEMS = 20;
	// AI 장소 이유는 100자 이내, 지역 이유는 "겹친 장소 {이름(최대 255자)} 외 N곳이 있는 지역이에요"라 넉넉히 둔다
	static final int MAX_REASON_LENGTH = 500;

	enum Type { REGION, PLACE }

	record Item(Type type, UUID id, String reason) {
	}

	static Optional<StoredRecommendation> fromAi(JsonNode data, JsonNode input) {
		if (data == null || !data.isObject()) return Optional.empty();
		Set<String> regionIds = ids(input.path("regions"), null);
		Set<String> placeIds = ids(input.path("candidatePlaces"), null);
		JsonNode items = data.path("items");
		JsonNode basis = data.path("basis");
		JsonNode insufficient = data.path("insufficientData");
		if (!items.isArray() || items.size() > MAX_ITEMS || !basis.isObject() || !insufficient.isBoolean()) return Optional.empty();
		Optional<Integer> shared = count(basis.path("sharedPlaceCount"));
		Optional<Integer> used = count(basis.path("usedMemberCount"));
		if (shared.isEmpty() || used.isEmpty()) return Optional.empty();
		List<Item> parsed = new ArrayList<>();
		Set<String> seen = new HashSet<>();
		for (JsonNode item : items) {
			String reason = item.path("reason").isString() ? item.path("reason").asString().strip() : "";
			if (reason.isEmpty() || reason.length() > MAX_REASON_LENGTH) return Optional.empty();
			String type = item.path("type").asString("");
			JsonNode region = item.path("region");
			JsonNode place = item.path("place");
			String id;
			Type t;
			if ("REGION".equals(type) && region.isObject() && (place.isNull() || place.isMissingNode())) {
				id = region.path("id").asString("");
				if (!regionIds.contains(id)) return Optional.empty();
				t = Type.REGION;
			} else if ("PLACE".equals(type) && place.isObject() && (region.isNull() || region.isMissingNode())) {
				id = place.path("id").asString("");
				if (!placeIds.contains(id)) return Optional.empty();
				t = Type.PLACE;
			} else {
				return Optional.empty();
			}
			if (!seen.add(t + ":" + id)) return Optional.empty();
			parsed.add(new Item(t, UUID.fromString(id), reason));
		}
		if (insufficient.asBoolean() && !parsed.isEmpty()) return Optional.empty();
		return Optional.of(new StoredRecommendation(List.copyOf(parsed), shared.get(), used.get(), insufficient.asBoolean()));
	}

	static Optional<StoredRecommendation> parseStored(JsonNode stored) {
		try {
			List<Item> items = new ArrayList<>();
			for (JsonNode n : stored.get("items")) {
				items.add(new Item(Type.valueOf(n.get("type").asString()), UUID.fromString(n.get("id").asString()),
						n.get("reason").asString()));
			}
			JsonNode basis = stored.get("basis");
			return Optional.of(new StoredRecommendation(List.copyOf(items), basis.get("sharedPlaceCount").asInt(),
					basis.get("usedMemberCount").asInt(), stored.get("insufficientData").asBoolean()));
		} catch (RuntimeException ex) {
			return Optional.empty();
		}
	}

	ObjectNode toStoredJson(JsonMapper jsonMapper) {
		ObjectNode node = jsonMapper.createObjectNode();
		ArrayNode array = node.putArray("items");
		for (Item item : items) {
			array.addObject().put("type", item.type().name()).put("id", item.id().toString()).put("reason", item.reason());
		}
		node.putObject("basis").put("sharedPlaceCount", sharedPlaceCount).put("usedMemberCount", usedMemberCount);
		node.put("insufficientData", insufficientData);
		return node;
	}

	Set<UUID> ids(Type type) {
		Set<UUID> ids = new LinkedHashSet<>();
		items.stream().filter(i -> i.type() == type).forEach(i -> ids.add(i.id()));
		return ids;
	}

	private static Set<String> ids(JsonNode array, String field) {
		Set<String> ids = new HashSet<>();
		for (JsonNode n : array) {
			JsonNode target = field == null ? n : n.path(field);
			if (target.path("id").isString()) ids.add(target.path("id").asString());
		}
		return ids;
	}

	private static Optional<Integer> count(JsonNode node) {
		return node.isIntegralNumber() && node.canConvertToInt() && node.asInt() >= 0 ? Optional.of(node.asInt())
				: Optional.empty();
	}

}
