package com.eodilog.trend;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.InMemoryStorageConfiguration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Trends aggregate over every feed in the database, so each test works in its own far-future year that no other test
 * (here or in other classes) uses.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class,InMemoryStorageConfiguration.class})
class TrendRegionApiTest {
    private static final AtomicInteger YEARS=new AtomicInteger(3000+ThreadLocalRandom.current().nextInt(4000));
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @Autowired NamedParameterJdbcTemplate named;
    @Autowired TransactionTemplate tx;

    @Test void countsOnlyFeedsTheRequesterMaySeeAndCountsFollowedRoutes() throws Exception {
        int y=YEARS.getAndIncrement();
        String in=y+"-03-05";
        UUID viewer=user("PRIVATE",true),stranger=user("PUBLIC",true),region=region(y+"A");
        UUID pub=user("PUBLIC",true),priv=user("PRIVATE",true),requested=user("PRIVATE",true),friend=user("PRIVATE",true);
        UUID hider=user("PUBLIC",true),other=user("PUBLIC",true),left=user("PUBLIC",true),incomplete=user("PUBLIC",false);
        follow(viewer,requested,"REQUESTED"); follow(viewer,friend,"ACCEPTED");
        UUID a=feed(in,in,null,List.of(region),pub);                         // PUBLIC without follow: counted
        feed(in,in,null,List.of(region),priv);                                // PRIVATE without follow: excluded
        feed(in,in,null,List.of(region),requested);                           // REQUESTED is not enough
        UUID d=feed(in,in,null,List.of(region),friend);                      // ACCEPTED: counted and following
        UUID e=feed(in,in,null,List.of(region),hider); hide(e,hider,viewer); // only route hides the viewer
        UUID f=feed(in,in,null,List.of(region),hider,priv); hide(f,hider,viewer); // other route not viewable
        UUID g=feed(in,in,null,List.of(region),hider,other); hide(g,hider,viewer); // still allowed through other
        UUID h=feed(in,in,null,List.of(region),priv,viewer);                 // requester is an ACTIVE member
        UUID leftFeed=feed(in,in,null,List.of(region),left,priv);
        jdbc.update("update trip_members set status='LEFT',left_at=now() where user_id=? and trip_id=(select trip_id from feeds where id=?)",left,leftFeed);
        feed(in,in,null,List.of(region),incomplete);                          // pending-signup member is no route
        UUID deleted=feed(in,in,null,List.of(region),pub);
        jdbc.update("update feeds set deleted_at=now() where id=?",deleted);
        UUID deletedTrip=feed(in,in,null,List.of(region),pub);
        jdbc.update("update trips set deleted_at=now() where id=(select trip_id from feeds where id=?)",deletedTrip);
        assertThat(List.of(a,d,g,h)).doesNotHaveDuplicates();

        JsonNode row=single(trends(viewer,y+"-03-01",y+"-03-31"));
        assertThat(row.path("region").path("id").asString()).isEqualTo(region.toString());
        assertThat(row.path("publishedTripCount").asInt()).isEqualTo(4);
        assertThat(row.path("followingCount").asInt()).isEqualTo(1);
        assertThat(row.path("sampleSize").asInt()).isEqualTo(4);
        assertThat(row.path("insufficientData").asBoolean()).isTrue();
        assertThat(row.path("rank").asInt()).isEqualTo(1);
        assertThat(row.path("from").asString()).isEqualTo(y+"-03-01");
        assertThat(row.path("to").asString()).isEqualTo(y+"-03-31");
        assertThat(Instant.parse(row.path("updatedAt").asString())).isNotNull();

        // another viewer: PUBLIC routes count (a, e, f and g are not hidden from them), private-only routes (d, h) do not
        JsonNode other2=single(trends(stranger,y+"-03-01",y+"-03-31"));
        assertThat(other2.path("publishedTripCount").asInt()).isEqualTo(4);
        assertThat(other2.path("followingCount").asInt()).isZero();

        // hiding the followed route removes it from both counts
        hide(d,friend,viewer);
        JsonNode after=single(trends(viewer,y+"-03-01",y+"-03-31"));
        assertThat(after.path("publishedTripCount").asInt()).isEqualTo(3);
        assertThat(after.path("followingCount").asInt()).isZero();
    }

