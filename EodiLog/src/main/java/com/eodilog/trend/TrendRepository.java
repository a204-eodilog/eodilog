package com.eodilog.trend;

import com.eodilog.region.dto.RegionView;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Region trend aggregation done entirely in SQL: permission filter, period overlap, per-region counts, current and previous
 * window ranks (window functions) and keyset paging. Nothing is loaded and filtered in Java.
 *
 * <p>A live feed (feed and trip not deleted) is allowed for the viewer when some current ACTIVE trip member is an ACTIVE,
 * profile-completed user whose content the viewer may see (the viewer themself, a PUBLIC account, or a PRIVATE account the
 * viewer follows with ACCEPTED status - the FollowAccess rule) and who has not hidden the viewer on that feed (the viewer's
 * own route ignores their own hidden list). A viewer that is not ACTIVE and profile-completed sees nothing.
 *
 * <p>A feed's period is its snapshot trip dates; an undated feed uses its publication date in Asia/Seoul. It belongs to a
 * window when that period overlaps the window. Candidate feeds are first narrowed with index-backed range predicates
 * (dated: end_date/start_date, undated: published_at between the Seoul day boundaries; see V202611102000) and the exact
 * period rule is applied on top. Snapshot dates come from trips, whose start and end dates are both set or both null.
 */
@Repository
@RequiredArgsConstructor
public class TrendRepository {
    private static final ZoneId SEOUL=ZoneId.of("Asia/Seoul");
    private final NamedParameterJdbcTemplate jdbc;

    public record Row(RegionView region,int rank,Integer previousRank,int count,int followingCount,int sampleSize) { }

    private static final String NOT_HIDDEN = """
            (m.user_id=:viewer or not exists (select 1 from feed_visibilities v where v.feed_id=f.id and v.user_id=m.user_id
             and v.hidden_viewer_user_ids @> jsonb_build_array(cast(:viewer as text))))""";
    private static final String PUBLISHED_DAY = "(f.published_at at time zone 'Asia/Seoul')::date";

    private static final String SQL = """
            with live as (
             select f.id,f.trip_id,
              coalesce(f.start_date,%1$s) as s,
              coalesce(f.end_date,f.start_date,%1$s) as e
             from feeds f join trips t on t.id=f.trip_id
             where f.deleted_at is null and t.deleted_at is null
              and exists (select 1 from users me where me.id=:viewer and me.status='ACTIVE' and me.profile_completed)
              and ((f.deleted_at is null and f.start_date is not null and f.end_date>=:prevFrom and f.start_date<=:to)
               or (f.deleted_at is null and f.start_date is null and f.published_at>=:prevFromAt and f.published_at<:toEndAt))
              and coalesce(f.start_date,%1$s)<=:to and coalesce(f.end_date,f.start_date,%1$s)>=:prevFrom
              and exists (select 1 from trip_members m join users u on u.id=m.user_id
               where m.trip_id=f.trip_id and m.status='ACTIVE' and u.status='ACTIVE' and u.profile_completed
                and (m.user_id=:viewer or u.account_visibility='PUBLIC' or exists (select 1 from follows fo
                 where fo.follower_user_id=:viewer and fo.followee_user_id=m.user_id and fo.status='ACCEPTED'))
                and %2$s)
            ),
            cur_feeds as (
             select l.id,
              exists (select 1 from feeds f join trip_members m on m.trip_id=f.trip_id join users u on u.id=m.user_id
               join follows fo on fo.follower_user_id=:viewer and fo.followee_user_id=m.user_id and fo.status='ACCEPTED'
               where f.id=l.id and m.status='ACTIVE' and u.status='ACTIVE' and u.profile_completed and %2$s) as followed
             from live l where l.s<=:to and l.e>=:from
            ),
            cur as (
             select fr.region_id,c.id as feed_id,c.followed from cur_feeds c join feed_regions fr on fr.feed_id=c.id
            ),
            cur_rank as (
             select region_id,count(*) as c,count(*) filter (where followed) as fc,rank() over (order by count(*) desc) as rk
             from cur group by region_id
            ),
            prev_rank as (
             select fr.region_id,rank() over (order by count(*) desc) as rk
             from live l join feed_regions fr on fr.feed_id=l.id where l.s<=:prevTo and l.e>=:prevFrom group by fr.region_id
            )
            select r.id,r.code,r.name,r.parent_id,r.latitude,r.longitude,cr.c::int as c,cr.fc::int as fc,cr.rk::int as rk,pr.rk::int as prev_rk,
             (select count(distinct feed_id) from cur)::int as sample
            from cur_rank cr join regions r on r.id=cr.region_id left join prev_rank pr on pr.region_id=cr.region_id
            where %3$s
            order by cr.c desc,r.code asc
            limit :limit
            """;

    /**
     * Ranked regions for [from,to] after {@code after} (keyset on count DESC, code ASC); {@code limit} is the fetch size.
     * The previous window is [prevFrom,prevTo].
     */
    public List<Row> page(UUID viewer,LocalDate from,LocalDate to,LocalDate prevFrom,LocalDate prevTo,TrendCursor after,int limit) {
        var params=params(viewer,from,to,prevFrom,prevTo).addValue("limit",limit);
        if(after!=null) params.addValue("afterCount",after.count()).addValue("afterCode",after.code());
        return jdbc.query(sql(after!=null),params,(rs,n)->new Row(
                new RegionView(rs.getObject("id",UUID.class),rs.getString("code"),rs.getString("name"),rs.getObject("parent_id",UUID.class),
                        rs.getBigDecimal("latitude"),rs.getBigDecimal("longitude")),
                rs.getInt("rk"),rs.getObject("prev_rk",Integer.class),rs.getInt("c"),rs.getInt("fc"),rs.getInt("sample")));
    }

    static String sql(boolean withCursor) {
        return SQL.formatted(PUBLISHED_DAY,NOT_HIDDEN,withCursor?"(cr.c<:afterCount or (cr.c=:afterCount and r.code>:afterCode))":"true");
    }

    static MapSqlParameterSource params(UUID viewer,LocalDate from,LocalDate to,LocalDate prevFrom,LocalDate prevTo) {
        return new MapSqlParameterSource("viewer",viewer).addValue("from",from).addValue("to",to)
                .addValue("prevFrom",prevFrom).addValue("prevTo",prevTo)
                .addValue("prevFromAt",OffsetDateTime.ofInstant(prevFrom.atStartOfDay(SEOUL).toInstant(),ZoneOffset.UTC))
                .addValue("toEndAt",OffsetDateTime.ofInstant(to.plusDays(1).atStartOfDay(SEOUL).toInstant(),ZoneOffset.UTC));
    }
}
