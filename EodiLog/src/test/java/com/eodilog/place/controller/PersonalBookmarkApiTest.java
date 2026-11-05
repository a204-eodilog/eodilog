package com.eodilog.place.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PersonalBookmarkApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test
    void savesUpdatesAndDeletesOnlyMyBookmark() throws Exception {
        UUID owner = user();
        UUID other = user();
        UUID place = place();
        String path = "/api/v1/me/bookmarks/{placeId}";
        mvc.perform(put(path, place).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memo\":\"가고 싶음\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.place.id").value(place.toString()))
                .andExpect(jsonPath("$.data.retainedPlace.latitude").value(35.15));
        mvc.perform(put(path, place).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memo\":\"가고 싶음\"}"))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM personal_bookmarks WHERE user_id=?", Long.class, owner))
                .isEqualTo(1);
        mvc.perform(get("/api/v1/me/bookmarks").with(authUser(other)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
        mvc.perform(patch(path, place).with(authUser(other)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memo\":\"타인 변경\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(patch(path, place).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memo\":\"다시 가기\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.memo").value("다시 가기"));
        mvc.perform(delete(path, place).with(authUser(owner))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/bookmarks").with(authUser(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void rejectsUnavailableSourceFeedInsteadOfIgnoringIt() throws Exception {
        UUID owner = user();
        UUID place = place();
        mvc.perform(put("/api/v1/me/bookmarks/{placeId}", place).with(authUser(owner))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sourceFeedId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM personal_bookmarks WHERE user_id=?", Long.class, owner))
                .isZero();
    }

    private UUID user() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) "
                + "VALUES(?,'사용자',true,now(),now())", id);
        return id;
    }

    private UUID place() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO places(id,name,latitude,longitude,source,created_at,updated_at) "
                + "VALUES(?,'광안리',35.15,129.12,'MANUAL',now(),now())", id);
        return id;
    }
}
