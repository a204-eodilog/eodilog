package com.eodilog.feed;

import static com.eodilog.feed.FeedExposureRepository.NOT_HIDDEN_BY_MEMBER;
import com.eodilog.feed.DiscoveryCursor.FeedKey;
import com.eodilog.feed.DiscoveryCursor.PlaceKey;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Discovery candidates, filtered and keyset-paged in SQL. An allowed feed is live, published in [since, now], not on a trip the
 * viewer is currently an ACTIVE member of, and reachable through at least one member route. Viewability is evaluated inside
 * SQL (no candidate id lists are passed): the predicates in {@link #ALLOWED} must equal {@code JdbcFollowAccess.viewableMembers}
 * (viewer ACTIVE and profile_completed; member ACTIVE, profile_completed and self, PUBLIC or viewer→member ACCEPTED follow)
 * combined with the member-route rule of {@link FeedExposureRepository} (current ACTIVE trip member who has not hidden the viewer).
 */
@Repository
@RequiredArgsConstructor
public class DiscoveryRepository {
    private final NamedParameterJdbcTemplate jdbc;
    private final FeedRepository feeds;

    /**
     * Allowed-feed predicate over {@code f} (feeds) and {@code t} (trips). Viewability must equal JdbcFollowAccess.viewableMembers
     * plus the member-route rule. The OFFSET 0 inside the (NOT) EXISTS subqueries keeps them per-feed probes of trip_members/users
     * by key instead of semi-joins that hash the whole trip_members table, so the cost follows the candidate feeds only.
     */
    static final String ALLOWED = """
             f.deleted_at is null and t.deleted_at is null and f.published_at>=:since and f.published_at<=:now
              and exists (select 1 from users v where v.id=:viewer and v.status='ACTIVE' and v.profile_completed)
              and not exists (select 1 from trip_members o where o.trip_id=f.trip_id and o.user_id=:viewer and o.status='ACTIVE' offset 0)
              and exists (select 1 from trip_members m join users u on u.id=m.user_id
               where m.trip_id=f.trip_id and m.status='ACTIVE' and u.status='ACTIVE' and u.profile_completed
                and (u.id=:viewer or u.account_visibility='PUBLIC' or exists (select 1 from follows fo
                 where fo.follower_user_id=:viewer and fo.followee_user_id=u.id and fo.status='ACCEPTED'))
                and %s offset 0)
            """.formatted(NOT_HIDDEN_BY_MEMBER);

    /** Feed row with its keyset values read from the columns the index orders by. */
    public record RankedFeed(FeedRepository.Row row,long likeCount,Instant publishedAt) { }
    public record RankedPlace(UUID id,long count) { }

    /**
     * Allowed feeds after {@code after} by like_count DESC, published_at DESC, id DESC. The order and the row-value keyset match
     * idx_feeds_discovery, so Postgres walks that index and stops after {@code limit} allowed rows.
     */
    public List<RankedFeed> feeds(UUID viewer,Instant since,Instant now,FeedKey after,int limit) {
        var params=window(viewer,since,now).addValue("limit",limit);
        if(after!=null) params.addValue("likes",after.likeCount()).addValue("at",Timestamp.from(after.publishedAt())).addValue("id",after.id());
        return jdbc.query(feedSql(after!=null),params,
                (rs,n)->new RankedFeed(feeds.map(rs,n),rs.getLong("like_count"),rs.getTimestamp("published_at").toInstant()));
    }

    /**
     * Existing places by the number of distinct allowed feeds whose snapshot contains them (feed_places), DESC, then place id DESC,
     * after {@code after}. The aggregate is bounded by the window: allowed feeds come from the idx_feeds_published range and their
     * places from the feed_places primary key.
     */
    public List<RankedPlace> places(UUID viewer,Instant since,Instant now,PlaceKey after,int limit) {
        var params=window(viewer,since,now).addValue("limit",limit);
        if(after!=null) params.addValue("count",after.count()).addValue("id",after.id());
        return jdbc.query(placeSql(after!=null),params,
                (rs,n)->new RankedPlace(rs.getObject("place_id",UUID.class),rs.getLong("c")));
    }

    /** Feed page statement (params viewer, since, now, limit and with a keyset likes, at, id). */
    static String feedSql(boolean keyset) {
        return "select f.* from feeds f join trips t on t.id=f.trip_id where"+ALLOWED
                +(keyset?" and (f.like_count,f.published_at,f.id)<(:likes,:at,:id)":"")
                +" order by f.like_count desc,f.published_at desc,f.id desc limit :limit";
    }
    /**
     * Place page statement (params viewer, since, now, limit and with a keyset count, id). The LATERAL ... OFFSET 0 fences keep
     * the planner from hashing whole trips/feed_places/places tables: each allowed feed (from the idx_feeds_published range) probes
     * trips_pkey, feed_places_pkey and places_pkey, so the cost follows the window size, not the table sizes.
     */
    static String placeSql(boolean keyset) {
        return """
                with allowed as materialized (
                 select f.id from feeds f cross join lateral (select t.deleted_at from trips t where t.id=f.trip_id offset 0) t
                 where %s
                ), counts as (
                 select x.place_id,count(*) as c from allowed a cross join lateral (
                  select fp.place_id from feed_places fp where fp.feed_id=a.id
                   and exists (select 1 from places p where p.id=fp.place_id offset 0) offset 0) x
                 group by x.place_id
                )
                select place_id,c from counts""".formatted(ALLOWED)
                +(keyset?" where (c,place_id)<(:count,:id)":"")+" order by c desc,place_id desc limit :limit";
    }
    private static MapSqlParameterSource window(UUID viewer,Instant since,Instant now) {
        return new MapSqlParameterSource("viewer",viewer).addValue("since",Timestamp.from(since)).addValue("now",Timestamp.from(now));
    }
}
