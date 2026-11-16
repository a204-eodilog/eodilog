package com.eodilog.notification;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import com.eodilog.trip.domain.TripInfoChangedEvent;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class NotificationApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager manager;
    TransactionTemplate tx;
    @Autowired NotificationEventRegistrar registrar;
    @Autowired ApplicationEventPublisher publisher;
    @Autowired JsonMapper json;

    @BeforeEach void setUp() { tx = new TransactionTemplate(manager); }

    @Test void nonTripEventAllowsNullTripAndActor() throws Exception {
        UUID recipient = user();
        UUID event = tx.execute(s -> registrar.register(new NotificationEventRegistrar.EventCommand(
                "SYSTEM_NOTICE", null, null, "USER", recipient, "notice", "system-" + recipient),
                List.of(recipient)));
        assertThat(event).isNotNull();
        mvc.perform(get("/api/v1/me/notifications").with(authUser(recipient)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].eventId").value(event.toString()))
                .andExpect(jsonPath("$.data[0].message").value("notice"))
                // 여행과 무관한 알림도 tripId 칸은 있고 값이 null이다
                .andExpect(jsonPath("$.data[0]", hasKey("tripId")))
                .andExpect(jsonPath("$.data[0].tripId").value(nullValue()));
    }

    // 투표 알림은 대상이 투표 번호라, 앱이 투표 화면 주소를 만들려면 여행 번호가 따로 필요하다
    @Test void tripEventCarriesTripIdInListAndReadResponse() throws Exception {
        UUID member = user(), trip = trip(member), poll = UUID.randomUUID();
        UUID event = tx.execute(s -> registrar.register(new NotificationEventRegistrar.EventCommand(
                "POLL_OPENED", trip, null, "POLL", poll, "새 투표가 열렸어요.", "poll-opened-" + poll),
                List.of(member)));
        String id = jdbc.queryForObject("SELECT id::text FROM notifications WHERE event_id=?", String.class, event);
        mvc.perform(get("/api/v1/me/notifications").with(authUser(member))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].target.type").value("POLL"))
                .andExpect(jsonPath("$.data[0].target.id").value(poll.toString()))
                .andExpect(jsonPath("$.data[0].tripId").value(trip.toString()));
        mvc.perform(patch("/api/v1/me/notifications/" + id).with(authUser(member))
                .contentType("application/json").content("{\"read\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.tripId").value(trip.toString()))
                .andExpect(jsonPath("$.data.readAt").isNotEmpty());
        // 이미 읽은 알림을 다시 읽어도 같은 모양이다
        mvc.perform(patch("/api/v1/me/notifications/" + id).with(authUser(member))
                .contentType("application/json").content("{\"read\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.tripId").value(trip.toString()));
    }

    // Swagger 화면을 띄워 보는 대신 문서 출력으로 확인한다(AGENTS "완료 전 확인")
    @Test void apiDocsDescribeTripIdOnNotification() throws Exception {
        String body = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var schema = json.readTree(body).path("components").path("schemas").path("NotificationView");
        assertThat(schema.path("properties").has("tripId")).isTrue();
        assertThat(schema.path("properties").path("tripId").toString()).contains("uuid", "여행 ID");
        assertThat(schema.path("required").toString()).contains("tripId");
    }

    @Test void voteCourseSettingOffSkipsPollAndCourseNotifications() throws Exception {
        UUID owner = user(), off = user(), otherOff = user(), noRow = user(), trip = trip(owner);
        join(trip, off, 2); join(trip, otherOff, 3); join(trip, noRow, 4);
        settings(off, false, true);
        // 다른 설정(여행 소식)만 끈 사람은 투표·코스 알림을 받는다
        settings(otherOff, true, false);
        for (String type : List.of("POLL_OPENED", "POLL_CANDIDATE_ADDED", "POLL_REMINDER", "POLL_FINALIZED",
                "POLL_CLOSED_NO_VOTES", "COURSE_CHANGED")) {
            UUID event = tx.execute(s -> registrar.register(new NotificationEventRegistrar.EventCommand(
                    type, trip, owner, "POLL", trip, "소식", type + "-" + trip), List.of(off, otherOff, noRow)));
            assertThat(recipientsOf(event)).as(type).containsExactlyInAnyOrder(otherOff, noRow);
        }
        mvc.perform(get("/api/v1/me/notifications").with(authUser(off))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(get("/api/v1/me/notification-summary").with(authUser(off))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unreadCount").value(0));
    }

    @Test void tripChangesSettingOffSkipsTripInfoAndMemberJoinedNotifications() {
        UUID owner = user(), off = user(), otherOff = user(), noRow = user(), trip = trip(owner);
        join(trip, off, 2); join(trip, otherOff, 3); join(trip, noRow, 4);
        settings(off, true, false);
        // 다른 설정(투표·코스 소식)만 끈 사람은 여행 소식을 받는다
        settings(otherOff, false, true);
        UUID joined = tx.execute(s -> registrar.register(new NotificationEventRegistrar.EventCommand(
                "TRIP_MEMBER_JOINED", trip, owner, "TRIP", trip, "참여했어요.", "joined-" + trip),
                List.of(off, otherOff, noRow)));
        assertThat(recipientsOf(joined)).containsExactlyInAnyOrder(otherOff, noRow);
        // 여행 수정이 실제로 거치는 길(TripInfoNotificationListener)도 같은 설정을 따른다
        tx.executeWithoutResult(s -> publisher.publishEvent(new TripInfoChangedEvent(trip, owner,
                java.util.Set.of("title"), 2, Instant.now())));
        UUID changed = jdbc.queryForObject("SELECT id FROM events WHERE type='TRIP_INFO_CHANGED' AND trip_id=?",
                UUID.class, trip);
        assertThat(recipientsOf(changed)).containsExactlyInAnyOrder(otherOff, noRow);
    }

    @Test void settingsDoNotBlockOtherKindsAndTheEventRowStays() {
        UUID owner = user(), off = user(), trip = trip(owner);
        join(trip, off, 2);
        settings(off, false, false);
        // 두 설정이 가리키지 않는 종류는 그대로 받는다
        UUID other = tx.execute(s -> registrar.register(new NotificationEventRegistrar.EventCommand(
                "SYSTEM_NOTICE", trip, owner, "TRIP", trip, "안내", "notice-" + trip), List.of(off)));
        assertThat(recipientsOf(other)).containsExactly(off);
        // 받는 사람이 모두 꺼 두었어도 이벤트 행은 남고 알림 행만 없다
        UUID poll = tx.execute(s -> registrar.register(new NotificationEventRegistrar.EventCommand(
                "POLL_OPENED", trip, owner, "POLL", trip, "소식", "all-off-" + trip), List.of(off)));
        assertThat(poll).isNotNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM events WHERE id=?", Integer.class, poll)).isOne();
        assertThat(recipientsOf(poll)).isEmpty();
        // 설정을 다시 켜면 그 뒤에 생기는 알림부터 받는다
        jdbc.update("UPDATE user_settings SET vote_course_enabled=true WHERE user_id=?", off);
        UUID later = tx.execute(s -> registrar.register(new NotificationEventRegistrar.EventCommand(
                "POLL_OPENED", trip, owner, "POLL", trip, "소식", "back-on-" + trip), List.of(off)));
        assertThat(recipientsOf(later)).containsExactly(off);
        assertThat(recipientsOf(poll)).isEmpty();
    }

    @Test void registrationAndReadsAreRecipientScopedAndIdempotent() throws Exception {
        UUID member = user(), outsider = user(), trip = trip(member);
        UUID event = tx.execute(s -> registrar.register(command(trip,"event-"+trip),List.of(member, outsider, member)));
        UUID repeated = tx.execute(s -> registrar.register(command(trip,"event-"+trip),List.of(member)));
        assertThat(repeated).isEqualTo(event);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE event_id=?",Integer.class,event)).isOne();
        String id = jdbc.queryForObject("SELECT id::text FROM notifications WHERE event_id=?",String.class,event);
        mvc.perform(get("/api/v1/me/notifications").with(authUser(member))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].eventId").value(event.toString()))
                .andExpect(jsonPath("$.data[0].message").value("여행이 바뀌었습니다."));
        mvc.perform(get("/api/v1/me/notification-summary").with(authUser(member))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unreadCount").value(1));
        mvc.perform(get("/api/v1/me/notifications").with(authUser(outsider))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(patch("/api/v1/me/notifications/"+id).with(authUser(outsider))
                .contentType("application/json").content("{\"read\":true}"))
                .andExpect(status().isNotFound());
        mvc.perform(patch("/api/v1/me/notifications/"+id).with(authUser(member))
                .contentType("application/json").content("{\"read\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.readAt").isNotEmpty());
        mvc.perform(post("/api/v1/me/events/"+event+"/read").with(authUser(member)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.readAt").isNotEmpty());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM event_receipts WHERE event_id=?",Integer.class,event)).isOne();
        mvc.perform(get("/api/v1/me/notification-summary").with(authUser(member))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unreadCount").value(0));
        mvc.perform(delete("/api/v1/me/notifications/"+id).with(authUser(member))).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/me/notifications/"+id).with(authUser(member))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/notifications").with(authUser(member))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());
    }

    @Test void tripVisibilityIsCheckedAgainAfterLeaving() throws Exception {
        UUID member=user(),trip=trip(member);
        UUID event=tx.execute(s -> registrar.register(command(trip,"leave-"+trip),List.of(member)));
        jdbc.update("UPDATE trip_members SET status='LEFT',left_at=now() WHERE trip_id=? AND user_id=?",trip,member);
        mvc.perform(get("/api/v1/me/notifications").with(authUser(member))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(get("/api/v1/me/notification-summary").with(authUser(member))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unreadCount").value(0));
        mvc.perform(post("/api/v1/me/events/"+event+"/read").with(authUser(member)))
                .andExpect(status().isNotFound());
    }

    @Test void eventRegistrationRollsBackWithBusinessTransaction() {
        UUID member=user(),trip=trip(member),id=UUID.randomUUID();
        tx.executeWithoutResult(s -> {
            registrar.register(command(trip,"rollback-"+id),List.of(member));
            s.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("SELECT count(*) FROM events WHERE deduplication_key=?",Integer.class,"rollback-"+id)).isZero();
    }

    @Test void existingTripChangeEventIsSavedInTheSameTransaction() {
        UUID owner=user(),member=user(),trip=trip(owner);
        jdbc.update("INSERT INTO trip_members(id,trip_id,user_id,status,join_order,joined_at) VALUES(?,?,?,'ACTIVE',2,now())",
                UUID.randomUUID(),trip,member);
        tx.executeWithoutResult(s -> publisher.publishEvent(new TripInfoChangedEvent(trip,owner,
                java.util.Set.of("title"),2,Instant.now())));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM events WHERE type='TRIP_INFO_CHANGED' AND trip_id=?",Integer.class,trip)).isOne();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_user_id=?",Integer.class,member)).isOne();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_user_id=?",Integer.class,owner)).isZero();
    }

    @Test void pagesAndReadAllUseTheRequestedCutoff() throws Exception {
        UUID member=user(),trip=trip(member);
        for (int i=0;i<3;i++) {
            String key="page-"+trip+"-"+i;
            tx.execute(s -> registrar.register(command(trip,key),List.of(member)));
        }
        String first=mvc.perform(get("/api/v1/me/notifications").with(authUser(member)).param("limit","2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.page.hasNext").value(true))
                .andReturn().getResponse().getContentAsString();
        String cursor=json.readTree(first).path("page").path("nextCursor").asText();
        mvc.perform(get("/api/v1/me/notifications").with(authUser(member))
                .param("limit","2").param("cursor",cursor))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1));
        mvc.perform(get("/api/v1/me/notifications").with(authUser(member)).param("cursor","bad"))
                .andExpect(status().isBadRequest());
        Instant through=Instant.now();
        mvc.perform(post("/api/v1/me/notifications/read-all").with(authUser(member))
                .contentType("application/json").content("{\"through\":\""+through+"\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.updatedCount").value(3));
        mvc.perform(get("/api/v1/me/notifications").with(authUser(member)).param("unreadOnly","true"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(post("/api/v1/me/notifications/read-all").with(authUser(member))
                .contentType("application/json").content("{\"through\":\""+Instant.now().plusSeconds(60)+"\"}"))
                .andExpect(status().isBadRequest());
    }

    private NotificationEventRegistrar.EventCommand command(UUID trip,String key) {
        return new NotificationEventRegistrar.EventCommand("TRIP_INFO_CHANGED",trip,null,"TRIP",trip,
                "여행이 바뀌었습니다.",key);
    }
    private UUID user() {
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) VALUES(?,'알림 테스트',true,now(),now())",id);
        return id;
    }
    private UUID trip(UUID owner) {
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO trips(id,owner_user_id,title,created_at,updated_at) VALUES(?,?,'알림 여행',now(),now())",id,owner);
        jdbc.update("INSERT INTO trip_members(id,trip_id,user_id,status,join_order,joined_at) VALUES(?,?,?,'ACTIVE',1,now())",
                UUID.randomUUID(),id,owner);
        return id;
    }
    private void join(UUID trip, UUID user, int order) {
        jdbc.update("INSERT INTO trip_members(id,trip_id,user_id,status,join_order,joined_at) VALUES(?,?,?,'ACTIVE',?,now())",
                UUID.randomUUID(), trip, user, order);
    }
    // 나머지 설정 열은 기본값을 쓴다
    private void settings(UUID user, boolean voteCourse, boolean tripChanges) {
        jdbc.update("INSERT INTO user_settings(user_id,vote_course_enabled,trip_changes_enabled) VALUES(?,?,?)",
                user, voteCourse, tripChanges);
    }
    private List<UUID> recipientsOf(UUID event) {
        return jdbc.queryForList("SELECT recipient_user_id FROM notifications WHERE event_id=?", UUID.class, event);
    }
}
