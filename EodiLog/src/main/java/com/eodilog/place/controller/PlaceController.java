package com.eodilog.place.controller;

import com.eodilog.global.common.response.*;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.service.PlaceCatalogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Places")
@RestController
@RequestMapping("/api/v1/places")
public class PlaceController {
    private final PlaceCatalogService service;
    public PlaceController(PlaceCatalogService service) { this.service = service; }

    @Operation(summary = "Search the local nationwide place catalog")
    @GetMapping
    public PageResponse<PlaceView> search(@RequestParam String query,
            @RequestParam(required = false) UUID regionId, @RequestParam(required = false) UUID cursor,
            @RequestParam(defaultValue = "20") int limit) {
        return service.search(query, regionId, cursor, limit);
    }

    @Operation(summary = "Get a place by its local UUID")
    @GetMapping("/{placeId}")
    public DataResponse<PlaceView> detail(@PathVariable UUID placeId) { return DataResponse.of(service.detail(placeId)); }

    @Operation(summary = "Register a place missing from the public catalog")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DataResponse<PlaceView> create(@Valid @RequestBody ManualPlaceRequest request) {
        return DataResponse.of(service.createManual(request.name(), request.address(), request.latitude(), request.longitude(), request.regionId()));
    }

    public record ManualPlaceRequest(@NotBlank @Size(max = 255) String name, @Size(max = 500) String address,
            @NotNull @DecimalMin("-90") @DecimalMax("90") BigDecimal latitude,
            @NotNull @DecimalMin("-180") @DecimalMax("180") BigDecimal longitude, UUID regionId) {}
}
