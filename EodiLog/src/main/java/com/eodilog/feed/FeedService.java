package com.eodilog.feed;

import com.eodilog.feed.FeedDtos.*;
import com.eodilog.feed.FeedRequests.*;
import com.eodilog.global.common.error.*;
import com.eodilog.global.common.response.*;
import com.eodilog.global.id.UuidV7;
import com.eodilog.notification.NotificationEventRegistrar;
import com.eodilog.trip.service.TripAccessChecker;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@RequiredArgsConstructor
public class FeedService {
    private final FeedRepository repository;
    private final FeedSnapshotAssembler assembler;
    private final TripAccessChecker access;
    private final NotificationEventRegistrar events;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public record Publication(OwnFeed feed,boolean created) { }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public OwnFeed tripFeed(UUID user,UUID trip) {
        access.requireActiveMember(trip,user);
        return repository.current(trip).map(row->own(row,user)).orElse(null);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Feed get(UUID id) { return assembler.visible(repository.require(id)); }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public PageResponse<OwnFeed> list(UUID user,String cursor,int limit) {
        if(limit<1 || limit>100) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        var rows=repository.own(user,cursor==null?null:CreatedAtCursor.decode(cursor),limit+1);
        boolean next=rows.size()>limit;
        var page=rows.subList(0,Math.min(rows.size(),limit));
        String after=next?new CreatedAtCursor(page.getLast().snapshot().publishedAt(),page.getLast().id()).encode():null;
        return PageResponse.of(page.stream().map(r->own(r,user)).toList(),after,next);
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
        repository.delete(row,clock.instant());
        var recipients=jdbc.query("""
                select m.user_id from trip_members m left join user_settings s on s.user_id=m.user_id
                where m.trip_id=? and m.status='ACTIVE' and m.user_id<>? and coalesce(s.trip_changes_enabled,true)
                """,(rs,n)->rs.getObject(1,UUID.class),row.tripId(),user);
        events.register(new NotificationEventRegistrar.EventCommand("FEED_DELETED",row.tripId(),user,"TRIP",row.tripId(),
                "공동 피드가 삭제되었습니다.","FEED_DELETED:"+id),recipients);
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
    private OwnFeed own(FeedRepository.Row row,UUID user) { return OwnFeed.of(assembler.visible(row),repository.visibility(row,user)); }
    private void version(long actual,long expected) {
        if(actual!=expected) throw new BusinessException(FeedErrorCode.VERSION_CONFLICT);
    }
}
