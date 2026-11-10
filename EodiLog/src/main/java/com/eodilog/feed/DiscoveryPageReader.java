package com.eodilog.feed;

import com.eodilog.feed.DiscoveryCursor.FeedKey;
import com.eodilog.feed.DiscoveryCursor.PlaceKey;
import com.eodilog.feed.DiscoveryItem.Type;
import com.eodilog.feed.DiscoveryRepository.RankedFeed;
import com.eodilog.feed.DiscoveryRepository.RankedPlace;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.trip.domain.TripStatusPolicy;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Home discovery sheet (S05). Candidates are live feeds published within the window that the requester can see through at
 * least one member route (see {@link DiscoveryRepository}), excluding trips the requester is an ACTIVE member of.
 * The window is 30 Asia/Seoul calendar days including today (00:00 KST of today - 29 days up to now), captured on the first
 * page and carried in the cursor so it does not move during one scroll session.
 * Feeds and places are paged by their own keysets (at most limit+1 rows each per page) and alternate FEED, PLACE, FEED, ...;
 * when one side is exhausted the other continues alone. Like changes between pages can still reorder feeds.
 * Reasons only use counts over allowed feeds: a feed's like count (shown on the card anyway) and the number of allowed feeds a
 * place appears in.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class DiscoveryPageReader {
    static final int WINDOW_DAYS=30;
    private final DiscoveryRepository repository;
    private final FeedExposureService exposure;
    private final PlaceReader places;
    private final Clock clock;

    public PageResponse<DiscoveryItem> recommendations(UUID viewer,String cursor,int limit) {
        if(limit<1 || limit>100) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,CommonErrorCode.VALIDATION_ERROR.message(),
                List.of(new ErrorField("limit","limit은 1~100입니다.")));
        DiscoveryCursor after=cursor==null?null:DiscoveryCursor.decode(cursor);
        Instant now=after==null?clock.instant():after.now();
        Instant since=after==null
                ?TripStatusPolicy.today(clock).minusDays(WINDOW_DAYS-1).atStartOfDay(TripStatusPolicy.SERVICE_ZONE).toInstant()
                :after.since();
        Deque<RankedFeed> feeds=new ArrayDeque<>(repository.feeds(viewer,since,now,after==null?null:after.feed(),limit+1));
        Deque<RankedPlace> ranked=new ArrayDeque<>(repository.places(viewer,since,now,after==null?null:after.place(),limit+1));
        FeedKey feedKey=after==null?null:after.feed();
        PlaceKey placeKey=after==null?null:after.place();
        Type next=after==null?Type.FEED:after.next();
        List<Object> picked=new ArrayList<>();
        while(picked.size()<limit && !(feeds.isEmpty() && ranked.isEmpty())) {
            boolean takeFeed=next==Type.FEED?!feeds.isEmpty():ranked.isEmpty();
            if(takeFeed) {
                RankedFeed f=feeds.poll();
                picked.add(f);
                feedKey=new FeedKey(f.likeCount(),f.publishedAt(),f.row().id());
                next=Type.PLACE;
            } else {
                RankedPlace p=ranked.poll();
                picked.add(p);
                placeKey=new PlaceKey(p.count(),p.id());
                next=Type.FEED;
            }
        }
        boolean hasNext=!feeds.isEmpty() || !ranked.isEmpty();
        var feedRows=picked.stream().filter(RankedFeed.class::isInstance).map(o->((RankedFeed)o).row()).toList();
        var cards=new HashMap<UUID,FeedDtos.FeedCard>();
        exposure.toCards(viewer,feedRows).forEach(c->cards.put(c.id(),c));
        var placeViews=places.findAll(picked.stream().filter(RankedPlace.class::isInstance).map(o->((RankedPlace)o).id()).toList());
        List<DiscoveryItem> items=new ArrayList<>();
        for(Object o:picked) {
            if(o instanceof RankedFeed f) {
                items.add(new DiscoveryItem(Type.FEED,cards.get(f.row().id()),null,f.likeCount()>0?"좋아요 "+f.likeCount()+"개":"최근 30일 새 여행"));
            } else if(o instanceof RankedPlace p && placeViews.containsKey(p.id())) {
                items.add(new DiscoveryItem(Type.PLACE,null,placeViews.get(p.id()),"최근 30일 여행 "+p.count()+"개에 등장"));
            }
        }
        String nextCursor=hasNext?new DiscoveryCursor(since,now,feedKey,placeKey,next).encode():null;
        return PageResponse.of(items,nextCursor,hasNext);
    }
}