    @Test void periodOverlapsTripDatesAndUndatedFeedsUseSeoulPublicationDate() throws Exception {
        int y=YEARS.getAndIncrement();
        UUID viewer=user("PUBLIC",true),m=user("PUBLIC",true),region=region(y+"A");
        feed(y+"-05-01",y+"-05-10",null,List.of(region),m);   // ends on from: in
        feed(y+"-05-20",y+"-05-25",null,List.of(region),m);   // starts on to: in
        feed(y+"-05-01",y+"-05-30",null,List.of(region),m);   // spans: in
        feed(y+"-05-01",y+"-05-09",null,List.of(region),m);   // before: out
        feed(y+"-05-21",y+"-05-30",null,List.of(region),m);   // after: out
        feed(null,null,y+"-05-15T03:00:00Z",List.of(region),m); // undated, published inside: in
        feed(null,null,y+"-05-20T15:30:00Z",List.of(region),m); // 05-21 00:30 in Seoul: out
        feed(null,null,y+"-05-09T15:30:00Z",List.of(region),m); // 05-10 00:30 in Seoul: in
        feed(y+"-05-12",y+"-05-12",null,List.of(),m);          // no region: not ranked, not sampled
        JsonNode row=single(trends(viewer,y+"-05-10",y+"-05-20"));
        assertThat(row.path("publishedTripCount").asInt()).isEqualTo(5);
        assertThat(row.path("sampleSize").asInt()).isEqualTo(5);
        assertThat(row.path("insufficientData").asBoolean()).isFalse();
        assertThat(trends(viewer,y+"-12-01",y+"-12-10")).isEmpty();
    }

    @Test void ranksSharePlacesOnTiesAndCompareWithThePreviousWindow() throws Exception {
        int y=YEARS.getAndIncrement();
        UUID viewer=user("PUBLIC",true),m=user("PUBLIC",true);
        UUID r1=region(y+"A"),r2=region(y+"B"),r3=region(y+"C"),r4=region(y+"D");
        String cur=y+"-07-15",prev=y+"-07-05";
        // current window 07-11..07-20, previous window 07-01..07-10
        feed(cur,cur,null,List.of(r1,r2),m);       // counts for r1 and r2 once in the sample
        feed(cur,cur,null,List.of(r1),m); feed(cur,cur,null,List.of(r1),m);
        feed(cur,cur,null,List.of(r2),m); feed(cur,cur,null,List.of(r2),m);
        feed(cur,cur,null,List.of(r3),m); feed(cur,cur,null,List.of(r3),m);
        feed(y+"-07-09",y+"-07-12",null,List.of(r4),m); // spans both windows
        for(int i=0;i<4;i++) feed(prev,prev,null,List.of(r3),m);
        feed(prev,prev,null,List.of(r1),m); feed(prev,prev,null,List.of(r1),m);
        feed(y+"-06-30",y+"-06-30",null,List.of(r2),m);  // before the previous window: r2 stays new

        JsonNode rows=trends(viewer,y+"-07-11",y+"-07-20");
        assertThat(rows.size()).isEqualTo(4);
        List<String> order=new ArrayList<>();
        rows.forEach(n->order.add(n.path("region").path("id").asString()));
        assertThat(order).containsExactly(r1.toString(),r2.toString(),r3.toString(),r4.toString());
        int[][] expected={{1,3,2,1},{1,3,-1,-1},{3,2,1,-2},{4,1,3,-1}}; // rank,count,previousRank(-1=null),rankChange
        for(int i=0;i<4;i++) {
            JsonNode n=rows.get(i);
            assertThat(n.path("rank").asInt()).as("rank %d",i).isEqualTo(expected[i][0]);
            assertThat(n.path("publishedTripCount").asInt()).as("count %d",i).isEqualTo(expected[i][1]);
            if(expected[i][2]<0) {
                assertThat(n.path("previousRank").isNull()).isTrue();
                assertThat(n.path("rankChange").isNull()).isTrue();
                assertThat(n.path("isNew").asBoolean()).isTrue();
            } else {
                assertThat(n.path("previousRank").asInt()).as("previous %d",i).isEqualTo(expected[i][2]);
                assertThat(n.path("rankChange").asInt()).as("change %d",i).isEqualTo(expected[i][3]);
                assertThat(n.path("isNew").asBoolean()).isFalse();
            }
            assertThat(n.path("sampleSize").asInt()).isEqualTo(8);
            assertThat(n.path("insufficientData").asBoolean()).isFalse();
        }
    }

