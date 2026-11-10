package com.eodilog.feed;

import com.eodilog.feed.FeedDtos.PublishedReview;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.user.dto.AccountVisibility;
import com.eodilog.user.dto.FollowStatus;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.service.FollowAccess;
import com.eodilog.user.service.UserCardReader;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Place info sheet aggregates. Allowed feeds are the live published feeds containing the place in their snapshot that the
 * requester sees through at least one member route: an ACTIVE member of the feed's trip whose content the requester may view
 * (FollowAccess: self, PUBLIC, or PRIVATE with ACCEPTED follow; following is not required) and who has not hidden the requester
 * on that feed. The requester's own route ignores their own hidden list. Disallowed feeds contribute nothing.
 * Reviews use feed-level visibility (an allowed feed exposes all its publicReviews, as feed detail does); visitors use the
 * member-route rule (each listed visitor must be an open route of that feed).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class PlaceSocialService {
    static final int VISITOR_LIMIT=20;
    private final PlaceSocialRepository repository;
    private final PlaceReader places;
    private final FollowAccess follow;
    private final UserCardReader cards;

    public PlaceSocialSummary summary(UUID viewer,UUID placeId) {
        PlaceView place=requirePlace(placeId);
        var members=members(viewer,placeId);
        if(members.isEmpty()) return new PlaceSocialSummary(place,0,List.of(),null,0,List.of());
        var result=repository.summary(viewer,members,placeId,VISITOR_LIMIT);
        var found=cards.findCards(viewer,result.visitorIds());
        var cardList=result.visitorIds().stream().filter(found::containsKey).map(found::get).toList();
        return new PlaceSocialSummary(place,result.visitorCount(),cardList,result.reviewCount()==0?null:result.averageScore(),result.reviewCount(),List.of());
    }

    public PageResponse<PublishedReview> reviews(UUID viewer,UUID placeId,String cursor,int limit) {
        if(limit<1 || limit>100) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,CommonErrorCode.VALIDATION_ERROR.message(),
                List.of(new ErrorField("limit","limit은 1~100입니다.")));
        CreatedAtCursor after=cursor==null?null:CreatedAtCursor.decode(cursor);
        requirePlace(placeId);
        var members=members(viewer,placeId);
        var rows=members.isEmpty()?List.<PlaceSocialRepository.ReviewRow>of():repository.reviews(viewer,members,placeId,after,limit+1);
        boolean next=rows.size()>limit;
        var page=next?rows.subList(0,limit):rows;
        var fresh=cards.findCards(viewer,page.stream().map(PlaceSocialRepository.ReviewRow::authorId).distinct().toList());
        var items=page.stream().map(r->new PublishedReview(r.id(),placeId,fresh.getOrDefault(r.authorId(),missingAuthor(r.authorId())),r.score(),r.body(),r.writtenAt(),r.feedId())).toList();
        return PageResponse.of(items,next?new CreatedAtCursor(page.getLast().writtenAt(),page.getLast().id()).encode():null,next);
    }

    /** An author whose user row no longer exists is shown like a deactivated member, never with publisher-relative statuses. */
    private static UserCard missingAuthor(UUID id) {
        return new UserCard(id,"탈퇴한 사용자",null,AccountVisibility.PRIVATE,FollowStatus.NONE,FollowStatus.NONE);
    }
    private PlaceView requirePlace(UUID placeId) {
        return places.find(placeId).orElseThrow(()->new BusinessException(CommonErrorCode.NOT_FOUND));
    }
    private Set<UUID> members(UUID viewer,UUID placeId) {
        return follow.viewableMembers(viewer,repository.candidateMembers(placeId));
    }
}
