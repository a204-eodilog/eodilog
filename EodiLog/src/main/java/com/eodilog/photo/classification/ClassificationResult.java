package com.eodilog.photo.classification;

import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/** Whitelists the public contract; malformed model output fails the whole attempt. */
public final class ClassificationResult {
    private static final Set<String> TOPICS = Set.of("LANDSCAPE", "FOOD", "PEOPLE", "OTHER");
    private static final Set<String> ERRORS = Set.of("INPUT_LIMIT_EXCEEDED", "UNSUPPORTED_INPUT", "IMAGE_DECODE_FAILED", "FILE_UNAVAILABLE");
    private ClassificationResult() { }
    public static ObjectNode sanitize(JsonNode source, Set<UUID> expected) {
        if (source == null || !source.path("photos").isArray()) throw new IllegalArgumentException("Invalid classification result");
        ObjectNode result = JsonNodeFactory.instance.objectNode();
        var photos = result.putArray("photos");
        Set<UUID> seen = new HashSet<>();
        Map<UUID,Integer> groups = new HashMap<>();
        for (JsonNode p : source.path("photos")) {
            UUID id = uuid(p.path("photoId"));
            if (!expected.contains(id) || !seen.add(id)) throw new IllegalArgumentException("Invalid result IDs");
            String status = p.path("status").asString();
            var topics = p.path("topics");
            UUID group = p.path("groupId").isNull() ? null : uuid(p.path("groupId"));
            if (!topics.isArray() || !p.has("errorCode")) throw new IllegalArgumentException("Invalid result fields");
            var out = photos.addObject().put("photoId",id.toString()).put("status",status);
            var outTopics = out.putArray("topics");
            if ("SUCCEEDED".equals(status)) {
                if (topics.size()!=1 || !topics.get(0).isString() || !TOPICS.contains(topics.get(0).asString()) || !p.path("errorCode").isNull())
                    throw new IllegalArgumentException("Invalid successful result");
                outTopics.add(topics.get(0).asString());
                out.putNull("errorCode");
                if (group != null) groups.merge(group,1,Integer::sum);
            } else if ("FAILED".equals(status)) {
                if (!topics.isEmpty() || group!=null || !ERRORS.contains(p.path("errorCode").asString()))
                    throw new IllegalArgumentException("Invalid failed result");
                out.put("errorCode",p.path("errorCode").asString());
            } else throw new IllegalArgumentException("Invalid status");
            if (group==null) out.putNull("groupId"); else out.put("groupId",group.toString());
        }
        if (!seen.equals(expected) || groups.values().stream().anyMatch(n -> n<2)) throw new IllegalArgumentException("Invalid result coverage");
        return result;
    }
    static UUID uuid(JsonNode node) {
        if (!node.isString()) throw new IllegalArgumentException("Invalid UUID");
        UUID id=UUID.fromString(node.asString());
        if (!id.toString().equalsIgnoreCase(node.asString())) throw new IllegalArgumentException("Invalid UUID");
        return id;
    }
}
