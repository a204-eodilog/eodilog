package com.eodilog.extraction;

import com.eodilog.extraction.ExtractionResult.Candidate;
import com.eodilog.extraction.ExtractionResult.ResultStatus;
import com.eodilog.place.dto.PlaceView;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// PLACE_EXTRACTION result(명세 §10): {resultStatus, candidates:[{candidateId,name,place,evidence,confidence}]}
// 저장할 때와 공개할 때 같은 규칙으로 다시 읽어, 허용한 필드만 내보낸다(정책 E-15)
record StoredExtraction(ResultStatus resultStatus, List<Candidate> candidates) {

	static final int MAX_CANDIDATES = 60;
	static final int TEXT_MAX_LENGTH = 255;

	StoredExtraction {
		candidates = List.copyOf(candidates);
	}

	static Optional<StoredExtraction> parse(JsonNode source, JsonMapper jsonMapper) {
		try {
			if (source == null || !source.isObject()) {
				return Optional.empty();
			}
			ResultStatus status = ResultStatus.valueOf(source.path("resultStatus").asString());
			JsonNode items = source.get("candidates");
			if (items == null || !items.isArray() || items.size() > MAX_CANDIDATES) {
				return Optional.empty();
			}
			List<Candidate> candidates = new ArrayList<>();
			for (JsonNode item : items) {
				UUID candidateId = UUID.fromString(item.path("candidateId").asString());
				String name = text(item.get("name"));
				String evidence = text(item.get("evidence"));
				JsonNode placeNode = item.get("place");
				PlaceView place = placeNode == null || placeNode.isNull() ? null
						: jsonMapper.treeToValue(placeNode, PlaceView.class);
				JsonNode confidenceNode = item.get("confidence");
				Double confidence = confidenceNode == null || confidenceNode.isNull() ? null : confidenceNode.doubleValue();
				if (name == null || evidence == null || (place != null && place.id() == null)
						|| (confidenceNode != null && !confidenceNode.isNull() && !confidenceNode.isNumber())
						|| (confidence != null && (confidence < 0 || confidence > 1))) {
					return Optional.empty();
				}
				candidates.add(new Candidate(candidateId, name, place, evidence, confidence));
			}
			return Optional.of(new StoredExtraction(status, candidates));
		} catch (RuntimeException ex) {
			return Optional.empty();
		}
	}

	JsonNode toJson(JsonMapper jsonMapper) {
		ObjectNode root = jsonMapper.createObjectNode();
		root.put("resultStatus", resultStatus.name());
		ArrayNode array = root.putArray("candidates");
		for (Candidate candidate : candidates) {
			ObjectNode node = array.addObject();
			node.put("candidateId", candidate.candidateId().toString());
			node.put("name", candidate.name());
			if (candidate.place() == null) {
				node.putNull("place");
			} else {
				node.set("place", jsonMapper.valueToTree(candidate.place()));
			}
			node.put("evidence", candidate.evidence());
			if (candidate.confidence() == null) {
				node.putNull("confidence");
			} else {
				node.put("confidence", candidate.confidence());
			}
		}
		return root;
	}

	private static String text(JsonNode node) {
		if (node == null || !node.isString()) {
			return null;
		}
		String value = node.asString().strip();
		return value.isEmpty() || value.length() > TEXT_MAX_LENGTH ? null : value;
	}

}
