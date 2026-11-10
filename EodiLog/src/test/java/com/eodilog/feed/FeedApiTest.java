package com.eodilog.feed;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.*;
import com.eodilog.job.JobWorker;
import java.util.*;
import java.util.concurrent.*;
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
class FeedApiTest {
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
    @Test void unpublishedGetDoesNotCreateAndEmptyBodyPublishesFullContract() throws Exception {
        own(user).andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
        assertThat(count("select count(*) from feeds where trip_id=?",trip)).isZero();
        JsonNode feed=body(publish(user).andExpect(status().isCreated()));
        for(String field:List.of("id","tripId","title","body","publishedAt","coverPhotoId","regions","startDate","endDate","photos","places","publicItinerary","publicReviews","expenseSummary","likedByMe","likeCount","version","visibility")) assertThat(feed.has(field)).as(field).isTrue();
        assertThat(feed.path("body").asString()).isEmpty();
        assertThat(feed.path("visibility").path("version").asInt()).isEqualTo(1);
        publish(other).andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(feed.path("id").asString()));
        assertThat(count("select count(*) from feeds where trip_id=? and deleted_at is null",trip)).isEqualTo(1);
        assertThat(count("select count(*) from events where trip_id=?",trip)).isZero();
    }
    @Test void concurrentMembersConvergeToOnePublication() throws Exception {
        CountDownLatch start=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var a=executor.submit(()->{start.await();return publish(user).andReturn();});
            var b=executor.submit(()->{start.await();return publish(other).andReturn();});
            start.countDown();
            var first=a.get(30,TimeUnit.SECONDS); var second=b.get(30,TimeUnit.SECONDS);
            assertThat(List.of(first.getResponse().getStatus(),second.getResponse().getStatus())).containsExactlyInAnyOrder(201,200);
            assertThat(json.readTree(first.getResponse().getContentAsString()).path("data").path("id").asString()).isEqualTo(json.readTree(second.getResponse().getContentAsString()).path("data").path("id").asString());
        }
        assertThat(count("select count(*) from feeds where trip_id=?",trip)).isEqualTo(1);
    }
    @Test void publicSnapshotIncludesOriginalsWithoutPrivateSettlementOrVisibility() throws Exception {
        UUID place=place(); UUID[] photo=photo(place);
        UUID review=review(place);
        jdbc.update("insert into itinerary_items(id,itinerary_id,place_id,day,sequence) values(?,?,?,1,1)",UUID.randomUUID(),itinerary,place);
        jdbc.update("insert into expenses(id,trip_id,registered_by_member_id,payer_member_id,title,amount_minor,spent_at,created_at,updated_at) values(?,?,?,?,'private expense',123,now(),now(),now())",UUID.randomUUID(),trip,member,member);
        jdbc.update("update users set account_visibility='PRIVATE' where id=?",other);
        UUID id=id(publish(user));
        publicFeed(id).andExpect(status().isOk()).andExpect(jsonPath("$.data.photos[0].id").value(photo[0].toString()))
            .andExpect(jsonPath("$.data.photos[0].imageUrl").value("/api/v1/assets/"+photo[1]+"/download?feedId="+id))
            .andExpect(jsonPath("$.data.places[0].id").value(place.toString()))
            .andExpect(jsonPath("$.data.publicItinerary.items[0].place.id").value(place.toString()))
            .andExpect(jsonPath("$.data.publicItinerary.updatedByMemberId").doesNotExist())
            .andExpect(jsonPath("$.data.publicItinerary.version").doesNotExist())
            .andExpect(jsonPath("$.data.publicReviews[0].id").value(review.toString()))
            .andExpect(jsonPath("$.data.expenseSummary.totalAmountMinor").value(123))
            .andExpect(jsonPath("$.data.expenses").doesNotExist()).andExpect(jsonPath("$.data.settlement").doesNotExist())
            .andExpect(jsonPath("$.data.visibility").doesNotExist());
        jdbc.update("update reviews set body='edited' where id=?",review);
        jdbc.update("update places set name='edited' where id=?",place);
        publicFeed(id).andExpect(jsonPath("$.data.publicReviews[0].body").value("original review"))
            .andExpect(jsonPath("$.data.places[0].name").value("Place"));
        jdbc.update("delete from reviews where id=?",review);
        jdbc.update("update photos set deleted_at=now() where id=?",photo[0]);
        publicFeed(id).andExpect(jsonPath("$.data.publicReviews").isEmpty()).andExpect(jsonPath("$.data.photos").isEmpty()).andExpect(jsonPath("$.data.coverPhotoId").isEmpty());
        download(photo[1],id).andExpect(status().isNotFound());
    }
    @Test void visibilityIsIndependentAndOnlyChangesRequestersSettings() throws Exception {
        UUID id=id(publish(user));
        visibility(user,id,1,List.of(viewer)).andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(2));
        visibility(other,id,1,List.of(user)).andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(2));
        visibility(user,id,1,List.of()).andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
        own(user).andExpect(jsonPath("$.data.visibility.hiddenViewerUserIds[0]").value(viewer.toString())).andExpect(jsonPath("$.data.version").value(1));
        own(other).andExpect(jsonPath("$.data.visibility.hiddenViewerUserIds[0]").value(user.toString()));
        publicFeed(id).andExpect(status().isOk()).andExpect(jsonPath("$.data.visibility").doesNotExist());
        mvc.perform(put("/api/v1/feeds/{id}/visibility/me",id).with(authUser(user)).contentType(MediaType.APPLICATION_JSON).content("{\"hiddenViewerUserIds\":[],\"expectedVersion\":2,\"userId\":\""+other+"\"}")).andExpect(status().isBadRequest());
    }
    @Test void stalePatchAndDeleteKeepStateAndRepostingGetsFreshIdAndSettings() throws Exception {
        UUID place=place(); UUID[] photo=photo(place); UUID review=review(place);
        UUID id=id(publish(user));
        visibility(user,id,1,List.of(viewer)).andExpect(status().isOk());
        patchFeed(id,"{\"title\":\"New\",\"body\":\"\",\"expectedVersion\":1}").andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(2));
        patchFeed(id,"{\"title\":\"Stale\",\"expectedVersion\":1}").andExpect(status().isConflict());
        remove(id,1).andExpect(status().isConflict());
        publicFeed(id).andExpect(jsonPath("$.data.title").value("New"));
        remove(id,2).andExpect(status().isNoContent());
        publicFeed(id).andExpect(status().isNotFound()); own(user).andExpect(jsonPath("$.data").isEmpty());
        download(photo[1],id).andExpect(status().isNotFound());
        assertThat(count("select count(*) from photos where id=? and deleted_at is null",photo[0])).isEqualTo(1);
        assertThat(count("select count(*) from reviews where id=?",review)).isEqualTo(1);
        assertThat(count("select count(*) from notifications n join events e on e.id=n.event_id where e.trip_id=? and e.type='FEED_DELETED'",trip)).isEqualTo(1);
        UUID fresh=id(publish(other).andExpect(status().isCreated())); assertThat(fresh).isNotEqualTo(id);
        own(user).andExpect(jsonPath("$.data.visibility.version").value(1)).andExpect(jsonPath("$.data.visibility.hiddenViewerUserIds").isEmpty());
        publicFeed(id).andExpect(status().isNotFound());
        download(photo[1],fresh).andExpect(status().isOk());
        timeline(fresh);
    }
    @Test void downloadOnlyAdmitsLiveIncludedReadyPhotosAndKeepsInternalRoute() throws Exception {
        UUID[] photo=photo(place()); UUID id=id(publish(user));
        var response=download(photo[1],id).andExpect(status().isOk()).andExpect(header().string("Cache-Control","private, no-store")).andReturn().getResponse();
        assertThat(response.getContentAsByteArray()).containsExactly(1,2,3);
        visibility(user,id,1,List.of(viewer)).andExpect(status().isOk()); download(photo[1],id).andExpect(status().isOk());
        mvc.perform(get("/api/v1/assets/{id}/download",photo[1]).with(authUser(user))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/assets/{id}/download",photo[1]).with(authUser(viewer))).andExpect(status().isNotFound());
        download(photo[1],UUID.randomUUID()).andExpect(status().isNotFound());
        UUID[] later=photo(null); download(later[1],id).andExpect(status().isNotFound());
        jdbc.update("update assets set status='PENDING' where id=?",photo[1]); download(photo[1],id).andExpect(status().isNotFound());
        jdbc.update("update assets set status='READY',deleted_at=now() where id=?",photo[1]); download(photo[1],id).andExpect(status().isNotFound());
        jdbc.update("update assets set deleted_at=null where id=?",photo[1]);
        UUID elsewhere=UUID.randomUUID();
        jdbc.update("insert into trips(id,owner_user_id,title,created_at,updated_at) values(?,?,'Elsewhere',now(),now())",elsewhere,user);
        jdbc.update("update photos set trip_id=? where id=?",elsewhere,photo[0]);
        download(photo[1],id).andExpect(status().isNotFound());
        publicFeed(id).andExpect(jsonPath("$.data.photos").isEmpty());
    }
    @Test void leftMemberLosesOwnRoutesButDirectFeedRemainsAndDeletedTripHidesEverything() throws Exception {
        UUID[] photo=photo(null);UUID id=id(publish(user));
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?",otherMember);
        own(other).andExpect(status().isNotFound());
        publish(other).andExpect(status().isNotFound());
        visibility(other,id,1,List.of()).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/feeds").with(authUser(other))).andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(get("/api/v1/feeds/{id}",id).with(authUser(other))).andExpect(status().isOk());
        jdbc.update("update trips set deleted_at=now() where id=?",trip);
        publicFeed(id).andExpect(status().isNotFound()); download(photo[1],id).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/feeds").with(authUser(user))).andExpect(jsonPath("$.data").isEmpty());
    }
    @Test void legacyReadyPhotoSanitizesOnPublicDownloadWithoutInternalMembership() throws Exception {
        UUID[] photo=photo(null);
        var pixels=new java.awt.image.BufferedImage(2,2,java.awt.image.BufferedImage.TYPE_INT_RGB);
        var bytes=new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(pixels,"png",bytes);
        storage.put("original/"+photo[1],bytes.toByteArray(),"image/png");
        jdbc.update("update assets set content_type='image/png',display_content_type=null,byte_size=? where id=?",bytes.size(),photo[1]);
        UUID id=id(publish(user));
        download(photo[1],id).andExpect(status().isOk()).andExpect(content().contentType("image/png"));
        assertThat(jdbc.queryForObject("select display_content_type from assets where id=?",String.class,photo[1])).isEqualTo("image/png");
    }
    @Test void ownFeedPaginationDoesNotIncludeOtherMembersRoutes() throws Exception {
        UUID first=id(publish(user));
        UUID secondTrip=UUID.randomUUID(),secondMember=UUID.randomUUID(),secondItinerary=UUID.randomUUID();
        jdbc.update("insert into trips(id,owner_user_id,title,created_at,updated_at) values(?,?,'Second',now(),now())",secondTrip,user);
        jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,1,now())",secondMember,secondTrip,user);
        jdbc.update("insert into itineraries(id,trip_id,updated_by_member_id,updated_at) values(?,?,?,now())",secondItinerary,secondTrip,secondMember);
        mvc.perform(post("/api/v1/trips/{id}/feed",secondTrip).with(authUser(user)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Second\",\"body\":\"\"}")).andExpect(status().isCreated());
        var page=json.readTree(mvc.perform(get("/api/v1/me/feeds").with(authUser(user)).param("limit","1")).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1)).andExpect(jsonPath("$.page.hasNext").value(true)).andReturn().getResponse().getContentAsString());
        mvc.perform(get("/api/v1/me/feeds").with(authUser(user)).param("limit","1").param("cursor",page.path("page").path("nextCursor").asString()))
                .andExpect(jsonPath("$.data[0].id").value(first.toString())).andExpect(jsonPath("$.page.hasNext").value(false));
        mvc.perform(get("/api/v1/me/feeds").with(authUser(other))).andExpect(jsonPath("$.data.length()").value(1));
        mvc.perform(get("/api/v1/me/feeds").with(authUser(viewer))).andExpect(jsonPath("$.data").isEmpty());
    }
    @Test void invalidInputsAndAnonymousRequestsAreRejected() throws Exception {
        for(String request:List.of("{}","{\"title\":\"\",\"body\":\"\"}","{\"title\":\"a\",\"body\":null}","{\"title\":null,\"body\":\"\"}"))
            mvc.perform(post("/api/v1/trips/{id}/feed",trip).with(authUser(user)).contentType(MediaType.APPLICATION_JSON).content(request)).andExpect(status().isBadRequest());
        UUID id=id(publish(user));
        for(String request:List.of("{\"title\":null,\"expectedVersion\":1}","{\"body\":null,\"expectedVersion\":1}","{\"title\":\"  \",\"expectedVersion\":1}","{\"body\":\"x\"}")) patchFeed(id,request).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/feeds/{id}",id)).andExpect(status().isUnauthorized());
        own(viewer).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/feeds").with(authUser(user)).param("cursor","bad")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/me/feeds").with(authUser(user)).param("limit","101")).andExpect(status().isBadRequest());
    }
    @Test void documentsAuthenticatedFullContracts() throws Exception {
        var docs=json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for(var path:List.of("/api/v1/feeds/{feedId}","/api/v1/me/feeds","/api/v1/trips/{tripId}/feed","/api/v1/feeds/{feedId}/visibility/me")) {
            assertThat(docs.path("paths").has(path)).isTrue();
        }
        var schemas=docs.path("components").path("schemas");
        assertThat(schemas.path("OwnFeed").path("properties").has("visibility")).isTrue();
        assertThat(schemas.path("Feed").path("properties").has("visibility")).isFalse();
        for(String field:List.of("photos","places","publicItinerary","publicReviews","expenseSummary","version")) assertThat(schemas.path("Feed").path("properties").has(field)).isTrue();
    }
    @Test void tripDeleteJobCleansFeedForeignKeysAndNotificationSettingsAreHonored() throws Exception {
        photo(null);
        UUID id=id(publish(user)); visibility(user,id,1,List.of(viewer)).andExpect(status().isOk());
        jdbc.update("insert into user_settings(user_id,trip_changes_enabled) values(?,false)",other);
        remove(id,1).andExpect(status().isNoContent());
        assertThat(count("select count(*) from notifications n join events e on e.id=n.event_id where e.trip_id=? and e.type='FEED_DELETED'",trip)).isZero();
        id(publish(user));
        var result=body(mvc.perform(delete("/api/v1/trips/{id}",trip).with(authUser(user)).param("expectedVersion","1")).andExpect(status().isAccepted()));
        UUID job=UUID.fromString(result.path("jobId").asString());
        for(int n=0;n<30;n++) {
            worker.pollOnce();
            if("SUCCEEDED".equals(jdbc.queryForObject("select status from jobs where id=?",String.class,job))) break;
            Thread.sleep(100);
        }
        assertThat(jdbc.queryForObject("select status from jobs where id=?",String.class,job)).isEqualTo("SUCCEEDED");
        assertThat(count("select count(*) from feeds where trip_id=?",trip)).isZero();
    }
    private ResultActions own(UUID who)throws Exception{return mvc.perform(get("/api/v1/trips/{id}/feed",trip).with(authUser(who)));}
    private ResultActions publish(UUID who)throws Exception{return mvc.perform(post("/api/v1/trips/{id}/feed",trip).with(authUser(who)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Trip\",\"body\":\"\"}"));}
    private ResultActions publicFeed(UUID id)throws Exception{return mvc.perform(get("/api/v1/feeds/{id}",id).with(authUser(viewer)));}
    private ResultActions patchFeed(UUID id,String request)throws Exception{return mvc.perform(patch("/api/v1/feeds/{id}",id).with(authUser(user)).contentType(MediaType.APPLICATION_JSON).content(request));}
    private ResultActions remove(UUID id,long version)throws Exception{return mvc.perform(delete("/api/v1/feeds/{id}",id).with(authUser(user)).param("expectedVersion",Long.toString(version)));}
    private ResultActions visibility(UUID who,UUID id,long version,List<UUID> ids)throws Exception{return mvc.perform(put("/api/v1/feeds/{id}/visibility/me",id).with(authUser(who)).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("expectedVersion",version,"hiddenViewerUserIds",ids))));}
    private ResultActions download(UUID asset,UUID feed)throws Exception{return mvc.perform(get("/api/v1/assets/{id}/download",asset).with(authUser(viewer)).param("feedId",feed.toString()));}
    private JsonNode body(ResultActions result)throws Exception{return json.readTree(result.andReturn().getResponse().getContentAsString()).path("data");}
    private UUID id(ResultActions result)throws Exception{return UUID.fromString(body(result).path("id").asString());}
    private void timeline(UUID feed)throws Exception{mvc.perform(get("/api/v1/me/timeline").with(authUser(user))).andExpect(jsonPath("$.data[0].feedId").value(feed.toString()));}
    private long count(String sql,UUID id){return jdbc.queryForObject(sql,Long.class,id);}
    private UUID user(){UUID id=UUID.randomUUID();jdbc.update("insert into users(id,nickname,profile_completed,created_at,updated_at) values(?,'feed',true,now(),now())",id);return id;}
    private UUID place(){UUID id=UUID.randomUUID();jdbc.update("insert into places(id,name,latitude,longitude,source,created_at,updated_at) values(?,'Place',37,127,'MANUAL',now(),now())",id);return id;}
    private UUID review(UUID place){UUID visit=UUID.randomUUID(),id=UUID.randomUUID();jdbc.update("insert into visits(id,trip_id,member_id,place_id,visited_at,created_at) values(?,?,?,?,now(),now())",visit,trip,member,place);jdbc.update("insert into reviews(id,visit_id,score,body,created_at,updated_at) values(?,?,5,'original review',now(),now())",id,visit);return id;}
    private UUID[] photo(UUID place){
        UUID batch=UUID.randomUUID(),asset=UUID.randomUUID(),photo=UUID.randomUUID();
        jdbc.update("insert into photo_upload_batches(id,trip_id,created_by_member_id,file_count,created_at,expires_at) values(?,?,?,1,now(),now()+interval '1 hour')",batch,trip,member);
        jdbc.update("insert into assets(id,owner_user_id,trip_id,purpose,object_key,display_key,content_type,display_content_type,byte_size,status,created_at) values(?,?,?,'TRIP_PHOTO',?,?,'image/jpeg','image/jpeg',3,'READY',now())",asset,user,trip,"original/"+asset,"display/"+asset);
        jdbc.update("insert into photos(id,batch_id,trip_id,uploader_member_id,asset_id,place_id,created_at) values(?,?,?,?,?,?,now())",photo,batch,trip,member,asset,place);
        storage.put("display/"+asset,new byte[]{1,2,3},"image/jpeg");
        return new UUID[]{photo,asset};
    }
}
