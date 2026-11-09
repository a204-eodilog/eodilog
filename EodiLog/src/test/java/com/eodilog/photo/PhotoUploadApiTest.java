package com.eodilog.photo;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.asset.*;
import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.job.JobWorker;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest @AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, PhotoUploadApiTest.StorageConfiguration.class})
class PhotoUploadApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @Autowired FakeStorage storage;
    @Autowired Clock clock;
    @Autowired TransactionTemplate transactions;
    @Autowired JobWorker worker;
    @Autowired AssetProperties assetProperties;
    @Autowired com.eodilog.trip.service.TripDeleteJobHandler tripDeleteHandler;
    UUID owner, friend, outsider, trip, member;
    byte[] png;

    @TestConfiguration static class StorageConfiguration {
        @Bean @Primary FakeStorage photoTestStorage() { return new FakeStorage(); }
    }
    static class FakeStorage implements ObjectStorage {
        final Map<String, byte[]> objects = new ConcurrentHashMap<>();
        volatile boolean failDelete;
        final Set<String> failedDeleteKeys = ConcurrentHashMap.newKeySet();
        volatile String blockedReadKey;
        volatile CountDownLatch readEntered;
        volatile CountDownLatch readReleased;
        final Map<String,Integer> deletes=new ConcurrentHashMap<>();
        final java.util.concurrent.atomic.AtomicInteger streamsOpened=new java.util.concurrent.atomic.AtomicInteger();
        final java.util.concurrent.atomic.AtomicInteger streamsClosed=new java.util.concurrent.atomic.AtomicInteger();
        public PresignedUpload presignUpload(String key, String type, long bytes, Duration ttl) {
            return new PresignedUpload("https://storage.example/"+key,"PUT",Map.of("content-type",type),Instant.now().plus(ttl));
        }
        public Optional<StoredObject> head(String key) {
            return Optional.ofNullable(objects.get(key)).map(bytes -> new StoredObject(bytes.length,"image/png"));
        }
        public java.io.InputStream open(String key) {
            streamsOpened.incrementAndGet();
            return new java.io.ByteArrayInputStream(objects.get(key)) {
                @Override public void close() throws java.io.IOException {streamsClosed.incrementAndGet();super.close();}
            };
        }
        public byte[] readPrefix(String key,int count) { return Arrays.copyOf(objects.get(key),Math.min(count,objects.get(key).length)); }
        public byte[] read(String key, long max) {
            if (key.equals(blockedReadKey)) {
                readEntered.countDown();
                try {
                    if (!readReleased.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("test read timed out");
                } catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw new IllegalStateException(ex); }
            }
            byte[] bytes = objects.get(key);
            if (bytes == null || bytes.length > max) throw new com.eodilog.global.common.error.BusinessException(AssetErrorCode.INVALID_ASSET);
            return bytes.clone();
        }
        public void write(String key, byte[] bytes, String type) { objects.put(key, bytes.clone()); }
        public void delete(String key) {
            deletes.merge(key,1,Integer::sum);
            if (failDelete || failedDeleteKeys.contains(key)) throw new com.eodilog.global.common.error.BusinessException(
                    AssetErrorCode.STORAGE_UNAVAILABLE, "storage-secret https://provider.example/?credential=storage-secret");
            objects.remove(key);
        }
    }

    @BeforeEach void setup() throws Exception {
        owner = user(); friend = user(); outsider = user();
        trip = UUID.fromString(data(mvc.perform(post("/api/v1/trips").with(authUser(owner))
                .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"사진 여행\"}"))
                .andExpect(status().isCreated())).path("id").asString());
        member = jdbc.queryForObject("select id from trip_members where trip_id=? and user_id=?", UUID.class, trip, owner);
        jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,2,now())", UUID.randomUUID(), trip, friend);
        var output = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(3, 2, BufferedImage.TYPE_INT_RGB), "png", output); png = output.toByteArray();
        storage.failDelete = false;
        storage.failedDeleteKeys.clear(); storage.blockedReadKey = null;
        storage.deletes.clear(); storage.streamsOpened.set(0);storage.streamsClosed.set(0);
    }

    @Test void captureCompletionIsPrivateAndDisplayCannotBeOverwrittenByPut() throws Exception {
        UUID id = intent(owner, null, false);
        mvc.perform(post("/api/v1/assets/{id}/complete", id).with(authUser(friend))).andExpect(status().isNotFound());
        complete(owner, id).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("READY"))
                .andExpect(jsonPath("$.data.metadata").doesNotExist());
        byte[] safe = storage.objects.get("display/" + id).clone();
        storage.objects.put("uploads/" + id, "malicious late PUT".getBytes());
        mvc.perform(get("/api/v1/assets/{id}/download", id).with(authUser(owner)))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "private, no-store"))
                .andExpect(content().contentType("image/png")).andExpect(content().bytes(safe));
        mvc.perform(get("/api/v1/assets/{id}/download", id).with(authUser(friend))).andExpect(status().isNotFound());
        complete(owner, id).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/assets/{id}", id).with(authUser(owner))).andExpect(status().isConflict());
    }

    @Test @EnabledIfEnvironmentVariable(named="IMAGE_MAGICK", matches=".+")
    void actualHeicCompletesRegistersAndDownloadsAsJpeg() throws Exception {
        byte[] heic;
        try (var stream=getClass().getResourceAsStream("/images/example.heic")) { heic=stream.readAllBytes(); }
        UUID batch=batch(owner,1,UUID.randomUUID().toString());
        String body="{\"purpose\":\"TRIP_PHOTO\",\"tripId\":\"%s\",\"batchId\":\"%s\",\"contentType\":\"image/heic\",\"byteSize\":%d}"
                .formatted(trip,batch,heic.length);
        UUID id=UUID.fromString(data(mvc.perform(post("/api/v1/assets/upload-intents").with(authUser(owner))
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated())).path("assetId").asString());
        storage.objects.put("uploads/"+id,heic);
        complete(owner,id).andExpect(status().isOk()).andExpect(jsonPath("$.data.contentType").value("image/heic"));
        register(owner,batch,id).andExpect(status().isCreated());
        byte[] downloaded=mvc.perform(get("/api/v1/assets/{id}/download",id).with(authUser(friend)))
                .andExpect(status().isOk()).andExpect(content().contentType("image/jpeg")).andReturn().getResponse().getContentAsByteArray();
        var image=ImageIO.read(new java.io.ByteArrayInputStream(downloaded));
        assertThat(image.getWidth()).isEqualTo(1280); assertThat(image.getHeight()).isEqualTo(854);
    }

    @Test void completeAndCancelSerializeToOneFinalState() throws Exception {
        UUID id=intent(owner,null,false);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var start=new CountDownLatch(1);
            var completed=executor.submit(() -> {start.await();return complete(owner,id).andReturn().getResponse().getStatus();});
            var cancelled=executor.submit(() -> {start.await();return mvc.perform(delete("/api/v1/assets/{id}",id).with(authUser(owner)))
                    .andReturn().getResponse().getStatus();});
            start.countDown();
            int completion=completed.get(15,TimeUnit.SECONDS), cancellation=cancelled.get(15,TimeUnit.SECONDS);
            if(state(id).equals("READY")) {assertThat(completion).isEqualTo(200);assertThat(cancellation).isEqualTo(409);}
            else {assertThat(state(id)).isEqualTo("CANCELLED");assertThat(completion).isEqualTo(409);assertThat(cancellation).isEqualTo(204);}
        }
    }

    @Test void rejectsMissingWrongSizeWrongFormatAndUnsupportedPolicies() throws Exception {
        UUID missing = intent(owner, null, false); storage.objects.remove("uploads/" + missing);
        complete(owner, missing).andExpect(status().isConflict());
        UUID wrongSize = intent(owner, null, false); storage.objects.put("uploads/" + wrongSize, new byte[]{1,2});
        complete(owner, wrongSize).andExpect(status().isUnprocessableEntity());
        UUID fake = intent(owner, null, false); storage.objects.put("uploads/" + fake, new byte[png.length]);
        complete(owner, fake).andExpect(status().isUnprocessableEntity());
        for (UUID id : List.of(missing, wrongSize, fake)) assertThat(state(id)).isEqualTo("PENDING");
        mvc.perform(post("/api/v1/assets/upload-intents").with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"purpose\":\"CAPTURE\",\"contentType\":\"image/heic\",\"byteSize\":10}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/assets/upload-intents").with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"purpose\":\"CAPTURE\",\"contentType\":\"image/png\",\"byteSize\":20971521}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/assets/upload-intents").with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"purpose\":\"TRIP_PHOTO\",\"tripId\":\"%s\",\"contentType\":\"image/png\",\"byteSize\":20}".formatted(trip)))
                .andExpect(status().isCreated()); // dev compatibility: unbatched TRIP_PHOTO can still be uploaded/downloaded.
    }

    @Test void cancelledAndExpiredFilesNeverCompleteAndLatePutsAreCleaned() throws Exception {
        UUID id = intent(owner, null, false);
        mvc.perform(delete("/api/v1/assets/{id}", id).with(authUser(friend))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/assets/{id}", id).with(authUser(owner))).andExpect(status().isNoContent());
        assertThat(storage.objects).doesNotContainKey("uploads/" + id);
        storage.objects.put("uploads/" + id, png); // still-live presigned PUT after cancellation
        complete(owner, id).andExpect(status().isConflict());
        expire(id);
        cleanup().clean();
        assertThat(state(id)).isEqualTo("DELETED");
        assertThat(storage.objects).doesNotContainKey("uploads/" + id);
        UUID expired = intent(owner, null, false);
        expire(expired);
        complete(owner, expired).andExpect(status().isGone());
        cleanup().clean(); assertThat(state(expired)).isEqualTo("DELETED");
    }

    @Test void registersAndPaginatesIndependentSuccessfulPhotos() throws Exception {
        UUID batch = batch(owner, 3, UUID.randomUUID().toString());
        UUID first = intent(owner, batch, true), second = intent(owner, batch, true), failed = intent(owner, batch, true);
        complete(owner, first).andExpect(status().isOk()); complete(owner, second).andExpect(status().isOk());
        storage.objects.put("uploads/" + failed, new byte[png.length]); complete(owner, failed).andExpect(status().isUnprocessableEntity());
        register(owner, batch, first).andExpect(status().isCreated()); register(owner, batch, second).andExpect(status().isCreated());
        register(owner, batch, failed).andExpect(status().isConflict());
        var page = json.readTree(mvc.perform(get("/api/v1/trips/{trip}/photos", trip).param("limit", "1").with(authUser(friend)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.page.hasNext").value(true)).andReturn().getResponse().getContentAsString());
        mvc.perform(get("/api/v1/trips/{trip}/photos", trip).param("cursor", page.path("page").path("nextCursor").asString())
                .with(authUser(friend))).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1));
        mvc.perform(get("/api/v1/assets/{id}/download", first).with(authUser(friend))).andExpect(status().isOk());
        assertThat(count("select registered_count from photo_upload_batches where id=?", batch)).isEqualTo(2);
        jdbc.update("update trip_members set status='LEFT',left_at=now() where trip_id=? and user_id=?", trip, friend);
        mvc.perform(get("/api/v1/assets/{id}/download", first).with(authUser(friend))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/trips/{trip}/photos", trip).with(authUser(outsider))).andExpect(status().isNotFound());
    }

    @Test void protectsBatchOwnershipTripExpirationAndIdempotentReplay() throws Exception {
        String key = UUID.randomUUID().toString(); UUID batch = batch(owner, 1, key);
        assertThat(batch(owner, 1, key)).isEqualTo(batch);
        mvc.perform(post("/api/v1/trips/{trip}/photo-upload-batches", trip).with(authUser(owner)).header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content("{\"fileCount\":2}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/trips/{trip}/photo-upload-batches", trip).with(authUser(owner)).header("Idempotency-Key", "too-many")
                .contentType(MediaType.APPLICATION_JSON).content("{\"fileCount\":51}"))
                .andExpect(status().isUnprocessableEntity());
        UUID asset = intent(owner, batch, true); complete(owner, asset).andExpect(status().isOk());
        UUID other = batch(friend, 1, UUID.randomUUID().toString());
        register(friend, batch, asset).andExpect(status().isNotFound());
        register(owner, other, asset).andExpect(status().isNotFound());
        var pending = intent(owner, batch, true);
        mvc.perform(get("/api/v1/assets/{id}/download", pending).with(authUser(friend))).andExpect(status().isNotFound());
        jdbc.update("update photo_upload_batches set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=?", batch);
        register(owner, batch, asset).andExpect(status().isGone());
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?", member);
        mvc.perform(post("/api/v1/trips/{trip}/photo-upload-batches", trip).with(authUser(owner)).header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content("{\"fileCount\":1}"))
                .andExpect(status().isNotFound());
        complete(owner, asset).andExpect(status().isNotFound());
    }

    @Test void registrationPreservesMetadataAndReplaysAfterBatchExpiry() throws Exception {
        UUID place=UUID.randomUUID();
        jdbc.update("insert into places(id,name,latitude,longitude,source,created_at,updated_at) values(?,'사진 장소',37.5,126.25,'MANUAL',now(),now())",place);
        UUID batch=batch(owner,2,UUID.randomUUID().toString()), asset=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());
        String body="{\"batchId\":\"%s\",\"assetId\":\"%s\",\"placeId\":\"%s\",\"capturedAt\":\"2026-11-06T12:00:00.123456789Z\"}".formatted(batch,asset,place);
        var first=data(mvc.perform(post("/api/v1/trips/{trip}/photos",trip).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.placeId").value(place.toString()))
                .andExpect(jsonPath("$.data.capturedAt").value("2026-11-06T12:00:00.123456Z")));
        jdbc.update("update photo_upload_batches set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=?",batch);
        mvc.perform(post("/api/v1/trips/{trip}/photos",trip).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.id").value(first.path("id").asString()));
        mvc.perform(get("/api/v1/trips/{trip}/photos",trip).with(authUser(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].placeId").value(place.toString()))
                .andExpect(jsonPath("$.data[0].capturedAt").value("2026-11-06T12:00:00.123456Z"));
        for(String changed:List.of(body.replace(".123456789Z", ".223456789Z"),body.replace(place.toString(),UUID.randomUUID().toString()))) {
            mvc.perform(post("/api/v1/trips/{trip}/photos",trip).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON).content(changed))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("ASSET_ALREADY_REGISTERED"));
        }
        assertThat(count("select registered_count from photo_upload_batches where id=?",batch)).isEqualTo(1);
    }

    @Test void rejectsExtremeCapturedAtAndPhotoCursorWithoutSqlOverflow() throws Exception {
        UUID batch=batch(owner,1,UUID.randomUUID().toString()), asset=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());
        for(String instant:List.of("+1000000000-12-31T23:59:59.999999999Z","-1000000000-01-01T00:00:00Z")) {
            mvc.perform(post("/api/v1/trips/{trip}/photos",trip).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"batchId\":\"%s\",\"assetId\":\"%s\",\"capturedAt\":\"%s\"}".formatted(batch,asset,instant)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
            String cursor=new com.eodilog.global.common.response.CreatedAtCursor(Instant.parse(instant),UUID.randomUUID()).encode();
            mvc.perform(get("/api/v1/trips/{trip}/photos",trip).with(authUser(owner)).param("cursor",cursor))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        }
    }

    @Test void completionCapacityRejectsWithoutWaitingAndRecoversAfterFailure() throws Exception {
        UUID first=intent(owner,null,false), second=intent(owner,null,false);
        storage.objects.put("uploads/"+first,new byte[png.length]);
        storage.blockedReadKey="uploads/"+first; storage.readEntered=new CountDownLatch(1); storage.readReleased=new CountDownLatch(1);
        try(var executor=Executors.newSingleThreadExecutor()) {
            var running=executor.submit(() -> complete(owner,first).andReturn().getResponse().getStatus());
            try {
                assertThat(storage.readEntered.await(10,TimeUnit.SECONDS)).isTrue();
                complete(owner,second).andExpect(status().isServiceUnavailable())
                        .andExpect(jsonPath("$.error.code").value("IMAGE_PROCESSOR_UNAVAILABLE"));
                assertThat(state(second)).isEqualTo("PENDING");
            } finally { storage.readReleased.countDown(); }
            assertThat(running.get(10,TimeUnit.SECONDS)).isEqualTo(422);
        } finally {storage.blockedReadKey=null;}
        complete(owner,second).andExpect(status().isOk());
    }

    @Test void sameTripCompletionRejectsCapacityBeforeWaitingForTheTripLock() throws Exception {
        UUID batch=batch(owner,2,UUID.randomUUID().toString()), first=intent(owner,batch,true), second=intent(owner,batch,true);
        storage.blockedReadKey="uploads/"+first;storage.readEntered=new CountDownLatch(1);storage.readReleased=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var running=executor.submit(()->complete(owner,first).andReturn().getResponse().getStatus());
            try {
                assertThat(storage.readEntered.await(10,TimeUnit.SECONDS)).isTrue();
                var rejected=executor.submit(()->complete(owner,second).andReturn().getResponse().getStatus());
                assertThat(rejected.get(2,TimeUnit.SECONDS)).isEqualTo(503);
                assertThat(running.isDone()).isFalse();
            } finally {storage.readReleased.countDown();}
            assertThat(running.get(10,TimeUnit.SECONDS)).isEqualTo(200);
        } finally {storage.blockedReadKey=null;}
        complete(owner,second).andExpect(status().isOk());
    }

    @Test void readyBatchedFileIsPrivateUntilRegisteredAndDownloadsStreamAndClose() throws Exception {
        UUID batch=batch(owner,1,UUID.randomUUID().toString()), asset=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());
        for(UUID user:List.of(owner,friend)) mvc.perform(get("/api/v1/assets/{id}/download",asset).with(authUser(user)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("ASSET_NOT_FOUND"));
        assertThat(storage.streamsOpened.get()).isZero();
        register(owner,batch,asset).andExpect(status().isCreated());
        byte[] display=storage.objects.get("display/"+asset);
        for(UUID user:List.of(owner,friend)) mvc.perform(get("/api/v1/assets/{id}/download",asset).with(authUser(user)))
                .andExpect(status().isOk()).andExpect(header().string("Content-Length",Integer.toString(display.length)))
                .andExpect(header().string("Cache-Control","private, no-store"))
                .andExpect(content().contentType("image/png")).andExpect(content().bytes(display));
        assertThat(storage.streamsOpened.get()).isEqualTo(2);
        assertThat(storage.streamsClosed.get()).isEqualTo(2);
    }

    @Test @EnabledIfEnvironmentVariable(named="IMAGE_MAGICK",matches=".+")
    void converterTimeoutReturns503WithoutDeletingValidPendingInput() throws Exception {
        byte[] heic;try(var source=getClass().getResourceAsStream("/images/example.heic")){heic=source.readAllBytes();}
        UUID batch=batch(owner,1,UUID.randomUUID().toString());
        UUID asset=UUID.fromString(data(mvc.perform(post("/api/v1/assets/upload-intents").with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"purpose\":\"TRIP_PHOTO\",\"tripId\":\"%s\",\"batchId\":\"%s\",\"contentType\":\"image/heic\",\"byteSize\":%d}".formatted(trip,batch,heic.length)))
                .andExpect(status().isCreated())).path("assetId").asString());
        storage.objects.put("uploads/"+asset,heic);
        Duration previous=assetProperties.getConversionTimeout();
        try {
            assetProperties.setConversionTimeout(Duration.ofNanos(1));
            complete(owner,asset).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.error.code").value("IMAGE_PROCESSOR_UNAVAILABLE"));
            assertThat(state(asset)).isEqualTo("PENDING");assertThat(storage.objects.get("uploads/"+asset)).containsExactly(heic);
        } finally {assetProperties.setConversionTimeout(previous);}
        complete(owner,asset).andExpect(status().isOk());
    }

    @Test void tripDeleteRetrySkipsEarlierCompletedObjectPairs() throws Exception {
        UUID batch=batch(owner,2,UUID.randomUUID().toString());
        UUID first=intent(owner,batch,true),second=intent(owner,batch,true);
        complete(owner,first).andExpect(status().isOk());complete(owner,second).andExpect(status().isOk());
        var ids=jdbc.query("select id from assets where trip_id=? order by id",(rs,row)->rs.getObject(1,UUID.class),trip);
        first=ids.get(0);second=ids.get(1);
        mvc.perform(delete("/api/v1/trips/{trip}",trip).with(authUser(owner)).param("expectedVersion","1")).andExpect(status().isAccepted());
        var input=json.createObjectNode().put("tripId",trip.toString()).put("reason","OWNER_DELETE");
        var submission=new com.eodilog.job.JobSubmission(owner,com.eodilog.job.JobKind.TRIP_DELETE,trip,input,null,
                new com.eodilog.job.CleanupScope(List.of(),List.of(),Instant.now()));
        var context=new com.eodilog.job.JobContext(UUID.randomUUID(),UUID.randomUUID(),1,submission);
        storage.failedDeleteKeys.add("display/"+second);
        assertThatThrownBy(()->tripDeleteHandler.execute(context)).isInstanceOf(com.eodilog.global.common.error.BusinessException.class);
        assertThat(state(first)).isEqualTo("DELETING");assertThat(state(second)).isEqualTo("READY");
        assertThat(storage.deletes.get("uploads/"+first)).isEqualTo(1);assertThat(storage.deletes.get("display/"+first)).isEqualTo(1);
        storage.failedDeleteKeys.clear();tripDeleteHandler.execute(context);
        assertThat(state(second)).isEqualTo("DELETING");
        assertThat(storage.deletes.get("uploads/"+first)).isEqualTo(1);assertThat(storage.deletes.get("display/"+first)).isEqualTo(1);
    }

    @Test void cleanupProcessesBeyondFirstHundredEvenWhenOldestDeleteFails() throws Exception {
        UUID source=intent(owner,null,false); expire(source);
        storage.failedDeleteKeys.add("uploads/"+source);
        List<UUID> ids=new ArrayList<>();
        for(int i=0;i<105;i++) {
            UUID id=UUID.randomUUID(); ids.add(id);
            jdbc.update("""
                    insert into assets(id,owner_user_id,purpose,object_key,display_key,content_type,byte_size,created_at,upload_expires_at,expires_at)
                    values(?,?,'CAPTURE',?,?,'image/png',1,now()-interval '3 days',now()-interval '2 days',now()-interval '1 day')
                    """,id,owner,"uploads/"+id,"display/"+id);
            storage.objects.put("uploads/"+id,new byte[]{1});
        }
        cleanup().clean();
        assertThat(state(source)).isEqualTo("PENDING");
        for(UUID id:ids) {assertThat(state(id)).isEqualTo("DELETED");assertThat(storage.objects).doesNotContainKey("uploads/"+id);}
    }

    @Test void cleanupRevisitsRawAndDeletionKeysForLateInFlightPutsDuringGrace() throws Exception {
        UUID ready=intent(owner,null,false); complete(owner,ready).andExpect(status().isOk());
        UUID deleting=intent(owner,null,false);
        jdbc.update("update assets set created_at=now()-interval '2 hours',upload_expires_at=now()-interval '1 hour',expires_at=now()+interval '1 hour' where id in (?,?)",ready,deleting);
        jdbc.update("update assets set status='DELETING' where id=?",deleting);
        cleanup().clean();
        assertThat(storage.objects).doesNotContainKey("uploads/"+ready).doesNotContainKey("uploads/"+deleting);
        assertThat(state(deleting)).isEqualTo("DELETING");
        storage.objects.put("uploads/"+ready,png); storage.objects.put("uploads/"+deleting,png);
        cleanup().clean();
        assertThat(storage.objects).doesNotContainKey("uploads/"+ready).doesNotContainKey("uploads/"+deleting);
        assertThat(count("select count(*) from assets where id=?",deleting)).isEqualTo(1);
        storage.objects.put("uploads/"+ready,png); storage.objects.put("uploads/"+deleting,png);
        jdbc.update("update assets set expires_at=now()-interval '1 minute',original_cleaned_at=now()-interval '2 minutes' where id in (?,?)",ready,deleting);
        cleanup().clean();
        assertThat(storage.objects).doesNotContainKey("uploads/"+ready).doesNotContainKey("uploads/"+deleting);
        assertThat(count("select count(*) from assets where id=?",deleting)).isZero();
    }

    @Test void concurrentRegistrationHasOnePhotoAndNeverExceedsBatch() throws Exception {
        UUID batch = batch(owner, 1, UUID.randomUUID().toString());
        UUID a = intent(owner, batch, true), b = intent(owner, batch, true);
        complete(owner, a).andExpect(status().isOk()); complete(owner, b).andExpect(status().isOk());
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(6)) {
            var futures = new ArrayList<Future<Integer>>();
            for (int i = 0; i < 6; i++) { final UUID selected = i < 3 ? a : b;
                futures.add(executor.submit(() -> { start.await(); return register(owner,batch,selected).andReturn().getResponse().getStatus(); }));
            }
            start.countDown();
            for (var future : futures) assertThat(future.get(15, TimeUnit.SECONDS)).isIn(201, 409);
        }
        assertThat(count("select count(*) from photos where batch_id=?", batch)).isEqualTo(1);
        assertThat(count("select registered_count from photo_upload_batches where id=?", batch)).isEqualTo(1);
        UUID registered = jdbc.queryForObject("select asset_id from photos where batch_id=?", UUID.class, batch);
        register(owner, batch, registered).andExpect(status().isCreated());
        assertThat(count("select registered_count from photo_upload_batches where id=?", batch)).isEqualTo(1);
    }

    @Test @org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
    void cleanupRetriesFailuresAndPreservesRegisteredPhotos(org.springframework.boot.test.system.CapturedOutput output) throws Exception {
        UUID batch = batch(owner, 2, UUID.randomUUID().toString());
        UUID registered = intent(owner,batch,true), abandoned = intent(owner,batch,true);
        complete(owner,registered).andExpect(status().isOk()); complete(owner,abandoned).andExpect(status().isOk());
        register(owner,batch,registered).andExpect(status().isCreated()); expire(registered); expire(abandoned);
        storage.failDelete=true; cleanup().clean();
        assertThat(output.getAll()).contains("exceptionClass=com.eodilog.global.common.error.BusinessException", "errorCode=STORAGE_UNAVAILABLE")
                .doesNotContain("storage-secret", "https://provider.example");
        assertThat(state(abandoned)).isEqualTo("READY");
        storage.failDelete=false; cleanup().clean();
        assertThat(state(abandoned)).isEqualTo("DELETED"); assertThat(state(registered)).isEqualTo("READY");
        assertThat(storage.objects).containsKey("display/"+registered).doesNotContainKey("uploads/"+registered);
    }

    @Test void tripDeletionRemovesFilesPhotosBatchesAndDefersLatePutCleanup() throws Exception {
        UUID batch=batch(owner,1,UUID.randomUUID().toString()); UUID id=intent(owner,batch,true);
        complete(owner,id).andExpect(status().isOk()); register(owner,batch,id).andExpect(status().isCreated());
        UUID job=UUID.fromString(data(mvc.perform(delete("/api/v1/trips/{trip}",trip).param("expectedVersion","1").with(authUser(owner)))
                .andExpect(status().isAccepted())).path("jobId").asString());
        mvc.perform(get("/api/v1/assets/{id}/download",id).with(authUser(owner))).andExpect(status().isNotFound());
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
        while(!"SUCCEEDED".equals(jdbc.queryForObject("select status from jobs where id=?",String.class,job)) && System.nanoTime()<deadline) {
            worker.pollOnce(); Thread.sleep(20);
        }
        assertThat(jdbc.queryForObject("select status from jobs where id=?",String.class,job)).isEqualTo("SUCCEEDED");
        assertThat(count("select count(*) from photos where trip_id=?",trip)).isZero();
        assertThat(count("select count(*) from photo_upload_batches where trip_id=?",trip)).isZero();
        assertThat(state(id)).isEqualTo("DELETING"); assertThat(storage.objects).doesNotContainKey("display/"+id);
        storage.objects.put("uploads/"+id,png); expire(id); cleanup().clean();
        assertThat(count("select count(*) from assets where id=?",id)).isZero(); assertThat(storage.objects).doesNotContainKey("uploads/"+id);
    }

    @Test void documentsNewPathsDtosAndBearerAuthentication() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/assets/upload-intents'].post.tags[0]").value("파일"))
                .andExpect(jsonPath("$.paths['/api/v1/assets/upload-intents'].post.responses['400']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/assets/upload-intents'].post.responses['422']").doesNotExist())
                .andExpect(jsonPath("$.paths['/api/v1/assets/{assetId}/complete'].post.responses['422']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/photos'].post.responses['409']").exists())
                .andExpect(jsonPath("$.components.schemas.UploadIntentRequest.properties.byteSize.description").exists())
                .andExpect(jsonPath("$.components.schemas.PhotoResponse.properties.topics").exists())
                .andExpect(jsonPath("$.security").isNotEmpty());
    }

    @Test void extensionMigrationPreservesExistingV1300AssetData() throws Exception {
        String original, extension;
        try(var source=getClass().getResourceAsStream("/db/migration/V202611061300__create_assets.sql")) {
            original=new String(source.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
        }
        try(var source=getClass().getResourceAsStream("/db/migration/V202611061400__extend_assets_and_create_photos.sql")) {
            extension=new String(source.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
        }
        transactions.executeWithoutResult(tx -> {
            String schema="asset_migration_"+UUID.randomUUID().toString().replace("-","");
            jdbc.execute("create schema "+schema); jdbc.execute("set local search_path to "+schema+",public");
            jdbc.execute("create table users(id uuid primary key,profile_asset_id uuid)");
            jdbc.execute("create table trips(id uuid primary key)"); jdbc.execute("create table trip_members(id uuid primary key)");
            jdbc.execute("create table places(id uuid primary key)");
            jdbc.execute(original); // Use the immutable deployed schema, then populate it BEFORE applying the extension.
            UUID uploader=UUID.randomUUID(); jdbc.update("insert into users(id,profile_asset_id) values(?,?)",uploader,UUID.randomUUID());
            Map<UUID,String> old=new LinkedHashMap<>();
            for(String state:List.of("PENDING","CANCELLED","READY")) {
                UUID id=UUID.randomUUID(); old.put(id,state);
                jdbc.update("insert into assets(id,owner_user_id,purpose,object_key,content_type,byte_size,status,created_at) values(?,?,'CAPTURE',?,'image/png',2048,?,now()-interval '2 days')",id,uploader,"capture/legacy/"+id,state);
            }
            jdbc.execute(extension);
            old.forEach((id,state) -> {
                assertThat(jdbc.queryForObject("select status from assets where id=?",String.class,id)).isEqualTo(state);
                assertThat(jdbc.queryForObject("select object_key from assets where id=?",String.class,id)).isEqualTo("capture/legacy/"+id);
                assertThat(jdbc.queryForObject("select display_key from assets where id=?",String.class,id)).isEqualTo("display/"+id);
                assertThat(jdbc.queryForObject("select count(*) from assets where id=? and upload_expires_at=created_at+interval '10 minutes' and expires_at=created_at+interval '24 hours' and display_content_type is null",Long.class,id)).isEqualTo(1);
            });
            tx.setRollbackOnly(); // Restore the shared database/search_path without leaving test-only schemas.
        });
    }

    @Test void legacyReadyFilesRemainUsableOnlyAfterSanitizationAndCurrentTripAccess() throws Exception {
        UUID legacy=UUID.randomUUID();
        String key="trip-photo/legacy/"+legacy;
        jdbc.update("insert into assets(id,owner_user_id,trip_id,purpose,object_key,content_type,byte_size,status,created_at,upload_expires_at,expires_at,display_key) values(?,?,?,'TRIP_PHOTO',?,'image/png',?,'READY',now()-interval '3 days',now()-interval '2 days',now()-interval '1 day',?)",legacy,owner,trip,key,png.length,"display/"+legacy);
        storage.objects.put(key,png);
        cleanup().clean(); // Historical READY original must not be discarded before its display exists.
        assertThat(storage.objects).containsKey(key);
        mvc.perform(get("/api/v1/assets/{id}/download",legacy).with(authUser(friend))).andExpect(status().isOk()).andExpect(content().contentType("image/png"));
        assertThat(jdbc.queryForObject("select display_content_type from assets where id=?",String.class,legacy)).isEqualTo("image/png");
        UUID badLegacy=UUID.randomUUID();
        jdbc.update("insert into assets(id,owner_user_id,purpose,object_key,content_type,byte_size,status,created_at,display_key) values(?,?,'CAPTURE',?,'image/png',8,'READY',now(),?)",badLegacy,owner,"capture/legacy/"+badLegacy,"display/"+badLegacy);
        storage.objects.put("capture/legacy/"+badLegacy,new byte[]{(byte)0x89,'P','N','G',13,10,26,10});
        mvc.perform(get("/api/v1/assets/{id}/download",badLegacy).with(authUser(owner))).andExpect(status().isUnprocessableEntity());
        assertThat(storage.objects).containsKey("capture/legacy/"+badLegacy);
        assertThat(state(badLegacy)).isEqualTo("READY");
        jdbc.update("update trip_members set status='LEFT',left_at=now() where trip_id=? and user_id=?",trip,owner);
        mvc.perform(get("/api/v1/assets/{id}/download",legacy).with(authUser(owner))).andExpect(status().isNotFound());
        complete(owner,legacy).andExpect(status().isNotFound());
        jdbc.update("update trips set deleted_at=now() where id=?",trip);
        mvc.perform(get("/api/v1/assets/{id}/download",legacy).with(authUser(friend))).andExpect(status().isNotFound());
    }

    UUID user() { UUID id=UUID.randomUUID(); jdbc.update("insert into users(id,nickname,profile_completed,created_at,updated_at) values(?,'사진 사용자',true,now(),now())",id); return id; }
    UUID batch(UUID user,int count,String key) throws Exception {
        return UUID.fromString(data(mvc.perform(post("/api/v1/trips/{trip}/photo-upload-batches",trip).with(authUser(user))
                .header("Idempotency-Key",key).contentType(MediaType.APPLICATION_JSON).content("{\"fileCount\":"+count+"}"))
                .andExpect(status().isCreated())).path("id").asString());
    }
    UUID intent(UUID user,UUID batch,boolean photo) throws Exception {
        String body="{\"purpose\":\""+(photo?"TRIP_PHOTO":"CAPTURE")+"\",\"contentType\":\"image/png\",\"byteSize\":"+png.length
                +(photo?",\"tripId\":\""+trip+"\",\"batchId\":\""+batch+"\"":"")+"}";
        UUID id=UUID.fromString(data(mvc.perform(post("/api/v1/assets/upload-intents").with(authUser(user)).contentType(MediaType.APPLICATION_JSON)
                .content(body)).andExpect(status().isCreated())).path("assetId").asString());
        storage.objects.put("uploads/"+id,png); return id;
    }
    ResultActions complete(UUID user,UUID id) throws Exception { return mvc.perform(post("/api/v1/assets/{id}/complete",id).with(authUser(user))); }
    ResultActions register(UUID user,UUID batch,UUID asset) throws Exception { return mvc.perform(post("/api/v1/trips/{trip}/photos",trip).with(authUser(user))
            .contentType(MediaType.APPLICATION_JSON).content("{\"batchId\":\"%s\",\"assetId\":\"%s\"}".formatted(batch,asset))); }
    JsonNode data(ResultActions result) throws Exception { return json.readTree(result.andReturn().getResponse().getContentAsString()).path("data"); }
    String state(UUID id) { return jdbc.queryForObject("select status from assets where id=?",String.class,id); }
    long count(String sql,Object... args) { return jdbc.queryForObject(sql,Long.class,args); }
    void expire(UUID id) { jdbc.update("update assets set created_at=now()-interval '3 days',upload_expires_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=?",id); }
    AssetCleanup cleanup() { return new AssetCleanup(jdbc,storage,clock,transactions); }
}
