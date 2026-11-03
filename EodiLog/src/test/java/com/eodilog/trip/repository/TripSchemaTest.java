package com.eodilog.trip.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.chat.domain.ChatParticipant;
import com.eodilog.chat.domain.ChatRoom;
import com.eodilog.chat.repository.ChatParticipantRepository;
import com.eodilog.chat.repository.ChatRoomRepository;
import com.eodilog.itinerary.domain.Itinerary;
import com.eodilog.itinerary.repository.ItineraryRepository;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripDestination;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.domain.TripMemberStatus;
import com.eodilog.trip.domain.TripStatus;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

// Flyway 스키마와 엔티티 매핑(ddl-auto=validate)이 맞는지, 주요 제약이 DB에서 지켜지는지 확인한다
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class TripSchemaTest {

	private static final Instant NOW = Instant.parse("2026-10-28T06:00:00Z");

	@Autowired
	private TripRepository tripRepository;

	@Autowired
	private TripMemberRepository tripMemberRepository;

	@Autowired
	private TripDestinationRepository tripDestinationRepository;

	@Autowired
	private ChatRoomRepository chatRoomRepository;

	@Autowired
	private ChatParticipantRepository chatParticipantRepository;

	@Autowired
	private ItineraryRepository itineraryRepository;

	@Autowired
	private EntityManager entityManager;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	private UUID ownerId;

	@BeforeEach
	void setUp() {
		ownerId = insertUser("여행자");
	}

	@Test
	void storesTripWithInitialRecords() {
		Trip trip = tripRepository.saveAndFlush(Trip.create(ownerId, "제주 3박 4일",
				LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 4), TripStatus.PLANNING, NOW));
		TripMember owner = tripMemberRepository.saveAndFlush(TripMember.join(trip.getId(), ownerId, 1, NOW));
		UUID jeju = insertRegion("JEJU");
		UUID seogwipo = insertRegion("SEOGWIPO");
		tripDestinationRepository.saveAllAndFlush(List.of(
				TripDestination.of(trip.getId(), seogwipo, 0, null),
				TripDestination.of(trip.getId(), jeju, 1, null)));
		ChatRoom room = chatRoomRepository.saveAndFlush(ChatRoom.open(trip.getId(), NOW));
		chatParticipantRepository.saveAndFlush(ChatParticipant.join(room.getId(), ownerId, NOW));
		itineraryRepository.saveAndFlush(Itinerary.createEmpty(trip.getId(), owner.getId(), NOW));
		entityManager.clear();

		Trip found = tripRepository.findById(trip.getId()).orElseThrow();
		assertThat(found.getId().version()).isEqualTo(7);
		assertThat(found.getTitle()).isEqualTo("제주 3박 4일");
		assertThat(found.getStartDate()).isEqualTo(LocalDate.of(2026, 11, 1));
		assertThat(found.getStatus()).isEqualTo(TripStatus.PLANNING);
		assertThat(found.getCurrency()).isEqualTo("KRW");
		assertThat(found.getVersion()).isEqualTo(1);
		assertThat(found.getExpenseVersion()).isZero();
		assertThat(found.getCreatedAt()).isEqualTo(NOW);

		TripMember foundOwner = tripMemberRepository.findById(owner.getId()).orElseThrow();
		assertThat(foundOwner.getStatus()).isEqualTo(TripMemberStatus.ACTIVE);
		assertThat(foundOwner.getJoinOrder()).isEqualTo(1);

		assertThat(tripDestinationRepository.findAllByTripIdOrderByDisplayOrder(trip.getId()))
				.extracting(TripDestination::getRegionId)
				.containsExactly(seogwipo, jeju);
		assertThat(chatParticipantRepository.findAllByRoomId(room.getId()))
				.extracting(ChatParticipant::getUserId)
				.containsExactly(ownerId);
		assertThat(itineraryRepository.findByTripId(trip.getId()).orElseThrow().getVersion()).isEqualTo(1);
		assertThat(jdbcTemplate.queryForObject(
				"select preference_scope from trip_members where id = ?", String.class, owner.getId()))
				.isEqualTo("INHERIT");
	}

	@Test
	void rejectsOnlyOneSideOfPeriod() {
		assertThatThrownBy(() -> tripRepository.saveAndFlush(
				Trip.create(ownerId, "제주", LocalDate.of(2026, 11, 1), null, TripStatus.PLANNING, NOW)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void rejectsReversedPeriod() {
		assertThatThrownBy(() -> tripRepository.saveAndFlush(Trip.create(ownerId, "제주",
				LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 1), TripStatus.PLANNING, NOW)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void rejectsBlankTitle() {
		assertThatThrownBy(() -> tripRepository.saveAndFlush(
				Trip.create(ownerId, "  ", null, null, TripStatus.PLANNING, NOW)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void rejectsUnknownOwner() {
		assertThatThrownBy(() -> tripRepository.saveAndFlush(
				Trip.create(UUID.randomUUID(), "제주", null, null, TripStatus.PLANNING, NOW)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void rejectsDuplicateMembership() {
		Trip trip = saveTrip();
		tripMemberRepository.saveAndFlush(TripMember.join(trip.getId(), ownerId, 1, NOW));

		assertThatThrownBy(() -> tripMemberRepository.saveAndFlush(TripMember.join(trip.getId(), ownerId, 2, NOW)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void rejectsDuplicateJoinOrder() {
		Trip trip = saveTrip();
		tripMemberRepository.saveAndFlush(TripMember.join(trip.getId(), ownerId, 1, NOW));
		UUID friendId = insertUser("동행");

		assertThatThrownBy(() -> tripMemberRepository.saveAndFlush(TripMember.join(trip.getId(), friendId, 1, NOW)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void rejectsSecondChatRoomForTrip() {
		Trip trip = saveTrip();
		chatRoomRepository.saveAndFlush(ChatRoom.open(trip.getId(), NOW));

		assertThatThrownBy(() -> chatRoomRepository.saveAndFlush(ChatRoom.open(trip.getId(), NOW)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void rejectsSecondItineraryForTrip() {
		Trip trip = saveTrip();
		TripMember owner = tripMemberRepository.saveAndFlush(TripMember.join(trip.getId(), ownerId, 1, NOW));
		itineraryRepository.saveAndFlush(Itinerary.createEmpty(trip.getId(), owner.getId(), NOW));

		assertThatThrownBy(() -> itineraryRepository.saveAndFlush(Itinerary.createEmpty(trip.getId(), owner.getId(), NOW)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void rejectsCurrencyOtherThanKrw() {
		Trip trip = saveTrip();

		assertThatThrownBy(() -> jdbcTemplate.update("update trips set currency = 'USD' where id = ?", trip.getId()))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void storesIdempotencyRecordOnlyWhenCompletedHasStatus() {
		jdbcTemplate.update("""
				insert into idempotency_records
				(user_id, request_scope, idempotency_key, request_hash, status, created_at, expires_at)
				values (?, 'POST /api/v1/trips', 'key-1', 'hash', 'IN_PROGRESS', now(), now() + interval '1 day')
				""", ownerId);

		assertThatThrownBy(() -> jdbcTemplate.update(
				"update idempotency_records set status = 'COMPLETED' where user_id = ?", ownerId))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	private Trip saveTrip() {
		return tripRepository.saveAndFlush(Trip.create(ownerId, "제주", null, null, TripStatus.PLANNING, NOW));
	}

	// users는 A-0 소유 테이블이라 엔티티 없이 SQL로 가입 완료 회원을 넣는다
	private UUID insertUser(String nickname) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("""
				insert into users (id, nickname, profile_completed, created_at, updated_at)
				values (?, ?, true, now(), now())
				""", id, nickname);
		return id;
	}

	private UUID insertRegion(String code) {
		UUID id = UUID.randomUUID();
		jdbcTemplate.update("insert into regions (id, code, name) values (?, ?, ?)", id, code, code);
		return id;
	}

}
