package com.eodilog.feed;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.InMemoryStorageConfiguration;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class,InMemoryStorageConfiguration.class})
class PlaceSocialApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    record Trip(UUID id,Map<UUID,UUID> members) { }

    @Test void accountVisibilityRelationAndHidingDecideWhetherAFeedCounts() throws Exception {
        for(String visibility:List.of("PUBLIC","PRIVATE")) for(String relation:List.of("ACCEPTED","REQUESTED","NONE")) for(boolean hidden:List.of(false,true)) {
            String label=visibility+"/"+relation+"/hidden="+hidden;
            UUID member=user(visibility),viewer=user("PUBLIC"),place=place();
            if(!relation.equals("NONE")) follow(viewer,member,relation);
            Trip trip=trip(member);
            UUID review=review(visit(trip,member,place),4,"좋아요",Instant.now().minusSeconds(60));
            UUID feed=publish(trip,member);
            if(hidden) hide(member,feed,viewer);
            boolean allowed=(visibility.equals("PUBLIC") || relation.equals("ACCEPTED")) && !hidden;
            JsonNode summary=summary(viewer,place);
            assertThat(summary.path("place").path("id").asString()).as(label).isEqualTo(place.toString());
            assertThat(summary.path("reviewCount").asLong()).as(label).isEqualTo(allowed?1:0);
            assertThat(summary.path("visitorCount").asLong()).as(label).isEqualTo(allowed?1:0);
            assertThat(ids(summary.path("visitors"))).as(label).isEqualTo(allowed?List.of(member):List.of());
            assertThat(summary.path("averageScore").isNull()).as(label).isEqualTo(!allowed);
            if(allowed) assertThat(summary.path("averageScore").asDouble()).as(label).isEqualTo(4.0);
            assertThat(summary.path("partialErrors").isArray() && summary.path("partialErrors").isEmpty()).as(label).isTrue();
            JsonNode reviews=page(viewer,place,null,20).path("data");
            assertThat(ids(reviews)).as(label).isEqualTo(allowed?List.of(review):List.of());
            if(allowed) {
                JsonNode r=reviews.get(0);
                assertThat(r.path("placeId").asString()).isEqualTo(place.toString());
                assertThat(r.path("feedId").asString()).isEqualTo(feed.toString());
                assertThat(r.path("author").path("id").asString()).isEqualTo(member.toString());
                assertThat(r.path("author").path("followingStatus").asString()).as(label).isEqualTo(relation.equals("NONE")?"NONE":relation);
                assertThat(r.path("score").asInt()).isEqualTo(4);
                assertThat(r.path("body").asString()).isEqualTo("좋아요");
                assertThat(r.has("writtenAt")).isTrue();
            }
        }
    }

    @Test void feedHiddenByOneMemberStillCountsThroughAnotherAndOnlyAllowedVisitorsAreListed() throws Exception {
        UUID a=user("PUBLIC"),b=user("PUBLIC"),viewer=user("PUBLIC"),place=place();
        Trip trip=trip(a,b);
        UUID ra=review(visit(trip,a,place),5,"a",Instant.now().minusSeconds(120));
        UUID rb=review(visit(trip,b,place),2,"b",Instant.now().minusSeconds(60));
        UUID feed=publish(trip,a);
        hide(a,feed,viewer);
        JsonNode summary=summary(viewer,place);
        assertThat(summary.path("reviewCount").asLong()).isEqualTo(2);
        assertThat(summary.path("averageScore").asDouble()).isEqualTo(3.5);
        assertThat(ids(summary.path("visitors"))).containsExactly(b);
        assertThat(summary.path("visitorCount").asLong()).isEqualTo(1);
        assertThat(ids(page(viewer,place,null,20).path("data"))).containsExactly(rb,ra);
        hide(b,feed,viewer);
        JsonNode none=summary(viewer,place);
        assertThat(none.path("reviewCount").asLong()).isZero();
        assertThat(none.path("visitorCount").asLong()).isZero();
        assertThat(page(viewer,place,null,20).path("data")).isEmpty();
        // a member sees their own feed through their own route and is not listed as a visitor to themselves
        JsonNode own=summary(a,place);
        assertThat(own.path("reviewCount").asLong()).isEqualTo(2);
        assertThat(ids(own.path("visitors"))).containsExactly(b);
    }

    @Test void deletedFeedsReviewsVisitsAndOtherPlacesAreExcluded() throws Exception {
        UUID member=user("PUBLIC"),other=user("PUBLIC"),viewer=user("PUBLIC"),place=place(),elsewhere=place();
        Trip trip=trip(member,other);
        UUID kept=review(visit(trip,member,place),3,"kept",Instant.now().minusSeconds(300));
        UUID removedVisit=visit(trip,other,place);
        UUID removedByVisit=review(removedVisit,1,"visit gone",Instant.now().minusSeconds(200));
        UUID elsewhereReview=review(visit(trip,member,elsewhere),5,"elsewhere",Instant.now().minusSeconds(100));
        UUID feed=publish(trip,member);
        // a review of the same place written after publication is not in the snapshot
        UUID late=user("PUBLIC");
        UUID lateMember=UUID.randomUUID();
        jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,3,now())",lateMember,trip.id(),late);
        UUID lateVisit=UUID.randomUUID();
        jdbc.update("insert into visits(id,trip_id,member_id,place_id,visited_at,created_at) values(?,?,?,?,now(),now()+interval '1 day')",lateVisit,trip.id(),lateMember,place);
        UUID afterPublish=review(lateVisit,5,"late",Instant.now());
        assertThat(ids(page(viewer,place,null,20).path("data"))).containsExactly(removedByVisit,kept).doesNotContain(afterPublish,elsewhereReview);
        assertThat(ids(summary(viewer,place).path("visitors"))).containsExactlyInAnyOrder(member,other);
        jdbc.update("update visits set deleted_at=now() where id=?",removedVisit);
        JsonNode summary=summary(viewer,place);
        assertThat(summary.path("reviewCount").asLong()).isEqualTo(1);
        assertThat(summary.path("averageScore").asDouble()).isEqualTo(3.0);
        assertThat(ids(summary.path("visitors"))).containsExactly(member);
        assertThat(ids(page(viewer,place,null,20).path("data"))).containsExactly(kept);
        jdbc.update("delete from reviews where id=?",kept);
        assertThat(page(viewer,place,null,20).path("data")).isEmpty();
        assertThat(summary(viewer,place).path("averageScore").isNull()).isTrue();
        assertThat(summary(viewer,place).path("visitorCount").asLong()).isEqualTo(1);
        jdbc.update("update feeds set deleted_at=now() where id=?",feed);
        assertThat(summary(viewer,place).path("visitorCount").asLong()).isZero();
        // deleted trip
        Trip second=trip(member);
        review(visit(second,member,place),4,"second",Instant.now().minusSeconds(50));
        publish(second,member);
        assertThat(summary(viewer,place).path("reviewCount").asLong()).isEqualTo(1);
        jdbc.update("update trips set deleted_at=now() where id=?",second.id());
        assertThat(summary(viewer,place).path("reviewCount").asLong()).isZero();
        assertThat(page(viewer,place,null,20).path("data")).isEmpty();
    }

    @Test void authorWithoutAUserRowIsMaskedInsteadOfUsingTheSnapshotCard() throws Exception {
        UUID member=user("PUBLIC"),viewer=user("PUBLIC"),place=place();
        follow(member,viewer,"ACCEPTED");
        Trip trip=trip(member);
        review(visit(trip,member,place),3,"x",Instant.now().minusSeconds(10));
        UUID feed=publish(trip,member);
        UUID gone=UUID.randomUUID();
        jdbc.update("update feeds set snapshot_json=jsonb_set(snapshot_json,'{publicReviews,0,author,id}',to_jsonb(cast(? as text))) where id=?",gone.toString(),feed);
        JsonNode author=page(viewer,place,null,20).path("data").get(0).path("author");
        assertThat(author.path("id").asString()).isEqualTo(gone.toString());
        assertThat(author.path("nickname").asString()).isEqualTo("탈퇴한 사용자");
        assertThat(author.path("profileImageUrl").isNull()).isTrue();
        assertThat(author.path("followingStatus").asString()).isEqualTo("NONE");
        assertThat(author.path("followedByStatus").asString()).isEqualTo("NONE");
    }

    @Test void unknownPlaceIsNotFoundAndBadPagingInputIsRejected() throws Exception {
        UUID viewer=user("PUBLIC"),missing=UUID.randomUUID();
        mvc.perform(get("/api/v1/places/{id}/social-summary",missing).with(authUser(viewer))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/places/{id}/public-reviews",missing).with(authUser(viewer))).andExpect(status().isNotFound());
        UUID place=place();
        mvc.perform(get("/api/v1/places/{id}/public-reviews",place).with(authUser(viewer)).param("limit","0")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/places/{id}/public-reviews",place).with(authUser(viewer)).param("cursor","bad")).andExpect(status().isBadRequest());
        JsonNode empty=summary(viewer,place);
        assertThat(empty.path("visitorCount").asLong()).isZero();
        assertThat(empty.path("reviewCount").asLong()).isZero();
        assertThat(empty.path("averageScore").isNull()).isTrue();
        mvc.perform(get("/api/v1/places/{id}/social-summary",place)).andExpect(status().isUnauthorized());
    }

    @Test void reviewsPageAfterFilteringWithoutDuplicatesOrSkips() throws Exception {
        UUID viewer=user("PUBLIC"),friend=user("PRIVATE"),stranger=user("PRIVATE"),place=place();
        follow(viewer,friend,"ACCEPTED");
        Instant base=Instant.now().minus(1,ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS);
        List<UUID> expected=new ArrayList<>();
        for(int i=0;i<9;i++) {
            UUID author=i%3==2?stranger:friend;
            Trip trip=trip(author);
            // pairs of reviews share a timestamp to exercise the id tie-break
            UUID review=review(visit(trip,author,place),1+i%5,"r"+i,base.plusSeconds(i/2));
            UUID feed=publish(trip,author);
            if(i==4) hide(friend,feed,viewer);
            else if(author.equals(friend)) expected.add(review);
        }
        List<UUID> seen=new ArrayList<>();
        String cursor=null;
        boolean more;
        do {
            JsonNode page=page(viewer,place,cursor,2);
            more=page.path("page").path("hasNext").asBoolean();
            if(more) assertThat(page.path("data").size()).isEqualTo(2);
            seen.addAll(ids(page.path("data")));
            cursor=more?page.path("page").path("nextCursor").asString():null;
        } while(more);
        assertThat(seen).doesNotHaveDuplicates().containsExactlyInAnyOrderElementsOf(expected);
        List<String> order=new ArrayList<>();
        for(UUID id:seen) order.add(jdbc.queryForObject("select to_char(created_at,'YYYYMMDDHH24MISSUS')||id::text from reviews where id=?",String.class,id));
        List<String> sorted=new ArrayList<>(order); sorted.sort(Comparator.reverseOrder());
        assertThat(order).isEqualTo(sorted);
        assertThat(summary(viewer,place).path("reviewCount").asLong()).isEqualTo(expected.size());
    }

    @Test void documentsBothPaths() throws Exception {
        var docs=json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for(var path:List.of("/api/v1/places/{placeId}/social-summary","/api/v1/places/{placeId}/public-reviews"))
            assertThat(docs.path("paths").path(path).has("get")).as(path).isTrue();
        var schemas=docs.path("components").path("schemas");
        for(String field:List.of("place","visitorCount","visitors","averageScore","reviewCount","partialErrors"))
            assertThat(schemas.path("PlaceSocialSummary").path("properties").has(field)).as(field).isTrue();
        for(String field:List.of("id","placeId","author","score","body","writtenAt","feedId"))
            assertThat(schemas.path("PublishedReview").path("properties").has(field)).as(field).isTrue();
    }

    private JsonNode summary(UUID viewer,UUID place) throws Exception {
        return read(get("/api/v1/places/{id}/social-summary",place).with(authUser(viewer))).path("data");
    }
    private JsonNode page(UUID viewer,UUID place,String cursor,int limit) throws Exception {
        var request=get("/api/v1/places/{id}/public-reviews",place).with(authUser(viewer)).param("limit",Integer.toString(limit));
        if(cursor!=null) request.param("cursor",cursor);
        return read(request);
    }
    private JsonNode read(RequestBuilder request) throws Exception {
        return json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    private static List<UUID> ids(JsonNode array) { List<UUID> ids=new ArrayList<>(); array.forEach(n->ids.add(UUID.fromString(n.path("id").asString()))); return ids; }
    private UUID user(String visibility) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into users(id,nickname,profile_completed,account_visibility,created_at,updated_at) values(?,'social',true,?,now(),now())",id,visibility);
        return id;
    }
    private void follow(UUID follower,UUID followee,String status) {
        jdbc.update("insert into follows(id,follower_user_id,followee_user_id,status,requested_at,accepted_at) values(?,?,?,?,now(),"+(status.equals("ACCEPTED")?"now()":"null")+")",
                UUID.randomUUID(),follower,followee,status);
    }
    private UUID place() {
        UUID region=UUID.randomUUID();
        jdbc.update("insert into regions(id,code,name) values(?,?,'테스트 지역')",region,"S"+ThreadLocalRandom.current().nextLong(1_000_000_000_000L));
        UUID id=UUID.randomUUID();
        jdbc.update("insert into places(id,region_id,name,latitude,longitude,source,created_at,updated_at) values(?,?,'Place',37,127,'MANUAL',now(),now())",id,region);
        return id;
    }
    private UUID visit(Trip trip,UUID user,UUID place) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into visits(id,trip_id,member_id,place_id,visited_at,created_at) values(?,?,?,?,now(),now()-interval '1 hour')",id,trip.id(),trip.members().get(user),place);
        return id;
    }
    private UUID review(UUID visit,int score,String body,Instant at) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into reviews(id,visit_id,score,body,created_at,updated_at) values(?,?,?,?,?,?)",id,visit,score,body,Timestamp.from(at),Timestamp.from(at));
        return id;
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
