package com.eodilog.feed;

import com.eodilog.feed.FeedDtos.*;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.response.CreatedAtCursor;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
@RequiredArgsConstructor
public class FeedRepository {
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final JsonMapper json;
    private static final String LIVE = " from feeds f join trips t on t.id=f.trip_id where f.deleted_at is null and t.deleted_at is null ";
    public record Row(UUID id, UUID tripId, String title, String body, long version, Feed snapshot) { }
    public Optional<Row> current(UUID tripId) {
        return jdbc.query("select f.*"+LIVE+"and f.trip_id=?", this::map, tripId).stream().findFirst();
    }
    public Row require(UUID id) {
        return jdbc.query("select f.*"+LIVE+"and f.id=?", this::map, id).stream().findFirst()
                .orElseThrow(() -> new BusinessException(FeedErrorCode.FEED_NOT_FOUND));
    }
    public List<Row> own(UUID userId, CreatedAtCursor after, int limit) {
        var args = new MapSqlParameterSource("user",userId).addValue("limit",limit);
        String sql="select f.*"+LIVE+"and exists(select 1 from trip_members m where m.trip_id=f.trip_id and m.user_id=:user and m.status='ACTIVE')";
        if(after!=null) {
            sql+=" and (f.published_at,f.id)<(:at,:id)";
            args.addValue("at",Timestamp.from(after.createdAt())).addValue("id",after.id());
        }
        return named.query(sql+" order by f.published_at desc,f.id desc limit :limit",args,this::map);
    }
    /** Stores the snapshot and its queryable copies (period, regions, place regions) used by member-route exposure. */
    public void insert(Feed feed) {
        jdbc.update("insert into feeds(id,trip_id,title,body,published_at,start_date,end_date,snapshot_json) values(?,?,?,?,?,?,?,?::jsonb)",
                feed.id(),feed.tripId(),feed.title(),feed.body(),Timestamp.from(feed.publishedAt()),feed.startDate(),feed.endDate(),json.writeValueAsString(feed));
        jdbc.batchUpdate("insert into feed_regions(feed_id,region_id) values(?,?)",
                feed.regions().stream().map(r->r.id()).distinct().map(r->new Object[]{feed.id(),r}).toList());
        Map<UUID,UUID> places=new LinkedHashMap<>();
        feed.places().forEach(p->places.putIfAbsent(p.id(),p.regionId()));
        jdbc.batchUpdate("insert into feed_places(feed_id,place_id,region_id) values(?,?,?)",
                places.entrySet().stream().map(e->new Object[]{feed.id(),e.getKey(),e.getValue()}).toList());
    }
    public void photo(UUID feed, UUID photo, UUID asset) {
        jdbc.update("insert into feed_photos(feed_id,photo_id,asset_id) values(?,?,?)",feed,photo,asset);
    }
    public FeedVisibility visibility(Row row, UUID user) {
        var result=jdbc.query("select * from feed_visibilities where feed_id=? and user_id=?",(rs,n)-> {
            List<UUID> ids=new ArrayList<>();
            json.readTree(rs.getString("hidden_viewer_user_ids")).forEach(v->ids.add(UUID.fromString(v.asString())));
            return new FeedVisibility(row.id(),List.copyOf(ids),rs.getLong("version"),rs.getTimestamp("updated_at").toInstant());
        },row.id(),user);
        return result.isEmpty()? new FeedVisibility(row.id(),List.of(),1,row.snapshot().publishedAt()):result.getFirst();
    }
    public FeedVisibility replaceVisibility(Row row, UUID user, List<UUID> ids, Instant now) {
        jdbc.update("""
                insert into feed_visibilities(feed_id,user_id,hidden_viewer_user_ids,version,updated_at)
                values(?,?,?::jsonb,2,?) on conflict(feed_id,user_id) do update
                set hidden_viewer_user_ids=excluded.hidden_viewer_user_ids,version=feed_visibilities.version+1,updated_at=excluded.updated_at
                """,row.id(),user,json.writeValueAsString(ids),Timestamp.from(now));
        return visibility(row,user);
    }
    public void edit(Row row,String title,String body) {
        jdbc.update("update feeds set title=?,body=?,version=version+1 where id=?",title,body,row.id());
    }
    public void delete(Row row,Instant now) {
        jdbc.update("update feeds set deleted_at=?,version=version+1 where id=?",Timestamp.from(now),row.id());
    }
    public Set<UUID> livePhotoIds(UUID feedId) {
        return new HashSet<>(jdbc.query("""
                select p.id from feed_photos fp join feeds f on f.id=fp.feed_id
                join photos p on p.id=fp.photo_id and p.trip_id=f.trip_id and p.asset_id=fp.asset_id
                join assets a on a.id=p.asset_id and a.trip_id=f.trip_id
                where fp.feed_id=? and p.deleted_at is null and a.deleted_at is null and a.status='READY'
                """,(rs,n)->rs.getObject(1,UUID.class),feedId));
    }
    public Set<UUID> liveReviewIds(UUID trip) {
        return new HashSet<>(jdbc.query("select r.id from reviews r join visits v on v.id=r.visit_id where v.trip_id=? and v.deleted_at is null",
                (rs,n)->rs.getObject(1,UUID.class),trip));
    }
    public record Likes(long count, boolean likedByMe) { }
    public Map<UUID,Likes> likes(Collection<UUID> feedIds, UUID viewer) {
        Map<UUID,Likes> result=new HashMap<>();
        if(feedIds.isEmpty()) return result;
        named.query("select feed_id,count(*),bool_or(user_id=:viewer) from feed_likes where feed_id in (:ids) group by feed_id",
                new MapSqlParameterSource("ids",feedIds).addValue("viewer",viewer),
                rs->{ result.put(rs.getObject(1,UUID.class),new Likes(rs.getLong(2),rs.getBoolean(3))); });
        return result;
    }
    /** Share-locks the live feed and its trip so a concurrent tombstone or trip delete waits; absent means FEED_NOT_FOUND. */
    public void lockLive(UUID id) {
        if(jdbc.query("select 1"+LIVE+"and f.id=? for share",(rs,n)->1,id).isEmpty()) throw new BusinessException(FeedErrorCode.FEED_NOT_FOUND);
    }
    public void like(UUID feed, UUID user, Instant now) {
        jdbc.update("insert into feed_likes(feed_id,user_id,created_at) values(?,?,?) on conflict(feed_id,user_id) do nothing",feed,user,Timestamp.from(now));
    }
    public void unlike(UUID feed, UUID user) {
        jdbc.update("delete from feed_likes where feed_id=? and user_id=?",feed,user);
    }
    public boolean activeMember(UUID trip, UUID user) {
        return !jdbc.queryForList("select 1 from trip_members where trip_id=? and user_id=? and status='ACTIVE'",Integer.class,trip,user).isEmpty();
    }
    /** Live original photo IDs per feed, with the same checks as {@link #livePhotoIds(UUID)}. */
    public Map<UUID,Set<UUID>> livePhotoIds(Collection<UUID> feedIds) {
        Map<UUID,Set<UUID>> result=new HashMap<>();
        if(feedIds.isEmpty()) return result;
        named.query("""
                select fp.feed_id,p.id from feed_photos fp join feeds f on f.id=fp.feed_id
                join photos p on p.id=fp.photo_id and p.trip_id=f.trip_id and p.asset_id=fp.asset_id
                join assets a on a.id=p.asset_id and a.trip_id=f.trip_id
                where fp.feed_id in (:ids) and p.deleted_at is null and a.deleted_at is null and a.status='READY'
                """,new MapSqlParameterSource("ids",feedIds),
                rs->{ result.computeIfAbsent(rs.getObject(1,UUID.class),k->new HashSet<>()).add(rs.getObject(2,UUID.class)); });
        return result;
    }
    /** Places of the feed's trip with a live visit recorded at or before publication. */
    public Set<UUID> visitedPlaceIds(Row row) {
        return new HashSet<>(jdbc.query("select distinct place_id from visits where trip_id=? and deleted_at is null and created_at<=?",
                (rs,n)->rs.getObject(1,UUID.class),row.tripId(),Timestamp.from(row.snapshot().publishedAt())));
    }
    Row map(ResultSet rs,int n) throws SQLException {
        return new Row(rs.getObject("id",UUID.class),rs.getObject("trip_id",UUID.class),rs.getString("title"),rs.getString("body"),
                rs.getLong("version"),json.readValue(rs.getString("snapshot_json"),Feed.class));
    }
}
