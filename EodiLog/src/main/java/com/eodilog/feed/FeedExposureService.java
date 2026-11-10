package com.eodilog.feed;

import com.eodilog.feed.FeedDtos.*;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.timeline.TimelineCursor;
import com.eodilog.timeline.TimelineDtos.DateBasis;
import com.eodilog.timeline.TimelineDtos.TimelineItem;
import com.eodilog.trip.domain.TripStatusPolicy;
import com.eodilog.user.UserErrorCode;
import com.eodilog.user.service.FollowAccess;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Member-routed feed exposure (home map, member profile routes, own travel map, member-route preview).
 * A feed is exposed to a viewer through a member when the feed is live, the member is an ACTIVE member of its trip
 * (LEFT/REMOVED members are no longer a route), FollowAccess allows the viewer to see that member's content, and the member
 * has not listed the viewer as hidden for that feed. The viewer's own route ignores their own hidden list.
 * Direct links (GET /feeds/{id}) are not governed here. Every list is filtered before paging, so disallowed feeds never
 * leak counts or locations.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class FeedExposureService {
    /** Markers group by each region captured in the feed snapshot as-is (no level merging). Q-8 is undecided. */
    public static final String REGION_GROUPING="FEED_REGION";
    private final FeedRepository repository;
    private final FeedExposureRepository exposure;
    private final FeedSnapshotAssembler assembler;
    private final FeedService feeds;
    private final FollowAccess follow;
    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;

    /** Whether {@code viewer} sees the live feed through {@code member}'s route. */
    public boolean canViewFeedViaMember(UUID viewer,UUID feedId,UUID member) {
        if(viewer==null || member==null || !follow.canViewMemberContent(viewer,member)) return false;
        return exposure.routeAllows(viewer,feedId,member);
    }

    public MapResult homeMap(UUID viewer,String bbox,LocalDate from,LocalDate to) {
        var box=Bounds.parse(bbox); range(from,to);
        return map(viewer,homeMembers(viewer),box,from,to);
    }
    public PageResponse<FeedCard> regionFeeds(UUID viewer,UUID regionId,String cursor,int limit) {
        limit(limit);
        return cards(viewer,homeMembers(viewer),regionId,cursor,limit);
    }
    public PageResponse<FeedCard> userFeeds(UUID viewer,UUID target,String cursor,int limit) {
        limit(limit);
        return cards(viewer,userMembers(viewer,target),null,cursor,limit);
    }
    public MapResult userFeedMap(UUID viewer,UUID target,String bbox,LocalDate from,LocalDate to) {
        var box=Bounds.parse(bbox); range(from,to);
        return map(viewer,userMembers(viewer,target),box,from,to);
    }
    /** Allowed published feeds on the target's route, snapshot start date DESC NULLS LAST then tripId DESC. */
    public PageResponse<TimelineItem> userTimeline(UUID viewer,UUID target,String cursor,int limit) {
        limit(limit);
        TimelineCursor after=cursor==null?null:TimelineCursor.decode(cursor);
        var members=userMembers(viewer,target);
        var rows=members.isEmpty()?List.<FeedExposureRepository.TimelineRow>of():exposure.timeline(viewer,members,after,limit+1);
        boolean next=rows.size()>limit;
        LocalDate today=TripStatusPolicy.today(clock);
        var page=(next?rows.subList(0,limit):rows).stream().map(r->new TimelineItem(r.tripId(),r.feedId(),r.start(),
                r.start()==null?DateBasis.UNKNOWN:DateBasis.TRIP,TripStatusPolicy.resolve(r.start(),r.end(),today))).toList();
        return PageResponse.of(page,next?new TimelineCursor(page.getLast().date(),page.getLast().tripId()).encode():null,next);
    }

    /**
     * Own ACTIVE trips. Published trips use the feed snapshot regions/dates (what a viewer would see); unpublished trips use
     * current destinations plus regions of live visited places and the current trip dates. With {@code viewerId} only
     * published feeds the viewer can see through my route are included, and hiddenTripCount counts the date-matching
     * published feeds the viewer cannot see (independent of bbox). Unpublished trips are never counted as hidden.
     */
    public OwnMapResult travelMap(UUID me,String bbox,UUID viewerId,LocalDate from,LocalDate to) {
        var box=Bounds.parse(bbox); range(from,to);
        boolean canSee=false;
        if(viewerId!=null) { requireUser(viewerId); canSee=follow.canViewMemberContent(viewerId,me); }
        var result=exposure.own(me,viewerId,canSee,box.toBox(),from,to);
        return new OwnMapResult(result.markers().stream().map(m->new OwnMapMarker(m.region(),m.tripIds(),m.feedIds())).toList(),
                result.unlocated(),viewerId==null?null:result.hidden(),clock.instant());
    }

    /**
     * Requester must be an ACTIVE member of the feed's trip and may only preview their own route (viaMember == requester),
     * because hidden lists are owner-only; anything else is FEED_NOT_FOUND. Simulates the viewer's access through that route.
     */
    public FeedPreview preview(UUID requester,UUID feedId,UUID viewer,UUID viaMember) {
        var row=repository.require(feedId);
        if(!requester.equals(viaMember) || !repository.activeMember(row.tripId(),requester)) throw new BusinessException(FeedErrorCode.FEED_NOT_FOUND);
        if(!canViewFeedViaMember(viewer,feedId,viaMember)) return new FeedPreview(false,null);
        return new FeedPreview(true,feeds.withLikes(assembler.visible(row),requester));
    }

    /** Home shows people the viewer follows; the viewer's own route is excluded (their feeds still appear via a followee co-member). */
    private Set<UUID> homeMembers(UUID viewer) {
        Set<UUID> candidates=new LinkedHashSet<>(follow.acceptedFolloweeIds(viewer));
        candidates.remove(viewer);
        return follow.viewableMembers(viewer,candidates);
    }
    private Set<UUID> userMembers(UUID viewer,UUID target) {
        requireUser(target);
        return follow.viewableMembers(viewer,List.of(target));
    }
    private void requireUser(UUID user) {
        if(jdbc.queryForList("select 1 from users where id=:id and status='ACTIVE' and profile_completed",
                new MapSqlParameterSource("id",user),Integer.class).isEmpty()) throw new BusinessException(UserErrorCode.USER_NOT_FOUND);
    }
    private PageResponse<FeedCard> cards(UUID viewer,Set<UUID> members,UUID regionId,String cursor,int limit) {
        CreatedAtCursor after=cursor==null?null:CreatedAtCursor.decode(cursor);
        var rows=members.isEmpty()?List.<FeedRepository.Row>of():exposure.page(viewer,members,regionId,after,limit+1);
        boolean next=rows.size()>limit;
        var page=next?rows.subList(0,limit):rows;
        var ids=page.stream().map(FeedRepository.Row::id).toList();
        var photos=repository.livePhotoIds(ids);
        var likes=repository.likes(ids,viewer);
        var items=page.stream().map(r->{
            var f=r.snapshot();
            var like=likes.get(r.id());
            UUID cover=f.coverPhotoId()!=null && photos.getOrDefault(r.id(),Set.of()).contains(f.coverPhotoId())?f.coverPhotoId():null;
            return new FeedCard(r.id(),r.tripId(),r.title(),cover,f.regions(),f.startDate(),f.endDate(),f.publishedAt(),
                    like!=null && like.likedByMe(),like==null?0:like.count());
        }).toList();
        String nextCursor=next?new CreatedAtCursor(page.getLast().snapshot().publishedAt(),page.getLast().id()).encode():null;
        return PageResponse.of(items,nextCursor,next);
    }
    private MapResult map(UUID viewer,Set<UUID> members,Bounds box,LocalDate from,LocalDate to) {
        var markers=members.isEmpty()?List.<FeedExposureRepository.Marker>of():exposure.map(viewer,members,box.toBox(),from,to);
        return new MapResult(markers.stream().map(m->new MapMarker(m.region(),m.feedIds(),m.members(),m.visitCount())).toList(),
                new MapCriteria(from,to,REGION_GROUPING),clock.instant());
    }
    private static void range(LocalDate from,LocalDate to) {
        if(from!=null && to!=null && from.isAfter(to)) throw invalid("from","from은 to보다 늦을 수 없습니다.");
    }
    private static void limit(int limit) {
        if(limit<1 || limit>100) throw invalid("limit","limit은 1~100입니다.");
    }
    private static BusinessException invalid(String field,String reason) {
        return new BusinessException(CommonErrorCode.VALIDATION_ERROR,CommonErrorCode.VALIDATION_ERROR.message(),List.of(new ErrorField(field,reason)));
    }
    /** bbox = minLongitude,minLatitude,maxLongitude,maxLatitude (API spec §2). Regions without coordinates are kept. */
    private record Bounds(BigDecimal west,BigDecimal south,BigDecimal east,BigDecimal north) {
        static Bounds parse(String value) {
            try {
                String[] parts=value.split(",",-1);
                if(parts.length!=4) throw new IllegalArgumentException();
                var b=new Bounds(new BigDecimal(parts[0].strip()),new BigDecimal(parts[1].strip()),new BigDecimal(parts[2].strip()),new BigDecimal(parts[3].strip()));
                if(b.west.compareTo(b.east)>=0 || b.south.compareTo(b.north)>=0
                        || b.west.compareTo(BigDecimal.valueOf(-180))<0 || b.east.compareTo(BigDecimal.valueOf(180))>0
                        || b.south.compareTo(BigDecimal.valueOf(-90))<0 || b.north.compareTo(BigDecimal.valueOf(90))>0)
                    throw new IllegalArgumentException();
                return b;
            } catch(RuntimeException e) {
                throw invalid("bbox","bbox는 minLongitude,minLatitude,maxLongitude,maxLatitude 형식입니다.");
            }
        }
        FeedExposureRepository.Box toBox() { return new FeedExposureRepository.Box(west,south,east,north); }
    }
}
