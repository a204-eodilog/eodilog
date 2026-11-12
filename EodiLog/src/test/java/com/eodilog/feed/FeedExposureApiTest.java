package com.eodilog.feed;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.InMemoryStorageConfiguration;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class,InMemoryStorageConfiguration.class})
class FeedExposureApiTest {
    static final String KOREA="124,33,132,39";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    record Trip(UUID id,Map<UUID,UUID> members) { }

    @Test void memberRouteMatrixAppliesAccountRelationAndHidingWhileDirectLinkStaysOpen() throws Exception {
        for(String visibility:List.of("PUBLIC","PRIVATE")) for(String relation:List.of("ACCEPTED","REQUESTED","NONE")) for(boolean hidden:List.of(false,true)) {
            String label=visibility+"/"+relation+"/hidden="+hidden;
            UUID member=user(visibility),viewer=user("PUBLIC"),region=region(null,null);
            if(!relation.equals("NONE")) follow(viewer,member,relation);
            Trip trip=trip(region,null,null,member);
            UUID feed=publish(trip,member);
            if(hidden) hide(member,feed,viewer);
            boolean profile=(visibility.equals("PUBLIC") || relation.equals("ACCEPTED")) && !hidden;
            boolean home=relation.equals("ACCEPTED") && !hidden;
            assertThat(ids(data(req("/api/v1/users/{id}/feeds",viewer,member)))).as(label).isEqualTo(profile?List.of(feed):List.of());
            assertThat(markerFeeds(data(req("/api/v1/users/{id}/feed-map?bbox="+KOREA,viewer,member)))).as(label).isEqualTo(profile?List.of(feed):List.of());
            assertThat(data(req("/api/v1/users/{id}/timeline",viewer,member)).size()).as(label).isEqualTo(profile?1:0);
            assertThat(markerFeeds(data(req("/api/v1/home/map?bbox="+KOREA,viewer)))).as(label).isEqualTo(home?List.of(feed):List.of());
            assertThat(ids(data(req("/api/v1/home/regions/{id}/feeds",viewer,region)))).as(label).isEqualTo(home?List.of(feed):List.of());
            mvc.perform(get("/api/v1/feeds/{id}",feed).with(authUser(viewer))).andExpect(status().isOk());
            mvc.perform(get("/api/v1/feeds/{id}/summary",feed).with(authUser(viewer))).andExpect(status().isOk());
            JsonNode preview=data(req("/api/v1/feeds/{id}/preview?viewerId="+viewer+"&viaMemberUserId="+member,member,feed));
            assertThat(preview.path("visible").asBoolean()).as(label).isEqualTo(profile);
            assertThat(preview.path("feed").isNull()).as(label).isEqualTo(!profile);
        }
    }

    @Test void feedHiddenOnOneMemberRouteStillAppearsThroughAnotherAllowedMember() throws Exception {
        UUID a=user("PUBLIC"),b=user("PUBLIC"),viewer=user("PUBLIC"),region=region(null,null);
        follow(viewer,a,"ACCEPTED"); follow(viewer,b,"ACCEPTED");
        Trip trip=trip(region,null,null,a,b);
        UUID feed=publish(trip,a);
        hide(a,feed,viewer);
        JsonNode marker=single(data(req("/api/v1/home/map?bbox="+KOREA,viewer)));
        assertThat(texts(marker.path("feedIds"))).containsExactly(feed.toString());
        assertThat(texts(marker.path("visibleMemberUserIds"))).containsExactly(b.toString());
        assertThat(marker.path("region").path("id").asString()).isEqualTo(region.toString());
        assertThat(ids(data(req("/api/v1/home/regions/{id}/feeds",viewer,region)))).containsExactly(feed);
        assertThat(ids(data(req("/api/v1/users/{id}/feeds",viewer,a)))).isEmpty();
        assertThat(ids(data(req("/api/v1/users/{id}/feeds",viewer,b)))).containsExactly(feed);
        assertThat(data(req("/api/v1/feeds/{id}/preview?viewerId="+viewer+"&viaMemberUserId="+a,a,feed)).path("visible").asBoolean()).isFalse();
        assertThat(data(req("/api/v1/feeds/{id}/preview?viewerId="+viewer+"&viaMemberUserId="+b,b,feed)).path("feed").path("id").asString()).isEqualTo(feed.toString());
        // a co-member cannot probe another member's route (hidden lists are owner-only)
        for(UUID[] pair:List.of(new UUID[]{b,a},new UUID[]{a,b}))
            mvc.perform(get("/api/v1/feeds/{id}/preview",feed).with(authUser(pair[0])).param("viewerId",viewer.toString()).param("viaMemberUserId",pair[1].toString()))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FEED_NOT_FOUND"));
        hide(b,feed,viewer);
        assertThat(data(req("/api/v1/home/map?bbox="+KOREA,viewer)).path("markers")).isEmpty();
        mvc.perform(get("/api/v1/feeds/{id}",feed).with(authUser(viewer))).andExpect(status().isOk());
        // self route ignores own hidden list
        hide(a,feed,a);
        assertThat(ids(data(req("/api/v1/users/{id}/feeds",a,a)))).containsExactly(feed);
    }

