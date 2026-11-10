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
    @Autowired PhotoDeleteJobHandler photoDeleteHandler;
    @Autowired PhotoDeleteJobAccessPolicy photoDeletePolicy;
    @Autowired ClassificationAi classificationAi;
    UUID owner, friend, outsider, trip, member;
    byte[] png;

    @TestConfiguration static class StorageConfiguration {
        @Bean @Primary FakeStorage photoTestStorage() { return new FakeStorage(); }
        @Bean @Primary ClassificationAi classificationAi(JsonMapper json) { return new ClassificationAi(json); }
    }
    static class ClassificationAi implements com.eodilog.global.ai.AiServerClient {
        final JsonMapper json;
        volatile int mode;
        volatile CountDownLatch entered, released;
        volatile boolean real;
        ClassificationAi(JsonMapper json) { this.json=json; }
        public JsonNode post(String path,UUID trace,JsonNode body) { throw new UnsupportedOperationException(); }
        public JsonNode postMultipart(String path,UUID trace,JsonNode meta,List<MultipartFile> files) {
            if(real) return new com.eodilog.global.ai.HttpAiServerClient(
                    new com.eodilog.global.ai.AiServerProperties(System.getenv("PHOTO_AI_URL"),System.getenv("PHOTO_AI_TOKEN"),Duration.ofSeconds(5),Duration.ofSeconds(50)),json)
                    .postMultipart(path,trace,meta,files);
            if(entered!=null) { entered.countDown();try {if(!released.await(15,TimeUnit.SECONDS)) throw new IllegalStateException();}catch(InterruptedException ex){throw new IllegalStateException(ex);} }
            if(mode==1) throw new com.eodilog.global.ai.AiServerException(true);
            var result=json.createObjectNode();var photos=result.putArray("photos");UUID group=UUID.randomUUID();
            for(var id:meta.path("photoIds")) {
                var p=photos.addObject().put("photoId",mode==2?UUID.randomUUID().toString():id.asString()).put("status","SUCCEEDED").putNull("errorCode");
                p.putArray("topics").add("FOOD");
                if(files.size()>1) p.put("groupId",group.toString());else p.putNull("groupId");
            }
            return result;
        }
    }
    static class FakeStorage implements ObjectStorage {
        final Map<String, byte[]> objects = new ConcurrentHashMap<>();
        volatile boolean failDelete;
        final Set<String> failedDeleteKeys = ConcurrentHashMap.newKeySet();
        final Set<String> failedHeadKeys = ConcurrentHashMap.newKeySet();
        volatile String blockedReadKey;
        volatile CountDownLatch readEntered;
        volatile CountDownLatch readReleased;
        volatile String blockedOpenKey;
        volatile CountDownLatch openEntered;
        volatile CountDownLatch openReleased;
        volatile String blockedDeleteKey;
        volatile CountDownLatch deleteEntered;
        volatile CountDownLatch deleteReleased;
        final Map<String,Integer> deletes=new ConcurrentHashMap<>();
        final java.util.concurrent.atomic.AtomicInteger streamsOpened=new java.util.concurrent.atomic.AtomicInteger();
        final java.util.concurrent.atomic.AtomicInteger streamsClosed=new java.util.concurrent.atomic.AtomicInteger();
        public PresignedUpload presignUpload(String key, String type, long bytes, Duration ttl) {
            return new PresignedUpload("https://storage.example/"+key,"PUT",Map.of("content-type",type),Instant.now().plus(ttl));
        }
        public Optional<StoredObject> head(String key) {
            if(failedHeadKeys.contains(key)) throw new com.eodilog.global.common.error.BusinessException(AssetErrorCode.STORAGE_UNAVAILABLE,"private-provider-url");
            return Optional.ofNullable(objects.get(key)).map(bytes -> new StoredObject(bytes.length,"image/png"));
        }
        public java.io.InputStream open(String key) {
            if (key.equals(blockedOpenKey)) awaitStorageLatch(openEntered,openReleased);
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
            if (key.equals(blockedDeleteKey)) awaitStorageLatch(deleteEntered,deleteReleased);
            deletes.merge(key,1,Integer::sum);
            if (failDelete || failedDeleteKeys.contains(key)) throw new com.eodilog.global.common.error.BusinessException(
                    AssetErrorCode.STORAGE_UNAVAILABLE, "storage-secret https://provider.example/?credential=storage-secret");
            objects.remove(key);
        }
        private void awaitStorageLatch(CountDownLatch entered,CountDownLatch released) {
            entered.countDown();
            try {
                if (!released.await(15,TimeUnit.SECONDS)) throw new IllegalStateException("test storage latch timed out");
            } catch(InterruptedException ex) {Thread.currentThread().interrupt();throw new IllegalStateException(ex);}
        }
    }

    @BeforeEach void setup() throws Exception {
        classificationAi.mode=0;classificationAi.entered=null;classificationAi.released=null;classificationAi.real=false;
        owner = user(); friend = user(); outsider = user();
        trip = UUID.fromString(data(mvc.perform(post("/api/v1/trips").with(authUser(owner))
                .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"사진 여행\"}"))
                .andExpect(status().isCreated())).path("id").asString());
        member = jdbc.queryForObject("select id from trip_members where trip_id=? and user_id=?", UUID.class, trip, owner);
        jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,2,now())", UUID.randomUUID(), trip, friend);
        var output = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(3, 2, BufferedImage.TYPE_INT_RGB), "png", output); png = output.toByteArray();
        storage.failDelete = false;
        storage.failedDeleteKeys.clear(); storage.blockedReadKey = null;
        storage.failedHeadKeys.clear();
        storage.blockedOpenKey=null;storage.blockedDeleteKey=null;
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
        assertThat(tripDeleteHandler.execute(context).failure()).isEqualTo(com.eodilog.job.JobFailure.TEMPORARY_FAILURE);
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
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/photos/{photoId}'].patch.responses['409']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/photos/{photoId}'].delete.responses['202']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/photo-summary'].get.tags[0]").value("사진"))
                .andExpect(jsonPath("$.components.schemas.UpdatePhotoRequest.properties.expectedVersion.description").exists())
                .andExpect(jsonPath("$.components.schemas.UpdatePhotoRequest.properties.expectedVersion.minimum").value(1))
                .andExpect(jsonPath("$.components.schemas.UpdatePhotoRequest.required").value(org.hamcrest.Matchers.hasItem("expectedVersion")))
                .andExpect(jsonPath("$.components.schemas.UpdatePhotoRequest.properties.topics.maxItems").value(4))
                .andExpect(jsonPath("$.components.schemas.UpdatePhotoRequest.properties.topics.uniqueItems").value(true))
                .andExpect(jsonPath("$.components.schemas.UpdatePhotoRequest.properties.topics.items.enum").value(org.hamcrest.Matchers.containsInAnyOrder("LANDSCAPE","FOOD","PEOPLE","OTHER")))
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/photos/{photoId}'].patch.responses['400'].description").value(org.hamcrest.Matchers.containsString("VALIDATION_ERROR")))
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

    @Test void manuallyEditsTopicsFiltersAndSummarizesWithoutLosingOmittedFields() throws Exception {
        UUID batch=batch(owner,2,UUID.randomUUID().toString()), asset=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());
        UUID photo=UUID.fromString(data(register(owner,batch,asset).andExpect(status().isCreated())).path("id").asString());
        UUID place=UUID.randomUUID();
        jdbc.update("insert into places(id,name,latitude,longitude,source,created_at,updated_at) values(?,'보정 장소',37.5,126.25,'MANUAL',now(),now())",place);
        edit(owner,photo,"{\"expectedVersion\":1,\"placeId\":\"%s\",\"topics\":[\"FOOD\",\"OTHER\"]}".formatted(place))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(2));
        edit(owner,photo,"{\"expectedVersion\":2,\"topics\":[]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.placeId").value(place.toString()))
                .andExpect(jsonPath("$.data.topics").isEmpty());
        mvc.perform(get("/api/v1/trips/{trip}/photos",trip).param("topic","FOOD").with(authUser(friend)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
        assertThat(jdbc.queryForObject("select topics_manually_edited and place_manually_edited from photos where id=?",Boolean.class,photo)).isTrue();
        edit(owner,photo,"{\"expectedVersion\":3,\"placeId\":null,\"topics\":[\"FOOD\"]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.placeId").isEmpty());
        mvc.perform(get("/api/v1/trips/{trip}/photos",trip).param("topic","FOOD").with(authUser(friend)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1)).andExpect(jsonPath("$.data[0].topics[0]").value("FOOD"));
        mvc.perform(get("/api/v1/trips/{trip}/photos",trip).param("topic","PEOPLE").with(authUser(friend)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(get("/api/v1/trips/{trip}/photo-summary",trip).with(authUser(friend)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalCount").value(1))
                .andExpect(jsonPath("$.data.unplacedCount").value(1)).andExpect(jsonPath("$.data.topics[0].count").value(1))
                .andExpect(jsonPath("$.data.groups").isEmpty());
    }

    @Test void rejectsInvalidPhotoEditsAndEnforcesOwnerMembershipAndVersion() throws Exception {
        UUID batch=batch(owner,1,UUID.randomUUID().toString()), asset=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());
        UUID photo=UUID.fromString(data(register(owner,batch,asset).andExpect(status().isCreated())).path("id").asString());
        for(String body:List.of("{}","{\"topics\":[]}","{\"expectedVersion\":1}",
                "{\"expectedVersion\":1.9,\"topics\":[]}","{\"expectedVersion\":\"1\",\"topics\":[]}",
                "{\"expectedVersion\":0,\"topics\":[]}","{\"expectedVersion\":-1,\"topics\":[]}",
                "{\"expectedVersion\":9223372036854775808,\"topics\":[]}",
                "{\"expectedVersion\":1,\"topics\":null}","{\"expectedVersion\":1,\"topics\":[null]}",
                "{\"expectedVersion\":1,\"topics\":[\"FOOD\",\"FOOD\"]}","{\"expectedVersion\":1,\"topics\":[\"BAD\"]}",
                "{\"expectedVersion\":1,\"groupId\":null}","{\"expectedVersion\":1,\"placeId\":\"%s\"}".formatted(UUID.randomUUID())))
            edit(owner,photo,body).andExpect(status().isBadRequest());
        edit(friend,photo,"{\"expectedVersion\":1,\"topics\":[]}").andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("PHOTO_NOT_FOUND"));
        edit(owner,photo,"{\"expectedVersion\":2,\"topics\":[]}").andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
        mvc.perform(get("/api/v1/trips/{trip}/photos",trip).param("topic","bad").with(authUser(owner))).andExpect(status().isBadRequest());
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?",member);
        edit(owner,photo,"{\"expectedVersion\":1,\"topics\":[]}").andExpect(status().isNotFound());
    }

    @Test void photoDeletionHidesImmediatelyRetriesFixedKeysAndReturnsReceiptAfterCompletion() throws Exception {
        UUID batch=batch(owner,2,UUID.randomUUID().toString()), asset=intent(owner,batch,true), other=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk()); complete(owner,other).andExpect(status().isOk());
        UUID photo=UUID.fromString(data(register(owner,batch,asset).andExpect(status().isCreated())).path("id").asString());
        register(owner,batch,other).andExpect(status().isCreated());
        remove(friend,photo).andExpect(status().isNotFound());
        UUID job=UUID.fromString(data(remove(owner,photo).andExpect(status().isAccepted())).path("jobId").asString());
        remove(owner,photo).andExpect(status().isAccepted()).andExpect(jsonPath("$.data.jobId").value(job.toString()));
        mvc.perform(get("/api/v1/assets/{id}/download",asset).with(authUser(friend))).andExpect(status().isNotFound());
        complete(owner,asset).andExpect(status().isConflict());register(owner,batch,asset).andExpect(status().isConflict());
        mvc.perform(get("/api/v1/trips/{trip}/photo-summary",trip).with(authUser(friend))).andExpect(jsonPath("$.data.totalCount").value(1));
        var submission=photoSubmission(job);
        assertThat(submission.cleanupScope().photoIds()).containsExactly(photo);
        assertThat(submission.cleanupScope().messageIds()).isEmpty();
        var context=new com.eodilog.job.JobContext(job,UUID.randomUUID(),1,submission);
        storage.failedDeleteKeys.add("display/"+asset);
        assertThat(photoDeleteHandler.execute(context).failure()).isEqualTo(com.eodilog.job.JobFailure.TEMPORARY_FAILURE);
        assertThat(storage.objects).containsKey("display/"+asset).containsKey("display/"+other);
        storage.failedDeleteKeys.clear();
        var outcome=photoDeleteHandler.execute(context);assertThat(outcome.failure()).isNull();
        transactions.executeWithoutResult(tx -> photoDeleteHandler.complete(context,outcome.result()));
        transactions.executeWithoutResult(tx -> photoDeleteHandler.complete(context,outcome.result()));
        remove(owner,photo).andExpect(status().isAccepted()).andExpect(jsonPath("$.data.jobId").value(job.toString()));
        assertThat(count("select count(*) from photos where id=?",photo)).isZero();
        assertThat(storage.objects).containsKey("display/"+other).doesNotContainKey("display/"+asset);
        storage.objects.put("uploads/"+asset,png);expire(asset);cleanup().clean();
        assertThat(count("select count(*) from assets where id=?",asset)).isZero();
        remove(owner,UUID.randomUUID()).andExpect(status().isNotFound());
    }

    @Test void photoCleanupSurvivesLeavingAndOverlappingTripDeletion() throws Exception {
        UUID batch=batch(owner,1,UUID.randomUUID().toString()), asset=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());
        UUID photo=UUID.fromString(data(register(owner,batch,asset).andExpect(status().isCreated())).path("id").asString());
        edit(owner,photo,"{\"expectedVersion\":1,\"topics\":[\"FOOD\"]}").andExpect(status().isOk());
        UUID job=UUID.fromString(data(remove(owner,photo).andExpect(status().isAccepted())).path("jobId").asString());
        var context=new com.eodilog.job.JobContext(job,UUID.randomUUID(),1,photoSubmission(job));
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?",member);
        assertThat(photoDeletePolicy.canExecute(context)).isTrue();assertThat(photoDeletePolicy.canComplete(context)).isTrue();
        jdbc.update("update trips set deleted_at=now() where id=?",trip);
        var tripInput=json.createObjectNode().put("tripId",trip.toString()).put("reason","OWNER_DELETE");
        var tripContext=new com.eodilog.job.JobContext(UUID.randomUUID(),UUID.randomUUID(),1,
                new com.eodilog.job.JobSubmission(owner,com.eodilog.job.JobKind.TRIP_DELETE,trip,tripInput,null,
                        new com.eodilog.job.CleanupScope(List.of(),List.of(),Instant.now())));
        assertThat(tripDeleteHandler.execute(tripContext).failure()).isNull();
        transactions.executeWithoutResult(tx -> tripDeleteHandler.complete(tripContext,json.createObjectNode()));
        var outcome=photoDeleteHandler.execute(context);assertThat(outcome.failure()).isNull();
        transactions.executeWithoutResult(tx -> photoDeleteHandler.complete(context,outcome.result()));
        assertThat(count("select count(*) from photo_topics where photo_id=?",photo)).isZero();
        assertThat(storage.objects).doesNotContainKey("display/"+asset);
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(owner))).andExpect(status().isOk());
    }

    @Test void workerRetriesPhotoDeleteAndOnlyRequesterReadsMinimalResult() throws Exception {
        UUID batch=batch(owner,1,UUID.randomUUID().toString()), asset=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());
        UUID photo=UUID.fromString(data(register(owner,batch,asset).andExpect(status().isCreated())).path("id").asString());
        UUID job=UUID.fromString(data(remove(owner,photo).andExpect(status().isAccepted())).path("jobId").asString());
        storage.failedDeleteKeys.add("display/"+asset);
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
        while(count("select count(*) from jobs where id=? and status='QUEUED' and attempt=1",job)==0 && System.nanoTime()<deadline) {
            worker.pollOnce();Thread.sleep(20);
        }
        assertThat(count("select count(*) from jobs where id=? and status='QUEUED' and attempt=1 and error_code='TEMPORARY_FAILURE'",job)).isEqualTo(1);
        assertThat(count("select count(*) from photos where id=? and deleted_at is not null",photo)).isEqualTo(1);
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(friend))).andExpect(status().isNotFound());
        storage.failedDeleteKeys.clear();
        jdbc.update("update jobs set next_attempt_at=now()-interval '1 second' where id=?",job);
        deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
        while(count("select count(*) from jobs where id=? and status='SUCCEEDED'",job)==0 && System.nanoTime()<deadline) {
            worker.pollOnce();Thread.sleep(20);
        }
        assertThat(count("select attempt from jobs where id=?",job)).isEqualTo(2);
        var result=data(mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.data.result.scope").value("PHOTO_DELETE"))
                .andExpect(jsonPath("$.data.result.completedCount").value(1)).andExpect(jsonPath("$.data.result.failedCount").value(0)));
        assertThat(result.path("result").size()).isEqualTo(3);
        assertThat(result.toString()).doesNotContain(asset.toString(),photo.toString(),"objectKey","displayKey");
        remove(owner,photo).andExpect(status().isAccepted()).andExpect(jsonPath("$.data.status").value("SUCCEEDED"));
    }

    @Test void concurrentPhotoEditsHaveOneVersionWinnerAndAccuratePlaceCounts() throws Exception {
        UUID batch=batch(owner,2,UUID.randomUUID().toString()), asset=intent(owner,batch,true), second=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());complete(owner,second).andExpect(status().isOk());
        UUID photo=UUID.fromString(data(register(owner,batch,asset).andExpect(status().isCreated())).path("id").asString());
        UUID another=UUID.fromString(data(register(owner,batch,second).andExpect(status().isCreated())).path("id").asString());
        UUID place=UUID.randomUUID();
        jdbc.update("insert into places(id,name,latitude,longitude,source,created_at,updated_at) values(?,'경합 장소',37.5,126.25,'MANUAL',now(),now())",place);
        String body="{\"expectedVersion\":1,\"placeId\":\"%s\",\"topics\":[\"PEOPLE\"]}".formatted(place);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var start=new CountDownLatch(1);
            var first=executor.submit(()->{start.await();return edit(owner,photo,body).andReturn().getResponse().getStatus();});
            var next=executor.submit(()->{start.await();return edit(owner,photo,body).andReturn().getResponse().getStatus();});
            start.countDown();assertThat(List.of(first.get(15,TimeUnit.SECONDS),next.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
        }
        edit(owner,another,body).andExpect(status().isOk());
        mvc.perform(get("/api/v1/trips/{trip}/photo-summary",trip).with(authUser(friend)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalCount").value(2)).andExpect(jsonPath("$.data.unplacedCount").value(0))
                .andExpect(jsonPath("$.data.places[0].placeId").value(place.toString())).andExpect(jsonPath("$.data.places[0].count").value(2))
                .andExpect(jsonPath("$.data.topics[0].count").value(2));
    }

    @Test void scheduledCleanupRecoversExhaustedPhotoDeletionWithoutRemovingReferencedAssets() throws Exception {
        UUID batch=batch(owner,2,UUID.randomUUID().toString()), asset=intent(owner,batch,true), live=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());complete(owner,live).andExpect(status().isOk());
        UUID photo=UUID.fromString(data(register(owner,batch,asset).andExpect(status().isCreated())).path("id").asString());
        register(owner,batch,live).andExpect(status().isCreated());
        UUID job=UUID.fromString(data(remove(owner,photo).andExpect(status().isAccepted())).path("jobId").asString());
        jdbc.update("update jobs set status='FAILED',attempt=3,error_code='TEMPORARY_FAILURE',finished_at=now() where id=?",job);
        storage.failedDeleteKeys.add("display/"+asset);
        cleanup().clean(); // Before signed PUT expiry: fallback must wait.
        assertThat(storage.objects).containsKey("uploads/"+asset);
        expire(asset);expire(live);
        jdbc.update("update assets set status='DELETING' where id=?",live); // Defensive check: a live photo still wins.
        cleanup().clean();
        assertThat(storage.objects).containsKey("display/"+asset).containsKey("display/"+live).containsKey("uploads/"+live);
        assertThat(count("select count(*) from assets where id=?",asset)).isEqualTo(1);
        storage.failedDeleteKeys.clear();cleanup().clean();
        assertThat(storage.objects).doesNotContainKey("display/"+asset).doesNotContainKey("uploads/"+asset)
                .containsKey("display/"+live).containsKey("uploads/"+live);
        assertThat(count("select count(*) from assets where id=?",asset)).isEqualTo(1);
        assertThat(count("select count(*) from photos where id=? and deleted_at is not null",photo)).isEqualTo(1);
        storage.objects.put("uploads/"+asset,png);cleanup().clean();
        assertThat(storage.objects).doesNotContainKey("uploads/"+asset);
        remove(owner,photo).andExpect(status().isAccepted()).andExpect(jsonPath("$.data.jobId").value(job.toString()))
                .andExpect(jsonPath("$.data.status").value("FAILED"));
    }

    @Test void tripDeletionWaitsForAdmittedStreamToOpenAndRejectsLaterDownloads() throws Exception {
        UUID batch=batch(owner,1,UUID.randomUUID().toString()), asset=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());register(owner,batch,asset).andExpect(status().isCreated());
        storage.blockedOpenKey="display/"+asset;storage.openEntered=new CountDownLatch(1);storage.openReleased=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var download=executor.submit(()->mvc.perform(get("/api/v1/assets/{id}/download",asset).with(authUser(friend))).andReturn().getResponse().getStatus());
            try {
                assertThat(storage.openEntered.await(10,TimeUnit.SECONDS)).isTrue();
                var deletionStarted=new CountDownLatch(1);
                var deletion=executor.submit(()->{deletionStarted.countDown();return mvc.perform(delete("/api/v1/trips/{trip}",trip).param("expectedVersion","1").with(authUser(owner))).andReturn().getResponse().getStatus();});
                assertThat(deletionStarted.await(10,TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(()->deletion.get(250,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                assertThat(count("select count(*) from trips where id=? and deleted_at is null",trip)).isEqualTo(1);
                storage.openReleased.countDown();
                assertThat(download.get(10,TimeUnit.SECONDS)).isEqualTo(200);
                assertThat(deletion.get(10,TimeUnit.SECONDS)).isEqualTo(202);
                mvc.perform(get("/api/v1/assets/{id}/download",asset).with(authUser(friend))).andExpect(status().isNotFound());
            } finally {storage.openReleased.countDown();}
        }
    }

    @Test void simultaneousPhotoDeletesCreateExactlyOneReceiptAndJob() throws Exception {
        UUID batch=batch(owner,1,UUID.randomUUID().toString()), asset=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());
        UUID photo=UUID.fromString(data(register(owner,batch,asset).andExpect(status().isCreated())).path("id").asString());
        try(var executor=Executors.newFixedThreadPool(2)) {
            var start=new CountDownLatch(1);
            Callable<String> request=()->{start.await();return data(remove(owner,photo).andExpect(status().isAccepted())).path("jobId").asString();};
            var first=executor.submit(request);var second=executor.submit(request);start.countDown();
            assertThat(first.get(15,TimeUnit.SECONDS)).isEqualTo(second.get(15,TimeUnit.SECONDS));
        }
        assertThat(count("select count(*) from photo_delete_requests where photo_id=?",photo)).isEqualTo(1);
        assertThat(count("select count(*) from jobs where kind='PHOTO_DELETE' and input_json->>'photoId'=?",photo.toString())).isEqualTo(1);
    }

    @Test void photoAndTripDeletionOverlapExternalDeletesAndCompleteWithoutForeignKeyRaces() throws Exception {
        UUID batch=batch(owner,1,UUID.randomUUID().toString()), asset=intent(owner,batch,true);
        complete(owner,asset).andExpect(status().isOk());
        UUID photo=UUID.fromString(data(register(owner,batch,asset).andExpect(status().isCreated())).path("id").asString());
        edit(owner,photo,"{\"expectedVersion\":1,\"topics\":[\"FOOD\"]}").andExpect(status().isOk());
        UUID job=UUID.fromString(data(remove(owner,photo).andExpect(status().isAccepted())).path("jobId").asString());
        var photoContext=new com.eodilog.job.JobContext(job,UUID.randomUUID(),1,photoSubmission(job));
        mvc.perform(delete("/api/v1/trips/{trip}",trip).param("expectedVersion","1").with(authUser(owner))).andExpect(status().isAccepted());
        var tripContext=new com.eodilog.job.JobContext(UUID.randomUUID(),UUID.randomUUID(),1,
                new com.eodilog.job.JobSubmission(owner,com.eodilog.job.JobKind.TRIP_DELETE,trip,
                        json.createObjectNode().put("tripId",trip.toString()).put("reason","OWNER_DELETE"),null,
                        new com.eodilog.job.CleanupScope(List.of(),List.of(),Instant.now())));
        storage.blockedDeleteKey="uploads/"+asset;storage.deleteEntered=new CountDownLatch(2);storage.deleteReleased=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var photoExecution=executor.submit(()->photoDeleteHandler.execute(photoContext));
            var tripExecution=executor.submit(()->tripDeleteHandler.execute(tripContext));
            try {
                assertThat(storage.deleteEntered.await(10,TimeUnit.SECONDS)).isTrue();storage.deleteReleased.countDown();
                var photoOutcome=photoExecution.get(10,TimeUnit.SECONDS);var tripOutcome=tripExecution.get(10,TimeUnit.SECONDS);
                assertThat(photoOutcome.failure()).isNull();assertThat(tripOutcome.failure()).isNull();
                var start=new CountDownLatch(1);
                var photoCompletion=executor.submit(()->{start.await();transactions.executeWithoutResult(tx->photoDeleteHandler.complete(photoContext,photoOutcome.result()));return true;});
                var tripCompletion=executor.submit(()->{start.await();transactions.executeWithoutResult(tx->tripDeleteHandler.complete(tripContext,tripOutcome.result()));return true;});
                start.countDown();assertThat(photoCompletion.get(10,TimeUnit.SECONDS)).isTrue();assertThat(tripCompletion.get(10,TimeUnit.SECONDS)).isTrue();
            } finally {storage.deleteReleased.countDown();}
        }
        assertThat(count("select count(*) from photos where trip_id=?",trip)).isZero();
        assertThat(count("select count(*) from photo_topics where photo_id=?",photo)).isZero();
        assertThat(count("select count(*) from trip_members where trip_id=?",trip)).isZero();
        assertThat(count("select count(*) from photo_delete_requests where photo_id=?",photo)).isEqualTo(1);
        assertThat(storage.objects).doesNotContainKey("uploads/"+asset).doesNotContainKey("display/"+asset);
    }

    @Test void topicCursorPaginatesTiedTimestampsWithoutDuplicatesOrMissingPhotos() throws Exception {
        UUID batch=batch(owner,4,UUID.randomUUID().toString());List<String> expected=new ArrayList<>();
        for(int i=0;i<4;i++) {
            UUID asset=intent(owner,batch,true);complete(owner,asset).andExpect(status().isOk());
            String photo=data(register(owner,batch,asset).andExpect(status().isCreated())).path("id").asString();
            edit(owner,UUID.fromString(photo),i==3?"{\"expectedVersion\":1,\"topics\":[\"PEOPLE\"]}":"{\"expectedVersion\":1,\"topics\":[\"FOOD\",\"OTHER\"]}")
                    .andExpect(status().isOk());if(i<3)expected.add(photo);
        }
        jdbc.update("update photos set created_at='2026-11-09T00:00:00Z' where trip_id=?",trip);
        expected.sort(Comparator.reverseOrder());List<String> actual=new ArrayList<>();String cursor=null;
        for(int page=0;page<3;page++) {
            var request=get("/api/v1/trips/{trip}/photos",trip).param("topic","FOOD").param("limit","1").with(authUser(friend));
            if(cursor!=null)request.param("cursor",cursor);
            var response=json.readTree(mvc.perform(request).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1))
                    .andExpect(jsonPath("$.page.hasNext").value(page<2)).andReturn().getResponse().getContentAsString());
            actual.add(response.path("data").get(0).path("id").asString());
            cursor=response.path("page").path("nextCursor").isNull()?null:response.path("page").path("nextCursor").asString();
        }
        assertThat(actual).containsExactlyElementsOf(expected).doesNotHaveDuplicates();assertThat(cursor).isNull();
    }

    @Test void classificationWorkerAppliesGroupsAndReplaysWithoutAnotherVersion() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.components.schemas.PhotoClassificationResponse.properties.photos.type").value("array"))
                .andExpect(jsonPath("$.components.schemas.PhotoClassificationResponse.properties.photos.items['$ref']").value("#/components/schemas/PhotoResponse"));
        var ids=classificationPhotos(3);UUID job=classify(ids);
        awaitClassification(job,"SUCCEEDED");
        String body=classificationBody(ids);
        String first=applyClassification(job,body).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.photos.length()").value(3)).andExpect(jsonPath("$.data.photos[0].version").value(2))
                .andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(applyClassification(job,body).andExpect(status().isOk()).andReturn().getResponse().getContentAsString())).isEqualTo(json.readTree(first));
        UUID group=jdbc.queryForObject("select group_id from photos where id=?",UUID.class,ids.getFirst());
        mvc.perform(get("/api/v1/trips/{trip}/photos",trip).param("groupId",group.toString()).with(authUser(friend)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(3));
        mvc.perform(get("/api/v1/trips/{trip}/photo-summary",trip).with(authUser(friend)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.groups[0].count").value(3));
        assertThat(count("select count(*) from photo_topics where source='AI' and photo_id in (select id from photos where trip_id=?)",trip)).isEqualTo(3);
        applyClassification(job,classificationBody(ids.subList(0,2))).andExpect(status().isConflict());
        edit(owner,ids.getFirst(),"{\"expectedVersion\":2,\"topics\":[]}").andExpect(status().isOk());
        applyClassification(job,body).andExpect(status().isConflict());
    }

    @Test void classificationPartialFilesAndManualClearAreProtectedAtomically() throws Exception {
        var ids=classificationPhotos(3);
        String key=jdbc.queryForObject("select a.display_key from assets a join photos p on p.asset_id=a.id where p.id=?",String.class,ids.get(2));
        storage.objects.remove(key);
        UUID job=classify(ids);awaitClassification(job,"SUCCEEDED");
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.result.photos[2].status").value("FAILED"));
        edit(owner,ids.get(1),"{\"expectedVersion\":1,\"topics\":[]}").andExpect(status().isOk());
        applyClassification(job,classificationBody(ids.subList(0,2))).andExpect(status().isConflict());
        assertThat(count("select version from photos where id=?",ids.getFirst())).isEqualTo(1);
        assertThat(count("select count(*) from photo_groups where trip_id=?",trip)).isZero();
        applyClassification(job,classificationBody(List.of(ids.getFirst()))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.photos[0].groupId").doesNotExist());
    }

    @Test void classificationValidatesRequestAndIdempotencyBeforeCreatingJobs() throws Exception {
        var ids=classificationPhotos(1);String body=json.writeValueAsString(Map.of("photoIds",ids));String key=UUID.randomUUID().toString();
        for(String invalid:List.of("1.5","\"1\"","true","null","9223372036854775808")) {
            mvc.perform(post("/api/v1/trips/{trip}/photo-classifications/{job}/apply",trip,UUID.randomUUID()).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"expectedPhotoVersions\":[{\"photoId\":\""+ids.getFirst()+"\",\"version\":"+invalid+"}]}"))
                    .andExpect(status().isBadRequest());
        }
        var request=post("/api/v1/trips/{trip}/photo-classifications",trip).with(authUser(owner)).header("Idempotency-Key",key).contentType(MediaType.APPLICATION_JSON).content(body);
        String first=data(mvc.perform(request).andExpect(status().isAccepted())).path("jobId").asString();
        mvc.perform(request).andExpect(status().isAccepted()).andExpect(jsonPath("$.data.jobId").value(first));
        mvc.perform(post("/api/v1/trips/{trip}/photo-classifications",trip).with(authUser(outsider)).header("Idempotency-Key","outsider").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isNotFound());
        for(var bad:List.of(List.of(),List.of(ids.getFirst(),ids.getFirst()),List.of(UUID.randomUUID()))) {
            mvc.perform(post("/api/v1/trips/{trip}/photo-classifications",trip).with(authUser(owner)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("photoIds",bad))))
                    .andExpect(bad.size()==1?status().isNotFound():status().isBadRequest());
        }
        List<UUID> many=new ArrayList<>();for(int i=0;i<51;i++)many.add(UUID.randomUUID());
        mvc.perform(post("/api/v1/trips/{trip}/photo-classifications",trip).with(authUser(owner)).header("Idempotency-Key","limit").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("photoIds",many))))
                .andExpect(status().isUnprocessableEntity());
        assertThat(count("select count(*) from jobs where trip_id=? and kind='PHOTO_CLASSIFICATION'",trip)).isEqualTo(1);
    }

    @Test void classificationRetriesTransientFailuresAndRejectsMalformedModelOutput() throws Exception {
        classificationAi.mode=1;UUID job=classify(classificationPhotos(1));
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
        while(count("select count(*) from jobs where id=? and attempt=1 and status='QUEUED'",job)==0 && System.nanoTime()<deadline){worker.pollOnce();Thread.sleep(20);}
        assertThat(jdbc.queryForObject("select error_code from jobs where id=?",String.class,job)).isEqualTo("TEMPORARY_FAILURE");
        classificationAi.mode=2;jdbc.update("update jobs set next_attempt_at=now()-interval '1 second' where id=?",job);awaitClassification(job,"FAILED");
        assertThat(jdbc.queryForObject("select error_code from jobs where id=?",String.class,job)).isEqualTo("EXECUTION_FAILED");
    }

    @Test void classificationConcurrentApplyAndDeletedResultDoNotResurrectPhotos() throws Exception {
        var ids=classificationPhotos(2);UUID job=classify(ids);awaitClassification(job,"SUCCEEDED");String body=classificationBody(ids);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var start=new CountDownLatch(1);Callable<String> action=()->{start.await();return applyClassification(job,body).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();};
            var first=pool.submit(action);var second=pool.submit(action);start.countDown();assertThat(json.readTree(first.get(15,TimeUnit.SECONDS))).isEqualTo(json.readTree(second.get(15,TimeUnit.SECONDS)));
        }
        assertThat(count("select count(*) from photo_groups where trip_id=?",trip)).isEqualTo(1);
        remove(owner,ids.getFirst()).andExpect(status().isAccepted());applyClassification(job,body).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(friend))).andExpect(status().isOk()).andExpect(jsonPath("$.data.result.photos.length()").value(1));
        mvc.perform(get("/api/v1/trips/{trip}/photo-summary",trip).with(authUser(friend))).andExpect(status().isOk()).andExpect(jsonPath("$.data.groups[0].count").value(1));
    }

    @Test void classificationStorageFailureRetriesToSuccess() throws Exception {
        var ids=classificationPhotos(2);
        String key=jdbc.queryForObject("select a.display_key from assets a join photos p on p.asset_id=a.id where p.id=?",String.class,ids.getLast());
        storage.failedHeadKeys.add(key);UUID job=classify(ids);
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
        while(count("select count(*) from jobs where id=? and attempt=1 and status='QUEUED'",job)==0 && System.nanoTime()<deadline){worker.pollOnce();Thread.sleep(20);}
        assertThat(jdbc.queryForObject("select error_code from jobs where id=?",String.class,job)).isEqualTo("TEMPORARY_FAILURE");
        storage.failedHeadKeys.clear();jdbc.update("update jobs set next_attempt_at=now()-interval '1 second' where id=?",job);
        awaitClassification(job,"SUCCEEDED");
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.result.photos[0].status").value("SUCCEEDED")).andExpect(jsonPath("$.data.result.photos[1].status").value("SUCCEEDED"));
    }

    @Test void classificationGroupFilterSelectsExactIdsAmongTwoGroupsAndUngroupedPhotos() throws Exception {
        var ids=classificationPhotos(5);
        for(var pair:List.of(ids.subList(0,2),ids.subList(2,4))) {
            UUID job=classify(pair);awaitClassification(job,"SUCCEEDED");applyClassification(job,classificationBody(pair)).andExpect(status().isOk());
        }
        for(var pair:List.of(ids.subList(0,2),ids.subList(2,4))) {
            UUID group=jdbc.queryForObject("select group_id from photos where id=?",UUID.class,pair.getFirst());
            var page=json.readTree(mvc.perform(get("/api/v1/trips/{trip}/photos",trip).param("groupId",group.toString()).with(authUser(friend)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2)).andReturn().getResponse().getContentAsString());
            Set<UUID> actual=new HashSet<>();for(var p:page.path("data"))actual.add(UUID.fromString(p.path("id").asString()));
            assertThat(actual).containsExactlyInAnyOrderElementsOf(pair);
        }
        mvc.perform(get("/api/v1/trips/{trip}/photos",trip).param("groupId",UUID.randomUUID().toString()).with(authUser(friend)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
        assertThat(jdbc.queryForObject("select group_id from photos where id=?",UUID.class,ids.getLast())).isNull();
    }

    @Test void tripDeletionCleansAppliedPhotoGroupsAndCourseUndoStateTogether() throws Exception {
        var ids=classificationPhotos(2);UUID photoJob=classify(ids);awaitClassification(photoJob,"SUCCEEDED");
        applyClassification(photoJob,classificationBody(ids)).andExpect(status().isOk());
        UUID itinerary=jdbc.queryForObject("select id from itineraries where trip_id=?",UUID.class,trip);
        UUID courseJob=UUID.randomUUID(),placeA=UUID.randomUUID(),placeB=UUID.randomUUID(),itemA=UUID.randomUUID(),itemB=UUID.randomUUID();
        for(UUID place:List.of(placeA,placeB)) jdbc.update("insert into places(id,name,latitude,longitude,source,created_at,updated_at) values(?,'공존 장소',37,127,'MANUAL',now(),now())",place);
        jdbc.update("insert into itinerary_items(id,itinerary_id,place_id,day,sequence) values(?,?,?,1,1),(?,?,?,1,2)",itemA,itinerary,placeA,itemB,itinerary,placeB);
        jdbc.update("insert into route_legs(id,itinerary_id,from_item_id,to_item_id,transport_mode,duration_seconds,status,queried_at) values(?,?,?,?,'TRANSIT',600,'AVAILABLE',now())",UUID.randomUUID(),itinerary,itemA,itemB);
        jdbc.update("update itineraries set version=2 where id=?",itinerary);
        jdbc.update("insert into jobs(id,requested_by_user_id,trip_id,kind,status,input_json,result_json,next_attempt_at,created_at,finished_at,base_version,applied_by_member_id,applied_at) values(?,?,?,'ITINERARY_PROPOSAL','SUCCEEDED','{}','{}',now(),now(),now(),1,?,now())",courseJob,owner,trip,member);
        jdbc.update("insert into itinerary_undo_states(itinerary_id,applied_job_id,applied_version,before_content_json,applied_by_member_id,created_at) values(?,?,2,'{\"items\":[],\"legs\":[]}',?,now())",itinerary,courseJob,member);
        assertThat(count("select count(*) from photo_groups where trip_id=?",trip)).isEqualTo(1);
        assertThat(count("select count(*) from itinerary_undo_states where itinerary_id=?",itinerary)).isEqualTo(1);
        UUID deletion=UUID.fromString(data(mvc.perform(delete("/api/v1/trips/{trip}",trip).param("expectedVersion","1").with(authUser(owner))).andExpect(status().isAccepted())).path("jobId").asString());
        awaitClassification(deletion,"SUCCEEDED");
        assertThat(count("select count(*) from photos where trip_id=?",trip)).isZero();
        assertThat(count("select count(*) from photo_groups where trip_id=?",trip)).isZero();
        assertThat(count("select count(*) from photo_topics where photo_id in (?,?)",ids.getFirst(),ids.getLast())).isZero();
        assertThat(count("select count(*) from itinerary_undo_states where itinerary_id=?",itinerary)).isZero();
        assertThat(count("select count(*) from route_legs where itinerary_id=?",itinerary)).isZero();
        assertThat(count("select count(*) from itinerary_items where itinerary_id=?",itinerary)).isZero();
        assertThat(count("select count(*) from itineraries where trip_id=?",trip)).isZero();
        assertThat(count("select count(*) from trip_members where trip_id=?",trip)).isZero();
        assertThat(count("select count(*) from jobs where id in (?,?) and applied_by_member_id is not null",photoJob,courseJob)).isZero();
        assertThat(count("select count(*) from photo_classification_applies where job_id=?",photoJob)).isEqualTo(1);
    }

    @Test void classificationCancellationSettingsAndMembershipAreRechecked() throws Exception {
        var ids=classificationPhotos(2);
        classificationAi.entered=new CountDownLatch(1);classificationAi.released=new CountDownLatch(1);
        UUID job=classify(ids);worker.pollOnce();
        try {
            assertThat(classificationAi.entered.await(10,TimeUnit.SECONDS)).isTrue();
            jdbc.update("insert into user_settings(user_id,photo_classification_mode) values(?,'OFF')",owner);
        } finally {classificationAi.released.countDown();}
        awaitClassification(job,"CANCELLED");
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(owner))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/trips/{trip}/photo-classifications",trip).with(authUser(owner)).header("Idempotency-Key","off").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("photoIds",ids)))).andExpect(status().isConflict());
        classificationAi.entered=null;classificationAi.released=null;
        jdbc.update("update user_settings set photo_classification_mode='AUTO' where user_id=?",owner);
        UUID next=classify(ids);awaitClassification(next,"SUCCEEDED");
        assertThat(count("select version from photos where id=?",ids.getFirst())).isEqualTo(1);
        jdbc.update("update trip_members set status='LEFT',left_at=now() where trip_id=? and user_id=?",trip,friend);
        mvc.perform(get("/api/v1/jobs/{id}",next).with(authUser(friend))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/trips/{trip}/photo-classifications/{job}/apply",trip,next).with(authUser(friend)).contentType(MediaType.APPLICATION_JSON).content(classificationBody(ids))).andExpect(status().isNotFound());
        jdbc.update("update user_settings set photo_classification_mode='OFF' where user_id=?",owner);
        applyClassification(next,classificationBody(ids)).andExpect(status().isConflict());
    }

    @Test void classificationDisplaySizeIsBoundedAndGroupIdCollisionRollsBack() throws Exception {
        var ids=classificationPhotos(2);UUID job=classify(ids);awaitClassification(job,"SUCCEEDED");
        var result=json.readTree(jdbc.queryForObject("select result_json::text from jobs where id=?",String.class,job));
        UUID group=UUID.fromString(result.path("photos").get(0).path("groupId").asString());
        // Reusing an existing group UUID, even from the same trip, cannot attach another job to it.
        jdbc.update("insert into photo_groups(id,trip_id,source_job_id) values(?,?,?)",group,trip,job);
        applyClassification(job,classificationBody(ids)).andExpect(status().isConflict());
        assertThat(count("select version from photos where id=?",ids.getFirst())).isEqualTo(1);
        jdbc.update("delete from photo_groups where id=?",group);
        String key=jdbc.queryForObject("select a.display_key from assets a join photos p on p.asset_id=a.id where p.id=?",String.class,ids.getFirst());
        storage.objects.put(key,new byte[15*1024*1024+1]);
        UUID bounded=classify(ids);awaitClassification(bounded,"SUCCEEDED");
        var boundedResult=json.readTree(jdbc.queryForObject("select result_json::text from jobs where id=?",String.class,bounded));
        assertThat(boundedResult.path("photos").toString()).contains("INPUT_LIMIT_EXCEEDED");
        assertThat(storage.streamsOpened.get()).isEqualTo(storage.streamsClosed.get());
    }

    @Test @EnabledIfEnvironmentVariable(named="PHOTO_AI_URL",matches=".+")
    void realPhotoAiUploadWorkerApplyAndSummary() throws Exception {
        classificationAi.real=true;
        // Two identical real image fixtures guarantee an actual-model similarity group.
        {
            var image=ImageIO.read(new java.io.ByteArrayInputStream(png));
            // Use a checked-in photograph when supplied by the opt-in verification environment.
            String fixture=System.getenv("PHOTO_AI_FIXTURE");
            if(fixture!=null) { image=ImageIO.read(java.nio.file.Path.of(fixture).toFile());var output=new ByteArrayOutputStream();ImageIO.write(image,"png",output);png=output.toByteArray(); }
        }
        var ids=classificationPhotos(2);UUID job=classify(ids);awaitClassification(job,"SUCCEEDED",90);
        applyClassification(job,classificationBody(ids)).andExpect(status().isOk()).andExpect(jsonPath("$.data.photos[0].version").value(2));
        mvc.perform(get("/api/v1/trips/{trip}/photo-summary",trip).with(authUser(owner))).andExpect(status().isOk()).andExpect(jsonPath("$.data.groups[0].count").value(2));
        UUID group=jdbc.queryForObject("select group_id from photos where id=?",UUID.class,ids.getFirst());
        mvc.perform(get("/api/v1/trips/{trip}/photos",trip).param("groupId",group.toString()).with(authUser(owner))).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2));
    }
    List<UUID> classificationPhotos(int size) throws Exception {
        UUID batch=batch(owner,size,UUID.randomUUID().toString());List<UUID> result=new ArrayList<>();
        for(int i=0;i<size;i++){UUID asset=intent(owner,batch,true);complete(owner,asset).andExpect(status().isOk());result.add(UUID.fromString(data(register(owner,batch,asset).andExpect(status().isCreated())).path("id").asString()));}
        return result;
    }
    UUID classify(List<UUID> ids) throws Exception {return UUID.fromString(data(mvc.perform(post("/api/v1/trips/{trip}/photo-classifications",trip).with(authUser(owner)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("photoIds",ids)))).andExpect(status().isAccepted())).path("jobId").asString());}
    String classificationBody(List<UUID> ids) {return json.writeValueAsString(Map.of("expectedPhotoVersions",ids.stream().map(id->Map.of("photoId",id,"version",1)).toList()));}
    ResultActions applyClassification(UUID job,String body) throws Exception {return mvc.perform(post("/api/v1/trips/{trip}/photo-classifications/{job}/apply",trip,job).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON).content(body));}
    void awaitClassification(UUID job,String state) throws Exception {awaitClassification(job,state,20);}
    void awaitClassification(UUID job,String state,int seconds) throws Exception {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(seconds);
        while(count("select count(*) from jobs where id=? and status=?",job,state)==0 && System.nanoTime()<deadline){worker.pollOnce();Thread.sleep(25);}
        assertThat(jdbc.queryForObject("select status from jobs where id=?",String.class,job)).isEqualTo(state);
    }

    com.eodilog.job.JobSubmission photoSubmission(UUID job) {
        return jdbc.queryForObject("select * from jobs where id=?",(rs,row)->new com.eodilog.job.JobSubmission(
                owner,com.eodilog.job.JobKind.PHOTO_DELETE,trip,json.readTree(rs.getString("input_json")),null,
                json.readValue(rs.getString("cleanup_scope_json"),com.eodilog.job.CleanupScope.class)),job);
    }
    ResultActions edit(UUID user,UUID photo,String body) throws Exception {return mvc.perform(patch("/api/v1/trips/{trip}/photos/{photo}",trip,photo).with(authUser(user)).contentType(MediaType.APPLICATION_JSON).content(body));}
    ResultActions remove(UUID user,UUID photo) throws Exception {return mvc.perform(delete("/api/v1/trips/{trip}/photos/{photo}",trip,photo).with(authUser(user)));}
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
