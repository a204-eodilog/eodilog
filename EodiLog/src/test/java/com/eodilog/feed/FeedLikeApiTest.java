package com.eodilog.feed;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.InMemoryStorageConfiguration;
import com.eodilog.job.JobWorker;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.*;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class,InMemoryStorageConfiguration.class})
class FeedLikeApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @Autowired JobWorker worker;
    UUID member,stranger,trip,region;
    @BeforeEach void setup() {
        member=user("PUBLIC"); stranger=user("PRIVATE"); trip=UUID.randomUUID(); region=UUID.randomUUID();
        jdbc.update("insert into regions(id,code,name) values(?,?,'좋아요 지역')",region,"L"+region.toString().substring(0,12));
        jdbc.update("insert into trips(id,owner_user_id,title,created_at,updated_at) values(?,?,'Trip',now(),now())",trip,member);
        UUID memberId=UUID.randomUUID();
        jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,1,now())",memberId,trip,member);
        jdbc.update("insert into itineraries(id,trip_id,updated_by_member_id,updated_at) values(?,?,?,now())",UUID.randomUUID(),trip,memberId);
        jdbc.update("insert into trip_destinations(trip_id,region_id,display_order) values(?,?,0)",trip,region);
    }
    @Test void likeIsIdempotentPerUserAndCountsAppearInFeedOwnFeedAndCards() throws Exception {
        UUID feed=publish();
        hideFrom(feed,stranger);
        like(feed,stranger).andExpect(status().isOk()).andExpect(jsonPath("$.data.liked").value(true)).andExpect(jsonPath("$.data.count").value(1));
        like(feed,stranger).andExpect(status().isOk()).andExpect(jsonPath("$.data.count").value(1));
        like(feed,member).andExpect(jsonPath("$.data.count").value(2));
        assertThat(jdbc.queryForObject("select count(*) from feed_likes where feed_id=?",Long.class,feed)).isEqualTo(2);
        mvc.perform(get("/api/v1/feeds/{id}",feed).with(authUser(stranger))).andExpect(jsonPath("$.data.likeCount").value(2)).andExpect(jsonPath("$.data.likedByMe").value(true));
        UUID other=user("PUBLIC");
        mvc.perform(get("/api/v1/feeds/{id}",feed).with(authUser(other))).andExpect(jsonPath("$.data.likeCount").value(2)).andExpect(jsonPath("$.data.likedByMe").value(false));
        mvc.perform(get("/api/v1/trips/{id}/feed",trip).with(authUser(member))).andExpect(jsonPath("$.data.likeCount").value(2)).andExpect(jsonPath("$.data.likedByMe").value(true));
        mvc.perform(get("/api/v1/me/feeds").with(authUser(member))).andExpect(jsonPath("$.data[0].likeCount").value(2));
        mvc.perform(get("/api/v1/users/{id}/feeds",member).with(authUser(other))).andExpect(jsonPath("$.data[0].likeCount").value(2)).andExpect(jsonPath("$.data[0].likedByMe").value(false))
                .andExpect(jsonPath("$.data[0].body").doesNotExist()).andExpect(jsonPath("$.data[0].photos").doesNotExist());
        unlike(feed,stranger).andExpect(status().isNoContent());
        unlike(feed,stranger).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/feeds/{id}",feed).with(authUser(stranger))).andExpect(jsonPath("$.data.likeCount").value(1)).andExpect(jsonPath("$.data.likedByMe").value(false));
        mvc.perform(put("/api/v1/feeds/{id}/like",feed)).andExpect(status().isUnauthorized());
        like(UUID.randomUUID(),member).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FEED_NOT_FOUND"));
    }
    @Test void feedCardCoverFollowsLiveOriginal() throws Exception {
        UUID memberId=jdbc.queryForObject("select id from trip_members where trip_id=?",UUID.class,trip);
        UUID batch=UUID.randomUUID(),asset=UUID.randomUUID(),photo=UUID.randomUUID();
        jdbc.update("insert into photo_upload_batches(id,trip_id,created_by_member_id,file_count,created_at,expires_at) values(?,?,?,1,now(),now()+interval '1 hour')",batch,trip,memberId);
        jdbc.update("insert into assets(id,owner_user_id,trip_id,purpose,object_key,display_key,content_type,display_content_type,byte_size,status,created_at) values(?,?,?,'TRIP_PHOTO',?,?,'image/jpeg','image/jpeg',3,'READY',now())",asset,member,trip,"original/"+asset,"display/"+asset);
        jdbc.update("insert into photos(id,batch_id,trip_id,uploader_member_id,asset_id,created_at) values(?,?,?,?,?,now())",photo,batch,trip,memberId,asset);
        publish();
        UUID other=user("PUBLIC");
        mvc.perform(get("/api/v1/users/{id}/feeds",member).with(authUser(other))).andExpect(jsonPath("$.data[0].coverPhotoId").value(photo.toString()));
        jdbc.update("update photos set deleted_at=now() where id=?",photo);
        mvc.perform(get("/api/v1/users/{id}/feeds",member).with(authUser(other))).andExpect(jsonPath("$.data[0].coverPhotoId").isEmpty());
    }
    @Test void deletedFeedRejectsLikesAndRepublishedFeedStartsAtZero() throws Exception {
        UUID feed=publish();
        like(feed,stranger).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/feeds/{id}",feed).with(authUser(member)).param("expectedVersion","1")).andExpect(status().isNoContent());
        like(feed,stranger).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("FEED_NOT_FOUND"));
        unlike(feed,stranger).andExpect(status().isNotFound());
        UUID fresh=publish();
        assertThat(fresh).isNotEqualTo(feed);
        mvc.perform(get("/api/v1/feeds/{id}",fresh).with(authUser(stranger))).andExpect(jsonPath("$.data.likeCount").value(0)).andExpect(jsonPath("$.data.likedByMe").value(false));
        like(fresh,stranger).andExpect(jsonPath("$.data.count").value(1));
        var result=json.readTree(mvc.perform(delete("/api/v1/trips/{id}",trip).with(authUser(member)).param("expectedVersion","1")).andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString());
        UUID job=UUID.fromString(result.path("data").path("jobId").asString());
        for(int n=0;n<30 && !"SUCCEEDED".equals(jdbc.queryForObject("select status from jobs where id=?",String.class,job));n++) { worker.pollOnce(); Thread.sleep(100); }
        assertThat(jdbc.queryForObject("select status from jobs where id=?",String.class,job)).isEqualTo("SUCCEEDED");
        assertThat(jdbc.queryForObject("select count(*) from feed_likes where feed_id in (?,?)",Long.class,feed,fresh)).isZero();
    }
    private ResultActions like(UUID feed,UUID who) throws Exception { return mvc.perform(put("/api/v1/feeds/{id}/like",feed).with(authUser(who))); }
    private ResultActions unlike(UUID feed,UUID who) throws Exception { return mvc.perform(delete("/api/v1/feeds/{id}/like",feed).with(authUser(who))); }
    private void hideFrom(UUID feed,UUID viewer) throws Exception {
        mvc.perform(put("/api/v1/feeds/{id}/visibility/me",feed).with(authUser(member)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"hiddenViewerUserIds\":[\""+viewer+"\"],\"expectedVersion\":1}")).andExpect(status().isOk());
    }
    private UUID publish() throws Exception {
        var body=mvc.perform(post("/api/v1/trips/{id}/feed",trip).with(authUser(member)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Trip\",\"body\":\"\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(body).path("data").path("id").asString());
    }
    private UUID user(String visibility) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into users(id,nickname,profile_completed,account_visibility,created_at,updated_at) values(?,'like',true,?,now(),now())",id,visibility);
        return id;
    }
}
