package com.eodilog.trip.controller;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.chat.service.ChatRoomInitializer;
import com.eodilog.global.idempotency.IdempotencyService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.web.servlet.MockMvc;

// 초기화 중 하나가 실패하면 여행·멤버십·멱등 기록까지 모두 남지 않아야 한다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class TripCreateRollbackTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@MockitoSpyBean
	private ChatRoomInitializer chatRoomInitializer;

	@Test
	void rollsBackWholeCreationWhenChatRoomFails() throws Exception {
		UUID userId = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, '여행자', true, now(), now())""", userId);
		// 주입된 빈은 트랜잭션 프록시라 스텁 호출에도 MANDATORY 검사가 돈다. 프록시 안쪽의 스파이에 스텁을 건다
		ChatRoomInitializer spy = AopTestUtils.getUltimateTargetObject(chatRoomInitializer);
		doThrow(new IllegalStateException("chat room failure")).when(spy).openTripRoom(any(), any(), any());

		mockMvc.perform(post("/api/v1/trips").with(authUser(userId)).with(csrf())
						.header(IdempotencyService.HEADER_NAME, "key-1")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"title\":\"제주\"}"))
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.error.code").value("INTERNAL_ERROR"));

		assertThat(count("select count(*) from trips where owner_user_id = ?", userId)).isZero();
		assertThat(count("select count(*) from trip_members where user_id = ?", userId)).isZero();
		assertThat(count("select count(*) from idempotency_records where user_id = ?", userId)).isZero();
	}

	private long count(String sql, Object... args) {
		return jdbcTemplate.queryForObject(sql, Long.class, args);
	}

}
