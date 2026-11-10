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
        @Schema(description="Whether the requesting user liked this feed", requiredMode=REQUIRED) boolean likedByMe,
        @Schema(description="Like count of this feed ID; a re-published feed starts at 0", requiredMode=REQUIRED) long likeCount,
        @Schema(description="Expected version for the next update", requiredMode=REQUIRED) long version) {
        public Feed withLikes(boolean liked, long count) {
            return new Feed(id, tripId, title, body, publishedAt, coverPhotoId, regions, startDate, endDate, photos, places, publicItinerary, publicReviews, expenseSummary, liked, count, version);
        }
    }
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
        @Schema(description="Whether the requesting user liked this feed", requiredMode=REQUIRED) boolean likedByMe,
        @Schema(description="Like count of this feed ID; a re-published feed starts at 0", requiredMode=REQUIRED) long likeCount,
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
    @Schema(description="Shared feed card without a single author")
    public record FeedCard(
        @Schema(description="Feed identifier (UUID)", example="019a0000-0000-7000-8000-000000000001", requiredMode=REQUIRED) UUID id,
        @Schema(description="Source trip identifier (UUID)", example="019a0000-0000-7000-8000-000000000002", requiredMode=REQUIRED) UUID tripId,
        @Schema(description="Shared publication title", example="제주 3박 4일", requiredMode=REQUIRED) String title,
        @Schema(description="Cover photo identifier; null when the original is unavailable", requiredMode=REQUIRED, nullable=true) UUID coverPhotoId,
        @Schema(description="Regions captured at publication", requiredMode=REQUIRED) List<RegionView> regions,
        @Schema(description="Trip start date captured at publication; null when undecided", example="2026-11-10", requiredMode=REQUIRED, nullable=true) LocalDate startDate,
        @Schema(description="Trip end date captured at publication; null when undecided", example="2026-11-12", requiredMode=REQUIRED, nullable=true) LocalDate endDate,
        @Schema(description="Publication time in UTC", example="2026-11-10T01:00:00Z", requiredMode=REQUIRED) Instant publishedAt,
        @Schema(description="Whether the requesting user liked this feed", requiredMode=REQUIRED) boolean likedByMe,
        @Schema(description="Like count of this feed ID", example="3", requiredMode=REQUIRED) long likeCount) { }
    @Schema(description="Like result")
    public record LikeResult(
        @Schema(description="Always true after PUT", example="true", requiredMode=REQUIRED) boolean liked,
        @Schema(description="Current like count of the feed", example="3", requiredMode=REQUIRED) long count) { }
    @Schema(description="Public summary aggregated only from the published representation")
    public record FeedSummary(
        @Schema(description="Feed identifier (UUID)", example="019a0000-0000-7000-8000-000000000001", requiredMode=REQUIRED) UUID feedId,
        @Schema(description="Published photos whose originals remain available", example="12", requiredMode=REQUIRED) long photoCount,
        @Schema(description="Distinct published places that still have a live visit recorded at or before publication", example="4", requiredMode=REQUIRED) long visitedPlaceCount,
        @Schema(description="Distinct snapshot regions of those visited places; places without a region are excluded", example="2", requiredMode=REQUIRED) long visitedRegionCount,
        @Schema(description="Sum of same-day adjacent public course legs in meters; null when there is no pair or a required leg is missing or unavailable", example="4200", requiredMode=REQUIRED, nullable=true) Long plannedDistanceMeters,
        @Schema(description="Actual measured distance; null because no measurement exists", requiredMode=REQUIRED, nullable=true) Long actualDistanceMeters,
        @Schema(description="Original expense total captured at publication only", requiredMode=REQUIRED, nullable=true) PublicExpenseSummary expenseSummary) { }
    @Schema(description="Feed preview from a specific viewer through a specific member route")
    public record FeedPreview(
        @Schema(description="Whether the viewer sees this feed through the member route", example="true", requiredMode=REQUIRED) boolean visible,
        @Schema(description="Feed when visible, otherwise null", requiredMode=REQUIRED, nullable=true) Feed feed) { }
    @Schema(description="Region marker of feeds allowed through member routes")
    public record MapMarker(
        @Schema(description="Region captured in the feed snapshot", requiredMode=REQUIRED) RegionView region,
        @Schema(description="Allowed feed IDs in publishedAt DESC, id DESC order", requiredMode=REQUIRED) List<UUID> feedIds,
        @Schema(description="Members whose route allowed at least one of these feeds", requiredMode=REQUIRED) List<UUID> visibleMemberUserIds,
        @Schema(description="Live visits recorded at or before publication on these feeds' trips whose snapshot place region is exactly this region", example="5", requiredMode=REQUIRED) long visitCount) { }
    @Schema(description="Map query criteria")
    public record MapCriteria(
        @Schema(description="Requested start date", example="2026-01-01", requiredMode=REQUIRED, nullable=true) LocalDate from,
        @Schema(description="Requested end date", example="2026-12-31", requiredMode=REQUIRED, nullable=true) LocalDate to,
        @Schema(description="Grouping rule. FEED_REGION groups by each region captured in the feed snapshot without merging levels", example="FEED_REGION", requiredMode=REQUIRED) String regionGrouping) { }
    @Schema(description="Feed map; counts and locations of disallowed feeds are never included")
    public record MapResult(
        @Schema(description="Region markers ordered by region code", requiredMode=REQUIRED) List<MapMarker> markers,
        @Schema(description="Applied criteria", requiredMode=REQUIRED) MapCriteria criteria,
        @Schema(description="Server time when this result was computed (UTC)", example="2026-11-10T01:00:00Z", requiredMode=REQUIRED) Instant updatedAt) { }
    @Schema(description="Own travel map region marker")
    public record OwnMapMarker(
        @Schema(description="Region", requiredMode=REQUIRED) RegionView region,
        @Schema(description="Trip IDs with this region", requiredMode=REQUIRED) List<UUID> tripIds,
        @Schema(description="Current feed IDs of those trips", requiredMode=REQUIRED) List<UUID> feedIds) { }
    @Schema(description="Own travel map for management or a specific viewer preview")
    public record OwnMapResult(
        @Schema(description="Region markers ordered by region code", requiredMode=REQUIRED) List<OwnMapMarker> markers,
        @Schema(description="Included trips without any region", example="1", requiredMode=REQUIRED) long unlocatedTripCount,
        @Schema(description="Published feeds within the from/to filter that the viewer cannot see through my route, independent of bbox; null without viewerId", example="2", requiredMode=REQUIRED, nullable=true) Long hiddenTripCount,
        @Schema(description="Server time when this result was computed (UTC)", example="2026-11-10T01:00:00Z", requiredMode=REQUIRED) Instant updatedAt) { }
}
