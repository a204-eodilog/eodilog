package com.eodilog.photo;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.InMemoryObjectStorage;
import com.eodilog.global.storage.InMemoryStorageConfiguration;
import com.eodilog.job.CleanupScope;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import com.eodilog.trip.service.TripDeleteJobHandler;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest @AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, InMemoryStorageConfiguration.class})
class PhotoBatchWriteApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @Autowired TransactionTemplate transactions;
    @Autowired TripDeleteJobHandler tripDeleteHandler;
    @Autowired InMemoryObjectStorage storage;
    UUID owner, friend, trip, other, ownerMember, friendMember, ownerOtherMember, place;

    @BeforeEach void setup() throws Exception {
        owner = user(); friend = user();
        trip = createTrip(owner); other = createTrip(owner);
        ownerMember = membership(trip, owner); ownerOtherMember = membership(other, owner);
        friendMember = UUID.randomUUID();
        jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,2,now())", friendMember, trip, friend);
        place = UUID.randomUUID();
        jdbc.update("insert into places(id,name,latitude,longitude,source,created_at,updated_at) values(?,'일괄 장소',37.5,126.25,'MANUAL',now(),now())", place);
    }

    @Test void updateAppliesManualEditsToEveryPhotoAndKeepsOmittedFields() throws Exception {
        UUID first = photo(trip, ownerMember, owner), second = photo(trip, ownerMember, owner);
        jdbc.update("insert into photo_topics(photo_id,topic,source) values(?,'FOOD','AI')", second);
        var data = data(batch(owner, trip, body("UPDATE", ordered(first, 1L, second, 1L), "\"placeId\":\"%s\"".formatted(place)))
                .andExpect(status().isOk()));
        assertThat(data.path("deletedPhotoIds").isEmpty()).isTrue();
        assertThat(data.path("photos").size()).isEqualTo(2);
        for (JsonNode p : data.path("photos")) {
            assertThat(p.path("placeId").asString()).isEqualTo(place.toString());
            assertThat(p.path("version").asLong()).isEqualTo(2);
        }
        assertThat(data.path("photos").get(1).path("topics").get(0).asString()).isEqualTo("FOOD");
        batch(owner, trip, body("UPDATE", ordered(first, 2L, second, 2L), "\"placeId\":null,\"topics\":[\"PEOPLE\",\"OTHER\"]"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.photos[0].placeId").isEmpty())
                .andExpect(jsonPath("$.data.photos[1].topics.length()").value(2));
        assertThat(count("select count(*) from photos where id in (?,?) and version=3 and place_manually_edited and topics_manually_edited", first, second)).isEqualTo(2);
        assertThat(count("select count(*) from photo_topics where photo_id in (?,?) and source='MANUAL'", first, second)).isEqualTo(4);
    }

    @Test void oneInvalidPhotoRejectsTheWholeBatchWithTheSingleApiError() throws Exception {
        UUID mine = photo(trip, ownerMember, owner), stale = photo(trip, ownerMember, owner);
        UUID friends = photo(trip, friendMember, friend), elsewhere = photo(other, ownerOtherMember, owner), deleted = photo(trip, ownerMember, owner);
        jdbc.update("update photos set deleted_at=now() where id=?", deleted);
        jdbc.update("update photos set version=2 where id=?", stale);
        for (String action : List.of("UPDATE", "UNGROUP", "DELETE")) {
            String extra = action.equals("UPDATE") ? "\"topics\":[\"FOOD\"]" : null;
            batch(owner, trip, body(action, ordered(mine, 1L, stale, 1L), extra))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
            for (UUID missing : List.of(friends, elsewhere, deleted, UUID.randomUUID()))
                batch(owner, trip, body(action, ordered(mine, 1L, missing, 1L), extra))
                        .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("PHOTO_NOT_FOUND"));
        }
        batch(owner, trip, body("UPDATE", ordered(mine, 1L), "\"placeId\":\"%s\"".formatted(UUID.randomUUID()))).andExpect(status().isBadRequest());
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?", ownerMember);
        batch(owner, trip, body("UNGROUP", ordered(mine, 1L), null))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
        assertThat(count("select count(*) from photos where id=? and version=1 and deleted_at is null and not topics_manually_edited", mine)).isEqualTo(1);
        assertThat(count("select count(*) from photos where id=? and version=2 and deleted_at is null", stale)).isEqualTo(1);
        assertThat(count("select count(*) from photo_topics where photo_id in (?,?)", mine, stale)).isZero();
        assertThat(count("select count(*) from jobs where kind='PHOTO_DELETE' and trip_id=?", trip)).isZero();
        assertThat(count("select count(*) from photo_delete_requests where trip_id=?", trip)).isZero();
        assertThat(count("select count(*) from assets a join photos p on p.asset_id=a.id where p.id in (?,?) and a.status='READY'", mine, stale)).isEqualTo(2);
    }

    @Test void ungroupClearsGroupsAndOnlyBumpsGroupedPhotos() throws Exception {
        UUID grouped = photo(trip, ownerMember, owner), loose = photo(trip, ownerMember, owner);
        UUID group = group(trip, owner);
        jdbc.update("update photos set group_id=? where id=?", group, grouped);
        batch(owner, trip, body("UNGROUP", ordered(grouped, 1L, loose, 1L), null)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.photos[0].groupId").isEmpty()).andExpect(jsonPath("$.data.photos[0].version").value(2))
                .andExpect(jsonPath("$.data.photos[1].version").value(1));
        mvc.perform(get("/api/v1/trips/{trip}/photos", trip).param("groupId", group.toString()).with(authUser(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
    }

    @Test void moveRehomesPhotosKeepsUploadBatchAndBothTripDeletionsSucceed() throws Exception {
        UUID source = newBatch(trip, ownerMember, 3);
        UUID first = photo(trip, ownerMember, owner, source), second = photo(trip, ownerMember, owner, source), stays = photo(trip, ownerMember, owner, source);
        UUID group = group(trip, owner);
        jdbc.update("update photos set group_id=?, place_id=? where id=?", group, place, first);
        jdbc.update("insert into photo_topics(photo_id,topic,source) values(?,'FOOD','MANUAL')", first);
        String target = "\"targetTripId\":\"%s\"".formatted(other);
        batch(owner, trip, body("MOVE", ordered(first, 1L, second, 1L), target)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.photos[0].tripId").value(other.toString()))
                .andExpect(jsonPath("$.data.photos[0].batchId").value(source.toString()))
                .andExpect(jsonPath("$.data.photos[0].uploaderMemberId").value(ownerOtherMember.toString()))
                .andExpect(jsonPath("$.data.photos[0].groupId").isEmpty())
                .andExpect(jsonPath("$.data.photos[0].placeId").value(place.toString()))
                .andExpect(jsonPath("$.data.photos[0].topics[0]").value("FOOD"))
                .andExpect(jsonPath("$.data.photos[0].version").value(2));
        assertThat(count("select count(*) from assets a join photos p on p.asset_id=a.id where p.id in (?,?) and a.trip_id=? and a.upload_batch_id=? and p.batch_id=?",
                first, second, other, source, source)).isEqualTo(2);
        mvc.perform(get("/api/v1/trips/{trip}/photos", other).with(authUser(owner))).andExpect(jsonPath("$.data.length()").value(2));
        mvc.perform(get("/api/v1/trips/{trip}/photos", trip).with(authUser(friend)))
                .andExpect(jsonPath("$.data.length()").value(1)).andExpect(jsonPath("$.data[0].id").value(stays.toString()));
        // The moved photos are now addressed through the target trip only.
        batch(owner, trip, body("UNGROUP", ordered(first, 2L), null)).andExpect(status().isNotFound());
        batch(owner, other, body("UNGROUP", ordered(first, 2L), null)).andExpect(status().isOk());
        // Registration replay: the original batch now resolves only through the photo's current trip.
        UUID secondAsset = jdbc.queryForObject("select asset_id from photos where id=?", UUID.class, second);
        register(owner, trip, source, secondAsset).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("ASSET_NOT_FOUND"));
        register(owner, other, source, secondAsset).andExpect(status().isCreated()).andExpect(jsonPath("$.data.id").value(second.toString()));
        // Source trip deletion keeps the batch the moved photos still reference, without its membership.
        deleteTrip(trip);
        assertThat(count("select count(*) from photos where trip_id=?", trip)).isZero();
        assertThat(count("select count(*) from trip_members where trip_id=?", trip)).isZero();
        assertThat(count("select count(*) from photo_upload_batches where id=? and created_by_member_id is null", source)).isEqualTo(1);
        assertThat(count("select count(*) from photos where trip_id=? and deleted_at is null", other)).isEqualTo(2);
        mvc.perform(get("/api/v1/trips/{trip}/photos", other).with(authUser(owner))).andExpect(jsonPath("$.data.length()").value(2));
        // Target trip deletion then removes the moved photos and the now unreferenced source batch.
        deleteTrip(other);
        assertThat(count("select count(*) from photos where id in (?,?)", first, second)).isZero();
        assertThat(count("select count(*) from photo_upload_batches where id=?", source)).isZero();
        assertThat(count("select count(*) from assets where id=? and status='DELETING' and upload_batch_id is null", secondAsset)).isEqualTo(1);
    }

    @Test void moveRemovesPhotosFromTheSourceFeedEvenWhenMovedBack() throws Exception {
        UUID moved = photo(trip, ownerMember, owner), kept = photo(trip, ownerMember, owner), feed = UUID.randomUUID();
        jdbc.update("insert into feeds(id,trip_id,title,body,published_at,snapshot_json) values(?,?,'피드','',now(),'{}')", feed, trip);
        for (UUID p : List.of(moved, kept))
            jdbc.update("insert into feed_photos(feed_id,photo_id,asset_id) select ?,id,asset_id from photos where id=?", feed, p);
        batch(owner, trip, body("MOVE", ordered(moved, 1L), "\"targetTripId\":\"%s\"".formatted(other))).andExpect(status().isOk());
        assertThat(count("select count(*) from feed_photos where feed_id=? and photo_id=?", feed, moved)).isZero();
        assertThat(count("select count(*) from feed_photos where feed_id=? and photo_id=?", feed, kept)).isEqualTo(1);
        batch(owner, other, body("MOVE", ordered(moved, 2L), "\"targetTripId\":\"%s\"".formatted(trip))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.photos[0].tripId").value(trip.toString()));
        assertThat(count("select count(*) from feed_photos where feed_id=? and photo_id=?", feed, moved)).isZero();
    }

    @Test void movedPhotoIsNotDownloadableThroughTheSourceTrip() throws Exception {
        UUID moved = photo(trip, ownerMember, owner);
        UUID asset = jdbc.queryForObject("select asset_id from photos where id=?", UUID.class, moved);
        storage.put("display/" + asset, new byte[] {1, 2, 3}, "image/jpeg");
        download(friend, asset).andExpect(status().isOk());
        batch(owner, trip, body("MOVE", ordered(moved, 1L), "\"targetTripId\":\"%s\"".formatted(other))).andExpect(status().isOk());
        download(friend, asset).andExpect(status().isNotFound());
        download(owner, asset).andExpect(status().isOk());
    }

    @Test void downloadWaitingOnTheSourceTripLockRejectsAPhotoMovedMeanwhile() throws Exception {
        UUID moved = photo(trip, ownerMember, owner);
        UUID asset = jdbc.queryForObject("select asset_id from photos where id=?", UUID.class, moved);
        storage.put("display/" + asset, new byte[] {1, 2, 3}, "image/jpeg");
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            // Stand-in for a MOVE commit: hold the source trip lock and re-home the rows until the download waits on it.
            var mover = executor.submit(() -> transactions.executeWithoutResult(tx -> {
                jdbc.query("select id from trips where id=? for update", (rs, row) -> rs.getObject(1), trip);
                jdbc.update("update photos set trip_id=?,uploader_member_id=?,version=version+1 where id=?", other, ownerOtherMember, moved);
                jdbc.update("update assets set trip_id=? where id=?", other, asset);
                locked.countDown();
                try {
                    if (!release.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("mover not released");
                } catch (InterruptedException ex) { throw new IllegalStateException(ex); }
            }));
            assertThat(locked.await(15, TimeUnit.SECONDS)).isTrue();
            var downloaded = executor.submit(() -> download(friend, asset).andReturn().getResponse().getStatus());
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while (count("select count(*) from pg_stat_activity where wait_event_type='Lock' and state='active'") == 0
                    && System.nanoTime() < deadline) Thread.sleep(20);
            assertThat(count("select count(*) from pg_stat_activity where wait_event_type='Lock' and state='active'")).isPositive();
            release.countDown();
            mover.get(15, TimeUnit.SECONDS);
            assertThat(downloaded.get(15, TimeUnit.SECONDS)).isEqualTo(404);
        }
    }

    @Test void moveRequiresActiveMembershipInBothTripsAndChangesNothingOtherwise() throws Exception {
        UUID friends = photo(trip, friendMember, friend), mine = photo(trip, ownerMember, owner);
        batch(friend, trip, body("MOVE", ordered(friends, 1L), "\"targetTripId\":\"%s\"".formatted(other)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
        batch(owner, trip, body("MOVE", ordered(mine, 1L), "\"targetTripId\":\"%s\"".formatted(UUID.randomUUID())))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?", ownerOtherMember);
        batch(owner, trip, body("MOVE", ordered(mine, 1L), "\"targetTripId\":\"%s\"".formatted(other)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
        batch(owner, trip, body("MOVE", ordered(mine, 1L), "\"targetTripId\":\"%s\"".formatted(trip))).andExpect(status().isBadRequest());
        assertThat(count("select count(*) from photos where trip_id=? and version=1", trip)).isEqualTo(2);
        assertThat(count("select count(*) from assets where trip_id=?", trip)).isEqualTo(2);
    }

    @Test void deleteUsesTheSingleDeleteApprovalForEveryPhoto() throws Exception {
        UUID first = photo(trip, ownerMember, owner), second = photo(trip, ownerMember, owner), kept = photo(trip, ownerMember, owner);
        batch(owner, trip, body("DELETE", ordered(second, 1L, first, 1L), null)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.photos").isEmpty())
                .andExpect(jsonPath("$.data.deletedPhotoIds[0]").value(second.toString()))
                .andExpect(jsonPath("$.data.deletedPhotoIds[1]").value(first.toString()));
        assertThat(count("select count(*) from photos where id in (?,?) and deleted_at is not null and version=2", first, second)).isEqualTo(2);
        assertThat(count("select count(*) from assets a join photos p on p.asset_id=a.id where p.id in (?,?) and a.status='DELETING'", first, second)).isEqualTo(2);
        assertThat(count("select count(*) from jobs j join photo_delete_requests r on r.job_id=j.id where r.photo_id in (?,?) and j.kind='PHOTO_DELETE' and j.trip_id=? and r.requested_by_user_id=?",
                first, second, trip, owner)).isEqualTo(2);
        UUID job = jdbc.queryForObject("select job_id from photo_delete_requests where photo_id=?", UUID.class, first);
        mvc.perform(delete("/api/v1/trips/{trip}/photos/{photo}", trip, first).with(authUser(owner)))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.data.jobId").value(job.toString()));
        mvc.perform(get("/api/v1/trips/{trip}/photos", trip).with(authUser(friend)))
                .andExpect(jsonPath("$.data.length()").value(1)).andExpect(jsonPath("$.data[0].id").value(kept.toString()));
        batch(owner, trip, body("DELETE", ordered(first, 2L), null)).andExpect(status().isNotFound());
    }

    @Test void rejectsMalformedBatchesBeforeTouchingPhotos() throws Exception {
        UUID mine = photo(trip, ownerMember, owner);
        String one = "[{\"photoId\":\"%s\",\"expectedVersion\":1}]".formatted(mine);
        for (String body : List.of("{}", "{\"photos\":" + one + "}", "{\"action\":\"UPDATE\"}",
                "{\"action\":\"UNGROUP\",\"photos\":[]}", "{\"action\":\"UNGROUP\",\"photos\":[null]}",
                "{\"action\":\"BOGUS\",\"photos\":" + one + "}",
                "{\"action\":\"UNGROUP\",\"photos\":[{\"photoId\":\"%s\"}]}".formatted(mine),
                "{\"action\":\"UNGROUP\",\"photos\":[{\"photoId\":\"%s\",\"expectedVersion\":0}]}".formatted(mine),
                "{\"action\":\"UNGROUP\",\"photos\":[{\"photoId\":\"%s\",\"expectedVersion\":\"1\"}]}".formatted(mine),
                "{\"action\":\"UNGROUP\",\"photos\":[{\"photoId\":\"%s\",\"expectedVersion\":1.5}]}".formatted(mine),
                "{\"action\":\"UNGROUP\",\"photos\":[{\"photoId\":\"%1$s\",\"expectedVersion\":1},{\"photoId\":\"%1$s\",\"expectedVersion\":1}]}".formatted(mine),
                "{\"action\":\"UPDATE\",\"photos\":" + one + "}",
                "{\"action\":\"UPDATE\",\"photos\":" + one + ",\"topics\":null}",
                "{\"action\":\"UPDATE\",\"photos\":" + one + ",\"topics\":[\"FOOD\",\"FOOD\"]}",
                "{\"action\":\"UPDATE\",\"photos\":" + one + ",\"topics\":[\"BAD\"]}",
                "{\"action\":\"UPDATE\",\"photos\":" + one + ",\"groupId\":null}",
                "{\"action\":\"UPDATE\",\"photos\":" + one + ",\"topics\":[],\"targetTripId\":\"" + other + "\"}",
                "{\"action\":\"DELETE\",\"photos\":" + one + ",\"topics\":[]}",
                "{\"action\":\"UNGROUP\",\"photos\":" + one + ",\"placeId\":null}",
                "{\"action\":\"MOVE\",\"photos\":" + one + "}",
                "{\"action\":\"MOVE\",\"photos\":" + one + ",\"targetTripId\":null}",
                "{\"action\":\"MOVE\",\"photos\":" + one + ",\"targetTripId\":\"" + other + "\",\"topics\":[]}"))
            batch(owner, trip, body).andExpect(status().isBadRequest());
        String tooMany = IntStream.range(0, 51).mapToObj(i -> "{\"photoId\":\"%s\",\"expectedVersion\":1}".formatted(UUID.randomUUID()))
                .collect(Collectors.joining(",", "[", "]"));
        batch(owner, trip, "{\"action\":\"DELETE\",\"photos\":" + tooMany + "}")
                .andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.error.code").value("INPUT_LIMIT_EXCEEDED"));
        assertThat(count("select count(*) from photos where id=? and version=1 and deleted_at is null", mine)).isEqualTo(1);
    }

    @Test void documentsBatchPathAndSchemas() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/photos/batch'].post.tags[0]").value("사진"))
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/photos/batch'].post.responses['200']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/photos/batch'].post.responses['409']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/photos/batch'].post.responses['422']").exists())
                .andExpect(jsonPath("$.components.schemas.PhotoBatchWrite.properties.action.enum").value(
                        org.hamcrest.Matchers.containsInAnyOrder("UPDATE", "MOVE", "UNGROUP", "DELETE")))
                .andExpect(jsonPath("$.components.schemas.PhotoBatchWrite.properties.photos.maxItems").value(50))
                .andExpect(jsonPath("$.components.schemas.PhotoBatchWriteResponse.properties.deletedPhotoIds").exists());
    }

    // Photo id → expected version, in request order.
    static Map<UUID, Long> ordered(Object... idVersion) {
        var map = new java.util.LinkedHashMap<UUID, Long>();
        for (int i = 0; i < idVersion.length; i += 2) map.put((UUID) idVersion[i], (Long) idVersion[i + 1]);
        return map;
    }
    String body(String action, Map<UUID, Long> photos, String extra) {
        String list = photos.entrySet().stream().map(e -> "{\"photoId\":\"%s\",\"expectedVersion\":%d}".formatted(e.getKey(), e.getValue()))
                .collect(Collectors.joining(",", "[", "]"));
        return "{\"action\":\"" + action + "\",\"photos\":" + list + (extra == null ? "" : "," + extra) + "}";
    }
    ResultActions batch(UUID user, UUID tripId, String body) throws Exception {
        return mvc.perform(post("/api/v1/trips/{trip}/photos/batch", tripId).with(authUser(user))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }
    UUID photo(UUID tripId, UUID uploader, UUID user) { return photo(tripId, uploader, user, newBatch(tripId, uploader, 1)); }
    UUID newBatch(UUID tripId, UUID creator, int size) {
        UUID batch = UUID.randomUUID();
        jdbc.update("insert into photo_upload_batches(id,trip_id,created_by_member_id,file_count,registered_count,created_at,expires_at) values(?,?,?,?,?,now(),now()+interval '1 hour')", batch, tripId, creator, size, size);
        return batch;
    }
    UUID photo(UUID tripId, UUID uploader, UUID user, UUID batch) {
        UUID asset = UUID.randomUUID(), photo = UUID.randomUUID();
        jdbc.update("insert into assets(id,owner_user_id,trip_id,upload_batch_id,purpose,object_key,display_key,content_type,display_content_type,byte_size,status,created_at) values(?,?,?,?,'TRIP_PHOTO',?,?,'image/jpeg','image/jpeg',3,'READY',now())",
                asset, user, tripId, batch, "original/" + asset, "display/" + asset);
        jdbc.update("insert into photos(id,batch_id,trip_id,uploader_member_id,asset_id,created_at) values(?,?,?,?,?,now())", photo, batch, tripId, uploader, asset);
        return photo;
    }
    ResultActions register(UUID user, UUID tripId, UUID batch, UUID asset) throws Exception {
        return mvc.perform(post("/api/v1/trips/{trip}/photos", tripId).with(authUser(user)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"batchId\":\"%s\",\"assetId\":\"%s\"}".formatted(batch, asset)));
    }
    ResultActions download(UUID user, UUID asset) throws Exception {
        return mvc.perform(get("/api/v1/assets/{id}/download", asset).with(authUser(user)));
    }
    void deleteTrip(UUID tripId) {
        jdbc.update("update trips set deleted_at=now() where id=?", tripId);
        var context = new JobContext(UUID.randomUUID(), UUID.randomUUID(), 1, new JobSubmission(owner, JobKind.TRIP_DELETE, tripId,
                json.createObjectNode().put("tripId", tripId.toString()).put("reason", "OWNER_DELETE"), null,
                new CleanupScope(List.of(), List.of(), Instant.now())));
        assertThat(tripDeleteHandler.execute(context).failure()).isNull();
        transactions.executeWithoutResult(tx -> tripDeleteHandler.complete(context, json.createObjectNode()));
    }
    UUID group(UUID tripId, UUID user) {
        UUID job = UUID.randomUUID(), group = UUID.randomUUID();
        jdbc.update("insert into jobs(id,requested_by_user_id,trip_id,kind,status,input_json,result_json,next_attempt_at,created_at,finished_at) values(?,?,?,'PHOTO_CLASSIFICATION','SUCCEEDED','{}','{}',now(),now(),now())", job, user, tripId);
        jdbc.update("insert into photo_groups(id,trip_id,source_job_id) values(?,?,?)", group, tripId, job);
        return group;
    }
    UUID createTrip(UUID user) throws Exception {
        return UUID.fromString(data(mvc.perform(post("/api/v1/trips").with(authUser(user)).header("Idempotency-Key", UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"일괄 여행\"}")).andExpect(status().isCreated())).path("id").asString());
    }
    UUID membership(UUID tripId, UUID user) { return jdbc.queryForObject("select id from trip_members where trip_id=? and user_id=?", UUID.class, tripId, user); }
    UUID user() { UUID id = UUID.randomUUID(); jdbc.update("insert into users(id,nickname,profile_completed,created_at,updated_at) values(?,'일괄 사용자',true,now(),now())", id); return id; }
    JsonNode data(ResultActions result) throws Exception { return json.readTree(result.andReturn().getResponse().getContentAsString()).path("data"); }
    long count(String sql, Object... args) { return jdbc.queryForObject(sql, Long.class, args); }
}
