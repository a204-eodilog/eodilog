package com.eodilog.notification;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
@Tag(name="알림",description="본인 알림 목록과 읽음")
public class NotificationController {
    private final NotificationService service;
    public NotificationController(NotificationService service) { this.service = service; }

    @GetMapping("/notifications")
    @Operation(summary="내 알림 목록")
    public PageResponse<NotificationView> list(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @RequestParam(defaultValue="false") boolean unreadOnly,
            @RequestParam(required=false) String cursor,
            @RequestParam(defaultValue="20") int limit) {
        return service.list(user.userId(), unreadOnly, cursor, limit);
    }

    @PatchMapping("/notifications/{notificationId}")
    @Operation(summary="알림 읽음")
    public DataResponse<NotificationView> read(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID notificationId, @RequestBody ReadRequest request) {
        if (request == null || !Boolean.TRUE.equals(request.read()))
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        return DataResponse.of(service.read(user.userId(), notificationId));
    }

    @DeleteMapping("/notifications/{notificationId}")
    @Operation(summary="내 목록에서 알림 숨김")
    public ResponseEntity<Void> dismiss(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID notificationId) {
        service.dismiss(user.userId(), notificationId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/notifications/read-all")
    @Operation(summary="지정 시각까지 알림 모두 읽음")
    public DataResponse<Map<String,Integer>> readAll(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @RequestBody ReadAllRequest request) {
        if (request == null) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        return DataResponse.of(Map.of("updatedCount",service.readAll(user.userId(), request.through())));
    }

    @PostMapping("/events/{eventId}/read")
    @Operation(summary="이벤트 읽음")
    public DataResponse<EventRead> readEvent(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user,
            @PathVariable UUID eventId) {
        return DataResponse.of(new EventRead(eventId,service.readEvent(user.userId(), eventId)));
    }

    @GetMapping("/notification-summary")
    @Operation(summary="미읽음 알림 수")
    public DataResponse<NotificationService.Summary> summary(@Parameter(hidden=true) @AuthenticationPrincipal AuthUser user) {
        return DataResponse.of(service.summary(user.userId()));
    }

    public record ReadRequest(Boolean read) { }
    public record ReadAllRequest(Instant through) { }
    public record EventRead(UUID eventId, Instant readAt) { }
}