    @Test void cursorPagingFollowsTheRankingWithoutDuplicatesOrSkips() throws Exception {
        int y=YEARS.getAndIncrement();
        UUID viewer=user("PUBLIC",true),m=user("PUBLIC",true),hiddenFrom=user("PRIVATE",true);
        String day=y+"-09-09";
        int[] counts={3,1,3,2,5,1,2,1};
        for(int i=0;i<counts.length;i++) {
            UUID region=region(y+"R"+i);
            for(int k=0;k<counts[i];k++) feed(day,day,null,List.of(region),m);
        }
        UUID invisible=region(y+"Z");
        for(int k=0;k<9;k++) feed(day,day,null,List.of(invisible),hiddenFrom); // never visible: must not appear on any page
        List<String> all=new ArrayList<>();
        trends(viewer,day,day).forEach(n->all.add(n.path("region").path("code").asString()));
        assertThat(all).containsExactly(Arrays.stream(new int[]{4,0,2,3,6,1,5,7}).mapToObj(i->"TR"+y+"R"+i).toArray(String[]::new));
        for(int limit:List.of(1,3)) {
            List<String> seen=new ArrayList<>();
            List<Integer> ranks=new ArrayList<>();
            String cursor=null;
            boolean more;
            do {
                var request=get("/api/v1/trends/regions").with(authUser(viewer)).param("from",day).param("to",day).param("limit",Integer.toString(limit));
                if(cursor!=null) request.param("cursor",cursor);
                JsonNode page=json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
                more=page.path("page").path("hasNext").asBoolean();
                if(more) assertThat(page.path("data").size()).isEqualTo(limit);
                page.path("data").forEach(n->{ seen.add(n.path("region").path("code").asString()); ranks.add(n.path("rank").asInt()); });
                cursor=more?page.path("page").path("nextCursor").asString():null;
                if(!more) assertThat(page.path("page").path("nextCursor").isNull()).isTrue();
            } while(more);
            assertThat(seen).as("limit %d",limit).containsExactlyElementsOf(all);
            assertThat(ranks).containsExactly(1,2,2,4,4,6,6,6);
        }
    }

    @Test void inactiveOrPendingViewersSeeNothing() throws Exception {
        int y=YEARS.getAndIncrement();
        String day=y+"-02-02";
        UUID m=user("PUBLIC",true),region=region(y+"A"),deactivated=user("PUBLIC",true),pending=user("PUBLIC",false);
        jdbc.update("update users set status='DEACTIVATED',deactivated_at=now() where id=?",deactivated);
        feed(day,day,null,List.of(region),m);
        feed(day,day,null,List.of(region),m,deactivated,pending);
        assertThat(single(trends(user("PUBLIC",true),day,day)).path("publishedTripCount").asInt()).isEqualTo(2);
        assertThat(trends(deactivated,day,day)).isEmpty();
        assertThat(trends(pending,day,day)).isEmpty();
    }

    @Test void ownRouteIgnoresOwnHiddenListAndPublicFolloweeCountsAsFollowing() throws Exception {
        int y=YEARS.getAndIncrement();
        String day=y+"-04-04";
        UUID viewer=user("PRIVATE",true),priv=user("PRIVATE",true),pub=user("PUBLIC",true),region=region(y+"A");
        follow(viewer,pub,"ACCEPTED");
        UUID own=feed(day,day,null,List.of(region),viewer,priv);
        hide(own,viewer,viewer);
        feed(day,day,null,List.of(region),pub);
        JsonNode row=single(trends(viewer,day,day));
        assertThat(row.path("publishedTripCount").asInt()).isEqualTo(2);
        assertThat(row.path("followingCount").asInt()).isEqualTo(1);
    }

