package com.eodilog.checklist.suggestion;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

// CHECKLIST_SUGGESTIONS result(명세 §10): {items:[{label,reason,sourceJobId}]}. 순번(suggestionIndex)은 items 배열의 위치다
// AI 응답을 저장하기 전, 공개하기 전, 채택하기 전에 같은 규칙으로 검사한다. 하나라도 어긋나면 결과 전체를 쓰지 않는다
public record ChecklistSuggestionResult(List<Suggestion> items) {

	static final int LABEL_MAX_LENGTH = 255;
	static final int REASON_MAX_LENGTH = 1000;
	static final int MAX_ITEMS = 50;

	public record Suggestion(String label, String reason) {
	}

	public ChecklistSuggestionResult {
		items = List.copyOf(items);
	}

	public static Optional<ChecklistSuggestionResult> sanitize(JsonNode source, UUID jobId) {
		if (source == null || !source.isObject()) {
			return Optional.empty();
		}
		JsonNode items = source.get("items");
		if (items == null || !items.isArray() || items.size() > MAX_ITEMS) {
			return Optional.empty();
		}
		List<Suggestion> suggestions = new ArrayList<>();
		for (JsonNode item : items) {
			if (!item.isObject()) {
				return Optional.empty();
			}
			JsonNode label = item.get("label");
			JsonNode reason = item.get("reason");
			JsonNode sourceJobId = item.get("sourceJobId");
			if (label == null || !label.isString() || reason == null || !reason.isString()
					|| sourceJobId == null || !sourceJobId.isString()
					|| !jobId.toString().equalsIgnoreCase(sourceJobId.asString())) {
				return Optional.empty();
			}
			String strippedLabel = label.asString().strip();
			String strippedReason = reason.asString().strip();
			// 준비물 이름 규칙(정책 C-6)과 같다. 채택 때 그대로 checklist_items.label이 된다
			if (strippedLabel.isEmpty() || strippedLabel.length() > LABEL_MAX_LENGTH
					|| strippedReason.length() > REASON_MAX_LENGTH) {
				return Optional.empty();
			}
			suggestions.add(new Suggestion(strippedLabel, strippedReason));
		}
		return Optional.of(new ChecklistSuggestionResult(suggestions));
	}

	public JsonNode toJson(UUID jobId) {
		ObjectNode root = JsonNodeFactory.instance.objectNode();
		ArrayNode array = root.putArray("items");
		for (Suggestion suggestion : items) {
			array.addObject()
					.put("label", suggestion.label())
					.put("reason", suggestion.reason())
					.put("sourceJobId", jobId.toString());
		}
		return root;
	}

}
