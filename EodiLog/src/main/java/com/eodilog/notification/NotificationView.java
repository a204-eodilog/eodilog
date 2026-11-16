package com.eodilog.notification;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

// tripId는 대상(target)이 투표처럼 여행 번호가 아닐 때 앱이 그 화면 주소(/trips/{tripId}/polls/{pollId})를 만들 수 있게 준다
@Schema(description = "알림")
public record NotificationView(UUID id, UUID eventId, String kind, String message,
        Target target,
        @Schema(description = "이 알림이 속한 여행 ID. 여행과 무관한 알림(팔로우 등)은 null",
                example = "3f2b8c1e-5d4a-4e7b-9c1f-2a6d8e0b7c45", nullable = true,
                requiredMode = Schema.RequiredMode.REQUIRED)
        UUID tripId,
        Instant readAt, Instant createdAt) {
    public record Target(String type, UUID id) { }
}
