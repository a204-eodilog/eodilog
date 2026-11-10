package com.eodilog.feed;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.*;
import com.eodilog.job.JobWorker;
import java.util.*;
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
class FeedDeleteOwnRecordsApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @Autowired InMemoryObjectStorage storage;
    @Autowired JobWorker worker;
    UUID user,other,viewer,trip,member,otherMember,itinerary;

    @BeforeEach void setup() {
        user=user(); other=user(); viewer=user(); trip=UUID.randomUUID(); member=UUID.randomUUID(); otherMember=UUID.randomUUID(); itinerary=UUID.randomUUID();
        jdbc.update("insert into trips(id,owner_user_id,title,created_at,updated_at) values(?,?,'Trip',now(),now())",trip,user);
        jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,1,now()),(?,?,?,2,now())",member,trip,user,otherMember,trip,other);
        jdbc.update("insert into itineraries(id,trip_id,updated_by_member_id,updated_at) values(?,?,?,now())",itinerary,trip,member);
    }

    @Test void deletesOnlyRequestersFrozenRecordsAndKeepsCompanionsSharedDataAndRepublishedFeed() throws Exception {
        UUID place=place(), otherPlace=place();
        UUID[] mine=photo(member,place), mine2=photo(member,null), theirs=photo(otherMember,place);
        UUID[] myReviewed=visit(member,place,true), myPlain=visit(member,otherPlace,false), theirVisit=visit(otherMember,place,true);
        UUID expense=UUID.randomUUID(), settlement=UUID.randomUUID();
        jdbc.update("insert into expenses(id,trip_id,registered_by_member_id,payer_member_id,title,amount_minor,spent_at,created_at,updated_at) values(?,?,?,?,'dinner',100,now(),now(),now())",expense,trip,member,member);
        jdbc.update("insert into settlements(id,trip_id,calculated_by_member_id,expense_version,total_amount_minor,rounding_policy,rounding_adjustment_minor,expense_snapshot_json,calculated_at) values(?,?,?,1,100,'FLOOR',0,'{}',now())",settlement,trip,member);
        UUID feed=id(publish(other));
        publicFeed(feed).andExpect(jsonPath("$.data.photos.length()").value(3)).andExpect(jsonPath("$.data.publicReviews.length()").value(2));

        JsonNode ref=body(request(user,feed,1).andExpect(status().isAccepted())
                .andExpect(jsonPath("$.data.status").value("QUEUED")));
        UUID job=UUID.fromString(ref.path("jobId").asString());
        assertThat(ref.path("statusUrl").asString()).isEqualTo("/api/v1/jobs/"+job);

        // Admission: feed is down like a normal delete and the requester's originals are hidden at once.
        publicFeed(feed).andExpect(status().isNotFound());
        assertThat(count("select count(*) from notifications n join events e on e.id=n.event_id where e.trip_id=? and e.type='FEED_DELETED'",trip)).isEqualTo(1);
        assertThat(count("select count(*) from photos where trip_id=? and deleted_at is null",trip)).isEqualTo(1);
        mvc.perform(get("/api/v1/trips/{id}/summary",trip).with(authUser(user))).andExpect(jsonPath("$.data.photoCount").value(1));
        download(mine[1],feed).andExpect(status().isNotFound());
        request(user,feed,2).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FEED_NOT_FOUND"));

        // Created after admission: a new own photo/visit and a fresh publication by the companion.
        UUID[] late=photo(member,null);
        UUID[] lateVisit=visit(member,place,true);
        UUID fresh=id(publish(other).andExpect(status().isCreated()));
        long freshVersion=jdbc.queryForObject("select version from feeds where id=?",Long.class,fresh);
        publicFeed(fresh).andExpect(jsonPath("$.data.photos.length()").value(2));

        runToSuccess(job);

        for(UUID[] photo:List.of(mine,mine2)) {
            assertThat(count("select count(*) from photos where id=?",photo[0])).isZero();
            assertThat(count("select count(*) from assets where id=? and status='DELETING' and objects_deleted",photo[1])).isEqualTo(1);
            assertThat(storage.contains("display/"+photo[1])).isFalse();
        }
        assertThat(count("select count(*) from reviews where id=?",myReviewed[1])).isZero();
        assertThat(count("select count(*) from visits where id=?",myReviewed[0])).isZero();
        assertThat(count("select count(*) from visits where id=?",myPlain[0])).isZero();
        // Companion data, shared money, trip and membership stay.
        assertThat(count("select count(*) from photos where id=? and deleted_at is null",theirs[0])).isEqualTo(1);
        assertThat(storage.contains("display/"+theirs[1])).isTrue();
        assertThat(count("select count(*) from visits where id=? and deleted_at is null",theirVisit[0])).isEqualTo(1);
        assertThat(count("select count(*) from reviews where id=?",theirVisit[1])).isEqualTo(1);
        assertThat(count("select count(*) from expenses where id=? and deleted_at is null",expense)).isEqualTo(1);
        assertThat(count("select count(*) from settlements where id=?",settlement)).isEqualTo(1);
        assertThat(count("select count(*) from trips where id=? and deleted_at is null",trip)).isEqualTo(1);
        assertThat(count("select count(*) from trip_members where id=? and status='ACTIVE'",member)).isEqualTo(1);
        // Later records and the re-published feed are untouched.
        assertThat(count("select count(*) from photos where id=? and deleted_at is null",late[0])).isEqualTo(1);
        assertThat(count("select count(*) from reviews where id=?",lateVisit[1])).isEqualTo(1);
        assertThat(jdbc.queryForObject("select version from feeds where id=? and deleted_at is null",Long.class,fresh)).isEqualTo(freshVersion);
        publicFeed(fresh).andExpect(status().isOk()).andExpect(jsonPath("$.data.photos.length()").value(2));
        download(theirs[1],fresh).andExpect(status().isOk());
        download(mine[1],fresh).andExpect(status().isNotFound());
        download(mine[1],feed).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/trips/{id}/summary",trip).with(authUser(user))).andExpect(jsonPath("$.data.photoCount").value(2));

        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(user))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.data.result.scope").value("OWN_RECORDS_DELETE"))
                .andExpect(jsonPath("$.data.result.completedCount").value(5))
                .andExpect(jsonPath("$.data.result.visitIds").doesNotExist());
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(other))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(viewer))).andExpect(status().isNotFound());

        // Re-running the same job is a no-op for already-gone targets and never broadens the scope.
        jdbc.update("update jobs set status='QUEUED',finished_at=null,result_json=null,attempt=0,next_attempt_at=now() where id=?",job);
        runToSuccess(job);
        assertThat(count("select count(*) from photos where id=? and deleted_at is null",late[0])).isEqualTo(1);
        assertThat(count("select count(*) from photos where id=? and deleted_at is null",theirs[0])).isEqualTo(1);
        assertThat(count("select count(*) from reviews where id=?",theirVisit[1])).isEqualTo(1);
        assertThat(count("select count(*) from reviews where id=?",lateVisit[1])).isEqualTo(1);
    }

    @Test void staleVersionConflictsWithoutChangingAnything() throws Exception {
        UUID[] mine=photo(member,null); UUID[] visit=visit(member,place(),true);
        UUID feed=id(publish(user));
        jdbc.update("update feeds set version=2 where id=?",feed);
        request(user,feed,1).andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
        publicFeed(feed).andExpect(status().isOk());
        assertThat(count("select count(*) from photos where id=? and deleted_at is null",mine[0])).isEqualTo(1);
        assertThat(count("select count(*) from assets where id=? and status='READY'",mine[1])).isEqualTo(1);
        assertThat(count("select count(*) from visits where id=? and deleted_at is null",visit[0])).isEqualTo(1);
        assertThat(count("select count(*) from jobs where trip_id=?",trip)).isZero();
        assertThat(count("select count(*) from events where trip_id=?",trip)).isZero();
    }

    @Test void unknownNonMemberAndLeftMemberGetFeedNotFoundAndInvalidBodiesAreRejected() throws Exception {
        UUID feed=id(publish(user));
        request(viewer,feed,1).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FEED_NOT_FOUND"));
        request(user,UUID.randomUUID(),1).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FEED_NOT_FOUND"));
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?",otherMember);
        request(other,feed,1).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FEED_NOT_FOUND"));
        for(String body:List.of("{}","{\"expectedVersion\":0}","{\"expectedVersion\":1,\"tripId\":\""+trip+"\"}"))
            mvc.perform(post("/api/v1/feeds/{id}/delete-own-records",feed).with(authUser(user)).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        publicFeed(feed).andExpect(status().isOk());
        assertThat(count("select count(*) from jobs where trip_id=?",trip)).isZero();
    }

    @Test void frozenScopeFinishesAfterRequesterLeavesTrip() throws Exception {
        UUID[] mine=photo(member,null); UUID[] visit=visit(member,place(),true);
        UUID feed=id(publish(user));
        UUID job=UUID.fromString(body(request(user,feed,1).andExpect(status().isAccepted())).path("jobId").asString());
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?",member);
        runToSuccess(job);
        assertThat(count("select count(*) from photos where id=?",mine[0])).isZero();
        assertThat(count("select count(*) from visits where id=?",visit[0])).isZero();
        assertThat(count("select count(*) from reviews where id=?",visit[1])).isZero();
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(user))).andExpect(status().isOk()).andExpect(jsonPath("$.data.result.completedCount").value(3));
    }

    @Test void documentsPath() throws Exception {
        var docs=json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var operation=docs.path("paths").path("/api/v1/feeds/{feedId}/delete-own-records").path("post");
        assertThat(operation.path("responses").has("202")).isTrue();
        assertThat(operation.path("responses").has("409")).isTrue();
        assertThat(docs.path("components").path("schemas").path("OwnRecordsDelete").path("required").toString()).contains("expectedVersion");
    }

    private void runToSuccess(UUID job) throws Exception {
        for(int n=0;n<50;n++) {
            worker.pollOnce();
            if("SUCCEEDED".equals(jdbc.queryForObject("select status from jobs where id=?",String.class,job))) break;
            Thread.sleep(100);
        }
        assertThat(jdbc.queryForObject("select status from jobs where id=?",String.class,job)).isEqualTo("SUCCEEDED");
    }
    private ResultActions request(UUID who,UUID feed,long version)throws Exception{return mvc.perform(post("/api/v1/feeds/{id}/delete-own-records",feed).with(authUser(who)).contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":"+version+"}"));}
    private ResultActions publish(UUID who)throws Exception{return mvc.perform(post("/api/v1/trips/{id}/feed",trip).with(authUser(who)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Trip\",\"body\":\"\"}"));}
    private ResultActions publicFeed(UUID id)throws Exception{return mvc.perform(get("/api/v1/feeds/{id}",id).with(authUser(viewer)));}
    private ResultActions download(UUID asset,UUID feed)throws Exception{return mvc.perform(get("/api/v1/assets/{id}/download",asset).with(authUser(viewer)).param("feedId",feed.toString()));}
    private JsonNode body(ResultActions result)throws Exception{return json.readTree(result.andReturn().getResponse().getContentAsString()).path("data");}
    private UUID id(ResultActions result)throws Exception{return UUID.fromString(body(result).path("id").asString());}
    private long count(String sql,UUID id){return jdbc.queryForObject(sql,Long.class,id);}
    private UUID user(){UUID id=UUID.randomUUID();jdbc.update("insert into users(id,nickname,profile_completed,created_at,updated_at) values(?,'feed',true,now(),now())",id);return id;}
    private UUID place(){UUID id=UUID.randomUUID();jdbc.update("insert into places(id,name,latitude,longitude,source,created_at,updated_at) values(?,'Place',37,127,'MANUAL',now(),now())",id);return id;}
    /** Returns {visitId, reviewId or null}. */
    private UUID[] visit(UUID by,UUID place,boolean reviewed){
        UUID visit=UUID.randomUUID(),review=reviewed?UUID.randomUUID():null;
        jdbc.update("insert into visits(id,trip_id,member_id,place_id,visited_at,created_at) values(?,?,?,?,now(),now())",visit,trip,by,place);
        if(reviewed) jdbc.update("insert into reviews(id,visit_id,score,body,created_at,updated_at) values(?,?,5,'review',now(),now())",review,visit);
        return new UUID[]{visit,review};
    }
    /** Returns {photoId, assetId}. */
    private UUID[] photo(UUID by,UUID place){
        UUID batch=UUID.randomUUID(),asset=UUID.randomUUID(),photo=UUID.randomUUID();
        UUID owner=jdbc.queryForObject("select user_id from trip_members where id=?",UUID.class,by);
        jdbc.update("insert into photo_upload_batches(id,trip_id,created_by_member_id,file_count,created_at,expires_at) values(?,?,?,1,now(),now()+interval '1 hour')",batch,trip,by);
        jdbc.update("insert into assets(id,owner_user_id,trip_id,purpose,object_key,display_key,content_type,display_content_type,byte_size,status,created_at) values(?,?,?,'TRIP_PHOTO',?,?,'image/jpeg','image/jpeg',3,'READY',now())",asset,owner,trip,"original/"+asset,"display/"+asset);
        jdbc.update("insert into photos(id,batch_id,trip_id,uploader_member_id,asset_id,place_id,created_at) values(?,?,?,?,?,?,now())",photo,batch,trip,by,asset,place);
        storage.put("original/"+asset,new byte[]{1,2,3},"image/jpeg");
        storage.put("display/"+asset,new byte[]{1,2,3},"image/jpeg");
        return new UUID[]{photo,asset};
    }
}
