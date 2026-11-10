package com.eodilog.itinerary.proposal;

import com.eodilog.itinerary.domain.RouteLegStatus;
import com.eodilog.itinerary.domain.TransportMode;
import com.eodilog.itinerary.dto.ItineraryPlaceResponse;
import com.eodilog.itinerary.proposal.ItineraryProposalResponse.ProposalDiff;
import com.eodilog.itinerary.proposal.ItineraryProposalResponse.ProposedCourse;
import com.eodilog.itinerary.proposal.ItineraryProposalResponse.ProposedItem;
import com.eodilog.itinerary.proposal.ItineraryProposalResponse.ProposedLeg;
import com.eodilog.itinerary.service.ItineraryService;
import com.eodilog.place.dto.PlaceView;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// ITINERARY_PROPOSAL result(명세 §9 ItineraryProposal의 baseVersion·reason·proposed·diff, 정책 I-13·I-14)
// AI 응답을 받을 때(fromAi)와 저장한 값을 공개할 때(parseStored) 같은 구조 규칙으로 다시 읽어 허용한 필드만 내보낸다
record StoredProposal(long baseVersion, ProposalReason reason, List<Item> items, List<Leg> legs, ProposalDiff diff) {

	static final int DESCRIPTION_MAX_LENGTH = 1000;
	private static final Pattern START_TIME = Pattern.compile("^([01][0-9]|2[0-3]):[0-5][0-9]$");

	record Item(UUID id, PlaceView place, int day, int order, String startTime, Integer stayMinutes) {
	}

	record Leg(UUID fromItemId, UUID toItemId, int day, int fromOrder, int toOrder, TransportMode transportMode,
			Integer durationSeconds, RouteLegStatus status, Instant queriedAt) {
	}

	StoredProposal {
		items = List.copyOf(items);
		legs = List.copyOf(legs);
	}

	// AI 응답 검증(I-13). 하나라도 어긋나면 empty → EXECUTION_FAILED. 장소 값은 AI 것이 아니라 요청 때 고정한 입력으로 바꿔 끼우고,
	// 항목 ID·diff 목록도 입력과 비교해 백엔드가 다시 정한다(I-14)
	static Optional<StoredProposal> fromAi(JsonNode data, JsonNode input, Instant now, JsonMapper jsonMapper) {
		try {
			if (data == null || !data.isObject()) {
				return Optional.empty();
			}
			long baseVersion = input.get("expectedVersion").asLong();
			if (!isLong(data.get("baseVersion")) || data.get("baseVersion").asLong() != baseVersion
					|| !input.get("reason").asString().equals(text(data.get("reason")))) {
				return Optional.empty();
			}
			Map<UUID, PlaceView> places = new HashMap<>();
			for (JsonNode place : input.get("places")) {
				PlaceView view = jsonMapper.treeToValue(place, PlaceView.class);
				places.put(view.id(), view);
			}
			List<UUID> currentPlaceIds = new ArrayList<>();
			Set<UUID> currentItemIds = new HashSet<>();
			for (JsonNode item : input.path("current").path("items")) {
				currentItemIds.add(UUID.fromString(item.get("id").asString()));
				currentPlaceIds.add(UUID.fromString(item.get("place").get("id").asString()));
			}
			long tripDays = ChronoUnit.DAYS.between(LocalDate.parse(input.get("trip").get("startDate").asString()),
					LocalDate.parse(input.get("trip").get("endDate").asString())) + 1;

			JsonNode proposed = data.get("proposed");
			if (proposed == null || !proposed.isObject()) {
				return Optional.empty();
			}
			List<Item> items = new ArrayList<>();
			JsonNode itemNodes = proposed.get("items");
			if (itemNodes == null || !itemNodes.isArray()) {
				return Optional.empty();
			}
			for (JsonNode node : itemNodes) {
				UUID id = optionalUuid(node.get("id"));
				JsonNode placeNode = node.get("place");
				UUID placeId = placeNode == null || !placeNode.isObject() ? null : optionalUuid(placeNode.get("id"));
				PlaceView place = placeId == null ? null : places.get(placeId);
				// 요청 places 밖의 장소, 요청 당시 코스에 없던 항목 ID는 받지 않는다(T-04-10)
				if (place == null || (id != null && !currentItemIds.contains(id))) {
					return Optional.empty();
				}
				Optional<Item> item = item(node, id, place);
				if (item.isEmpty() || item.get().day() > tripDays) {
					return Optional.empty();
				}
				items.add(item.get());
			}
			JsonNode legNodes = proposed.get("legs");
			if (legNodes == null || !legNodes.isArray()) {
				return Optional.empty();
			}
			List<Leg> legs = new ArrayList<>();
			for (JsonNode node : legNodes) {
				Optional<Leg> leg = leg(node, now);
				if (leg.isEmpty()) {
					return Optional.empty();
				}
				legs.add(leg.get());
			}
			JsonNode diffNode = data.get("diff");
			String description = diffNode == null || !diffNode.isObject() ? null : rawText(diffNode.get("description"));
			if (description == null) {
				return Optional.empty();
			}
			// AI 문구는 일차마다 "N일차 M곳"이 붙어 여행이 길면 길어진다. 여행 기간 상한이 없으므로 실패시키지 않고 자른다
			if (description.length() > DESCRIPTION_MAX_LENGTH) {
				description = description.substring(0, DESCRIPTION_MAX_LENGTH - 1) + "…";
			}
			return structured(baseVersion, ProposalReason.valueOf(input.get("reason").asString()), items, legs, null,
					description, currentPlaceIds);
		} catch (RuntimeException ex) {
			return Optional.empty();
		}
	}