    @Test void previousWindowTiesShareARank() throws Exception {
        int y=YEARS.getAndIncrement();
        UUID viewer=user("PUBLIC",true),m=user("PUBLIC",true),r1=region(y+"A"),r2=region(y+"B"),r3=region(y+"C");
        String prev=y+"-08-01",cur=y+"-08-02";
        feed(prev,prev,null,List.of(r1,r2),m); feed(prev,prev,null,List.of(r1),m); feed(prev,prev,null,List.of(r2),m);
        feed(prev,prev,null,List.of(r3),m);
        for(int i=0;i<3;i++) feed(cur,cur,null,List.of(r3),m);
        feed(cur,cur,null,List.of(r1),m); feed(cur,cur,null,List.of(r2),m);
        JsonNode rows=trends(viewer,cur,cur);
        assertThat(rows.size()).isEqualTo(3);
        int[][] expected={{1,3,2},{2,1,-1},{2,1,-1}}; // rank, previousRank, rankChange for r3, r1, r2
        List<UUID> order=List.of(r3,r1,r2);
        for(int i=0;i<3;i++) {
            JsonNode n=rows.get(i);
            assertThat(n.path("region").path("id").asString()).isEqualTo(order.get(i).toString());
            assertThat(n.path("rank").asInt()).isEqualTo(expected[i][0]);
            assertThat(n.path("previousRank").asInt()).isEqualTo(expected[i][1]);
            assertThat(n.path("rankChange").asInt()).isEqualTo(expected[i][2]);
            assertThat(n.path("isNew").asBoolean()).isFalse();
        }
    }

    @Test void candidateFeedsAreFoundThroughTheTrendIndexes() {
        LocalDate from=LocalDate.of(2026,10,12),to=LocalDate.of(2026,11,10);
        long days=java.time.temporal.ChronoUnit.DAYS.between(from,to)+1;
        var params=TrendRepository.params(UUID.randomUUID(),from,to,from.minusDays(days),from.minusDays(1)).addValue("limit",21);
        UUID owner=user("PUBLIC",true);
        // 6000 old feeds (dated and undated) outside the window; inserted and analyzed inside a transaction that is rolled back
        String plan=tx.execute(status->{
            status.setRollbackOnly();
            jdbc.update("""
                    insert into trips(id,owner_user_id,title,start_date,end_date,created_at,updated_at)
                    select md5('trend-plan'||g)::uuid,?,'Trip',
                     case when g%3=0 then null else date '2000-01-01'+(g%7000) end,
                     case when g%3=0 then null else date '2000-01-01'+(g%7000)+3 end,now(),now()
                    from generate_series(1,6000) g""",owner);
            jdbc.update("""
                    insert into feeds(id,trip_id,title,body,published_at,snapshot_json,start_date,end_date)
                    select md5('trend-feed'||t.id)::uuid,t.id,'Trip','',timestamptz '2000-01-01'+(random()*7000)*interval '1 day','{}'::jsonb,t.start_date,t.end_date
                    from trips t where t.owner_user_id=?""",owner);
            jdbc.execute("analyze feeds");
            return String.join(System.lineSeparator(),named.queryForList("explain "+TrendRepository.sql(false),params,String.class));
        });
        assertThat(plan).as(plan).contains("idx_feeds_live_trend_dated","idx_feeds_live_trend_undated");
    }

    @Test void rejectsMissingReversedOrTooLongPeriodsAndBadPaging() throws Exception {
        UUID viewer=user("PUBLIC",true);
        String[][] bad={{null,"2026-01-01"},{"2026-01-01",null},{"2026-02-01","2026-01-31"},{"2025-01-01","2026-01-02"},{"2026-13-01","2026-12-31"},{"x","2026-01-01"},
                {"0001-01-01","0001-01-02"},{"1899-12-31","1900-01-02"},{"9999-12-31","+10000-01-01"}};
        for(String[] p:bad) {
            var request=get("/api/v1/trends/regions").with(authUser(viewer));
            if(p[0]!=null) request.param("from",p[0]);
            if(p[1]!=null) request.param("to",p[1]);
            mvc.perform(request).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        }
        // 366 days inclusive is the longest accepted window
        mvc.perform(get("/api/v1/trends/regions").with(authUser(viewer)).param("from","2024-01-01").param("to","2024-12-31")).andExpect(status().isOk());
        for(String limit:List.of("0","101"))
            mvc.perform(get("/api/v1/trends/regions").with(authUser(viewer)).param("from","2026-01-01").param("to","2026-01-31").param("limit",limit))
                    .andExpect(status().isBadRequest());
        for(String cursor:List.of("not-a-cursor","MHxhYmM"))
            mvc.perform(get("/api/v1/trends/regions").with(authUser(viewer)).param("from","2026-01-01").param("to","2026-01-31").param("cursor",cursor))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.fields[0].field").value("cursor"));
        mvc.perform(get("/api/v1/trends/regions").param("from","2026-01-01").param("to","2026-01-31")).andExpect(status().isUnauthorized());
    }

