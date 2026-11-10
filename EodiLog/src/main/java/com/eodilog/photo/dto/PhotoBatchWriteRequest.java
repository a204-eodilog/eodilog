package com.eodilog.photo.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import tools.jackson.databind.annotation.JsonDeserialize;
import java.util.List;
import java.util.UUID;

@Schema(name = "PhotoBatchWrite", description = "본인 사진 일괄 변경. action 하나를 고르고 그 action의 필드만 보낸다. 사진 1~50장, 중복 ID 금지")
public class PhotoBatchWriteRequest {
    public enum Action { UPDATE, MOVE, UNGROUP, DELETE }

    @Schema(description = "UPDATE 수정, MOVE 다른 여행으로 이동, UNGROUP 묶음 해제, DELETE 삭제", example = "UPDATE",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Action action;
    @ArraySchema(minItems = 1, maxItems = 50, uniqueItems = true,
            arraySchema = @Schema(description = "대상 사진과 조회한 버전. 1~50장, 같은 사진 중복 금지", requiredMode = Schema.RequiredMode.REQUIRED))
    private List<Target> photos;
    @Schema(description = "UPDATE 전용. 장소 ID, null은 장소 해제", example = "019a0000-0000-7000-8000-000000000004", nullable = true)
    private UUID placeId;
    @ArraySchema(minItems = 0, maxItems = 4, uniqueItems = true,
            arraySchema = @Schema(description = "UPDATE 전용. 중복 없는 0~4개 주제. []는 해제, null 금지", example = "[\"FOOD\"]"),
            schema = @Schema(type = "string", allowableValues = {"LANDSCAPE", "FOOD", "PEOPLE", "OTHER"}))
    private List<String> topics;
    @Schema(description = "MOVE 전용(필수). 옮길 여행 ID. 요청자가 양쪽 여행의 ACTIVE 멤버여야 한다",
            example = "019a0000-0000-7000-8000-000000000008")
    private UUID targetTripId;
    private boolean placeSent;
    private boolean topicsSent;
    private boolean targetTripSent;

    public Action getAction() { return action; }
    public List<Target> getPhotos() { return photos; }
    public UUID getPlaceId() { return placeId; }
    public List<String> getTopics() { return topics; }
    public UUID getTargetTripId() { return targetTripId; }
    public boolean sentPlace() { return placeSent; }
    public boolean sentTopics() { return topicsSent; }
    public boolean sentTargetTrip() { return targetTripSent; }
    @JsonSetter("action") public void setAction(Action value) { action = value; }
    @JsonSetter("photos") public void setPhotos(List<Target> value) { photos = value; }
    @JsonSetter("placeId") public void setPlaceId(UUID value) { placeId = value; placeSent = true; }
    @JsonSetter("topics") public void setTopics(List<String> value) { topics = value; topicsSent = true; }
    @JsonSetter("targetTripId") public void setTargetTripId(UUID value) { targetTripId = value; targetTripSent = true; }

    @Schema(name = "PhotoBatchTarget", description = "일괄 변경할 사진과 조회한 버전")
    public record Target(
            @Schema(description = "사진 ID", example = "019a0000-0000-7000-8000-000000000005", requiredMode = Schema.RequiredMode.REQUIRED)
            UUID photoId,
            @Schema(description = "조회한 사진 버전. JSON 정수만 허용", example = "1", type = "integer", format = "int64",
                    minimum = "1", requiredMode = Schema.RequiredMode.REQUIRED)
            @JsonDeserialize(using = StrictLongDeserializer.class) Long expectedVersion) { }
}
