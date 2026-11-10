package com.eodilog.feed;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.InMemoryStorageConfiguration;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.web.servlet.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Every test moves the clock to its own far-future year, so feeds published by other tests (or other classes sharing the
 * database) fall outside the 30-day window and each test sees only its own candidates.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class,InMemoryStorageConfiguration.class,DiscoveryApiTest.ClockConfig.class})
class DiscoveryApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @Autowired MutableClock clock;
    @Autowired FeedService feedService;
    @Autowired NamedParameterJdbcTemplate named;
    @Autowired PlatformTransactionManager transactions;
    record Trip(UUID id,Map<UUID,UUID> members) { }
    record Item(String type,UUID id,String reason) { }

    static class MutableClock extends Clock {
        volatile Instant now=Instant.parse("2040-01-01T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return Clock.fixed(now,zone); }
        public Instant instant() { return now; }
    }
    @TestConfiguration(proxyBeanMethods=false)
    static class ClockConfig {
        @Bean @Primary MutableClock discoveryTestClock() { return new MutableClock(); }
    }

    @Test void permissionMatrixDecidesWhetherFeedAndItsPlacesAreRecommended() throws Exception {
        clock.now=Instant.parse("2041-05-10T03:00:00Z");
        for(String visibility:List.of("PUBLIC","PRIVATE")) for(String relation:List.of("ACCEPTED","REQUESTED","NONE")) for(boolean hidden:List.of(false,true)) {
            String label=visibility+"/"+relation+"/hidden="+hidden;
            UUID member=user(visibility),viewer=user("PUBLIC"),place=place();
            if(!relation.equals("NONE")) follow(viewer,member,relation);
            Trip trip=trip(member);
            visit(trip,member,place);
            UUID feed=publish(trip,member);
            if(hidden) hide(member,feed,viewer);
            boolean allowed=(visibility.equals("PUBLIC") || relation.equals("ACCEPTED")) && !hidden;
            List<Item> items=all(viewer,100);
            assertThat(items.stream().anyMatch(i->i.id().equals(feed))).as(label).isEqualTo(allowed);
            assertThat(items.stream().anyMatch(i->i.id().equals(place))).as(label).isEqualTo(allowed);
            // own feeds (trips the requester is an ACTIVE member of) are never recommended
            List<Item> own=all(member,100);
            assertThat(own).as(label).noneMatch(i->i.id().equals(feed) || i.id().equals(place));
        }
    }

    @Test void feedHiddenByOneMemberIsStillRecommendedThroughAnotherOpenRoute() throws Exception {
        clock.now=Instant.parse("2043-02-10T03:00:00Z");
        UUID a=user("PUBLIC"),b=user("PRIVATE"),viewer=user("PUBLIC"),coMember=user("PUBLIC");
        Trip trip=trip(a,b,coMember);
        UUID feed=publish(trip,a);
        hide(a,feed,viewer);
        hide(coMember,feed,viewer);
        assertThat(ids(all(viewer,100))).isEmpty();
        follow(viewer,b,"ACCEPTED");
        assertThat(ids(all(viewer,100))).containsExactly(feed);
        hide(b,feed,viewer);
        assertThat(ids(all(viewer,100))).isEmpty();
        // a member who left is no longer a route and the requester's own former trip is recommended again
        UUID other=user("PUBLIC");
        Trip second=trip(other,viewer);
        UUID secondFeed=publish(second,other);
        assertThat(ids(all(viewer,100))).doesNotContain(secondFeed);
        jdbc.update("update trip_members set status='LEFT',left_at=now() where trip_id=? and user_id=?",second.id(),viewer);
        assertThat(ids(all(viewer,100))).containsExactly(secondFeed);
        // a deactivated member is no longer a route
        jdbc.update("update users set status='DEACTIVATED' where id=?",other);
        assertThat(ids(all(viewer,100))).isEmpty();
    }

    @Test void windowIsThirtySeoulCalendarDaysIncludingTodayUpToNow() throws Exception {
        Instant now=Instant.parse("2045-03-31T00:30:00Z"); // 09:30 KST on 03-31, so the window starts 03-02 00:00 KST
        Instant start=Instant.parse("2045-03-01T15:00:00Z");
        UUID member=user("PUBLIC"),viewer=user("PUBLIC");
        clock.now=start; UUID first=publish(trip(member),member);
        clock.now=start.minusNanos(1000); UUID before=publish(trip(member),member);
        clock.now=now; UUID latest=publish(trip(member),member);
        clock.now=now.plusSeconds(1); UUID future=publish(trip(member),member);
        clock.now=now;
        assertThat(ids(all(viewer,100))).containsExactly(latest,first).doesNotContain(before,future);
        // a UTC-day window would have started at 03-02T00:00Z and dropped the first feed
        clock.now=now.plus(Duration.ofDays(1));
        assertThat(ids(all(viewer,100))).containsExactly(future,latest);
    }

    @Test void feedsRankByLikesThenPublishedAtThenIdWithLikeReasons() throws Exception {
        Instant base=Instant.parse("2047-07-01T00:00:00Z");
        UUID member=user("PUBLIC"),viewer=user("PUBLIC");
        clock.now=base; UUID oldest=publish(trip(member),member);
        clock.now=base.plusSeconds(10); UUID one=publish(trip(member),member);
        clock.now=base.plusSeconds(20); UUID oneLater=publish(trip(member),member);
        clock.now=base.plusSeconds(30); UUID three=publish(trip(member),member);
        clock.now=base.plusSeconds(40); UUID tieA=publish(trip(member),member); UUID tieB=publish(trip(member),member);
        like(three,3); like(one,1); like(oneLater,1);
        likeAs(three,viewer);
        clock.now=base.plusSeconds(60);
        List<Item> items=all(viewer,100);
        UUID hi=UUID.fromString(jdbc.queryForObject("select id::text from feeds where id in (?,?) order by id desc limit 1",String.class,tieA,tieB));
        assertThat(ids(items)).containsExactly(three,oneLater,one,hi,hi.equals(tieA)?tieB:tieA,oldest);
        assertThat(items.get(0).reason()).isEqualTo("좋아요 4개");
        assertThat(items.get(1).reason()).isEqualTo("좋아요 1개");
        assertThat(items.get(5).reason()).isEqualTo("최근 30일 새 여행");
        JsonNode card=read(viewer,null,1).path("data").get(0);
        assertThat(card.path("type").asString()).isEqualTo("FEED");
        assertThat(card.path("place").isNull()).isTrue();
        assertThat(card.path("feed").path("id").asString()).isEqualTo(three.toString());
        assertThat(card.path("feed").path("likeCount").asLong()).isEqualTo(4);
        assertThat(card.path("feed").path("likedByMe").asBoolean()).isTrue();
        assertThat(card.path("feed").has("regions")).isTrue();
    }

    @Test void placesRankByAllowedFeedFrequencyAndInterleaveWithFeeds() throws Exception {
        clock.now=Instant.parse("2049-09-01T00:00:00Z");
        UUID member=user("PUBLIC"),stranger=user("PRIVATE"),viewer=user("PUBLIC");
        UUID p1=place(),p2=place(),p3=place(),p4=place(),secret=place();
        List<UUID> feeds=new ArrayList<>();
        for(List<UUID> places:List.of(List.of(p1,p2,p3),List.of(p1,p2,p4),List.of(p1))) {
            Trip t=trip(member);
            for(UUID p:places) visit(t,member,p);
            clock.now=clock.now.plusSeconds(1);
            feeds.add(publish(t,member));
        }
        // disallowed feeds (private stranger, hidden, deleted) must not raise counts or leak places
        for(int i=0;i<3;i++) { Trip t=trip(stranger); visit(t,stranger,p4); visit(t,stranger,secret); publish(t,stranger); }
        Trip hiddenTrip=trip(member); visit(hiddenTrip,member,p3); visit(hiddenTrip,member,secret);
        hide(member,publish(hiddenTrip,member),viewer);
        Trip deletedTrip=trip(member); visit(deletedTrip,member,p4); visit(deletedTrip,member,secret);
        UUID deleted=publish(deletedTrip,member);
        jdbc.update("update feeds set deleted_at=now() where id=?",deleted);
        Trip goneTrip=trip(member); visit(goneTrip,member,p4); visit(goneTrip,member,secret);
        publish(goneTrip,member);
        jdbc.update("update trips set deleted_at=now() where id=?",goneTrip.id());
        like(feeds.get(0),2);
        List<Item> items=all(viewer,100);
        UUID tieHigh=UUID.fromString(jdbc.queryForObject("select id::text from places where id in (?,?) order by id desc limit 1",String.class,p3,p4));
        UUID tieLow=tieHigh.equals(p3)?p4:p3;
        assertThat(items).extracting(Item::type).containsExactly("FEED","PLACE","FEED","PLACE","FEED","PLACE","PLACE");
        assertThat(ids(items)).containsExactly(feeds.get(0),p1,feeds.get(2),p2,feeds.get(1),tieHigh,tieLow);
        assertThat(ids(items)).doesNotContain(secret,deleted);
        assertThat(items.get(1).reason()).isEqualTo("최근 30일 여행 3개에 등장");
        assertThat(items.get(3).reason()).isEqualTo("최근 30일 여행 2개에 등장");
        assertThat(items.get(5).reason()).isEqualTo("최근 30일 여행 1개에 등장");
        assertThat(items.get(6).reason()).isEqualTo("최근 30일 여행 1개에 등장");
        JsonNode place=read(viewer,null,2).path("data").get(1);
        assertThat(place.path("feed").isNull()).isTrue();
        assertThat(place.path("place").path("id").asString()).isEqualTo(p1.toString());
        assertThat(place.path("place").path("name").asString()).isEqualTo("Place");
    }

    @Test void pagesWithoutDuplicatesOrSkips() throws Exception {
        clock.now=Instant.parse("2051-04-01T00:00:00Z");
        UUID friend=user("PRIVATE"),stranger=user("PRIVATE"),viewer=user("PUBLIC");
        follow(viewer,friend,"ACCEPTED");
        for(int i=0;i<8;i++) {
            UUID author=i%3==2?stranger:friend;
            Trip t=trip(author);
            visit(t,author,place());
            if(i%2==0) visit(t,author,place());
            clock.now=clock.now.plusSeconds(i/2); // pairs share publication time
            UUID feed=publish(t,author);
            like(feed,i%3);
        }
        List<Item> expected=all(viewer,100);
        assertThat(expected).hasSize(6+9); // six friend feeds, nine of their places
        for(int size:List.of(1,2,3,5)) {
            List<Item> seen=new ArrayList<>();
            String cursor=null;
            boolean more;
            do {
                JsonNode page=read(viewer,cursor,size);
                more=page.path("page").path("hasNext").asBoolean();
                if(more) assertThat(page.path("data").size()).isEqualTo(size);
                seen.addAll(items(page.path("data")));
                cursor=more?page.path("page").path("nextCursor").asString():null;
            } while(more);
            assertThat(seen).as("size "+size).isEqualTo(expected);
        }
    }

    @Test void likeCountFollowsActualLikeRowsIncludingRepeatsAndConcurrentRequests() throws Exception {
        clock.now=Instant.parse("2057-01-10T00:00:00Z");
        UUID member=user("PUBLIC"),a=user("PUBLIC"),b=user("PUBLIC");
        UUID feed=publish(trip(member),member);
        assertThat(likeCount(feed)).isZero();
        likeAs(feed,a); likeAs(feed,a);
        assertThat(likeCount(feed)).isEqualTo(1);
        likeAs(feed,b);
        assertThat(likeCount(feed)).isEqualTo(2);
        unlike(feed,a); unlike(feed,a); unlike(feed,user("PUBLIC"));
        assertThat(likeCount(feed)).isEqualTo(1).isEqualTo(likeRows(feed));
        // never below zero even if the counter was already off
        jdbc.update("update feeds set like_count=0 where id=?",feed);
        unlike(feed,b);
        assertThat(likeCount(feed)).isZero();
        assertThat(likeRows(feed)).isZero();
        // concurrent likes by distinct users, each user twice at once, then concurrent unlikes
        List<UUID> users=new ArrayList<>();
        for(int i=0;i<8;i++) users.add(user("PUBLIC"));
        concurrently(users,u->feedService.like(u,feed));
        assertThat(likeRows(feed)).isEqualTo(8);
        assertThat(likeCount(feed)).isEqualTo(8);
        concurrently(users,u->feedService.unlike(u,feed));
        assertThat(likeRows(feed)).isZero();
        assertThat(likeCount(feed)).isZero();
    }

    @Test void migrationBackfillCountsExistingLikeRows() throws Exception {
        clock.now=Instant.parse("2059-01-10T00:00:00Z");
        UUID member=user("PUBLIC");
        UUID liked=publish(trip(member),member),plain=publish(trip(member),member);
        like(liked,3);
        jdbc.update("update feeds set like_count=0 where id in (?,?)",liked,plain);
        String migration=new ClassPathResource("db/migration/V202611110000__add_feeds_like_count.sql").getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        String backfill=Arrays.stream(migration.split(";")).map(x->x.lines().filter(l->!l.startsWith("--")).reduce("",(x1,x2)->x1+"\n"+x2).strip())
                .filter(x->x.startsWith("UPDATE feeds")).findFirst().orElseThrow();
        jdbc.update(backfill);
        assertThat(likeCount(liked)).isEqualTo(3);
        assertThat(likeCount(plain)).isZero();
    }

    @Test void scrollKeepsTheFirstPageWindowAcrossADayChange() throws Exception {
        Instant now=Instant.parse("2053-06-30T03:00:00Z"); // 12:00 KST, window from 06-01 00:00 KST
        UUID member=user("PUBLIC"),viewer=user("PUBLIC");
        for(int days:List.of(29,29,20,10,1,0)) {
            clock.now=now.minus(Duration.ofDays(days));
            Trip t=trip(member);
            visit(t,member,place());
            publish(t,member);
        }
        clock.now=now;
        List<Item> expected=all(viewer,100);
        assertThat(expected).hasSize(12);
        JsonNode first=read(viewer,null,3);
        List<Item> seen=new ArrayList<>(items(first.path("data")));
        String cursor=first.path("page").path("nextCursor").asString();
        clock.now=now.plus(Duration.ofDays(2)); // the 29-day-old feeds and their places would now fall out
        assertThat(all(viewer,100)).hasSize(8);
        boolean more=true;
        while(more) {
            JsonNode page=read(viewer,cursor,3);
            seen.addAll(items(page.path("data")));
            more=page.path("page").path("hasNext").asBoolean();
            cursor=more?page.path("page").path("nextCursor").asString():null;
        }
        assertThat(seen).isEqualTo(expected);
    }

    @Test void feedPageWalksTheDiscoveryIndexAndPlacesUseThePublishedWindowIndex() {
        Instant now=Instant.parse("2055-06-30T00:00:00Z");
        var tx=new TransactionTemplate(transactions);
        List<List<String>> plans=tx.execute(status->{
            seed(now);
            var params=new MapSqlParameterSource("viewer",UUID.nameUUIDFromBytes("dseed-viewer".getBytes()))
                    .addValue("since",java.sql.Timestamp.from(now.minus(Duration.ofDays(30)))).addValue("now",java.sql.Timestamp.from(now))
                    .addValue("limit",21).addValue("likes",30L).addValue("at",java.sql.Timestamp.from(now.minus(Duration.ofDays(3))))
                    .addValue("id",UUID.randomUUID()).addValue("count",5L);
            var result=List.of(named.queryForList("explain "+DiscoveryRepository.feedSql(false),params,String.class),
                    named.queryForList("explain "+DiscoveryRepository.feedSql(true),params,String.class),
                    named.queryForList("explain "+DiscoveryRepository.placeSql(true),params,String.class));
            status.setRollbackOnly();
            return result;
        });
        for(int i=0;i<2;i++) {
            String plan=String.join("\n",plans.get(i));
            assertThat(plan).as(plan).contains("idx_feeds_discovery").contains("Limit").doesNotContain("Sort")
                    .doesNotContain("Seq Scan on feeds","Seq Scan on trips","Seq Scan on trip_members","Seq Scan on users");
        }
        String places=String.join("\n",plans.get(2));
        assertThat(places).as(places).contains("idx_feeds_published","trips_pkey","feed_places_pkey","places_pkey")
                .doesNotContain("Seq Scan on feeds","Seq Scan on trips","Seq Scan on trip_members","Seq Scan on feed_places","Seq Scan on places","Seq Scan on users");
    }

    @Test void rejectsBadInputAndDocumentsThePath() throws Exception {
        UUID viewer=user("PUBLIC");
        mvc.perform(get("/api/v1/me/discovery-recommendations").with(authUser(viewer)).param("limit","0")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/me/discovery-recommendations").with(authUser(viewer)).param("limit","101")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/me/discovery-recommendations").with(authUser(viewer)).param("cursor","bad")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/me/discovery-recommendations")).andExpect(status().isUnauthorized());
        var docs=json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(docs.path("paths").path("/api/v1/me/discovery-recommendations").has("get")).isTrue();
        for(String field:List.of("type","feed","place","reason"))
            assertThat(docs.path("components").path("schemas").path("DiscoveryItem").path("properties").has(field)).as(field).isTrue();
    }

    private List<Item> all(UUID viewer,int limit) throws Exception {
        JsonNode page=read(viewer,null,limit);
        assertThat(page.path("page").path("hasNext").asBoolean()).isFalse();
        return items(page.path("data"));
    }
    private JsonNode read(UUID viewer,String cursor,int limit) throws Exception {
        var request=get("/api/v1/me/discovery-recommendations").with(authUser(viewer)).param("limit",Integer.toString(limit));
        if(cursor!=null) request.param("cursor",cursor);
        return json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    private static List<Item> items(JsonNode array) {
        List<Item> items=new ArrayList<>();
        array.forEach(n->{
            String type=n.path("type").asString();
            JsonNode body=type.equals("FEED")?n.path("feed"):n.path("place");
            items.add(new Item(type,UUID.fromString(body.path("id").asString()),n.path("reason").asString()));
        });
        return items;
    }
    private static List<UUID> ids(List<Item> items) { return items.stream().map(Item::id).toList(); }
    private void like(UUID feed,int count) throws Exception {
        for(int i=0;i<count;i++) likeAs(feed,user("PUBLIC"));
    }
    private void likeAs(UUID feed,UUID user) throws Exception {
        mvc.perform(put("/api/v1/feeds/{id}/like",feed).with(authUser(user))).andExpect(status().isOk());
    }
    private long likeCount(UUID feed) { return jdbc.queryForObject("select like_count from feeds where id=?",Long.class,feed); }
    private long likeRows(UUID feed) { return jdbc.queryForObject("select count(*) from feed_likes where feed_id=?",Long.class,feed); }
    private void unlike(UUID feed,UUID user) throws Exception {
        mvc.perform(delete("/api/v1/feeds/{id}/like",feed).with(authUser(user))).andExpect(status().isNoContent());
    }
    /** Runs the action for every user twice, all released at once. */
    private void concurrently(List<UUID> users,java.util.function.Consumer<UUID> action) throws Exception {
        CountDownLatch start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(users.size()*2)) {
            List<Future<?>> futures=new ArrayList<>();
            for(UUID u:users) for(int i=0;i<2;i++) futures.add(pool.submit(()->{ start.await(); action.accept(u); return null; }));
            start.countDown();
            for(var f:futures) f.get(30,TimeUnit.SECONDS);
        }
    }
    /** 20,000 PUBLIC members with one feed each, 2% inside the 30-day window, three places each; statistics refreshed. */
    private void seed(Instant now) {
        var p=new MapSqlParameterSource("now",java.sql.Timestamp.from(now)).addValue("old",java.sql.Timestamp.from(now.minus(Duration.ofDays(400))));
        named.update("insert into users(id,nickname,profile_completed,account_visibility,created_at,updated_at) select md5('dseed-u'||g)::uuid,'seed',true,'PUBLIC',now(),now() from generate_series(1,20000) g",p);
        jdbc.update("insert into users(id,nickname,profile_completed,account_visibility,created_at,updated_at) values(?,'seed',true,'PUBLIC',now(),now())",UUID.nameUUIDFromBytes("dseed-viewer".getBytes()));
        named.update("insert into trips(id,owner_user_id,title,created_at,updated_at) select md5('dseed-t'||g)::uuid,md5('dseed-u'||g)::uuid,'Seed',now(),now() from generate_series(1,20000) g",p);
        named.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) select md5('dseed-m'||g)::uuid,md5('dseed-t'||g)::uuid,md5('dseed-u'||g)::uuid,1,now() from generate_series(1,20000) g",p);
        named.update("""
                insert into feeds(id,trip_id,title,body,published_at,snapshot_json,like_count)
                select md5('dseed-f'||g)::uuid,md5('dseed-t'||g)::uuid,'Seed','',
                 case when g%50=0 then cast(:now as timestamptz)-(g%600)*interval '1 hour' else cast(:old as timestamptz)-g*interval '1 minute' end,'{}'::jsonb,g%37
                from generate_series(1,20000) g
                """,p);
        named.update("insert into regions(id,code,name) values(md5('dseed-r')::uuid,'DSEED','seed')",p);
        named.update("insert into places(id,region_id,name,latitude,longitude,source,created_at,updated_at) select md5('dseed-p'||g)::uuid,md5('dseed-r')::uuid,'P',37,127,'MANUAL',now(),now() from generate_series(1,500) g",p);
        named.update("insert into feed_places(feed_id,place_id) select md5('dseed-f'||g)::uuid,md5('dseed-p'||((g*k)%500+1))::uuid from generate_series(1,20000) g,generate_series(1,3) k on conflict do nothing",p);
        for(String table:List.of("users","trips","trip_members","feeds","feed_places","places","follows","feed_visibilities")) jdbc.execute("analyze "+table);
    }
    private UUID user(String visibility) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into users(id,nickname,profile_completed,account_visibility,created_at,updated_at) values(?,'discovery',true,?,now(),now())",id,visibility);
        return id;
    }
    private void follow(UUID follower,UUID followee,String status) {
        jdbc.update("insert into follows(id,follower_user_id,followee_user_id,status,requested_at,accepted_at) values(?,?,?,?,now(),"+(status.equals("ACCEPTED")?"now()":"null")+")",
                UUID.randomUUID(),follower,followee,status);
    }
    private UUID place() {
        UUID region=UUID.randomUUID();
        jdbc.update("insert into regions(id,code,name) values(?,?,'테스트 지역')",region,"D"+java.util.concurrent.ThreadLocalRandom.current().nextLong(1_000_000_000_000L));
        UUID id=UUID.randomUUID();
        jdbc.update("insert into places(id,region_id,name,latitude,longitude,source,created_at,updated_at) values(?,?,'Place',37,127,'MANUAL',now(),now())",id,region);
        return id;
    }
    private void visit(Trip trip,UUID user,UUID place) {
        jdbc.update("insert into visits(id,trip_id,member_id,place_id,visited_at,created_at) values(?,?,?,?,now(),now())",UUID.randomUUID(),trip.id(),trip.members().get(user),place);
    }
    private Trip trip(UUID... users) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into trips(id,owner_user_id,title,created_at,updated_at) values(?,?,'Trip',now(),now())",id,users[0]);
        Map<UUID,UUID> members=new LinkedHashMap<>();
        for(int i=0;i<users.length;i++) {
            UUID member=UUID.randomUUID();
            jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,?,now())",member,id,users[i],i+1);
            members.put(users[i],member);
        }
        jdbc.update("insert into itineraries(id,trip_id,updated_by_member_id,updated_at) values(?,?,?,now())",UUID.randomUUID(),id,members.get(users[0]));
        return new Trip(id,members);
    }
    private UUID publish(Trip trip,UUID who) throws Exception {
        var body=mvc.perform(post("/api/v1/trips/{id}/feed",trip.id()).with(authUser(who)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Trip\",\"body\":\"\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(body).path("data").path("id").asString());
    }
    private void hide(UUID member,UUID feed,UUID viewer) throws Exception {
        long version=jdbc.queryForList("select version from feed_visibilities where feed_id=? and user_id=?",Long.class,feed,member).stream().findFirst().orElse(1L);
        List<UUID> hidden=new ArrayList<>();
        jdbc.queryForList("select jsonb_array_elements_text(hidden_viewer_user_ids) from feed_visibilities where feed_id=? and user_id=?",String.class,feed,member).forEach(s->hidden.add(UUID.fromString(s)));
        hidden.add(viewer);
        mvc.perform(put("/api/v1/feeds/{id}/visibility/me",feed).with(authUser(member)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("expectedVersion",version,"hiddenViewerUserIds",hidden)))).andExpect(status().isOk());
    }
}
