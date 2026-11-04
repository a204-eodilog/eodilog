package com.eodilog.user.settings;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class UserSettingsApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper mapper;

    @Test
    void openApiDocumentsSettingsEndpointsAndPatchFields() throws Exception {
        String body = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var root = mapper.readTree(body);
        var path = root.get("paths").get("/api/v1/me/settings");
        assertThat(path.get("get")).isNotNull();
        assertThat(path.get("patch")).isNotNull();
        assertThat(body).contains("SettingsPatch", "expectedVersion", "photoClassification", "voteCourse", "VERSION_CONFLICT");
    }

    @Test
    void firstGetCreatesDefaultsAtVersionOne() throws Exception {
        UUID user = user(true);
        getSettings(user).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(1))
                .andExpect(jsonPath("$.data.ai.photoClassification").value("CONFIRM"))
                .andExpect(jsonPath("$.data.ai.visitDetection").value("CONFIRM"))
                .andExpect(jsonPath("$.data.ai.placeExtraction").value("CONFIRM"))
                .andExpect(jsonPath("$.data.ai.checklist").value("CONFIRM"))
                .andExpect(jsonPath("$.data.ai.weather").value("SUGGEST_ONLY"))
                .andExpect(jsonPath("$.data.notifications.followRequests").value(true))
                .andExpect(jsonPath("$.data.notifications.voteCourse").value(true))
                .andExpect(jsonPath("$.data.notifications.tripChanges").value(true));
        assertThat(version(user)).isEqualTo(1);
    }

    @Test
    void partialPatchPersistsAndNoopDoesNotIncreaseVersion() throws Exception {
        UUID user = user(true);
        patchSettings(user, """
                {"expectedVersion":1,"ai":{"photoClassification":"AUTO","weather":"OFF"},"notifications":{"voteCourse":false}}
                """)
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(2));
        getSettings(user).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(2))
                .andExpect(jsonPath("$.data.ai.photoClassification").value("AUTO"))
                .andExpect(jsonPath("$.data.ai.weather").value("OFF"))
                .andExpect(jsonPath("$.data.ai.visitDetection").value("CONFIRM"))
                .andExpect(jsonPath("$.data.notifications.voteCourse").value(false))
                .andExpect(jsonPath("$.data.notifications.tripChanges").value(true));
        patchSettings(user, """
                {"expectedVersion":2,"ai":{"photoClassification":"AUTO"}}
                """)
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(2));
        assertThat(version(user)).isEqualTo(2);
    }

    @Test
    void staleVersionLeavesAllValuesUnchanged() throws Exception {
        UUID user = user(true);
        patchSettings(user, """
                {"expectedVersion":1,"notifications":{"followRequests":false}}
                """)
                .andExpect(status().isOk());
        patchSettings(user, """
                {"expectedVersion":1,"ai":{"checklist":"OFF"}}
                """)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
        getSettings(user).andExpect(jsonPath("$.data.version").value(2))
                .andExpect(jsonPath("$.data.ai.checklist").value("CONFIRM"))
                .andExpect(jsonPath("$.data.notifications.followRequests").value(false));
    }

    @Test
    void invalidInputReturns400WithoutChangingDatabase() throws Exception {
        UUID user = user(true);
        getSettings(user);
        for (String body : new String[] {
                """
                {"expectedVersion":1,"ai":{"weather":"AUTO"}}
                """,
                """
                {"ai":{"checklist":"OFF"}}
                """,
                """
                {"expectedVersion":1,"ai":{"unknown":"OFF"}}
                """,
                """
                {"expectedVersion":1,"notifications":{"tripChanges":null}}
                """,
                """
                {"expectedVersion":0,"ai":{"checklist":"OFF"}}
                """ }) {
            patchSettings(user, body).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        }
        getSettings(user).andExpect(jsonPath("$.data.version").value(1))
                .andExpect(jsonPath("$.data.ai.checklist").value("CONFIRM"));
    }

    @Test
    void anonymousAndPendingUserCannotSeeSettings() throws Exception {
        mvc.perform(get("/api/v1/me/settings")).andExpect(status().isUnauthorized());
        UUID pending = user(false);
        getSettings(pending).andExpect(status().isForbidden());
        patchSettings(pending, """
                {"expectedVersion":1,"ai":{"checklist":"OFF"}}
                """)
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_settings WHERE user_id=?", Long.class, pending)).isZero();
    }

    private ResultActions getSettings(UUID user) throws Exception {
        return mvc.perform(get("/api/v1/me/settings").with(authUser(user)));
    }

    private ResultActions patchSettings(UUID user, String body) throws Exception {
        return mvc.perform(patch("/api/v1/me/settings").with(authUser(user))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private UUID user(boolean completed) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id,nickname,profile_completed,created_at,updated_at) VALUES (?,?,?,now(),now())",
                id, completed ? "테스터" : "", completed);
        return id;
    }

    private long version(UUID user) {
        return jdbc.queryForObject("SELECT version FROM user_settings WHERE user_id=?", Long.class, user);
    }
}