    @Test void leftMemberIsNoLongerARouteAndPreviewRequiresActiveMembership() throws Exception {
        UUID a=user("PUBLIC"),b=user("PUBLIC"),viewer=user("PUBLIC"),outsider=user("PUBLIC"),region=region(null,null);
        follow(viewer,b,"ACCEPTED");
        Trip trip=trip(region,null,null,a,b);
        UUID feed=publish(trip,a);
        assertThat(markerFeeds(data(req("/api/v1/home/map?bbox="+KOREA,viewer)))).containsExactly(feed);
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?",trip.members().get(b));
        assertThat(data(req("/api/v1/home/map?bbox="+KOREA,viewer)).path("markers")).isEmpty();
        assertThat(ids(data(req("/api/v1/users/{id}/feeds",viewer,b)))).isEmpty();
        mvc.perform(get("/api/v1/feeds/{id}/preview",feed).with(authUser(b)).param("viewerId",viewer.toString()).param("viaMemberUserId",b.toString()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FEED_NOT_FOUND"));
        mvc.perform(get("/api/v1/feeds/{id}/preview",feed).with(authUser(b)).param("viewerId",viewer.toString()).param("viaMemberUserId",a.toString()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FEED_NOT_FOUND"));
        mvc.perform(get("/api/v1/feeds/{id}/preview",feed).with(authUser(outsider)).param("viewerId",viewer.toString()).param("viaMemberUserId",a.toString()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/feeds/{id}/preview",feed).with(authUser(a)).param("viewerId",viewer.toString())).andExpect(status().isBadRequest());
    }

    @Test void unknownUsersAre404AndPrivateWithoutAcceptanceIsEmpty() throws Exception {
        UUID viewer=user("PUBLIC"),hidden=user("PRIVATE"),pending=UUID.randomUUID();
        jdbc.update("insert into users(id,nickname,profile_completed,created_at,updated_at) values(?,'',false,now(),now())",pending);
        publish(trip(region(null,null),null,null,hidden),hidden);
        for(UUID missing:List.of(UUID.randomUUID(),pending)) {
            mvc.perform(get("/api/v1/users/{id}/feeds",missing).with(authUser(viewer))).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("USER_NOT_FOUND"));
            mvc.perform(get("/api/v1/users/{id}/feed-map",missing).with(authUser(viewer)).param("bbox",KOREA)).andExpect(status().isNotFound());
            mvc.perform(get("/api/v1/users/{id}/timeline",missing).with(authUser(viewer))).andExpect(status().isNotFound());
            mvc.perform(get("/api/v1/me/travel-map").with(authUser(viewer)).param("bbox",KOREA).param("viewerId",missing.toString())).andExpect(status().isNotFound());
        }
        assertThat(data(req("/api/v1/users/{id}/feeds",viewer,hidden))).isEmpty();
        assertThat(data(req("/api/v1/users/{id}/timeline",viewer,hidden))).isEmpty();
        assertThat(data(req("/api/v1/users/{id}/feed-map?bbox="+KOREA,viewer,hidden)).path("markers")).isEmpty();
        for(String bbox:List.of("1,2,3","132,33,124,39","124,33,124,39","a,b,c,d","-181,0,0,1"))
            mvc.perform(get("/api/v1/home/map").with(authUser(viewer)).param("bbox",bbox)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/home/map").with(authUser(viewer))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/home/map").with(authUser(viewer)).param("bbox",KOREA).param("from","2026-02-01").param("to","2026-01-01")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/home/map").param("bbox",KOREA)).andExpect(status().isUnauthorized());
    }

    @Test void deletedFeedDisappearsEverywhereAndOldIdIs404() throws Exception {
        UUID member=user("PUBLIC"),viewer=user("PUBLIC"),region=region(null,null);
        follow(viewer,member,"ACCEPTED");
        Trip trip=trip(region,null,null,member);
        UUID feed=publish(trip,member);
        mvc.perform(delete("/api/v1/feeds/{id}",feed).with(authUser(member)).param("expectedVersion","1")).andExpect(status().isNoContent());
        assertThat(data(req("/api/v1/home/map?bbox="+KOREA,viewer)).path("markers")).isEmpty();
        assertThat(data(req("/api/v1/home/regions/{id}/feeds",viewer,region))).isEmpty();
        assertThat(data(req("/api/v1/users/{id}/feeds",viewer,member))).isEmpty();
        assertThat(data(req("/api/v1/users/{id}/timeline",viewer,member))).isEmpty();
        JsonNode own=data(req("/api/v1/me/travel-map?bbox="+KOREA,member));
        assertThat(texts(single(own).path("tripIds"))).containsExactly(trip.id().toString());
        assertThat(single(own).path("feedIds")).isEmpty();
        for(String path:List.of("/api/v1/feeds/{id}","/api/v1/feeds/{id}/summary"))
            mvc.perform(get(path,feed).with(authUser(viewer))).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FEED_NOT_FOUND"));
        mvc.perform(get("/api/v1/feeds/{id}/preview",feed).with(authUser(member)).param("viewerId",viewer.toString()).param("viaMemberUserId",member.toString())).andExpect(status().isNotFound());
        mvc.perform(put("/api/v1/feeds/{id}/like",feed).with(authUser(viewer))).andExpect(status().isNotFound());
        UUID fresh=publish(trip,member);
        assertThat(markerFeeds(data(req("/api/v1/home/map?bbox="+KOREA,viewer)))).containsExactly(fresh);
        jdbc.update("update trips set deleted_at=now() where id=?",trip.id());
        assertThat(data(req("/api/v1/home/map?bbox="+KOREA,viewer)).path("markers")).isEmpty();
        assertThat(data(req("/api/v1/users/{id}/feeds",viewer,member))).isEmpty();
    }

    @Test void pagingHappensAfterFilteringWithoutDuplicatesOrLeaks() throws Exception {
        UUID member=user("PUBLIC"),viewer=user("PUBLIC"),region=region(null,null);
        follow(viewer,member,"ACCEPTED");
        List<UUID> visible=new ArrayList<>();
        UUID hiddenFeed=null;
        String[][] dates={{"2026-03-01","2026-03-02"},{null,null},{"2026-05-01","2026-05-03"},{"2026-01-01","2026-01-01"},{"2026-04-01","2026-04-02"}};
        for(int i=0;i<dates.length;i++) {
            Trip trip=trip(region,dates[i][0],dates[i][1],member);
            UUID feed=publish(trip,member);
            if(i==2) { hide(member,feed,viewer); hiddenFeed=feed; } else visible.add(feed);
        }
        for(String path:List.of("/api/v1/users/"+member+"/feeds","/api/v1/home/regions/"+region+"/feeds")) {
            List<UUID> seen=new ArrayList<>();
            String cursor=null;
            do {
                var request=get(path).with(authUser(viewer)).param("limit","2");
                if(cursor!=null) request.param("cursor",cursor);
                JsonNode page=json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
                assertThat(page.path("data").size()).isLessThanOrEqualTo(2).isPositive();
                seen.addAll(ids(page.path("data")));
                cursor=page.path("page").path("hasNext").asBoolean()?page.path("page").path("nextCursor").asString():null;
            } while(cursor!=null);
            assertThat(seen).as(path).doesNotHaveDuplicates().containsExactlyInAnyOrderElementsOf(visible).doesNotContain(hiddenFeed);
            List<UUID> reversed=new ArrayList<>(visible); Collections.reverse(reversed);
            assertThat(seen).as(path).containsExactlyElementsOf(reversed);
        }
        List<String> timeline=new ArrayList<>();
        String cursor=null;
        do {
            var request=get("/api/v1/users/{id}/timeline",member).with(authUser(viewer)).param("limit","1");
            if(cursor!=null) request.param("cursor",cursor);
            JsonNode page=json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
            timeline.add(page.path("data").get(0).path("date").isNull()?"UNKNOWN":page.path("data").get(0).path("date").asString());
            assertThat(page.path("data").get(0).path("feedId").asString()).isNotEqualTo(hiddenFeed.toString());
            cursor=page.path("page").path("hasNext").asBoolean()?page.path("page").path("nextCursor").asString():null;
        } while(cursor!=null);
        assertThat(timeline).containsExactly("2026-04-01","2026-03-01","2026-01-01","UNKNOWN");
        JsonNode filtered=data(req("/api/v1/home/map?bbox="+KOREA+"&from=2026-03-02&to=2026-05-31",viewer));
        assertThat(single(filtered).path("feedIds").size()).isEqualTo(2);
        assertThat(filtered.path("criteria").path("from").asString()).isEqualTo("2026-03-02");
        assertThat(filtered.path("criteria").path("regionGrouping").asString()).isEqualTo("FEED_REGION");
        assertThat(single(data(req("/api/v1/home/map?bbox="+KOREA,viewer))).path("feedIds").size()).isEqualTo(4);
    }

    @Test void keysetPagingAcrossManyMembersAndFeedsReturnsFullPagesWithoutDuplicatesOrSkips() throws Exception {
        UUID viewer=user("PUBLIC"),region=region(null,null),otherRegion=region(null,null);
        List<UUID> friends=new ArrayList<>();
        for(int i=0;i<5;i++) { UUID f=user(i%2==0?"PUBLIC":"PRIVATE"); follow(viewer,f,"ACCEPTED"); friends.add(f); }
        UUID requested=user("PRIVATE"),stranger=user("PUBLIC");
        follow(viewer,requested,"REQUESTED");
        Set<UUID> expectedHome=new LinkedHashSet<>(),expectedFriend=new LinkedHashSet<>();
        for(int i=0;i<23;i++) {
            UUID a=friends.get(i%5),b=friends.get((i+1)%5);
            Trip trip;
            UUID feed;
            switch(i%6) {
                case 0 -> { trip=trip(region,null,null,a,b); feed=publish(trip,a); expectedHome.add(feed); }      // two allowed routes, deduped
                case 1 -> { trip=trip(region,null,null,a,b); feed=publish(trip,a); hide(a,feed,viewer); expectedHome.add(feed); } // still visible via b
                case 2 -> { trip=trip(region,null,null,a); feed=publish(trip,a); hide(a,feed,viewer); }           // only route hidden
                case 3 -> { trip=trip(region,null,null,requested,stranger); feed=publish(trip,requested); }      // no followed route
                case 4 -> { trip=trip(otherRegion,null,null,a); feed=publish(trip,a); }                          // other region
                default -> { trip=trip(region,null,null,a); feed=publish(trip,a); expectedHome.add(feed); }
            }
            if(friends.get(0).equals(a) && Set.of(0,4,5).contains(i%6)) expectedFriend.add(feed);
            if(friends.get(0).equals(b) && Set.of(0,1).contains(i%6)) expectedFriend.add(feed);
        }
        assertThat(pageAll("/api/v1/home/regions/"+region+"/feeds",viewer,4,"id")).containsExactlyInAnyOrderElementsOf(expectedHome.stream().map(UUID::toString).toList());
        assertThat(pageAll("/api/v1/users/"+friends.get(0)+"/feeds",viewer,3,"id")).containsExactlyInAnyOrderElementsOf(expectedFriend.stream().map(UUID::toString).toList());
        assertThat(pageAll("/api/v1/users/"+friends.get(0)+"/timeline",viewer,3,"feedId")).containsExactlyInAnyOrderElementsOf(expectedFriend.stream().map(UUID::toString).toList());
        JsonNode home=data(req("/api/v1/home/map?bbox="+KOREA,viewer));
        Set<String> mapped=new HashSet<>();
        home.path("markers").forEach(m->{ if(m.path("region").path("id").asString().equals(region.toString())) mapped.addAll(texts(m.path("feedIds"))); });
        assertThat(mapped).containsExactlyInAnyOrderElementsOf(expectedHome.stream().map(UUID::toString).toList());
        home.path("markers").forEach(m->assertThat(texts(m.path("visibleMemberUserIds"))).doesNotContain(requested.toString(),stranger.toString()));
    }
    private List<String> pageAll(String path,UUID viewer,int limit,String idField) throws Exception {
        List<String> seen=new ArrayList<>();
        String cursor=null;
        boolean more;
        do {
            var request=get(path).with(authUser(viewer)).param("limit",Integer.toString(limit));
            if(cursor!=null) request.param("cursor",cursor);
            JsonNode page=json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
            more=page.path("page").path("hasNext").asBoolean();
            if(more) assertThat(page.path("data").size()).as(path).isEqualTo(limit);
            page.path("data").forEach(n->seen.add(n.path(idField).asString()));
            cursor=more?page.path("page").path("nextCursor").asString():null;
        } while(more);
        assertThat(seen).as(path).doesNotHaveDuplicates();
        return seen;
    }

    @Test void mapUsesSnapshotRegionsBboxAndCountsPrePublicationVisits() throws Exception {
        UUID member=user("PUBLIC"),viewer=user("PUBLIC");
        UUID inside=region(37.5,127.0),outside=region(10.0,100.0),visitRegion=region(null,null);
        follow(viewer,member,"ACCEPTED");
        Trip trip=trip(inside,null,null,member);
        jdbc.update("insert into trip_destinations(trip_id,region_id,display_order) values(?,?,1)",trip.id(),outside);
        UUID place=place(visitRegion);
        visit(trip,member,place);
        UUID deletedVisit=visit(trip,member,place(visitRegion));
        jdbc.update("update visits set deleted_at=now() where id=?",deletedVisit);
        UUID feed=publish(trip,member);
        jdbc.update("insert into visits(id,trip_id,member_id,place_id,visited_at,created_at) values(?,?,?,?,now(),now()+interval '1 day')",UUID.randomUUID(),trip.id(),trip.members().get(member),place(visitRegion));
        JsonNode markers=data(req("/api/v1/home/map?bbox="+KOREA,viewer)).path("markers");
        Map<String,JsonNode> byRegion=new HashMap<>();
        markers.forEach(m->byRegion.put(m.path("region").path("id").asString(),m));
        assertThat(byRegion).containsOnlyKeys(inside.toString(),visitRegion.toString());
        assertThat(byRegion.get(visitRegion.toString()).path("visitCount").asLong()).isEqualTo(1);
        assertThat(byRegion.get(inside.toString()).path("visitCount").asLong()).isZero();
        assertThat(texts(byRegion.get(inside.toString()).path("feedIds"))).containsExactly(feed.toString());
        JsonNode summary=data(req("/api/v1/feeds/{id}/summary",viewer,feed));
        assertThat(summary.path("feedId").asString()).isEqualTo(feed.toString());
        assertThat(summary.path("visitedPlaceCount").asLong()).isEqualTo(1);
        assertThat(summary.path("visitedRegionCount").asLong()).isEqualTo(1);
        assertThat(summary.path("photoCount").asLong()).isZero();
        assertThat(summary.path("plannedDistanceMeters").isNull()).isTrue();
        assertThat(summary.path("actualDistanceMeters").isNull()).isTrue();
        assertThat(summary.has("members")).isFalse(); assertThat(summary.has("settlement")).isFalse();
    }

    @Test void ownTravelMapIncludesDraftsAndPreviewsAViewerWithHiddenCount() throws Exception {
        UUID me=user("PRIVATE"),friend=user("PUBLIC"),stranger=user("PUBLIC"),region=region(null,null);
        follow(friend,me,"ACCEPTED");
        Trip shown=trip(region,"2026-01-01","2026-01-02",me), hiddenTrip=trip(region,"2026-02-10","2026-02-20",me), draft=trip(region,"2026-03-01","2026-03-01",me);
        Trip unlocated=trip(null,null,null,me);
        UUID shownFeed=publish(shown,me),hiddenFeed=publish(hiddenTrip,me);
        hide(me,hiddenFeed,friend);
        JsonNode own=data(req("/api/v1/me/travel-map?bbox="+KOREA,me));
        assertThat(own.path("hiddenTripCount").isNull()).isTrue();
        assertThat(own.path("unlocatedTripCount").asLong()).isEqualTo(1);
        assertThat(texts(single(own).path("tripIds"))).containsExactlyInAnyOrder(shown.id().toString(),hiddenTrip.id().toString(),draft.id().toString());
        assertThat(texts(single(own).path("feedIds"))).containsExactlyInAnyOrder(shownFeed.toString(),hiddenFeed.toString());
        JsonNode asFriend=data(req("/api/v1/me/travel-map?bbox="+KOREA+"&viewerId="+friend,me));
        assertThat(asFriend.path("hiddenTripCount").asLong()).isEqualTo(1);
        assertThat(texts(single(asFriend).path("feedIds"))).containsExactly(shownFeed.toString());
        assertThat(asFriend.path("unlocatedTripCount").asLong()).isZero();
        JsonNode asStranger=data(req("/api/v1/me/travel-map?bbox="+KOREA+"&viewerId="+stranger,me));
        assertThat(asStranger.path("hiddenTripCount").asLong()).isEqualTo(2);
        assertThat(asStranger.path("markers")).isEmpty();
        JsonNode dated=data(req("/api/v1/me/travel-map?bbox="+KOREA+"&from=2026-02-15&to=2026-03-31",me));
        assertThat(texts(single(dated).path("tripIds"))).containsExactlyInAnyOrder(hiddenTrip.id().toString(),draft.id().toString());
        assertThat(dated.path("unlocatedTripCount").asLong()).isZero();
        assertThat(unlocated.id()).isNotNull();
    }

    @Test void documentsNewPaths() throws Exception {
        var docs=json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for(var path:List.of("/api/v1/home/map","/api/v1/home/regions/{regionId}/feeds","/api/v1/users/{userId}/feeds","/api/v1/users/{userId}/feed-map",
                "/api/v1/users/{userId}/timeline","/api/v1/me/travel-map","/api/v1/feeds/{feedId}/like","/api/v1/feeds/{feedId}/summary","/api/v1/feeds/{feedId}/preview"))
            assertThat(docs.path("paths").has(path)).as(path).isTrue();
        assertThat(docs.path("paths").path("/api/v1/feeds/{feedId}/like").has("put")).isTrue();
        assertThat(docs.path("paths").path("/api/v1/feeds/{feedId}/like").has("delete")).isTrue();
        var schemas=docs.path("components").path("schemas");
        for(String field:List.of("id","tripId","title","coverPhotoId","coverImageUrl","regions","startDate","endDate","publishedAt","likedByMe","likeCount"))
            assertThat(schemas.path("FeedCard").path("properties").has(field)).as(field).isTrue();
        for(String field:List.of("markers","criteria","updatedAt")) assertThat(schemas.path("MapResult").path("properties").has(field)).isTrue();
        for(String field:List.of("markers","unlocatedTripCount","hiddenTripCount","updatedAt")) assertThat(schemas.path("OwnMapResult").path("properties").has(field)).isTrue();
        for(String field:List.of("feedId","photoCount","visitedPlaceCount","visitedRegionCount","plannedDistanceMeters","actualDistanceMeters","expenseSummary"))
            assertThat(schemas.path("FeedSummary").path("properties").has(field)).isTrue();
    }

    private JsonNode data(MockHttpServletRequestBuilder request) throws Exception {
        return json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data");
    }
    private MockHttpServletRequestBuilder req(String path,UUID who,Object... vars) {
        return MockMvcRequestBuilders.get(path,vars).with(authUser(who));
    }
    private static List<UUID> ids(JsonNode array) { List<UUID> ids=new ArrayList<>(); array.forEach(n->ids.add(UUID.fromString(n.path("id").asString()))); return ids; }
    private static List<String> texts(JsonNode array) { List<String> out=new ArrayList<>(); array.forEach(n->out.add(n.asString())); return out; }
    private static List<UUID> markerFeeds(JsonNode map) {
        Set<UUID> ids=new LinkedHashSet<>();
        map.path("markers").forEach(m->m.path("feedIds").forEach(n->ids.add(UUID.fromString(n.asString()))));
        return List.copyOf(ids);
    }
    private static JsonNode single(JsonNode map) { assertThat(map.path("markers").size()).isEqualTo(1); return map.path("markers").get(0); }
    private UUID user(String visibility) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into users(id,nickname,profile_completed,account_visibility,created_at,updated_at) values(?,'exposure',true,?,now(),now())",id,visibility);
        return id;
    }
    private void follow(UUID follower,UUID followee,String status) {
        jdbc.update("insert into follows(id,follower_user_id,followee_user_id,status,requested_at,accepted_at) values(?,?,?,?,now(),"+(status.equals("ACCEPTED")?"now()":"null")+")",
                UUID.randomUUID(),follower,followee,status);
    }
    private UUID region(Double latitude,Double longitude) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into regions(id,code,name,latitude,longitude) values(?,?,?,?,?)",id,"T"+ThreadLocalRandom.current().nextLong(1_000_000_000_000L),"테스트 지역",latitude,longitude);
        return id;
    }
    private UUID place(UUID region) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into places(id,region_id,name,latitude,longitude,source,created_at,updated_at) values(?,?,'Place',37,127,'MANUAL',now(),now())",id,region);
        return id;
    }
    private UUID visit(Trip trip,UUID user,UUID place) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into visits(id,trip_id,member_id,place_id,visited_at,created_at) values(?,?,?,?,now(),now()-interval '1 hour')",id,trip.id(),trip.members().get(user),place);
        return id;
    }
    private Trip trip(UUID region,String start,String end,UUID... users) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into trips(id,owner_user_id,title,start_date,end_date,created_at,updated_at) values(?,?,'Trip',cast(? as date),cast(? as date),now(),now())",id,users[0],start,end);
        Map<UUID,UUID> members=new LinkedHashMap<>();
        for(int i=0;i<users.length;i++) {
            UUID member=UUID.randomUUID();
            jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,?,now())",member,id,users[i],i+1);
            members.put(users[i],member);
        }
        jdbc.update("insert into itineraries(id,trip_id,updated_by_member_id,updated_at) values(?,?,?,now())",UUID.randomUUID(),id,members.get(users[0]));
        if(region!=null) jdbc.update("insert into trip_destinations(trip_id,region_id,display_order) values(?,?,0)",id,region);
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
