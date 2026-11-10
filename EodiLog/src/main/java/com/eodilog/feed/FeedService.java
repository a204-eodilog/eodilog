package com.eodilog.feed;

import com.eodilog.feed.FeedDtos.*;
import com.eodilog.feed.FeedRequests.*;
import com.eodilog.global.common.error.*;
import com.eodilog.global.common.response.*;
import com.eodilog.global.id.UuidV7;
import com.eodilog.itinerary.dto.ItineraryItemResponse;
import com.eodilog.itinerary.domain.RouteLegStatus;
import com.eodilog.job.*;
import com.eodilog.notification.NotificationEventRegistrar;
import com.eodilog.trip.exception.TripErrorCode;
import com.eodilog.trip.service.TripAccess;
import com.eodilog.trip.service.TripAccessChecker;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
@RequiredArgsConstructor
public class FeedService {
    private final FeedRepository repository;
    private final FeedSnapshotAssembler assembler;
    private final TripAccessChecker access;
    private final NotificationEventRegistrar events;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final JobService jobs;
    private final JsonMapper json;
    public record Publication(OwnFeed feed,boolean created) { }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public OwnFeed tripFeed(UUID user,UUID trip) {
        access.requireActiveMember(trip,user);
        return repository.current(trip).map(row->own(row,user)).orElse(null);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Feed get(UUID user,UUID id) { return withLikes(assembler.visible(repository.require(id)),user); }
    /** Feed as seen by {@code user}: public representation with that user's like state. */
    public Feed withLikes(Feed feed,UUID user) { return withLikes(feed,repository.likes(List.of(feed.id()),user).get(feed.id())); }
    private static Feed withLikes(Feed feed,FeedRepository.Likes likes) {
        return likes==null?feed.withLikes(false,0):feed.withLikes(likes.likedByMe(),likes.count());
    }
    @Transactional
    public LikeResult like(UUID user,UUID id) {
        repository.lockLive(id);
        repository.like(id,user,clock.instant());
        var likes=repository.likes(List.of(id),user).get(id);
        return new LikeResult(true,likes==null?0:likes.count());
    }
    @Transactional
    public void unlike(UUID user,UUID id) {
        repository.lockLive(id);
        repository.unlike(id,user);
    }
    /**
     * Public summary from the published representation only: visible photos, snapshot places that still have a live visit
     * recorded at or before publication (and their snapshot regions), the public course legs, and the captured expense total.
     */
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public FeedSummary summary(UUID id) {
        var row=repository.require(id);
        var feed=assembler.visible(row);
        var visited=repository.visitedPlaceIds(row);
        var places=feed.places().stream().filter(p->visited.contains(p.id())).toList();
        long regionCount=places.stream().map(p->p.regionId()).filter(Objects::nonNull).distinct().count();
        return new FeedSummary(id,feed.photos().size(),places.size(),regionCount,plannedDistance(feed.publicItinerary()),null,feed.expenseSummary());
    }
    private static Long plannedDistance(CourseContent course) {
        if(course==null) return null;
        var items=course.items().stream().sorted(Comparator.comparingInt(ItineraryItemResponse::day).thenComparingInt(ItineraryItemResponse::order)).toList();
        Map<String,Integer> legs=new HashMap<>();
        course.legs().forEach(l->{ if(l.status()==RouteLegStatus.AVAILABLE && l.distanceMeters()!=null) legs.put(l.fromItemId()+">"+l.toItemId(),l.distanceMeters()); });
        long sum=0; int pairs=0;
        for(int i=0;i+1<items.size();i++) {
            var a=items.get(i); var b=items.get(i+1);
            if(a.day()!=b.day()) continue;
            Integer d=legs.get(a.id()+">"+b.id());
            if(d==null) return null;
            sum+=d; pairs++;
        }
        return pairs==0?null:sum;
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public PageResponse<OwnFeed> list(UUID user,String cursor,int limit) {
        if(limit<1 || limit>100) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        var rows=repository.own(user,cursor==null?null:CreatedAtCursor.decode(cursor),limit+1);
        boolean next=rows.size()>limit;
        var page=rows.subList(0,Math.min(rows.size(),limit));
        String after=next?new CreatedAtCursor(page.getLast().snapshot().publishedAt(),page.getLast().id()).encode():null;
        var likes=repository.likes(page.stream().map(FeedRepository.Row::id).toList(),user);
        return PageResponse.of(page.stream().map(r->OwnFeed.of(withLikes(assembler.visible(r),likes.get(r.id())),repository.visibility(r,user))).toList(),after,next);
    }
    @Transactional
    public Publication publish(UUID user,UUID trip,FeedWrite request) {
        var tripAccess=access.requireActiveMemberForUpdate(trip,user);
        var current=repository.current(trip);
        if(current.isPresent()) return new Publication(own(current.get(),user),false);
        var snapshot=assembler.assemble(UuidV7.generate(),user,tripAccess.trip(),request.title(),request.body(),clock.instant().truncatedTo(ChronoUnit.MICROS));
        repository.insert(snapshot.feed());
        snapshot.photos().forEach(p->repository.photo(snapshot.feed().id(),p.id(),p.assetId()));
        return new Publication(own(repository.require(snapshot.feed().id()),user),true);
    }
    @Transactional
    public OwnFeed patch(UUID user,UUID id,FeedPatch request) {
        if(request.hasExplicitNull() || request.title()!=null && request.title().isBlank())
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        var row=managed(user,id);
        version(row.version(),request.expectedVersion());
        String title=request.title()==null?row.title():request.title();
        String body=request.body()==null?row.body():request.body();
        if(!title.equals(row.title()) || !body.equals(row.body())) repository.edit(row,title,body);
        return own(repository.require(id),user);
    }
    @Transactional
    public void delete(UUID user,UUID id,long expectedVersion) {
        var row=managed(user,id);
        version(row.version(),expectedVersion);
        takeDown(user,row,clock.instant());
    }
    /**
     * Same trip-first lock order as delete. Any non-current feed or non-ACTIVE requester is FEED_NOT_FOUND, so a repeat
     * after the tombstone is 404. Tombstones the feed (with the deletion notice) and the requester's own photos (asset
     * DELETING, like the photo delete API) and visits, then freezes those IDs and their reviews into one cleanup job.
     */
    @Transactional
    public JobRef deleteOwnRecords(UUID user,UUID id,long expectedVersion) {
        var observed=repository.require(id);
        TripAccess tripAccess;
        try { tripAccess=access.requireActiveMemberForUpdate(observed.tripId(),user); }
        catch(BusinessException e) {
            if(e.getErrorCode()==TripErrorCode.TRIP_NOT_FOUND) throw new BusinessException(FeedErrorCode.FEED_NOT_FOUND);
            throw e;
        }
        var row=repository.require(id);
        version(row.version(),expectedVersion);
        var now=clock.instant();
        takeDown(user,row,now);
        UUID trip=row.tripId(), member=tripAccess.member().getId();
        record OwnPhoto(UUID id,UUID asset) { }
        var photos=jdbc.query("select id,asset_id from photos where trip_id=? and uploader_member_id=? and deleted_at is null order by id for update",
                (rs,n)->new OwnPhoto(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class)),trip,member);
        var visits=jdbc.query("select id from visits where trip_id=? and member_id=? and deleted_at is null order by id for update",
                (rs,n)->rs.getObject(1,UUID.class),trip,member);
        var reviews=jdbc.query("select r.id from reviews r join visits v on v.id=r.visit_id where v.trip_id=? and v.member_id=? and v.deleted_at is null order by r.id",
                (rs,n)->rs.getObject(1,UUID.class),trip,member);
        var at=Timestamp.from(now);
        tombstone("update photos set deleted_at=?,version=version+1 where id=any(?)",at,photos.stream().map(OwnPhoto::id).toList());
        tombstone("update assets set status='DELETING',deleted_at=? where id=any(?)",at,photos.stream().map(OwnPhoto::asset).toList());
        tombstone("update visits set deleted_at=? where id=any(?)",at,visits);
        var input=json.createObjectNode().put("feedId",id.toString());
        var assetIds=input.putArray("assetIds"); var visitIds=input.putArray("visitIds"); var reviewIds=input.putArray("reviewIds");
        photos.forEach(p->assetIds.add(p.asset().toString()));
        visits.forEach(v->visitIds.add(v.toString()));
        reviews.forEach(r->reviewIds.add(r.toString()));
        return jobs.submit(new JobSubmission(user,JobKind.OWN_RECORDS_DELETE,trip,input,null,
                new CleanupScope(photos.stream().map(OwnPhoto::id).toList(),List.of(),now)));
    }
    private void tombstone(String sql,Timestamp at,List<UUID> ids) {
        if(ids.isEmpty()) return;
        jdbc.update(con->{
            var statement=con.prepareStatement(sql);
            statement.setTimestamp(1,at);
            statement.setArray(2,con.createArrayOf("uuid",ids.toArray()));
            return statement;
        });
    }
    private void takeDown(UUID user,FeedRepository.Row row,Instant now) {
        repository.delete(row,now);
        var recipients=jdbc.query("""
                select m.user_id from trip_members m left join user_settings s on s.user_id=m.user_id
                where m.trip_id=? and m.status='ACTIVE' and m.user_id<>? and coalesce(s.trip_changes_enabled,true)
                """,(rs,n)->rs.getObject(1,UUID.class),row.tripId(),user);
        events.register(new NotificationEventRegistrar.EventCommand("FEED_DELETED",row.tripId(),user,"TRIP",row.tripId(),
                "공동 피드가 삭제되었습니다.","FEED_DELETED:"+row.id()),recipients);
    }
    @Transactional
    public FeedVisibility visibility(UUID user,UUID id,VisibilityWrite request) {
        var ids=request.hiddenViewerUserIds();
        if(new HashSet<>(ids).size()!=ids.size()) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        var row=managed(user,id);
        var previous=repository.visibility(row,user);
        version(previous.version(),request.expectedVersion());
        return repository.replaceVisibility(row,user,ids,clock.instant());
    }
    private FeedRepository.Row managed(UUID user,UUID id) {
        var observed=repository.require(id);
        access.requireActiveMemberForUpdate(observed.tripId(),user);
        return repository.require(id);
    }
    private OwnFeed own(FeedRepository.Row row,UUID user) { return OwnFeed.of(withLikes(assembler.visible(row),user),repository.visibility(row,user)); }
    private void version(long actual,long expected) {
        if(actual!=expected) throw new BusinessException(FeedErrorCode.VERSION_CONFLICT);
    }
}
