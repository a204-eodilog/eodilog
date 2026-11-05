package com.eodilog.place.controller;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.place.dto.SavedPlacePage;
import com.eodilog.place.dto.SavedPlaceView;
import com.eodilog.place.service.TripSavedPlaceService;
import com.eodilog.trip.controller.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/trips/{tripId}/saved-places")
public class TripSavedPlaceController {
    private final TripSavedPlaceService service;

    public TripSavedPlaceController(TripSavedPlaceService service) { this.service = service; }

    @GetMapping
    public SavedPlacePage list(@AuthenticationPrincipal AuthUser authUser, @PathVariable UUID tripId,
            @RequestParam(defaultValue = "ALL") TripSavedPlaceService.Filter filter,
            @RequestParam(required = false) UUID memberId, @RequestParam(required = false) String bbox,
            @RequestParam(required = false) String cursor, @RequestParam(defaultValue = "20") int limit) {
        return service.list(CurrentUser.requireUserId(authUser), tripId, filter, memberId, bbox, cursor, limit);
    }

    @PutMapping("/{placeId}/me")
    public DataResponse<SavedPlaceView> put(@AuthenticationPrincipal AuthUser authUser,
            @PathVariable UUID tripId, @PathVariable UUID placeId,
            @Valid @RequestBody(required = false) PutRequest request) {
        return DataResponse.of(service.put(CurrentUser.requireUserId(authUser), tripId, placeId,
                request == null ? null : request.memo()));
    }

    @PatchMapping("/{placeId}/me")
    public DataResponse<SavedPlaceView> patch(@AuthenticationPrincipal AuthUser authUser,
            @PathVariable UUID tripId, @PathVariable UUID placeId, @Valid @RequestBody PatchRequest request) {
        return DataResponse.of(service.patch(CurrentUser.requireUserId(authUser), tripId, placeId, request.memo()));
    }

    @DeleteMapping("/{placeId}/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthUser authUser,
            @PathVariable UUID tripId, @PathVariable UUID placeId) {
        service.delete(CurrentUser.requireUserId(authUser), tripId, placeId);
    }

    public record PutRequest(@Size(max = 2000) String memo) {}
    public record PatchRequest(@NotNull @Size(max = 2000) String memo) {}
}
