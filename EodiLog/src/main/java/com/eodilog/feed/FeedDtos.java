package com.eodilog.feed;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.region.dto.RegionView;
import com.eodilog.user.dto.UserCard;
import com.eodilog.itinerary.dto.ItineraryItemResponse;
import com.eodilog.itinerary.dto.RouteLegResponse;
import io.swagger.v3.oas.annotations.media.Schema;
import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;
import java.time.*;
import java.util.*;
public final class FeedDtos {
    private FeedDtos() { }
    @Schema(description="Shared feed public representation")
    public record Feed(
        @Schema(description="Identifier (UUID)", requiredMode=REQUIRED) UUID id,
        @Schema(description="Source trip identifier (UUID)", requiredMode=REQUIRED) UUID tripId,
        @Schema(description="Shared publication title", requiredMode=REQUIRED) String title,
        @Schema(description="Published text; empty string is allowed", requiredMode=REQUIRED) String body,
        @Schema(description="Publication time in UTC", requiredMode=REQUIRED) Instant publishedAt,
        @Schema(description="Cover photo identifier; null when the original is unavailable", requiredMode=REQUIRED, nullable=true) UUID coverPhotoId,
        @Schema(description="Regions captured at publication", requiredMode=REQUIRED) List<RegionView> regions,
        @Schema(description="Trip start date; null when undecided", requiredMode=REQUIRED, nullable=true) LocalDate startDate,
        @Schema(description="Trip end date; null when undecided", requiredMode=REQUIRED, nullable=true) LocalDate endDate,
        @Schema(description="Published photos whose originals remain available", requiredMode=REQUIRED) List<PublicPhoto> photos,
        @Schema(description="Public places captured at publication", requiredMode=REQUIRED) List<PlaceView> places,
        @Schema(description="Public course snapshot without internal version or editor metadata", requiredMode=REQUIRED, nullable=true) CourseContent publicItinerary,
        @Schema(description="Review snapshots whose originals remain available", requiredMode=REQUIRED) List<PublishedReview> publicReviews,
        @Schema(description="Original expense total only; no shares or settlement details", requiredMode=REQUIRED, nullable=true) PublicExpenseSummary expenseSummary,
        @Schema(description="Whether the viewer liked this feed; currently false", requiredMode=REQUIRED) boolean likedByMe,
        @Schema(description="Reaction count; currently zero", requiredMode=REQUIRED) long likeCount,
        @Schema(description="Expected version for the next update", requiredMode=REQUIRED) long version) { }
    @Schema(description="Shared feed public representation")
    public record OwnFeed(
        @Schema(description="Identifier (UUID)", requiredMode=REQUIRED) UUID id,
        @Schema(description="Source trip identifier (UUID)", requiredMode=REQUIRED) UUID tripId,
        @Schema(description="Shared publication title", requiredMode=REQUIRED) String title,
        @Schema(description="Published text; empty string is allowed", requiredMode=REQUIRED) String body,
        @Schema(description="Publication time in UTC", requiredMode=REQUIRED) Instant publishedAt,
        @Schema(description="Cover photo identifier; null when the original is unavailable", requiredMode=REQUIRED, nullable=true) UUID coverPhotoId,
        @Schema(description="Regions captured at publication", requiredMode=REQUIRED) List<RegionView> regions,
        @Schema(description="Trip start date; null when undecided", requiredMode=REQUIRED, nullable=true) LocalDate startDate,
        @Schema(description="Trip end date; null when undecided", requiredMode=REQUIRED, nullable=true) LocalDate endDate,
        @Schema(description="Published photos whose originals remain available", requiredMode=REQUIRED) List<PublicPhoto> photos,
        @Schema(description="Public places captured at publication", requiredMode=REQUIRED) List<PlaceView> places,
        @Schema(description="Public course snapshot without internal version or editor metadata", requiredMode=REQUIRED, nullable=true) CourseContent publicItinerary,
        @Schema(description="Review snapshots whose originals remain available", requiredMode=REQUIRED) List<PublishedReview> publicReviews,
        @Schema(description="Original expense total only; no shares or settlement details", requiredMode=REQUIRED, nullable=true) PublicExpenseSummary expenseSummary,
        @Schema(description="Whether the viewer liked this feed; currently false", requiredMode=REQUIRED) boolean likedByMe,
        @Schema(description="Reaction count; currently zero", requiredMode=REQUIRED) long likeCount,
        @Schema(description="Expected version for the next update", requiredMode=REQUIRED) long version,
        @Schema(description="Only the requesting members personal visibility settings", requiredMode=REQUIRED) FeedVisibility visibility) {
        public static OwnFeed of(Feed f, FeedVisibility visibility) {
            return new OwnFeed(f.id(), f.tripId(), f.title(), f.body(), f.publishedAt(), f.coverPhotoId(), f.regions(), f.startDate(), f.endDate(), f.photos(), f.places(), f.publicItinerary(), f.publicReviews(), f.expenseSummary(), f.likedByMe(), f.likeCount(), f.version(), visibility);
        }
    }
    public record PublicPhoto(
        @Schema(description="Identifier (UUID)", requiredMode=REQUIRED) UUID id,
        @Schema(description="Associated place identifier or null", requiredMode=REQUIRED, nullable=true) UUID placeId,
        @Schema(description="Authenticated /api/v1/assets/{assetId}/download?feedId=... URL", requiredMode=REQUIRED) String imageUrl,
        @Schema(description="Public caption or null", requiredMode=REQUIRED, nullable=true) String caption) { }
    public record CourseContent(
        @Schema(description="Public course items in day and sequence order", requiredMode=REQUIRED) List<ItineraryItemResponse> items,
        @Schema(description="Public route legs with transport and route information", requiredMode=REQUIRED) List<RouteLegResponse> legs) { }
    public record PublishedReview(
        @Schema(description="Identifier (UUID)", requiredMode=REQUIRED) UUID id,
        @Schema(description="Associated place identifier or null", requiredMode=REQUIRED) UUID placeId,
        @Schema(description="Public author card without private member information", requiredMode=REQUIRED) UserCard author,
        @Schema(description="Review score from 1 to 5", requiredMode=REQUIRED) int score,
        @Schema(description="Published text; empty string is allowed", requiredMode=REQUIRED) String body,
        @Schema(description="Original review creation time in UTC", requiredMode=REQUIRED) Instant writtenAt,
        @Schema(description="Published feed identifier", requiredMode=REQUIRED) UUID feedId) { }
    public record PublicExpenseSummary(
        @Schema(description="Original expense sum in minor currency units", requiredMode=REQUIRED) long totalAmountMinor,
        @Schema(description="Currency code KRW", requiredMode=REQUIRED) String currency,
        @Schema(description="Source expense version captured at publication", requiredMode=REQUIRED) long asOfExpenseVersion) { }
    public record FeedVisibility(
        @Schema(description="Published feed identifier", requiredMode=REQUIRED) UUID feedId,
        @Schema(description="Viewer identifiers hidden on the requesting members route only", requiredMode=REQUIRED) List<UUID> hiddenViewerUserIds,
        @Schema(description="Expected version for the next update", requiredMode=REQUIRED) long version,
        @Schema(description="Personal setting modification time in UTC", requiredMode=REQUIRED) Instant updatedAt) { }
}
