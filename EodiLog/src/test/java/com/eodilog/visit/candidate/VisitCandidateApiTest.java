package com.eodilog.visit.candidate;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.ai.AiServerException;
import com.eodilog.global.storage.InMemoryStorageConfiguration;
import com.eodilog.job.CleanupScope;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import com.eodilog.job.JobWorker;
import com.eodilog.trip.service.TripDeleteJobHandler;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
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
import org.mockito.ArgumentCaptor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 사진 방문 후보 감지(VISIT_DETECTION)·확정(EODI-267). AI 서버는 AI spec §8.2 규칙(코스 장소 300m)을 흉내 내는 가짜로 바꾸고 실제 jobs worker를 직접 돌린다
@SpringBootTest @AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, InMemoryStorageConfiguration.class})
class VisitCandidateApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @Autowired JobWorker worker;
    @Autowired TransactionTemplate transactions;
    @Autowired TripDeleteJobHandler tripDeleteHandler;
    @Autowired VisitDetectionHandler handler;
    @MockitoBean AiServerClient ai;
    UUID owner, friend, trip, other, ownerMember, friendMember, placeA, placeB, outsider;

    static final String CAPTURED = "2026-11-01T03:00:00Z";

    @BeforeEach void setup() throws Exception {
        owner = user(); friend = user();
        trip = createTrip(owner); other = createTrip(owner);
        ownerMember = membership(trip, owner);
        friendMember = UUID.randomUUID();
        jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,2,now())", friendMember, trip, friend);
        placeA = place(37.5, 127.0); placeB = place(37.51, 127.0);
        // 코스에 없는 저장 장소는 AI에 보내지 않는다(AI는 코스 장소만 맞춘다)
        outsider = place(37.50041, 127.0);
        jdbc.update("insert into trip_place_saves(trip_id,place_id,saved_by_member_id,created_at,updated_at) values(?,?,?,now(),now())", trip, outsider, ownerMember);
        jdbc.update("update trips set start_date='2026-11-01',end_date='2026-11-03' where id in (?,?)", trip, other);
        jdbc.update("insert into itineraries(id,trip_id,updated_by_member_id,updated_at) values(?,?,?,now()) on conflict (trip_id) do nothing",
                UUID.randomUUID(), trip, ownerMember);
        UUID itinerary = jdbc.queryForObject("select id from itineraries where trip_id=?", UUID.class, trip);
        jdbc.update("insert into itinerary_items(id,itinerary_id,place_id,day,sequence) values(?,?,?,1,1)", UUID.randomUUID(), itinerary, placeA);
        jdbc.update("insert into itinerary_items(id,itinerary_id,place_id,day,sequence,start_time,stay_minutes) values(?,?,?,2,1,'10:30',60)", UUID.randomUUID(), itinerary, placeB);
        doAnswer(call -> fakeAi(call.getArgument(2))).when(ai).post(eq(VisitDetectionHandler.AI_PATH), any(), any());
    }

    // AI spec §8.2를 흉내 낸다: 사진마다 300m 안 가장 가까운 코스 장소, 업로더·장소별 묶음, visitedAt은 첫 사진 시각을 그대로
    JsonNode fakeAi(JsonNode body) {
        var groups = new java.util.LinkedHashMap<String, tools.jackson.databind.node.ObjectNode>();
        for (JsonNode photo : body.path("photos")) {
            String best = null;
            double bestMeters = 300;
            for (JsonNode item : body.path("items")) {
                double dLat = (photo.path("latitude").asDouble() - item.path("place").path("latitude").asDouble()) * 111_000;
                double dLng = (photo.path("longitude").asDouble() - item.path("place").path("longitude").asDouble()) * 88_000;
                double meters = Math.sqrt(dLat * dLat + dLng * dLng);
                if (meters <= bestMeters) { bestMeters = meters; best = item.path("place").path("id").asString(); }
            }
            if (best == null) continue;
            String place = best;
            var group = groups.computeIfAbsent(photo.path("uploaderMemberId").asString() + "/" + place, k -> {
                var node = json.createObjectNode().put("memberId", photo.path("uploaderMemberId").asString())
                        .put("placeId", place).put("visitedAt", photo.path("capturedAt").asString());
                node.putArray("evidencePhotoIds");
                return node;
            });
            ((tools.jackson.databind.node.ArrayNode) group.get("evidencePhotoIds")).add(photo.path("photoId").asString());
        }
        var result = json.createObjectNode();
        var candidates = result.putArray("candidates");
        groups.values().forEach(candidates::add);
        return result;
    }

    @Test void sendsOnlyRequesterPhotosWithLocationAndTimeAndStoresValidatedCandidates() throws Exception {
        UUID near = photo(trip, ownerMember, owner, gps(37.5004, 127.0, null), Instant.parse(CAPTURED), null);
        // capturedAt이 없으면 EXIF 촬영 시각을 시간대 없는 현지 시각으로 보낸다: 09:00 KST = 00:00Z
        UUID exifOnly = photo(trip, ownerMember, owner, gps(37.4997, 127.0, "2026:11:01 09:00:00"), null, null);
        UUID nearB = photo(trip, ownerMember, owner, gps(37.5101, 127.0, null), Instant.parse("2026-11-02T01:00:00Z"), null);
        UUID tooFar = photo(trip, ownerMember, owner, gps(37.5050, 127.0, null), Instant.parse(CAPTURED), null);
        UUID noMetadata = photo(trip, ownerMember, owner, "{}", Instant.parse(CAPTURED), null);
        UUID textGps = photo(trip, ownerMember, owner, "{\"latitude\":\"37.5\",\"longitude\":\"127.0\"}", Instant.parse(CAPTURED), null);
        UUID noTime = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), null, null);
        UUID future = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.now().plusSeconds(3600), null);
        // 업로더가 연결한 장소는 AI 계약에 없어, 위치가 없는 사진은 연결 장소가 있어도 보내지 않는다
        UUID tagged = photo(trip, ownerMember, owner, "{}", Instant.parse(CAPTURED), placeB);

        UUID job = detect(owner, trip, near, exifOnly, nearB, tooFar, noMetadata, textGps, noTime, future, tagged);
        run(job);

        var body = ArgumentCaptor.forClass(JsonNode.class);
        verify(ai).post(eq(VisitDetectionHandler.AI_PATH), eq(job), body.capture());
        JsonNode sent = body.getValue();
        assertThat(sent.path("tripStartDate").asString()).isEqualTo("2026-11-01");
        assertThat(sent.path("photos").findValues("photoId").stream().map(n -> UUID.fromString(n.asString())).toList()).containsExactlyInAnyOrder(near, exifOnly, nearB, tooFar);
        for (JsonNode photo : sent.path("photos")) {
            assertThat(photo.path("uploaderMemberId").asString()).isEqualTo(ownerMember.toString());
            assertThat(photo.size()).isEqualTo(5);
        }
        assertThat(photoNode(sent, near).path("capturedAt").asString()).isEqualTo(CAPTURED);
        assertThat(photoNode(sent, exifOnly).path("capturedAt").asString()).isEqualTo("2026-11-01T09:00:00");
        assertThat(photoNode(sent, near).path("latitude").asDouble()).isEqualTo(37.5004);
        assertThat(sent.path("items")).hasSize(2);
        assertThat(sent.path("items").get(0).path("place").path("id").asString()).isEqualTo(placeA.toString());
        assertThat(sent.path("items").get(0).path("day").asInt()).isEqualTo(1);
        assertThat(sent.path("items").get(1).path("startTime").asString()).isEqualTo("10:30");
        assertThat(sent.path("items").get(1).path("stayMinutes").asInt()).isEqualTo(60);
        assertThat(sent.path("items").get(1).path("order").asInt()).isEqualTo(1);

        JsonNode candidates = result(owner, job).path("candidates");
        assertThat(candidates).hasSize(2);
        JsonNode a = byPlace(candidates, placeA), b = byPlace(candidates, placeB);
        assertThat(ids(a.path("evidencePhotoIds"))).containsExactlyInAnyOrder(near, exifOnly);
        assertThat(Instant.parse(a.path("visitedAt").asString())).isEqualTo(Instant.parse("2026-11-01T00:00:00Z"));
        assertThat(ids(b.path("evidencePhotoIds"))).containsExactly(nearB);
        for (JsonNode c : candidates) {
            assertThat(c.path("memberId").asString()).isEqualTo(ownerMember.toString());
            assertThat(c.path("status").asString()).isEqualTo("PENDING");
            assertThat(c.path("version").asLong()).isEqualTo(1);
            assertThat(c.path("visitId").isNull()).isTrue();
        }
        assertThat(a.path("place").path("name").asString()).isNotBlank();
        // 후보는 실제 방문이 아니다
        assertThat(count("select count(*) from visits where trip_id=?", trip)).isZero();
    }

    @Test void dropsAiCandidatesForOtherMembersUnknownPlacesOrUnsentPhotos() throws Exception {
        UUID mine = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID friends = photo(trip, friendMember, friend, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        String response = """
                {"candidates":[
                 {"memberId":"%1$s","placeId":"%2$s","visitedAt":"2026-11-01T12:00:00","evidencePhotoIds":["%3$s"]},
                 {"memberId":"%4$s","placeId":"%5$s","visitedAt":"%6$s","evidencePhotoIds":["%3$s"]},
                 {"memberId":"%1$s","placeId":"%7$s","visitedAt":"%6$s","evidencePhotoIds":["%3$s"]},
                 {"memberId":"%1$s","placeId":"%5$s","visitedAt":"%6$s","evidencePhotoIds":["%8$s"]},
                 {"memberId":"%1$s","placeId":"%5$s","visitedAt":"yesterday","evidencePhotoIds":["%3$s"]},
                 {"memberId":"%1$s","placeId":"%5$s","visitedAt":"%6$s","evidencePhotoIds":["%3$s","%3$s"]},
                 {"memberId":"%1$s","placeId":"%5$s","visitedAt":"%6$s","evidencePhotoIds":[]}]}""".formatted(
                ownerMember, placeA, mine, friendMember, placeB, CAPTURED, outsider, friends);
        doAnswer(call -> json.readTree(response)).when(ai).post(eq(VisitDetectionHandler.AI_PATH), any(), any());

        UUID job = detect(owner, trip, mine);
        run(job);
        JsonNode candidates = result(owner, job).path("candidates");
        assertThat(candidates).hasSize(1);
        assertThat(candidates.get(0).path("place").path("id").asString()).isEqualTo(placeA.toString());
        assertThat(count("select count(*) from visit_candidates where trip_id=?", trip)).isEqualTo(1);
    }

    @Test void malformedAiResponseFailsAndTransientAiErrorIsRetried() throws Exception {
        UUID mine = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        doAnswer(call -> json.readTree("{\"items\":[]}")).when(ai).post(eq(VisitDetectionHandler.AI_PATH), any(), any());
        UUID broken = detect(owner, trip, mine);
        runUntil(broken, "FAILED");
        assertThat(jdbc.queryForObject("select error_code from jobs where id=?", String.class, broken)).isEqualTo("EXECUTION_FAILED");

        doThrow(new AiServerException(true)).when(ai).post(eq(VisitDetectionHandler.AI_PATH), any(), any());
        UUID transientJob = detect(owner, trip, mine);
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        while (count("select count(*) from jobs where id=? and attempt=1 and status='QUEUED'", transientJob) == 0 && System.nanoTime() < until) {
            if (!state(transientJob).equals("QUEUED") || !worker.pollOnce()) LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
        }
        assertThat(jdbc.queryForObject("select status||':'||attempt||':'||error_code from jobs where id=?", String.class, transientJob))
                .isEqualTo("QUEUED:1:TEMPORARY_FAILURE");
        assertThat(count("select count(*) from visit_candidates where job_id in (?,?)", broken, transientJob)).isZero();
    }

    @Test void skipsTheAiCallWhenNoPhotoHasLocationAndTimeAndRequiresTripDates() throws Exception {
        UUID noMetadata = photo(trip, ownerMember, owner, "{}", Instant.parse(CAPTURED), null);
        UUID job = detect(owner, trip, noMetadata);
        run(job);
        assertThat(result(owner, job).path("candidates")).isEmpty();
        verify(ai, never()).post(any(), eq(job), any());

        jdbc.update("update trips set start_date=null,end_date=null where id=?", trip);
        detectRequest(owner, trip, key(), List.of(noMetadata)).andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.error.code").value("INSUFFICIENT_DATA"))
                .andExpect(jsonPath("$.error.fields[0].field").value("trip.startDate"));
    }

    @Test void rejectsOtherMembersPhotosAndInvalidRequestsWithoutCreatingJobs() throws Exception {
        UUID mine = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID friends = photo(trip, friendMember, friend, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        long before = count("select count(*) from jobs where kind='VISIT_DETECTION'");

        // 사진 속·다른 멤버가 올린 사진으로 내 방문을 만들지 않는다(D-16 업로더 본인)
        detectRequest(owner, trip, key(), List.of(mine, friends)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("PHOTO_NOT_FOUND"));
        detectRequest(owner, other, key(), List.of(mine)).andExpect(status().isNotFound());
        detectRequest(friend, trip, key(), List.of(mine)).andExpect(status().isNotFound());
        detectRequest(owner, trip, key(), List.of(mine, mine)).andExpect(status().isBadRequest());
        detectRequest(owner, trip, key(), List.of()).andExpect(status().isBadRequest());
        detectRequest(owner, trip, null, List.of(mine)).andExpect(status().isBadRequest());
        detectRequest(owner, trip, key(), IntStream.range(0, 51).mapToObj(i -> UUID.randomUUID()).toList())
                .andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.error.code").value("INPUT_LIMIT_EXCEEDED"))
                .andExpect(jsonPath("$.error.message").value("사진은 50장까지 보낼 수 있습니다."));
        UUID stranger = user();
        detectRequest(stranger, trip, key(), List.of(mine)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
        jdbc.update("insert into user_settings(user_id,visit_detection_mode) values(?,'OFF')", owner);
        detectRequest(owner, trip, key(), List.of(mine)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("AI_FEATURE_DISABLED"));

        assertThat(count("select count(*) from jobs where kind='VISIT_DETECTION'")).isEqualTo(before);
    }

    @Test void sameKeyReturnsSameJobAndOnlyTheRequesterCanReadIt() throws Exception {
        UUID mine = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        String key = key();
        UUID first = UUID.fromString(data(detectRequest(owner, trip, key, List.of(mine)).andExpect(status().isAccepted())).path("jobId").asString());
        JsonNode again = data(detectRequest(owner, trip, key, List.of(mine)).andExpect(status().isAccepted()));
        assertThat(again.path("jobId").asString()).isEqualTo(first.toString());
        assertThat(again.path("statusUrl").asString()).isEqualTo("/api/v1/jobs/" + first);

        run(first);
        mvc.perform(get("/api/v1/jobs/{id}", first).with(authUser(friend))).andExpect(status().isNotFound());
        JsonNode job = data(mvc.perform(get("/api/v1/jobs/{id}", first).with(authUser(owner))).andExpect(status().isOk()));
        assertThat(job.path("kind").asString()).isEqualTo("VISIT_DETECTION");
        // 입력 스냅샷(사진 목록·멤버십)과 사진 위치는 결과에 싣지 않는다
        assertThat(job.path("result").has("photoIds")).isFalse();
        assertThat(job.path("result").path("candidates").get(0).has("latitude")).isFalse();

        // 나간 요청자는 결과를 볼 수 없다
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?", ownerMember);
        mvc.perform(get("/api/v1/jobs/{id}", first).with(authUser(owner))).andExpect(status().isNotFound());
    }

    @Test void alreadyCheckedPlaceIsNotSuggested() throws Exception {
        UUID mine = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        manualVisit(owner, trip, placeA).andExpect(status().isCreated());
        UUID job = detect(owner, trip, mine);
        run(job);
        assertThat(result(owner, job).path("candidates")).isEmpty();
    }

    @Test void confirmCreatesPhotoVisitOnceAndRepeatReturnsTheSameVisit() throws Exception {
        UUID candidate = candidate(photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null));

        JsonNode visit = data(confirm(owner, trip, candidate, "{\"expectedVersion\":1}").andExpect(status().isCreated()));
        assertThat(visit.path("evidenceType").asString()).isEqualTo("PHOTO");
        assertThat(visit.path("memberId").asString()).isEqualTo(ownerMember.toString());
        assertThat(visit.path("placeId").asString()).isEqualTo(placeA.toString());
        assertThat(Instant.parse(visit.path("visitedAt").asString())).isEqualTo(Instant.parse(CAPTURED));

        JsonNode again = data(confirm(owner, trip, candidate, "{\"expectedVersion\":1}").andExpect(status().isCreated()));
        assertThat(again.path("id").asString()).isEqualTo(visit.path("id").asString());
        assertThat(count("select count(*) from visits where trip_id=? and deleted_at is null", trip)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status||':'||version||':'||visit_id from visit_candidates where id=?", String.class, candidate))
                .isEqualTo("CONFIRMED:2:" + visit.path("id").asString());
        // 직접 체크도 같은 방문을 돌려준다(여행·멤버·장소당 방문 하나)
        assertThat(data(manualVisit(owner, trip, placeA).andExpect(status().isOk())).path("id").asString()).isEqualTo(visit.path("id").asString());
    }

    @Test void confirmChecksOwnerVersionAndBody() throws Exception {
        UUID candidate = candidate(photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null));
        confirm(friend, trip, candidate, "{\"expectedVersion\":1}").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("VISIT_CANDIDATE_NOT_FOUND"));
        confirm(owner, other, candidate, "{\"expectedVersion\":1}").andExpect(status().isNotFound());
        confirm(owner, trip, UUID.randomUUID(), "{\"expectedVersion\":1}").andExpect(status().isNotFound());
        confirm(owner, trip, candidate, "{\"expectedVersion\":2}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
        confirm(owner, trip, candidate, "{}").andExpect(status().isBadRequest());
        confirm(owner, trip, candidate, "{\"expectedVersion\":1.5}").andExpect(status().isBadRequest());
        jdbc.update("insert into user_settings(user_id,visit_detection_mode) values(?,'OFF')", owner);
        confirm(owner, trip, candidate, "{\"expectedVersion\":1}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("AI_FEATURE_DISABLED"));
        assertThat(count("select count(*) from visits where trip_id=?", trip)).isZero();
    }

    @Test void confirmReusesALaterManualCheckAndInvalidatesSiblingCandidates() throws Exception {
        UUID photo = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID first = candidate(photo);
        UUID second = candidate(photo);
        JsonNode manual = data(manualVisit(owner, trip, placeA).andExpect(status().isCreated()));

        JsonNode visit = data(confirm(owner, trip, first, "{\"expectedVersion\":1}").andExpect(status().isCreated()));
        assertThat(visit.path("id").asString()).isEqualTo(manual.path("id").asString());
        assertThat(visit.path("evidenceType").asString()).isEqualTo("MANUAL");
        confirm(owner, trip, second, "{\"expectedVersion\":1}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("VISIT_CANDIDATE_INVALIDATED"));
        assertThat(jdbc.queryForObject("select status from visit_candidates where id=?", String.class, second)).isEqualTo("INVALIDATED");
    }

    @Test void movingAnEvidencePhotoInvalidatesThePendingCandidate() throws Exception {
        UUID photo = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID candidate = candidate(photo);
        mvc.perform(post("/api/v1/trips/{trip}/photos/batch", trip).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"MOVE\",\"targetTripId\":\"%s\",\"photos\":[{\"photoId\":\"%s\",\"expectedVersion\":1}]}".formatted(other, photo)))
                .andExpect(status().isOk());

        assertThat(jdbc.queryForObject("select status||':'||version from visit_candidates where id=?", String.class, candidate)).isEqualTo("INVALIDATED:2");
        confirm(owner, trip, candidate, "{\"expectedVersion\":2}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("VISIT_CANDIDATE_INVALIDATED"));
        assertThat(count("select count(*) from visits where trip_id=?", trip)).isZero();
        // 옮겨 간 사진을 근거로 둔 후보가 있어도 대상 여행을 지울 수 있다
        deleteTrip(other);
        assertThat(count("select count(*) from photos where id=?", photo)).isZero();
    }

    @Test void deletingAnEvidencePhotoInvalidatesTheCandidateAndPurgeSucceeds() throws Exception {
        UUID photo = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID candidate = candidate(photo);
        UUID deleteJob = UUID.fromString(data(mvc.perform(delete("/api/v1/trips/{trip}/photos/{id}", trip, photo).with(authUser(owner)))
                .andExpect(status().isAccepted())).path("jobId").asString());

        assertThat(jdbc.queryForObject("select status from visit_candidates where id=?", String.class, candidate)).isEqualTo("INVALIDATED");
        confirm(owner, trip, candidate, "{\"expectedVersion\":2}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("VISIT_CANDIDATE_INVALIDATED"));
        run(deleteJob);
        assertThat(count("select count(*) from photos where id=?", photo)).isZero();
        assertThat(count("select count(*) from visit_candidate_photos where candidate_id=?", candidate)).isZero();
    }

    @Test void evidenceRemovedOutsideTheMoveDeletePathsIsInvalidAtConfirmAndTripDeletionClearsCandidates() throws Exception {
        UUID photo = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID pending = candidate(photo);
        UUID confirmed = candidate(photo(trip, ownerMember, owner, gps(37.51, 127.0, null), Instant.parse(CAPTURED), placeB));
        confirm(owner, trip, confirmed, "{\"expectedVersion\":1}").andExpect(status().isCreated());
        jdbc.update("update photos set deleted_at=now() where id=?", photo);

        confirm(owner, trip, pending, "{\"expectedVersion\":1}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("VISIT_CANDIDATE_INVALIDATED"));
        deleteTrip(trip);
        assertThat(count("select count(*) from visit_candidates where trip_id=?", trip)).isZero();
        assertThat(count("select count(*) from visits where trip_id=?", trip)).isZero();
    }

    @Test void documentsPathsAndCandidateSchema() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visit-detections'].post.tags[0]").value("방문"))
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visit-detections'].post.responses['202']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visit-detections'].post.responses['422']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visit-candidates/{candidateId}/confirm'].post.responses['201']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/visit-candidates/{candidateId}/confirm'].post.responses['409']").exists())
                .andExpect(jsonPath("$.components.schemas.VisitDetectionRequest.properties.photoIds").exists())
                .andExpect(jsonPath("$.components.schemas.ConfirmVisitCandidateRequest.properties.expectedVersion").exists());
    }

    @Test void completionCreatesNothingWhenTheRequesterLeftOrTurnedTheSettingOffAfterExecution() throws Exception {
        UUID photo = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        JobContext left = context(detect(owner, trip, photo));
        var leftResult = handler.execute(left).result();
        assertThat(leftResult.path("candidates")).hasSize(1);
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?", ownerMember);
        transactions.executeWithoutResult(tx -> handler.complete(left, leftResult));
        assertThat(count("select count(*) from visit_candidates where job_id=?", left.jobId())).isZero();

        jdbc.update("update trip_members set status='ACTIVE',left_at=null where id=?", ownerMember);
        JobContext off = context(detect(owner, trip, photo));
        var offResult = handler.execute(off).result();
        jdbc.update("insert into user_settings(user_id,visit_detection_mode) values(?,'OFF')", owner);
        transactions.executeWithoutResult(tx -> handler.complete(off, offResult));
        assertThat(count("select count(*) from visit_candidates where job_id=?", off.jobId())).isZero();
    }

    @Test void completionRecomputesVisitedAtFromTheEvidenceStillLive() throws Exception {
        UUID earliest = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse("2026-11-01T01:00:00Z"), null);
        UUID later = photo(trip, ownerMember, owner, gps(37.5001, 127.0, null), Instant.parse(CAPTURED), null);
        JobContext context = context(detect(owner, trip, earliest, later));
        var result = handler.execute(context).result();
        assertThat(result.path("candidates").get(0).path("evidencePhotoIds")).hasSize(2);
        jdbc.update("update photos set deleted_at=now() where id=?", earliest);
        transactions.executeWithoutResult(tx -> handler.complete(context, result));

        assertThat(jdbc.queryForObject("select visited_at from visit_candidates where job_id=?", Timestamp.class, context.jobId()).toInstant())
                .isEqualTo(Instant.parse(CAPTURED));
        assertThat(jdbc.queryForList("select photo_id from visit_candidate_photos l join visit_candidates c on c.id=l.candidate_id where c.job_id=?",
                UUID.class, context.jobId())).containsExactly(later);
    }

    @Test void reusingAKeyWithADifferentBodyIsRejected() throws Exception {
        UUID first = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID second = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        String key = key();
        detectRequest(owner, trip, key, List.of(first)).andExpect(status().isAccepted());
        detectRequest(owner, trip, key, List.of(second)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("IDEMPOTENCY_KEY_REUSED"));
    }

    @Test void changingAnEvidencePhotosPlaceInvalidatesThePendingCandidate() throws Exception {
        UUID single = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID batched = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID untouched = photo(trip, ownerMember, owner, gps(37.51, 127.0, null), Instant.parse(CAPTURED), placeB);
        UUID singleCandidate = candidate(single), batchedCandidate = candidate(batched), sameCandidate = candidate(untouched);

        mvc.perform(patch("/api/v1/trips/{trip}/photos/{id}", trip, single).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"placeId\":\"%s\",\"expectedVersion\":1}".formatted(placeB))).andExpect(status().isOk());
        mvc.perform(post("/api/v1/trips/{trip}/photos/batch", trip).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"UPDATE\",\"placeId\":\"%s\",\"photos\":[{\"photoId\":\"%s\",\"expectedVersion\":1}]}".formatted(placeB, batched)))
                .andExpect(status().isOk());
        // 같은 장소를 다시 보내거나 주제만 바꾸면 근거가 그대로라 무효화하지 않는다
        mvc.perform(patch("/api/v1/trips/{trip}/photos/{id}", trip, untouched).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"placeId\":\"%s\",\"topics\":[\"FOOD\"],\"expectedVersion\":1}".formatted(placeB))).andExpect(status().isOk());

        assertThat(jdbc.queryForObject("select status from visit_candidates where id=?", String.class, singleCandidate)).isEqualTo("INVALIDATED");
        assertThat(jdbc.queryForObject("select status from visit_candidates where id=?", String.class, batchedCandidate)).isEqualTo("INVALIDATED");
        assertThat(jdbc.queryForObject("select status from visit_candidates where id=?", String.class, sameCandidate)).isEqualTo("PENDING");
    }

    @Test void repeatedConfirmReturnsTheVisitEvenWithTheSettingOffButLeavingHidesEverything() throws Exception {
        UUID candidate = candidate(photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null));
        UUID pending = candidate(photo(trip, ownerMember, owner, gps(37.51, 127.0, null), Instant.parse(CAPTURED), placeB));
        JsonNode visit = data(confirm(owner, trip, candidate, "{\"expectedVersion\":1}").andExpect(status().isCreated()));
        jdbc.update("insert into user_settings(user_id,visit_detection_mode) values(?,'OFF')", owner);

        assertThat(data(confirm(owner, trip, candidate, "{\"expectedVersion\":1}").andExpect(status().isCreated())).path("id").asString())
                .isEqualTo(visit.path("id").asString());
        confirm(owner, trip, pending, "{\"expectedVersion\":1}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("AI_FEATURE_DISABLED"));

        jdbc.update("delete from user_settings where user_id=?", owner);
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?", ownerMember);
        confirm(owner, trip, pending, "{\"expectedVersion\":1}").andExpect(status().isNotFound());
        confirm(owner, trip, candidate, "{\"expectedVersion\":1}").andExpect(status().isNotFound());
    }

    @Test void ownRecordsDeletionPurgesConfirmedCandidatesWithTheirVisitAndPhotos() throws Exception {
        UUID confirmedPhoto = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID pendingPhoto = photo(trip, ownerMember, owner, gps(37.51, 127.0, null), Instant.parse(CAPTURED), placeB);
        UUID confirmed = candidate(confirmedPhoto), pending = candidate(pendingPhoto);
        UUID visit = UUID.fromString(data(confirm(owner, trip, confirmed, "{\"expectedVersion\":1}").andExpect(status().isCreated())).path("id").asString());
        UUID feed = UUID.fromString(data(mvc.perform(post("/api/v1/trips/{id}/feed", trip).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Trip\",\"body\":\"\"}")).andExpect(status().isCreated())).path("id").asString());
        UUID job = UUID.fromString(data(mvc.perform(post("/api/v1/feeds/{id}/delete-own-records", feed).with(authUser(owner))
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":1}")).andExpect(status().isAccepted())).path("jobId").asString());
        // 승인 직후 근거 사진이 숨겨져 미확정 후보는 확정할 수 없다
        confirm(owner, trip, pending, "{\"expectedVersion\":1}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("VISIT_CANDIDATE_INVALIDATED"));

        run(job);
        assertThat(count("select count(*) from visits where id=?", visit)).isZero();
        assertThat(count("select count(*) from photos where id in (?,?)", confirmedPhoto, pendingPhoto)).isZero();
        assertThat(count("select count(*) from visit_candidates where id=?", confirmed)).isZero();
        assertThat(count("select count(*) from visit_candidate_photos where candidate_id in (?,?)", confirmed, pending)).isZero();
    }

    @Test void sameKeyWithTheSamePhotosInAnotherOrderReplaysTheFirstJob() throws Exception {
        UUID first = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID second = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        String key = key();
        String job = data(detectRequest(owner, trip, key, List.of(first, second)).andExpect(status().isAccepted())).path("jobId").asString();
        assertThat(data(detectRequest(owner, trip, key, List.of(second, first)).andExpect(status().isAccepted())).path("jobId").asString())
                .isEqualTo(job);
        assertThat(count("select count(*) from jobs where kind='VISIT_DETECTION' and requested_by_user_id=?", owner)).isEqualTo(1);
        detectRequest(owner, trip, key, List.of(first, first)).andExpect(status().isBadRequest());
    }

    @Test void invalidatedEvidenceIsReportedBeforeAStaleVersion() throws Exception {
        UUID photo = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID candidate = candidate(photo);
        // 이동·삭제 경로를 거치지 않고 근거가 사라지면 행은 PENDING:1 그대로다
        jdbc.update("update photos set deleted_at=now() where id=?", photo);
        assertThat(jdbc.queryForObject("select status||':'||version from visit_candidates where id=?", String.class, candidate)).isEqualTo("PENDING:1");
        confirm(owner, trip, candidate, "{\"expectedVersion\":7}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("VISIT_CANDIDATE_INVALIDATED"));
    }

    @Test void finishedJobStaysReadableWithTheSettingOffButConfirmIsBlocked() throws Exception {
        UUID job = detect(owner, trip, photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null));
        run(job);
        jdbc.update("insert into user_settings(user_id,visit_detection_mode) values(?,'OFF')", owner);

        JsonNode candidates = result(owner, job).path("candidates");
        assertThat(candidates).hasSize(1);
        mvc.perform(get("/api/v1/jobs/{id}", job).with(authUser(friend))).andExpect(status().isNotFound());
        confirm(owner, trip, UUID.fromString(candidates.get(0).path("id").asString()), "{\"expectedVersion\":1}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("AI_FEATURE_DISABLED"));
    }

    @Test void uncheckingAConfirmedVisitInvalidatesItsCandidateAndAllowsCheckingAgain() throws Exception {
        UUID photo = photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null);
        UUID candidate = candidate(photo);
        String visit = data(confirm(owner, trip, candidate, "{\"expectedVersion\":1}").andExpect(status().isCreated())).path("id").asString();

        mvc.perform(delete("/api/v1/trips/{trip}/visits/{id}", trip, visit).with(authUser(owner))).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select status||':'||version||':'||coalesce(visit_id::text,'-') from visit_candidates where id=?",
                String.class, candidate)).isEqualTo("INVALIDATED:3:-");
        confirm(owner, trip, candidate, "{\"expectedVersion\":3}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("VISIT_CANDIDATE_INVALIDATED"));
        confirm(owner, trip, candidate, "{\"expectedVersion\":2}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("VISIT_CANDIDATE_INVALIDATED"));

        // 같은 장소를 다시 체크하고 새 후보로 확정할 수 있다(체크한 장소는 제안하지 않으므로 후보를 먼저 받는다)
        UUID again = candidate(photo(trip, ownerMember, owner, gps(37.5, 127.0, null), Instant.parse(CAPTURED), null));
        String manual = data(manualVisit(owner, trip, placeA).andExpect(status().isCreated())).path("id").asString();
        assertThat(data(confirm(owner, trip, again, "{\"expectedVersion\":1}").andExpect(status().isCreated())).path("id").asString())
                .isEqualTo(manual);
    }

    // 접수한 작업을 worker 없이 직접 실행·완료해 그 사이에 상태를 바꿀 수 있게 한다
    JobContext context(UUID jobId) throws Exception {
        JsonNode input = json.readTree(jdbc.queryForObject("select input_json::text from jobs where id=?", String.class, jobId));
        return new JobContext(jobId, UUID.randomUUID(), 1, new JobSubmission(owner, JobKind.VISIT_DETECTION, trip, input, null, null));
    }

    // 사진 하나로 감지를 돌려 placeA(또는 지정 장소) 후보 ID를 얻는다
    UUID candidate(UUID photo) throws Exception {
        UUID job = detect(owner, trip, photo);
        run(job);
        JsonNode candidates = result(owner, job).path("candidates");
        assertThat(candidates).hasSize(1);
        return UUID.fromString(candidates.get(0).path("id").asString());
    }
    UUID detect(UUID user, UUID tripId, UUID... photos) throws Exception {
        return UUID.fromString(data(detectRequest(user, tripId, key(), List.of(photos)).andExpect(status().isAccepted())).path("jobId").asString());
    }
    JsonNode result(UUID user, UUID job) throws Exception {
        JsonNode found = data(mvc.perform(get("/api/v1/jobs/{id}", job).with(authUser(user))).andExpect(status().isOk()));
        assertThat(found.path("status").asString()).isEqualTo("SUCCEEDED");
        return found.path("result");
    }
    static JsonNode photoNode(JsonNode body, UUID photo) {
        for (JsonNode p : body.path("photos")) if (p.path("photoId").asString().equals(photo.toString())) return p;
        throw new AssertionError("Photo not sent: " + photo);
    }
    void run(UUID jobId) { runUntil(jobId, "SUCCEEDED"); }
    void runUntil(UUID jobId, String expected) {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        Set<String> done = Set.of("SUCCEEDED", "FAILED", "CANCELLED");
        while (!done.contains(state(jobId)) && System.nanoTime() < until) {
            if (!state(jobId).equals("QUEUED") || !worker.pollOnce()) LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
        }
        assertThat(state(jobId)).isEqualTo(expected);
    }
    String state(UUID jobId) { return jdbc.queryForObject("select status from jobs where id=?", String.class, jobId); }
    ResultActions detectRequest(UUID user, UUID tripId, String key, List<UUID> photos) throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/trips/{trip}/visit-detections", tripId)
                .with(authUser(user)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"photoIds\":" + photos.stream().map(id -> "\"" + id + "\"").collect(Collectors.joining(",", "[", "]")) + "}");
        if (key != null) request.header("Idempotency-Key", key);
        return mvc.perform(request);
    }
    ResultActions confirm(UUID user, UUID tripId, UUID candidate, String body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/api/v1/trips/{trip}/visit-candidates/{id}/confirm", tripId, candidate)
                .with(authUser(user)).contentType(MediaType.APPLICATION_JSON).content(body));
    }
    ResultActions manualVisit(UUID user, UUID tripId, UUID placeId) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/trips/{trip}/visits", tripId)
                .with(authUser(user)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"placeId\":\"%s\",\"visitedAt\":\"2026-11-01T05:00:00Z\",\"evidenceType\":\"MANUAL\"}".formatted(placeId)));
    }
    void deleteTrip(UUID tripId) {
        jdbc.update("update trips set deleted_at=now() where id=?", tripId);
        var context = new JobContext(UUID.randomUUID(), UUID.randomUUID(), 1, new JobSubmission(owner, JobKind.TRIP_DELETE, tripId,
                json.createObjectNode().put("tripId", tripId.toString()).put("reason", "OWNER_DELETE"), null,
                new CleanupScope(List.of(), List.of(), Instant.now())));
        assertThat(tripDeleteHandler.execute(context).failure()).isNull();
        transactions.executeWithoutResult(tx -> tripDeleteHandler.complete(context, json.createObjectNode()));
    }
    static String gps(double latitude, double longitude, String localTime) {
        return "{\"latitude\":" + latitude + ",\"longitude\":" + longitude + (localTime == null ? "" : ",\"capturedAtLocal\":\"" + localTime + "\"") + "}";
    }
    UUID photo(UUID tripId, UUID uploader, UUID user, String metadata, Instant capturedAt, UUID placeId) {
        UUID batch = UUID.randomUUID(), asset = UUID.randomUUID(), photo = UUID.randomUUID();
        jdbc.update("insert into photo_upload_batches(id,trip_id,created_by_member_id,file_count,registered_count,created_at,expires_at) values(?,?,?,1,1,now(),now()+interval '1 hour')", batch, tripId, uploader);
        jdbc.update("insert into assets(id,owner_user_id,trip_id,upload_batch_id,purpose,object_key,display_key,content_type,display_content_type,byte_size,status,metadata_json,created_at) values(?,?,?,?,'TRIP_PHOTO',?,?,'image/jpeg','image/jpeg',3,'READY',?::jsonb,now())",
                asset, user, tripId, batch, "original/" + asset, "display/" + asset, metadata);
        jdbc.update("insert into photos(id,batch_id,trip_id,uploader_member_id,asset_id,place_id,captured_at,created_at) values(?,?,?,?,?,?,?,now())",
                photo, batch, tripId, uploader, asset, placeId, capturedAt == null ? null : Timestamp.from(capturedAt));
        return photo;
    }
    UUID place(double latitude, double longitude) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into places(id,name,latitude,longitude,source,created_at,updated_at) values(?,'방문 장소',?,?,'MANUAL',now(),now())", id, latitude, longitude);
        return id;
    }
    static JsonNode byPlace(JsonNode candidates, UUID place) {
        for (JsonNode c : candidates) if (c.path("place").path("id").asString().equals(place.toString())) return c;
        throw new AssertionError("No candidate for " + place);
    }
    static List<UUID> ids(JsonNode array) {
        List<UUID> out = new ArrayList<>();
        array.forEach(id -> out.add(UUID.fromString(id.asString())));
        return out;
    }
    static String key() { return UUID.randomUUID().toString(); }
    UUID createTrip(UUID user) throws Exception {
        return UUID.fromString(data(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/trips")
                .with(authUser(user)).header("Idempotency-Key", key())
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"방문 여행\"}")).andExpect(status().isCreated())).path("id").asString());
    }
    UUID membership(UUID tripId, UUID user) { return jdbc.queryForObject("select id from trip_members where trip_id=? and user_id=?", UUID.class, tripId, user); }
    UUID user() { UUID id = UUID.randomUUID(); jdbc.update("insert into users(id,nickname,profile_completed,created_at,updated_at) values(?,'방문 사용자',true,now(),now())", id); return id; }
    JsonNode data(ResultActions result) throws Exception { return json.readTree(result.andReturn().getResponse().getContentAsString()).path("data"); }
    long count(String sql, Object... args) { return jdbc.queryForObject(sql, Long.class, args); }
}
