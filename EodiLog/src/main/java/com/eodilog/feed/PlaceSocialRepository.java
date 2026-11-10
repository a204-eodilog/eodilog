package com.eodilog.feed;

import static com.eodilog.feed.FeedExposureRepository.LIVE;
import static com.eodilog.feed.FeedExposureRepository.NOT_HIDDEN_BY_MEMBER;
import static com.eodilog.feed.FeedExposureRepository.ROUTE;
import com.eodilog.global.common.response.CreatedAtCursor;
import java.sql.Array;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Place-level aggregates over feeds exposed to a viewer. A feed is allowed when it is live, its publication snapshot contains
 * the place (feed_places) and it passes the member-route predicate of {@link FeedExposureRepository} for {@code :members}.
 * Reviews follow feed-level visibility: every snapshot publicReview of the place in an allowed feed counts, while the original
 * review and its live visit on the feed's trip still exist. Visitors additionally need their own open member route.
 * All filtering and keyset paging happen in SQL.
 */
@Repository
@RequiredArgsConstructor
public class PlaceSocialRepository {
    private final NamedParameterJdbcTemplate jdbc;

    private static final String ALLOWED = "allowed as (select f.id,f.trip_id,f.published_at,f.snapshot_json"+LIVE
            +" and exists (select 1 from feed_places fp where fp.feed_id=f.id and fp.place_id=:place)"+ROUTE+")";
    private static final String PUBLISHED = """
            , published as (
             select f.id as feed_id,(e->>'id')::uuid as id,(e->>'score')::int as score,e->>'body' as body,
              (e->>'writtenAt')::timestamptz as written_at,(e->'author'->>'id')::uuid as author_id
             from allowed f cross join lateral jsonb_array_elements(f.snapshot_json->'publicReviews') e
             where e->>'placeId'=cast(:place as text)
              and exists (select 1 from reviews r join visits vi on vi.id=r.visit_id
               where r.id=(e->>'id')::uuid and vi.trip_id=f.trip_id and vi.deleted_at is null)
            )""";
    private static final String VISITORS = """
            , visitors as (
             select m.user_id,max(vi.visited_at) as last_at from allowed f
             join visits vi on vi.trip_id=f.trip_id and vi.place_id=:place and vi.deleted_at is null and vi.created_at<=f.published_at
             join trip_members m on m.id=vi.member_id and m.status='ACTIVE' and m.user_id=any(:members) and m.user_id<>:viewer
             where %s group by m.user_id
            )""".formatted(NOT_HIDDEN_BY_MEMBER);

    public record ReviewRow(UUID id,UUID feedId,UUID authorId,int score,String body,Instant writtenAt) { }
    public record Summary(long reviewCount,Double averageScore,long visitorCount,List<UUID> visitorIds) { }

    /** Current ACTIVE members of live feeds whose snapshot contains the place: the route candidates to check with FollowAccess. */
    public List<UUID> candidateMembers(UUID place) {
        return jdbc.queryForList("""
                select distinct m.user_id from feed_places fp join feeds f on f.id=fp.feed_id join trips t on t.id=f.trip_id
                join trip_members m on m.trip_id=f.trip_id and m.status='ACTIVE'
                where fp.place_id=:place and f.deleted_at is null and t.deleted_at is null
                """,new MapSqlParameterSource("place",place),UUID.class);
    }

    /** Published reviews of the place in allowed feeds, writtenAt DESC, id DESC; {@code limit} is the fetch size. */
    public List<ReviewRow> reviews(UUID viewer,Collection<UUID> members,UUID place,CreatedAtCursor after,int limit) {
        var params=params(viewer,members,place).addValue("limit",limit);
        String sql="with "+ALLOWED+PUBLISHED+" select * from published p";
        if(after!=null) {
            sql+=" where (p.written_at,p.id)<(:at,:id)";
            params.addValue("at",Timestamp.from(after.createdAt())).addValue("id",after.id());
        }
        return jdbc.query(sql+" order by p.written_at desc,p.id desc limit :limit",params,(rs,n)->new ReviewRow(
                rs.getObject("id",UUID.class),rs.getObject("feed_id",UUID.class),rs.getObject("author_id",UUID.class),
                rs.getInt("score"),rs.getString("body"),rs.getTimestamp("written_at").toInstant()));
    }

    /**
     * One statement: review count/average over published reviews, plus distinct visitors other than the viewer (a live visit to
     * the place on an allowed feed's trip recorded at or before publication, by a user who is an open route of that feed) with
     * their total and the first {@code limit} ids by latest visit DESC, user id DESC. The allowed CTE is referenced more than
     * once and is therefore materialized once.
     */
    public Summary summary(UUID viewer,Collection<UUID> members,UUID place,int limit) {
        var params=params(viewer,members,place).addValue("limit",limit);
        String sql="with "+ALLOWED+PUBLISHED+VISITORS+"""
                , top as (select user_id,last_at from visitors order by last_at desc,user_id desc limit :limit)
                select (select count(*) from published) as review_count,
                 (select avg(score)::float8 from published) as average_score,
                 (select count(*) from visitors) as visitor_count,
                 (select array_agg(user_id order by last_at desc,user_id desc) from top) as visitor_ids
                """;
        return jdbc.queryForObject(sql,params,(rs,n)->{
            Array array=rs.getArray("visitor_ids");
            List<UUID> ids=array==null?List.of():List.of((UUID[])array.getArray());
            return new Summary(rs.getLong("review_count"),rs.getObject("average_score",Double.class),rs.getLong("visitor_count"),ids);
        });
    }

    private static MapSqlParameterSource params(UUID viewer,Collection<UUID> members,UUID place) {
        return new MapSqlParameterSource("viewer",viewer).addValue("members",members.toArray(UUID[]::new)).addValue("place",place);
    }
}
