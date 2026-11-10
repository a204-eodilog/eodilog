package com.eodilog.feed;

import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.region.dto.RegionView;
import com.eodilog.timeline.TimelineCursor;
import java.math.BigDecimal;
import java.sql.*;
import java.time.LocalDate;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Member-route exposure queries. Filtering, de-duplication, ordering and keyset paging all happen in SQL; callers pass the
 * route members already allowed by FollowAccess as a uuid[] ({@code :members}). A live feed is exposed through a member
 * when that member is currently ACTIVE on its trip and has not hidden the viewer (the viewer's own route ignores this).
 */
@Repository
@RequiredArgsConstructor
public class FeedExposureRepository {
    private final NamedParameterJdbcTemplate jdbc;
    private final FeedRepository feeds;

    static final String NOT_HIDDEN_BY_MEMBER = """
            (m.user_id=:viewer or not exists (select 1 from feed_visibilities v where v.feed_id=f.id and v.user_id=m.user_id
             and v.hidden_viewer_user_ids @> jsonb_build_array(cast(:viewer as text))))""";
    static final String LIVE = " from feeds f join trips t on t.id=f.trip_id where f.deleted_at is null and t.deleted_at is null ";
    static final String ROUTE = " and exists (select 1 from trip_members m where m.trip_id=f.trip_id and m.status='ACTIVE'"
            + " and m.user_id=any(:members) and " + NOT_HIDDEN_BY_MEMBER + ") ";
    private static final String BBOX = " (r.latitude is null or r.longitude is null or (r.longitude between :west and :east and r.latitude between :south and :north)) ";

    public record Box(BigDecimal west,BigDecimal south,BigDecimal east,BigDecimal north) { }
    public record TimelineRow(UUID feedId,UUID tripId,LocalDate start,LocalDate end) { }
    public record Marker(RegionView region,List<UUID> feedIds,List<UUID> members,long visitCount) { }
    public record OwnMarker(RegionView region,List<UUID> tripIds,List<UUID> feedIds) { }
    public record OwnMap(List<OwnMarker> markers,long unlocated,long hidden) { }

    /** Single feed, single member route. */
    public boolean routeAllows(UUID viewer,UUID feedId,UUID member) {
        var params=params(viewer,List.of(member)).addValue("id",feedId);
        return !jdbc.queryForList("select 1"+LIVE+"and f.id=:id"+ROUTE,params,Integer.class).isEmpty();
    }

    /** Exposed feeds in publishedAt DESC, id DESC; {@code limit} is the fetch size (page size + 1). */
    public List<FeedRepository.Row> page(UUID viewer,Collection<UUID> members,UUID regionId,CreatedAtCursor after,int limit) {
        var params=params(viewer,members).addValue("limit",limit);
        String sql="select f.*"+LIVE+ROUTE;
        if(regionId!=null) {
            sql+=" and exists (select 1 from feed_regions x where x.feed_id=f.id and x.region_id=:region)";
            params.addValue("region",regionId);
        }
        if(after!=null) {
            sql+=" and (f.published_at,f.id)<(:at,:id)";
            params.addValue("at",Timestamp.from(after.createdAt())).addValue("id",after.id());
        }
        return jdbc.query(sql+" order by f.published_at desc,f.id desc limit :limit",params,feeds::map);
    }

    /** Exposed feeds by snapshot start date DESC NULLS LAST, trip_id DESC (TimelineCursor semantics). */
    public List<TimelineRow> timeline(UUID viewer,Collection<UUID> members,TimelineCursor after,int limit) {
        var params=params(viewer,members).addValue("limit",limit);
        String sql="select f.id,f.trip_id,f.start_date,f.end_date"+LIVE+ROUTE;
        if(after!=null) {
            params.addValue("trip",after.tripId());
            if(after.date()==null) sql+=" and f.start_date is null and f.trip_id<:trip";
            else {
                params.addValue("date",after.date());
                sql+=" and (f.start_date<:date or f.start_date is null or (f.start_date=:date and f.trip_id<:trip))";
            }
        }
        return jdbc.query(sql+" order by f.start_date desc nulls last,f.trip_id desc limit :limit",params,(rs,n)->new TimelineRow(
                rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,LocalDate.class),rs.getObject(4,LocalDate.class)));
    }

    /**
     * Region markers of exposed feeds: feeds grouped by snapshot region (feed_regions) inside the box, feedIds in
     * publishedAt DESC, id DESC, allowed members per region, and visits recorded at or before publication on the feed's
     * trip whose snapshot place region (feed_places) is the marker region.
     */
    public List<Marker> map(UUID viewer,Collection<UUID> members,Box box,LocalDate from,LocalDate to) {
        var params=box(params(viewer,members),box);
        String sql="""
                with routes as (
                 select f.id as feed_id,f.trip_id,f.published_at,m.user_id as member
                 from feeds f join trips t on t.id=f.trip_id
                 join trip_members m on m.trip_id=f.trip_id and m.status='ACTIVE' and m.user_id=any(:members)
                 where f.deleted_at is null and t.deleted_at is null and %s and %s
                ), allowed as (select distinct feed_id,trip_id,published_at from routes),
                visit_counts as (
                 select a.feed_id,fp.region_id,count(*) as c from allowed a
                 join visits v on v.trip_id=a.trip_id and v.deleted_at is null and v.created_at<=a.published_at
                 join feed_places fp on fp.feed_id=a.feed_id and fp.place_id=v.place_id
                 where fp.region_id is not null group by a.feed_id,fp.region_id
                )
                select r.id,r.code,r.name,r.parent_id,r.latitude,r.longitude,
                 array_agg(a.feed_id order by a.published_at desc,a.feed_id desc) as feed_ids,
                 coalesce(sum(vc.c),0) as visit_count,
                 (select array_agg(distinct ro.member) from routes ro join feed_regions x on x.feed_id=ro.feed_id and x.region_id=r.id) as members
                from allowed a join feed_regions fr on fr.feed_id=a.feed_id join regions r on r.id=fr.region_id
                left join visit_counts vc on vc.feed_id=a.feed_id and vc.region_id=r.id
                where %s group by r.id order by r.code
                """.formatted(NOT_HIDDEN_BY_MEMBER,period("f.start_date","f.end_date",from,to,params),BBOX);
        return jdbc.query(sql,params,(rs,n)->new Marker(region(rs),uuids(rs,"feed_ids"),uuids(rs,"members"),rs.getLong("visit_count")));
    }

    /**
     * Own ACTIVE trips: published ones use the snapshot period and regions, unpublished ones the current period and
     * destinations plus regions of live visited places. With a viewer only published feeds visible on my route are included
     * and {@code hidden} counts date-matching published feeds that are not (independent of the box).
     */
    public OwnMap own(UUID me,UUID viewer,boolean viewerCanSeeMe,Box box,LocalDate from,LocalDate to) {
        var params=box(new MapSqlParameterSource("me",me),box).addValue("viewer",viewer).addValue("canSee",viewerCanSeeMe)
                .addValue("self",me.equals(viewer));
        String visible="(:canSee and (:self or not exists (select 1 from feed_visibilities v where v.feed_id=b.feed_id and v.user_id=:me"
                +" and v.hidden_viewer_user_ids @> jsonb_build_array(cast(:viewer as text)))))";
        String period=period("b.s","b.e",from,to,params);
        String cte="""
                with base as (
                 select t.id as trip_id,f.id as feed_id,
                  case when f.id is null then t.start_date else f.start_date end as s,
                  case when f.id is null then t.end_date else f.end_date end as e
                 from trips t join trip_members m on m.trip_id=t.id and m.user_id=:me and m.status='ACTIVE'
                 left join feeds f on f.trip_id=t.id and f.deleted_at is null
                 where t.deleted_at is null
                ), included as (select b.* from base b where %s %s),
                located as (
                 select i.trip_id,i.feed_id,x.region_id from included i cross join lateral (
                  select fr.region_id from feed_regions fr where fr.feed_id=i.feed_id
                  union select d.region_id from trip_destinations d where i.feed_id is null and d.trip_id=i.trip_id
                  union select p.region_id from visits v join places p on p.id=v.place_id
                   where i.feed_id is null and v.trip_id=i.trip_id and v.deleted_at is null and p.region_id is not null
                 ) x
                )
                """.formatted(period,viewer==null?"":" and b.feed_id is not null and "+visible);
        var markers=jdbc.query(cte+"""
                select r.id,r.code,r.name,r.parent_id,r.latitude,r.longitude,
                 array_agg(l.trip_id order by l.trip_id) as trip_ids,
                 array_agg(l.feed_id order by l.trip_id) filter (where l.feed_id is not null) as feed_ids
                from located l join regions r on r.id=l.region_id where %s group by r.id order by r.code
                """.formatted(BBOX),params,(rs,n)->new OwnMarker(region(rs),uuids(rs,"trip_ids"),uuids(rs,"feed_ids")));
        Long unlocated=jdbc.queryForObject(cte+" select count(*) from included i where not exists (select 1 from located l where l.trip_id=i.trip_id)",params,Long.class);
        Long hidden=viewer==null?0L:jdbc.queryForObject(cte+" select count(*) from base b where b.feed_id is not null and "+period+" and not "+visible,params,Long.class);
        return new OwnMap(markers,unlocated==null?0:unlocated,hidden==null?0:hidden);
    }

    private static MapSqlParameterSource params(UUID viewer,Collection<UUID> members) {
        return new MapSqlParameterSource("viewer",viewer).addValue("members",members.toArray(UUID[]::new));
    }
    private static MapSqlParameterSource box(MapSqlParameterSource params,Box box) {
        return params.addValue("west",box.west()).addValue("east",box.east()).addValue("south",box.south()).addValue("north",box.north());
    }
    /** Period overlaps [from,to]; without a filter everything matches, with one undated trips never match. */
    private static String period(String start,String end,LocalDate from,LocalDate to,MapSqlParameterSource params) {
        if(from==null && to==null) return "true";
        String sql="("+start+" is not null";
        if(to!=null) { sql+=" and "+start+"<=:to"; params.addValue("to",to); }
        if(from!=null) { sql+=" and coalesce("+end+","+start+")>=:from"; params.addValue("from",from); }
        return sql+")";
    }
    private static RegionView region(ResultSet rs) throws SQLException {
        return new RegionView(rs.getObject("id",UUID.class),rs.getString("code"),rs.getString("name"),rs.getObject("parent_id",UUID.class),
                rs.getBigDecimal("latitude"),rs.getBigDecimal("longitude"));
    }
    private static List<UUID> uuids(ResultSet rs,String column) throws SQLException {
        Array array=rs.getArray(column);
        if(array==null) return List.of();
        return List.of((UUID[])array.getArray());
    }
}
