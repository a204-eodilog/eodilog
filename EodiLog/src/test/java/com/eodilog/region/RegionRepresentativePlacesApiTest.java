package com.eodilog.region;

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
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class,InMemoryStorageConfiguration.class})
class RegionRepresentativePlacesApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    record Trip(UUID id,Map<UUID,UUID> members) { }

    @Test void placesAreRankedByDistinctAllowedFeedsWithIdTieBreakAndDescendantRollUp() throws Exception {
        UUID member=user("PUBLIC"),other=user("PUBLIC"),viewer=user("PUBLIC");
        UUID province=region(null),city=region(province),elsewhere=region(null);
        UUID a=place(city),b=place(city),c=place(city),d=place(province),e=place(elsewhere);
        // a: two feeds (visited by two members in the first counts once), b/c/d: one feed each, e: other region
        Trip first=trip(member,other);
        visit(first,member,a); visit(first,other,a); visit(first,member,b);
        publish(first,member);
        Trip second=trip(member);
        visit(second,member,a); visit(second,member,c); visit(second,member,d); visit(second,member,e);
        publish(second,member);
        assertThat(places(viewer,province)).containsExactlyElementsOf(concat(List.of(a),byId(b,c,d)));
        assertThat(places(viewer,city)).containsExactlyElementsOf(concat(List.of(a),byId(b,c)));
        assertThat(places(viewer,elsewhere)).containsExactly(e);
        JsonNode detail=detail(viewer,city);
        JsonNode top=detail.path("representativePlaces").get(0);
        assertThat(top.path("id").asString()).isEqualTo(a.toString());
        assertThat(top.path("name").asString()).isEqualTo("Place");
        assertThat(detail.path("introduction").isNull()).isTrue();
        assertThat(detail.path("partialErrors").isArray() && detail.path("partialErrors").isEmpty()).isTrue();
        // two more feeds lift c (3) above a (2)
        for(int i=0;i<2;i++) {
            Trip more=trip(other);
            visit(more,other,c);
            publish(more,other);
        }
        assertThat(places(viewer,city)).containsExactly(c,a,b);
    }

    @Test void atMostFivePlacesAreReturned() throws Exception {
        UUID member=user("PUBLIC"),viewer=user("PUBLIC"),region=region(null);
        List<UUID> all=new ArrayList<>();
        for(int i=0;i<6;i++) all.add(place(region));
        Trip trip=trip(member);
        for(UUID p:all) visit(trip,member,p);
        publish(trip,member);
        assertThat(places(viewer,region)).containsExactlyElementsOf(byId(all.toArray(UUID[]::new)).subList(0,5));
    }

    @Test void accountVisibilityRelationAndHidingDecideWhetherAFeedCounts() throws Exception {
        for(String visibility:List.of("PUBLIC","PRIVATE")) for(String relation:List.of("ACCEPTED","REQUESTED","NONE")) for(boolean hidden:List.of(false,true)) {
            String label=visibility+"/"+relation+"/hidden="+hidden;
            UUID member=user(visibility),viewer=user("PUBLIC"),region=region(null),place=place(region);
            if(!relation.equals("NONE")) follow(viewer,member,relation);
            Trip trip=trip(member);
            visit(trip,member,place);
            UUID feed=publish(trip,member);
            if(hidden) hide(member,feed,viewer);
            boolean allowed=(visibility.equals("PUBLIC") || relation.equals("ACCEPTED")) && !hidden;
            assertThat(places(viewer,region)).as(label).isEqualTo(allowed?List.of(place):List.of());
            // the member always sees their own feed
            assertThat(places(member,region)).as(label).containsExactly(place);
        }
    }

    @Test void aFeedHiddenByOneMemberStillCountsThroughAnotherOpenRoute() throws Exception {
        UUID a=user("PUBLIC"),b=user("PRIVATE"),viewer=user("PUBLIC"),region=region(null),place=place(region);
        Trip trip=trip(a,b);
        visit(trip,a,place);
        UUID feed=publish(trip,a);
        hide(a,feed,viewer);
        assertThat(places(viewer,region)).isEmpty();
        follow(viewer,b,"ACCEPTED");
        assertThat(places(viewer,region)).containsExactly(place);
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?",trip.members().get(b));
        assertThat(places(viewer,region)).isEmpty();
    }

    @Test void deletedFeedsTripsAndUnusableAccountsAreExcluded() throws Exception {
        UUID member=user("PUBLIC"),viewer=user("PUBLIC"),region=region(null),place=place(region);
        Trip trip=trip(member);
        visit(trip,member,place);
        UUID feed=publish(trip,member);
        assertThat(places(viewer,region)).containsExactly(place);
        jdbc.update("update users set status='DEACTIVATED' where id=?",member);
        assertThat(places(viewer,region)).isEmpty();
        jdbc.update("update users set status='ACTIVE' where id=?",member);
        jdbc.update("update users set profile_completed=false,nickname='' where id=?",member);
        assertThat(places(viewer,region)).isEmpty();
        jdbc.update("update users set profile_completed=true,nickname='region' where id=?",member);
        assertThat(places(viewer,region)).containsExactly(place);
        jdbc.update("update feeds set deleted_at=now() where id=?",feed);
        assertThat(places(viewer,region)).isEmpty();
        Trip second=trip(member);
        visit(second,member,place);
        publish(second,member);
        assertThat(places(viewer,region)).containsExactly(place);
        jdbc.update("update trips set deleted_at=now() where id=?",second.id());
        assertThat(places(viewer,region)).isEmpty();
    }

    @Test void snapshotPlacesWithoutAPlaceRowDoNotTakeASlot() throws Exception {
        UUID member=user("PUBLIC"),viewer=user("PUBLIC"),region=region(null);
        List<UUID> real=new ArrayList<>();
        for(int i=0;i<5;i++) real.add(place(region));
        UUID ghost=UUID.randomUUID();
        for(int i=0;i<2;i++) {
            Trip trip=trip(member);
            for(UUID p:real) visit(trip,member,p);
            UUID feed=publish(trip,member);
            // feed_places outlives the original place row; this one has no places row and the most feeds
            jdbc.update("insert into feed_places(feed_id,place_id,region_id) values(?,?,?)",feed,ghost,region);
        }
        Trip extra=trip(member);
        visit(extra,member,real.getFirst());
        UUID third=publish(extra,member);
        jdbc.update("insert into feed_places(feed_id,place_id,region_id) values(?,?,?)",third,ghost,region);
        List<UUID> rest=byId(real.subList(1,5).toArray(UUID[]::new));
        assertThat(places(viewer,region)).doesNotContain(ghost).containsExactlyElementsOf(concat(List.of(real.getFirst()),rest));
    }

    @Test void descendantsTwoLevelsDownRollUpAndAParentCycleTerminates() throws Exception {
        UUID member=user("PUBLIC"),viewer=user("PUBLIC");
        UUID top=region(null),middle=region(top),bottom=region(middle);
        UUID deep=place(bottom);
        Trip trip=trip(member);
        visit(trip,member,deep);
        publish(trip,member);
        try {
            assertThat(places(viewer,top)).containsExactly(deep);
            assertThat(places(viewer,middle)).containsExactly(deep);
            assertThat(places(viewer,bottom)).containsExactly(deep);
        } finally {
            // this class commits its data; keep the shared database within the seed's two-level shape
            jdbc.update("update regions set parent_id=null where id=?",bottom);
        }
        // regions only has a parent_id foreign key, so a cycle can be stored; the scope walk must still end
        UUID a=region(null),b=region(a);
        UUID inCycle=place(b);
        Trip cyclic=trip(member);
        visit(cyclic,member,inCycle);
        publish(cyclic,member);
        jdbc.update("update regions set parent_id=? where id=?",b,a);
        try {
            assertThat(places(viewer,a)).containsExactly(inCycle);
            assertThat(places(viewer,b)).containsExactly(inCycle);
        } finally {
            jdbc.update("update regions set parent_id=null where id=?",a);
        }
    }

    @Test void emptyRegionUnknownRegionAndInvalidIdKeepTheirContracts() throws Exception {
        UUID viewer=user("PUBLIC"),region=region(null);
        place(region);
        assertThat(places(viewer,region)).isEmpty();
        mvc.perform(get("/api/v1/regions/{id}",UUID.randomUUID()).with(authUser(viewer)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("REGION_NOT_FOUND"));
        mvc.perform(get("/api/v1/regions/{id}","not-uuid").with(authUser(viewer)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/regions/{id}",region)).andExpect(status().isUnauthorized());
    }

    @Test void documentsTheRanking() throws Exception {
        var docs=json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String operation=docs.path("paths").path("/api/v1/regions/{regionId}").path("get").path("description").asString();
        assertThat(operation).contains("representativePlaces는 최대 5개").contains("하위 지역").doesNotContain("대표 장소와 부분 오류는 빈 목록");
        String field=docs.path("components").path("schemas").path("RegionDetail").path("properties").path("representativePlaces").path("description").asString();
        assertThat(field).contains("최대 5개").doesNotContain("현재 빈 목록");
    }

    private List<UUID> places(UUID viewer,UUID region) throws Exception {
        List<UUID> ids=new ArrayList<>();
        detail(viewer,region).path("representativePlaces").forEach(n->ids.add(UUID.fromString(n.path("id").asString())));
        return ids;
    }
    private JsonNode detail(UUID viewer,UUID region) throws Exception {
        var body=mvc.perform(get("/api/v1/regions/{id}",region).with(authUser(viewer))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("data");
    }
    /** PostgreSQL orders uuid by bytes, which matches lowercase string order (not UUID.compareTo). */
    private static List<UUID> byId(UUID... ids) { return Arrays.stream(ids).sorted(Comparator.comparing(UUID::toString)).toList(); }
    private static List<UUID> concat(List<UUID> head,List<UUID> tail) { List<UUID> all=new ArrayList<>(head); all.addAll(tail); return all; }
    private UUID user(String visibility) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into users(id,nickname,profile_completed,account_visibility,created_at,updated_at) values(?,'region',true,?,now(),now())",id,visibility);
        return id;
    }
    private void follow(UUID follower,UUID followee,String status) {
        jdbc.update("insert into follows(id,follower_user_id,followee_user_id,status,requested_at,accepted_at) values(?,?,?,?,now(),"+(status.equals("ACCEPTED")?"now()":"null")+")",
                UUID.randomUUID(),follower,followee,status);
    }
    private UUID region(UUID parent) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into regions(id,code,name,parent_id) values(?,?,'대표 장소 지역',?)",id,"RP"+ThreadLocalRandom.current().nextLong(1_000_000_000_000L),parent);
        return id;
    }
    private UUID place(UUID region) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into places(id,region_id,name,latitude,longitude,source,created_at,updated_at) values(?,?,'Place',37,127,'MANUAL',now(),now())",id,region);
        return id;
    }
    private void visit(Trip trip,UUID user,UUID place) {
        jdbc.update("insert into visits(id,trip_id,member_id,place_id,visited_at,created_at) values(?,?,?,?,now(),now()-interval '1 hour')",
                UUID.randomUUID(),trip.id(),trip.members().get(user),place);
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
