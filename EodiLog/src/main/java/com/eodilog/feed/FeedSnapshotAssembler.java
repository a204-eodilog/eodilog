package com.eodilog.feed;

import com.eodilog.feed.FeedDtos.*;
import com.eodilog.itinerary.service.ItineraryService;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.region.service.RegionReader;
import com.eodilog.trip.domain.Trip;
import com.eodilog.user.service.UserCardReader;
import java.time.Instant;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class FeedSnapshotAssembler {
    private final JdbcTemplate jdbc;
    private final ItineraryService itineraries;
    private final PlaceReader places;
    private final RegionReader regions;
    private final UserCardReader users;
    private final FeedRepository repository;
    public record PhotoSource(UUID id,UUID assetId,UUID placeId) { }
    public record Snapshot(Feed feed,List<PhotoSource> photos) { }
    public Snapshot assemble(UUID id,UUID user,Trip trip,String title,String body,Instant now) {
        UUID tripId=trip.getId();
        var sources=jdbc.query("""
                select p.id,p.asset_id,p.place_id from photos p join assets a on a.id=p.asset_id
                where p.trip_id=? and a.trip_id=p.trip_id and p.deleted_at is null and a.deleted_at is null and a.status='READY'
                order by p.created_at,p.id
                """,(rs,n)->new PhotoSource(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class)),tripId);
        var photos=sources.stream().map(p->new PublicPhoto(p.id(),p.placeId(),"/api/v1/assets/"+p.assetId()+"/download?feedId="+id,null)).toList();
        var course=itineraries.getItinerary(user,tripId);
        var placeIds=new LinkedHashSet<UUID>();
        course.items().forEach(i->placeIds.add(i.place().id()));
        sources.forEach(p->{ if(p.placeId()!=null) placeIds.add(p.placeId()); });
        placeIds.addAll(jdbc.query("select distinct place_id from visits where trip_id=? and deleted_at is null",(rs,n)->rs.getObject(1,UUID.class),tripId));
        var placeViews=List.copyOf(places.findAll(placeIds).values());
        var regionIds=new LinkedHashSet<>(jdbc.query("select region_id from trip_destinations where trip_id=? order by display_order",(rs,n)->rs.getObject(1,UUID.class),tripId));
        placeViews.forEach(p->{if(p.regionId()!=null) regionIds.add(p.regionId());});
        record ReviewSource(UUID id,UUID place,UUID user,int score,String body,Instant at) { }
        var reviews=jdbc.query("""
                select r.id,v.place_id,m.user_id,r.score,r.body,r.created_at from reviews r
                join visits v on v.id=r.visit_id join trip_members m on m.id=v.member_id
                where v.trip_id=? and v.deleted_at is null order by r.created_at,r.id
                """,(rs,n)->new ReviewSource(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class),rs.getInt(4),rs.getString(5),rs.getTimestamp(6).toInstant()),tripId);
        var cards=users.findCards(user,reviews.stream().map(ReviewSource::user).distinct().toList());
        var published=reviews.stream().filter(r->cards.containsKey(r.user())).map(r->new PublishedReview(r.id(),r.place(),cards.get(r.user()),r.score(),r.body(),r.at(),id)).toList();
        Long total=jdbc.queryForObject("select sum(amount_minor) from expenses where trip_id=? and deleted_at is null",Long.class,tripId);
        var feed=new Feed(id,tripId,title,body,now,photos.isEmpty()?null:photos.getFirst().id(),List.copyOf(regions.findAll(regionIds).values()),
                trip.getStartDate(),trip.getEndDate(),photos,placeViews,new CourseContent(course.items(),course.legs()),published,
                total==null?null:new PublicExpenseSummary(total,"KRW",trip.getExpenseVersion()),false,0,1);
        return new Snapshot(feed,sources);
    }
    public Feed visible(FeedRepository.Row row) {
        var f=row.snapshot();
        var livePhotos=repository.livePhotoIds(row.id());
        var photos=f.photos().stream().filter(p->livePhotos.contains(p.id())).toList();
        var liveReviews=repository.liveReviewIds(row.tripId());
        var reviews=f.publicReviews().stream().filter(r->liveReviews.contains(r.id())).toList();
        UUID cover=livePhotos.contains(f.coverPhotoId())?f.coverPhotoId():null;
        return new Feed(f.id(),f.tripId(),row.title(),row.body(),f.publishedAt(),cover,f.regions(),f.startDate(),f.endDate(),photos,
                f.places(),f.publicItinerary(),reviews,f.expenseSummary(),false,0,row.version());
    }
}
