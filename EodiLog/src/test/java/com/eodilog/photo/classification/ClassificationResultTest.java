package com.eodilog.photo.classification;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

class ClassificationResultTest {
    final JsonMapper json=JsonMapper.builder().build();
    final UUID first=new UUID(0,1),second=new UUID(0,2),third=new UUID(0,3),group=UUID.randomUUID();
    ObjectNode mixed() {
        var out=json.createObjectNode();var photos=out.putArray("photos");
        for(UUID id:List.of(first,second)) {
            var p=photos.addObject().put("photoId",id.toString()).put("status","SUCCEEDED").put("groupId",group.toString()).putNull("errorCode");p.putArray("topics").add("FOOD");
        }
        photos.addObject().put("photoId",third.toString()).put("status","FAILED").putNull("groupId").put("errorCode","IMAGE_DECODE_FAILED").putArray("topics");
        return out;
    }
    @Test void acceptsMixedResultAndDropsUnapprovedFields() {
        var input=mixed();input.put("privateModelField","secret");((ObjectNode)input.path("photos").get(0)).put("image","secret");
        var result=ClassificationResult.sanitize(input,Set.of(first,second,third));
        assertThat(result.path("photos")).hasSize(3);assertThat(result.toString()).doesNotContain("secret","privateModelField","image");
    }
    @ParameterizedTest
    @ValueSource(strings={"duplicate","missing","foreign","noncanonical","invalidStatus","invalidTopic","emptyTopics","multipleTopics","successError","failedTopics","failedGroup","invalidError","missingError","missingGroup","singleton","photosObject","photosMissing","rootArray","itemScalar"})
    void rejectsMalformedResultIndependently(String mutation) {
        var input=mixed();var photos=(tools.jackson.databind.node.ArrayNode)input.path("photos");
        var a=(ObjectNode)photos.get(0);var b=(ObjectNode)photos.get(1);var failed=(ObjectNode)photos.get(2);
        switch(mutation) {
            case "duplicate"->b.put("photoId",first.toString());
            case "missing"->photos.remove(2);
            case "foreign"->a.put("photoId",UUID.randomUUID().toString());
            case "noncanonical"->a.put("photoId","0-0-0-0-1");
            case "invalidStatus"->a.put("status","UNKNOWN");
            case "invalidTopic"->a.putArray("topics").add("UNKNOWN");
            case "emptyTopics"->a.putArray("topics");
            case "multipleTopics"->a.putArray("topics").add("FOOD").add("PEOPLE");
            case "successError"->a.put("errorCode","IMAGE_DECODE_FAILED");
            case "failedTopics"->failed.putArray("topics").add("FOOD");
            case "failedGroup"->failed.put("groupId",group.toString());
            case "invalidError"->failed.put("errorCode","provider-secret");
            case "missingError"->a.remove("errorCode");
            case "missingGroup"->a.remove("groupId");
            case "singleton"->a.putNull("groupId");
            case "photosObject"->input.putObject("photos");
            case "photosMissing"->input.remove("photos");
            case "rootArray"->{assertThatThrownBy(()->ClassificationResult.sanitize(json.createArrayNode(),Set.of(first,second,third))).isInstanceOf(IllegalArgumentException.class);return;}
            case "itemScalar"->photos.set(0,json.getNodeFactory().textNode("bad"));
        }
        assertThatThrownBy(()->ClassificationResult.sanitize(input,Set.of(first,second,third))).isInstanceOf(IllegalArgumentException.class);
    }
}
