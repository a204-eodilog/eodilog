package com.eodilog.place.controller;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.place.dto.BookmarkView;
import com.eodilog.place.service.PersonalBookmarkService;
import com.eodilog.trip.controller.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me/bookmarks")
public class PersonalBookmarkController {
    private final PersonalBookmarkService service;

    public PersonalBookmarkController(PersonalBookmarkService service) { this.service = service; }

    @GetMapping
    public PageResponse<BookmarkView> list(@AuthenticationPrincipal AuthUser authUser,
            @RequestParam(required = false) UUID regionId, @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int limit) {
        return service.list(CurrentUser.requireUserId(authUser), regionId, cursor, limit);
    }

    @PutMapping("/{placeId}")
    public DataResponse<BookmarkView> put(@AuthenticationPrincipal AuthUser authUser,
            @PathVariable UUID placeId, @Valid @RequestBody(required = false) PutRequest request) {
        return DataResponse.of(service.put(CurrentUser.requireUserId(authUser), placeId,
                request == null ? null : request.memo(), request == null ? null : request.sourceFeedId()));
    }

    @PatchMapping("/{placeId}")
    public DataResponse<BookmarkView> patch(@AuthenticationPrincipal AuthUser authUser,
            @PathVariable UUID placeId, @Valid @RequestBody PatchRequest request) {
        return DataResponse.of(service.patch(CurrentUser.requireUserId(authUser), placeId, request.memo()));
    }

    @DeleteMapping("/{placeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthUser authUser, @PathVariable UUID placeId) {
        service.delete(CurrentUser.requireUserId(authUser), placeId);
    }

    public record PutRequest(@Size(max = 2000) String memo, UUID sourceFeedId) {}
    public record PatchRequest(@NotNull @Size(max = 2000) String memo) {}
}