	// 저장한 result를 다시 읽는다. 저장 때 이미 검증했으므로 실패는 자료 오류다
	static Optional<StoredProposal> parseStored(JsonNode stored, JsonMapper jsonMapper) {
		try {
			if (stored == null || !stored.isObject() || !isLong(stored.get("baseVersion"))) {
				return Optional.empty();
			}
			ProposalReason reason = ProposalReason.valueOf(stored.get("reason").asString());
			JsonNode proposed = stored.get("proposed");
			List<Item> items = new ArrayList<>();
			for (JsonNode node : proposed.get("items")) {
				PlaceView place = jsonMapper.treeToValue(node.get("place"), PlaceView.class);
				Optional<Item> item = place == null || place.id() == null ? Optional.empty()
						: item(node, optionalUuid(node.get("id")), place);
				if (item.isEmpty()) {
					return Optional.empty();
				}
				items.add(item.get());
			}
			List<Leg> legs = new ArrayList<>();
			for (JsonNode node : proposed.get("legs")) {
				Optional<Leg> leg = leg(node, null);
				if (leg.isEmpty()) {
					return Optional.empty();
				}
				legs.add(leg.get());
			}
			JsonNode diff = stored.get("diff");
			ProposalDiff storedDiff = new ProposalDiff(uuids(diff.get("removedPlaceIds")),
					uuids(diff.get("addedPlaceIds")), rawText(diff.get("description")));
			if (storedDiff.description() == null) {
				return Optional.empty();
			}
			return structured(stored.get("baseVersion").asLong(), reason, items, legs, storedDiff, null, null);
		} catch (RuntimeException ex) {
			return Optional.empty();
		}
	}

