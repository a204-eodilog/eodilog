package com.eodilog.notification;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
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
                .andExpect(jsonPath("$.data[0].message").value("notice"));
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
}
