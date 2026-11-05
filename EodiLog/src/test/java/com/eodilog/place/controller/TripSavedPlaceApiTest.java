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
import org.junit.jupiter.api.BeforeEach;
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
class TripSavedPlaceApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    UUID owner;
    UUID friend;
    UUID outsider;
    UUID trip;
    UUID ownerMember;
    UUID friendMember;
    UUID place;

    @BeforeEach
    void setup() {
        owner = user(); friend = user(); outsider = user();
        trip = UUID.randomUUID(); ownerMember = UUID.randomUUID(); friendMember = UUID.randomUUID();
        place = UUID.randomUUID();
        jdbc.update("INSERT INTO trips(id,owner_user_id,title,created_at,updated_at) VALUES(?,?,?,now(),now())",
                trip, owner, "여행");
        jdbc.update("INSERT INTO trip_members(id,trip_id,user_id,status,join_order,joined_at) VALUES(?,?,?,'ACTIVE',1,now())",
                ownerMember, trip, owner);
        jdbc.update("INSERT INTO trip_members(id,trip_id,user_id,status,join_order,joined_at) VALUES(?,?,?,'ACTIVE',2,now())",
                friendMember, trip, friend);
        jdbc.update("INSERT INTO places(id,name,latitude,longitude,source,created_at,updated_at) "
                + "VALUES(?,'광안리',35.15,129.12,'MANUAL',now(),now())", place);
    }

    @Test
    void multipleMembersSaveSamePlaceAndOnlyOwnContributionIsDeleted() throws Exception {
        String path = "/api/v1/trips/{tripId}/saved-places/{placeId}/me";
        mvc.perform(put(path, trip, place).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memo\":\"A\"}")).andExpect(status().isOk());
        mvc.perform(put(path, trip, place).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memo\":\"A\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.savedCount").value(1));
        mvc.perform(put(path, trip, place).with(authUser(friend)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memo\":\"B\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.savedCount").value(2));
        mvc.perform(get("/api/v1/trips/{tripId}/saved-places", trip).with(authUser(owner))
                .param("filter", "OVERLAP").param("bbox", "129,35,130,36"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totals.overlapPlaceCount").value(1))
                .andExpect(jsonPath("$.items[0].savedBy.length()").value(2));
        mvc.perform(patch(path, trip, place).with(authUser(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memo\":\"A2\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.savedBy[0].memo").value("A2"));
        mvc.perform(delete(path, trip, place).with(authUser(owner))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/trips/{tripId}/saved-places", trip).with(authUser(friend)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].savedCount").value(1))
                .andExpect(jsonPath("$.items[0].savedBy[0].memberId").value(friendMember.toString()));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM trip_place_saves WHERE trip_id=?", Long.class, trip))
                .isEqualTo(1);
    }

    @Test
    void outsiderCannotReadOrSaveTripPlace() throws Exception {
        mvc.perform(get("/api/v1/trips/{tripId}/saved-places", trip).with(authUser(outsider)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("TRIP_NOT_FOUND"));
        mvc.perform(put("/api/v1/trips/{tripId}/saved-places/{placeId}/me", trip, place)
                .with(authUser(outsider)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
    }

    private UUID user() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) "
                + "VALUES(?,'사용자',true,now(),now())", id);
        return id;
    }
}