	// 항목·구간 구조 규칙(PUT과 같다, C-3·C-4): 항목 1~200개, 날짜별 order 1부터 빈틈없이, 기존 항목 ID는 한 번만,
	// 구간은 같은 날짜의 인접 쌍마다 정확히 하나. 구간의 항목 ID는 AI 값이 아니라 위치로 다시 정한다
	private static Optional<StoredProposal> structured(long baseVersion, ProposalReason reason, List<Item> items,
			List<Leg> legs, ProposalDiff storedDiff, String description, List<UUID> currentPlaceIds) {
		if (items.isEmpty() || items.size() > ItineraryService.MAX_ITEMS) {
			return Optional.empty();
		}
		Set<UUID> ids = new HashSet<>();
		Map<Integer, TreeMap<Integer, Item>> byDay = new TreeMap<>();
		for (Item item : items) {
			if ((item.id() != null && !ids.add(item.id()))
					|| byDay.computeIfAbsent(item.day(), day -> new TreeMap<>()).put(item.order(), item) != null) {
				return Optional.empty();
			}
		}
		// order가 1 이상이고 겹치지 않으므로, 가장 큰 order가 개수와 같으면 1부터 빈틈없다
		for (TreeMap<Integer, Item> day : byDay.values()) {
			if (day.lastKey() != day.size()) {
				return Optional.empty();
			}
		}
		Map<String, Leg> legByPair = new LinkedHashMap<>();
		for (Leg leg : legs) {
			Map<Integer, Item> day = byDay.get(leg.day());
			if (day == null || leg.toOrder() != leg.fromOrder() + 1 || !day.containsKey(leg.toOrder())
					|| legByPair.put(leg.day() + ":" + leg.fromOrder(), leg) != null) {
				return Optional.empty();
			}
		}
		int expectedLegs = byDay.values().stream().mapToInt(day -> day.size() - 1).sum();
		if (legByPair.size() != expectedLegs) {
			return Optional.empty();
		}

		List<Item> sortedItems = byDay.values().stream().flatMap(day -> day.values().stream()).toList();
		List<Leg> sortedLegs = new ArrayList<>();
		byDay.forEach((dayNumber, day) -> {
			for (int order = 1; order < day.size(); order++) {
				Leg leg = legByPair.get(dayNumber + ":" + order);
				sortedLegs.add(new Leg(day.get(order).id(), day.get(order + 1).id(), dayNumber, order, order + 1,
						leg.transportMode(), leg.durationSeconds(), leg.status(), leg.queriedAt()));
			}
		});
		ProposalDiff diff = storedDiff;
		if (diff == null) {
			Set<UUID> proposedPlaces = sortedItems.stream().map(item -> item.place().id())
					.collect(Collectors.toCollection(LinkedHashSet::new));
			Set<UUID> currentPlaces = new LinkedHashSet<>(currentPlaceIds);
			diff = new ProposalDiff(currentPlaces.stream().filter(id -> !proposedPlaces.contains(id)).toList(),
					proposedPlaces.stream().filter(id -> !currentPlaces.contains(id)).toList(), description);
		}
		return Optional.of(new StoredProposal(baseVersion, reason, sortedItems, sortedLegs, diff));
	}

	private static Optional<Item> item(JsonNode node, UUID id, PlaceView place) {
		Integer day = positiveInt(node.get("day"));
		Integer order = positiveInt(node.get("order"));
		JsonNode startNode = node.get("startTime");
		String startTime = startNode == null || startNode.isNull() ? null : rawText(startNode);
		JsonNode stayNode = node.get("stayMinutes");
		Integer stayMinutes = stayNode == null || stayNode.isNull() ? null : positiveInt(stayNode);
		boolean startValid = startNode == null || startNode.isNull()
				|| (startTime != null && START_TIME.matcher(startTime).matches());
		boolean stayValid = stayNode == null || stayNode.isNull()
				|| (stayMinutes != null && stayMinutes <= ItineraryService.MAX_STAY_MINUTES);
		if (day == null || order == null || !startValid || !stayValid) {
			return Optional.empty();
		}
		return Optional.of(new Item(id, place, day, order, startTime, stayMinutes));
	}

	// queriedAt이 없으면 defaultQueriedAt(AI 응답을 받은 시각)을 쓴다. 저장값을 다시 읽을 때는 반드시 있어야 한다
	private static Optional<Leg> leg(JsonNode node, Instant defaultQueriedAt) {
		Integer day = positiveInt(node.get("day"));
		Integer fromOrder = positiveInt(node.get("fromOrder"));
		Integer toOrder = positiveInt(node.get("toOrder"));
		TransportMode mode = TransportMode.valueOf(node.get("transportMode").asString());
		RouteLegStatus status = RouteLegStatus.valueOf(node.get("status").asString());
		JsonNode durationNode = node.get("durationSeconds");
		boolean hasDuration = durationNode != null && !durationNode.isNull();
		Integer duration = hasDuration && durationNode.isIntegralNumber() && durationNode.canConvertToInt()
				&& durationNode.intValue() >= 0 ? durationNode.intValue() : null;
		JsonNode queriedNode = node.get("queriedAt");
		Instant queriedAt = queriedNode == null || queriedNode.isNull() ? defaultQueriedAt
				: Instant.parse(queriedNode.asString());
		// 시간이 있으면 AVAILABLE, 없으면 UNAVAILABLE이어야 한다. 0초·추정값으로 채우지 않는다(D-13)
		boolean resultValid = status == RouteLegStatus.AVAILABLE ? duration != null : !hasDuration;
		if (day == null || fromOrder == null || toOrder == null || !resultValid || queriedAt == null) {
			return Optional.empty();
		}
		return Optional.of(new Leg(null, null, day, fromOrder, toOrder, mode, duration, status, queriedAt));
	}