    @Test void documentsPathAndSchema() throws Exception {
        JsonNode docs=json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode op=docs.path("paths").path("/api/v1/trends/regions").path("get");
        assertThat(op.isMissingNode()).isFalse();
        assertThat(op.path("tags").get(0).asString()).isEqualTo("트렌드");
        List<String> params=new ArrayList<>();
        op.path("parameters").forEach(p->params.add(p.path("name").asString()));
        assertThat(params).contains("from","to","cursor","limit");
        JsonNode props=docs.path("components").path("schemas").path("TrendRegion").path("properties");
        for(String field:List.of("region","rank","previousRank","rankChange","isNew","publishedTripCount","followingCount","from","to","sampleSize","updatedAt","insufficientData"))
            assertThat(props.has(field)).as(field).isTrue();
    }

    private JsonNode trends(UUID viewer,String from,String to) throws Exception {
        String body=mvc.perform(get("/api/v1/trends/regions").with(authUser(viewer)).param("from",from).param("to",to).param("limit","100"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.hasNext").value(false)).andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("data");
    }
    private static JsonNode single(JsonNode rows) {
        assertThat(rows.size()).isEqualTo(1);
        return rows.get(0);
    }
    private UUID user(String visibility,boolean completed) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into users(id,nickname,profile_completed,account_visibility,created_at,updated_at) values(?,?,?,?,now(),now())",
                id,completed?"trend":"",completed,visibility);
        return id;
    }
    private void follow(UUID follower,UUID followee,String status) {
        jdbc.update("insert into follows(id,follower_user_id,followee_user_id,status,requested_at,accepted_at) values(?,?,?,?,now(),"+(status.equals("ACCEPTED")?"now()":"null")+")",
                UUID.randomUUID(),follower,followee,status);
    }
    private UUID region(String code) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into regions(id,code,name) values(?,?,'트렌드 지역')",id,"TR"+code);
        return id;
    }
    /** A live published feed of a new trip with the given ACTIVE members, snapshot dates and regions. */
    private UUID feed(String start,String end,String publishedAt,List<UUID> regions,UUID... members) {
        UUID trip=UUID.randomUUID(),feed=UUID.randomUUID();
        jdbc.update("insert into trips(id,owner_user_id,title,start_date,end_date,created_at,updated_at) values(?,?,'Trip',cast(? as date),cast(? as date),now(),now())",
                trip,members[0],start,end);
        for(int i=0;i<members.length;i++)
            jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,?,now())",UUID.randomUUID(),trip,members[i],i+1);
        jdbc.update("insert into feeds(id,trip_id,title,body,published_at,snapshot_json,start_date,end_date) values(?,?,'Trip','',"
                        +(publishedAt==null?"now()":"cast(? as timestamptz)")+",'{}'::jsonb,cast(? as date),cast(? as date))",
                publishedAt==null?new Object[]{feed,trip,start,end}:new Object[]{feed,trip,publishedAt,start,end});
        for(UUID region:regions) jdbc.update("insert into feed_regions(feed_id,region_id) values(?,?)",feed,region);
        return feed;
    }
    private void hide(UUID feed,UUID member,UUID viewer) {
        jdbc.update("insert into feed_visibilities(feed_id,user_id,hidden_viewer_user_ids,updated_at) values(?,?,jsonb_build_array(cast(? as text)),now())"
                + " on conflict(feed_id,user_id) do update set hidden_viewer_user_ids=feed_visibilities.hidden_viewer_user_ids||excluded.hidden_viewer_user_ids",
                feed,member,viewer.toString());
    }
}
