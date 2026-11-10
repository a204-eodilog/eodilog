package com.eodilog.photo.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import tools.jackson.databind.annotation.JsonDeserialize;
import java.util.List;
import java.util.UUID;

@Schema(description = "본인 사진 수동 보정. 생략은 유지, placeId null과 topics []는 해제. groupId는 지원하지 않는다")
public class UpdatePhotoRequest {
    @Schema(description = "조회한 사진 버전. JSON 정수만 허용", example = "1", type = "integer", format = "int64",
            minimum = "1", maximum = "9223372036854775807", requiredMode = Schema.RequiredMode.REQUIRED)
    @JsonDeserialize(using = StrictLongDeserializer.class)
    private Long expectedVersion;
    @Schema(description = "장소 ID. null은 장소 해제", example = "019a0000-0000-7000-8000-000000000004", nullable = true)
    private UUID placeId;
    @ArraySchema(minItems = 0, maxItems = 4, uniqueItems = true,
            arraySchema = @Schema(description = "중복 없는 0~4개 주제. []는 해제, null 금지", example = "[\"FOOD\"]"),
            schema = @Schema(type = "string", allowableValues = {"LANDSCAPE", "FOOD", "PEOPLE", "OTHER"}))
    private List<String> topics;
    private boolean placeSent;
    private boolean topicsSent;
    public Long getExpectedVersion() { return expectedVersion; }
    public UUID getPlaceId() { return placeId; }
    public List<String> getTopics() { return topics; }
    public boolean sentPlace() { return placeSent; }
    public boolean sentTopics() { return topicsSent; }
    @JsonSetter("expectedVersion") public void setExpectedVersion(Long value) { expectedVersion = value; }
    @JsonSetter("placeId") public void setPlaceId(UUID value) { placeId = value; placeSent = true; }
    @JsonSetter("topics") public void setTopics(List<String> value) { topics = value; topicsSent = true; }
}
