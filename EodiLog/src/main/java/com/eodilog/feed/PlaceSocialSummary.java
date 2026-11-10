package com.eodilog.feed;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.user.dto.UserCard;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description="Place social summary computed only from published feeds the requester is allowed to see")
public record PlaceSocialSummary(
        @Schema(description="Place", requiredMode=REQUIRED) PlaceView place,
        @Schema(description="Distinct allowed visitors other than the requester", example="3", requiredMode=REQUIRED) long visitorCount,
        @Schema(description="Allowed visitors, latest visit first, at most 20", requiredMode=REQUIRED) List<UserCard> visitors,
        @Schema(description="Average score of allowed published reviews or null when there is none", example="4.5", requiredMode=REQUIRED, nullable=true) Double averageScore,
        @Schema(description="Number of allowed published reviews", example="2", requiredMode=REQUIRED) long reviewCount,
        @Schema(description="Sources that failed while building the summary; empty because no external source is called", requiredMode=REQUIRED) List<String> partialErrors) { }