	JsonNode toJson(JsonMapper jsonMapper) {
		ObjectNode root = jsonMapper.createObjectNode();
		root.put("baseVersion", baseVersion);
		root.put("reason", reason.name());
		ObjectNode proposed = root.putObject("proposed");
		ArrayNode itemArray = proposed.putArray("items");
		for (Item item : items) {
			ObjectNode node = itemArray.addObject();
			putUuid(node, "id", item.id());
			node.set("place", jsonMapper.valueToTree(item.place()));
			node.put("day", item.day());
			node.put("order", item.order());
			node.put("startTime", item.startTime());
			if (item.stayMinutes() == null) {
				node.putNull("stayMinutes");
			} else {
				node.put("stayMinutes", item.stayMinutes());
			}
		}
		ArrayNode legArray = proposed.putArray("legs");
		for (Leg leg : legs) {
			ObjectNode node = legArray.addObject();
			putUuid(node, "fromItemId", leg.fromItemId());
			putUuid(node, "toItemId", leg.toItemId());
			node.put("day", leg.day());
			node.put("fromOrder", leg.fromOrder());
			node.put("toOrder", leg.toOrder());
			node.put("transportMode", leg.transportMode().name());
			if (leg.durationSeconds() == null) {
				node.putNull("durationSeconds");
			} else {
				node.put("durationSeconds", leg.durationSeconds());
			}
			node.putNull("distanceMeters");
			node.putNull("geometry");
			node.put("status", leg.status().name());
			node.put("queriedAt", leg.queriedAt().toString());
		}
		ObjectNode diffNode = root.putObject("diff");
		ArrayNode removed = diffNode.putArray("removedPlaceIds");
		diff.removedPlaceIds().forEach(id -> removed.add(id.toString()));
		ArrayNode added = diffNode.putArray("addedPlaceIds");
		diff.addedPlaceIds().forEach(id -> added.add(id.toString()));
		diffNode.put("description", diff.description());
		return root;
	}

	ProposedCourse toCourse() {
		return new ProposedCourse(
				items.stream().map(item -> new ProposedItem(item.id(), ItineraryPlaceResponse.from(item.place()),
						item.day(), item.order(), item.startTime(), item.stayMinutes())).toList(),
				legs.stream().map(leg -> new ProposedLeg(leg.fromItemId(), leg.toItemId(), leg.day(), leg.fromOrder(),
						leg.toOrder(), leg.transportMode(), leg.durationSeconds(), null, null, leg.status(),
						leg.queriedAt())).toList());
	}

	private static void putUuid(ObjectNode node, String field, UUID value) {
		if (value == null) {
			node.putNull(field);
		} else {
			node.put(field, value.toString());
		}
	}

	private static boolean isLong(JsonNode node) {
		return node != null && node.isIntegralNumber() && node.canConvertToLong();
	}

	private static Integer positiveInt(JsonNode node) {
		if (node == null || !node.isIntegralNumber() || !node.canConvertToInt() || node.intValue() < 1) {
			return null;
		}
		return node.intValue();
	}

	private static UUID optionalUuid(JsonNode node) {
		if (node == null || node.isNull()) {
			return null;
		}
		return UUID.fromString(node.asString());
	}

	private static List<UUID> uuids(JsonNode node) {
		List<UUID> values = new ArrayList<>();
		for (JsonNode value : node) {
			values.add(UUID.fromString(value.asString()));
		}
		return values;
	}

	private static String text(JsonNode node) {
		return node == null || !node.isString() ? null : node.asString();
	}

	// 문자열이면 앞뒤 공백만 지운다. 빈 문자열도 허용한다
	private static String rawText(JsonNode node) {
		return node == null || !node.isString() ? null : node.asString().strip();
	}

}
