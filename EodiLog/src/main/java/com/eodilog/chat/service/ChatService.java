package com.eodilog.chat.service;

import com.eodilog.chat.domain.ChatRoom;
import com.eodilog.chat.domain.Message;
import com.eodilog.chat.dto.ChatRoomResponse;
import com.eodilog.chat.dto.MessagePageResponse;
import com.eodilog.chat.dto.MessageResponse;
import com.eodilog.chat.dto.SendMessageRequest;
import com.eodilog.chat.exception.ChatErrorCode;
import com.eodilog.chat.repository.ChatRoomRepository;
import com.eodilog.chat.repository.MessageRepository;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.domain.TripMemberStatus;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.trip.repository.TripRepository;
import com.eodilog.trip.service.TripAccessChecker;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.service.UserCardReader;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 여행 그룹 채팅 REST(명세 §9). 방 참여 권한은 지금의 여행 ACTIVE 멤버십이다(채팅 참여 행은 멤버십과 함께 바뀐다)
// ACTIVE 멤버는 신규·재참여 모두 처음부터 전체 대화를 본다(Q-13, 2026-11-02). 실시간 전송·첨부·편집·삭제·읽음은 없다
@Service
@RequiredArgsConstructor
public class ChatService {

	public static final int DEFAULT_LIMIT = 20;
	public static final int MAX_LIMIT = 100;
	public static final int TEXT_MAX_LENGTH = 1000;

	private final ChatRoomRepository chatRoomRepository;
	private final MessageRepository messageRepository;
	private final TripRepository tripRepository;
	private final TripMemberRepository tripMemberRepository;
	private final TripAccessChecker tripAccessChecker;
	private final UserCardReader userCardReader;
	private final EntityManager entityManager;
	private final Clock clock;

	// 지금 ACTIVE 멤버인 여행의 방만. 방이 만들어진 순서의 역순(createdAt DESC, id DESC) 커서 페이지
	@Transactional(readOnly = true)
	public PageResponse<ChatRoomResponse> getRooms(UUID userId, String cursor, int limit) {
		CreatedAtCursor after = cursor == null || cursor.isBlank() ? null : CreatedAtCursor.decode(cursor);
		String jpql = """
				select r from ChatRoom r
				where exists (select 1 from TripMember m
						where m.tripId = r.tripId and m.userId = :userId and m.status = :active)
				and exists (select 1 from Trip t where t.id = r.tripId and t.deletedAt is null)"""
				+ (after == null ? "" : " and (r.createdAt < :cursorAt or (r.createdAt = :cursorAt and r.id < :cursorId))")
				+ " order by r.createdAt desc, r.id desc";
		TypedQuery<ChatRoom> query = entityManager.createQuery(jpql, ChatRoom.class)
				.setParameter("userId", userId)
				.setParameter("active", TripMemberStatus.ACTIVE)
				.setMaxResults(limit + 1);
		if (after != null) {
			query.setParameter("cursorAt", after.createdAt()).setParameter("cursorId", after.id());
		}
		List<ChatRoom> found = query.getResultList();
		boolean hasNext = found.size() > limit;
		List<ChatRoom> page = hasNext ? found.subList(0, limit) : found;
		String nextCursor = hasNext
				? new CreatedAtCursor(page.getLast().getCreatedAt(), page.getLast().getId()).encode()
				: null;
		return PageResponse.of(toResponses(userId, page), nextCursor, hasNext);
	}

	@Transactional(readOnly = true)
	public ChatRoomResponse getTripRoom(UUID userId, UUID tripId) {
		tripAccessChecker.requireActiveMember(tripId, userId);
		ChatRoom room = chatRoomRepository.findByTripId(tripId)
				.orElseThrow(() -> new IllegalStateException("Trip has no chat room: " + tripId));
		return toResponses(userId, List.of(room)).getFirst();
	}

	// sequence 내림차순, beforeSequence는 포함하지 않는다. 다음 요청은 page.nextBeforeSequence(이 페이지의 최소 sequence)를 쓴다
	@Transactional(readOnly = true)
	public MessagePageResponse getMessages(UUID userId, UUID roomId, Long beforeSequence, int limit) {
		ChatRoom room = chatRoomRepository.findById(roomId)
				.orElseThrow(() -> new BusinessException(ChatErrorCode.CHAT_ROOM_NOT_FOUND));
		requireParticipant(room, userId);
		List<Message> found = beforeSequence == null
				? messageRepository.findByRoomIdOrderBySequenceDesc(roomId, Limit.of(limit + 1))
				: messageRepository.findByRoomIdAndSequenceLessThanOrderBySequenceDesc(roomId, beforeSequence,
						Limit.of(limit + 1));
		boolean hasNext = found.size() > limit;
		List<Message> page = hasNext ? found.subList(0, limit) : found;
		return new MessagePageResponse(page.stream().map(MessageResponse::of).toList(),
				new MessagePageResponse.Page(hasNext ? page.getLast().getSequence() : null, hasNext));
	}

	// 판정 순서: 입력 400 → 방 잠금 후 참여 확인 404 → 같은 clientMessageId면 처음 메시지(다른 방·본문이면 409) → 저장
	// 방 행을 잠가 순번을 빈틈없이 발급한다. 같은 clientMessageId를 서로 다른 방에 동시에 보내면 방 잠금으로는 막지 못하므로
	// (보낸 사람, clientMessageId) 단위 advisory 잠금을 먼저 잡는다. 잠금 순서는 항상 advisory → 방 행이다
	@Transactional
	public MessageResponse sendMessage(UUID userId, UUID roomId, SendMessageRequest request) {
		validate(request);
		lockClientMessageId(userId, request.clientMessageId());
		ChatRoom room = chatRoomRepository.findByIdForUpdate(roomId)
				.orElseThrow(() -> new BusinessException(ChatErrorCode.CHAT_ROOM_NOT_FOUND));
		requireParticipant(room, userId);

		Optional<Message> existing = messageRepository.findBySenderUserIdAndClientMessageId(userId,
				request.clientMessageId());
		if (existing.isPresent()) {
			Message message = existing.get();
			// 나가기로 본문을 지운 메시지(text null)의 ID는 다시 쓸 수 없다(정책 §15)
			if (!message.getRoomId().equals(roomId) || !request.text().equals(message.getText())) {
				throw new BusinessException(ChatErrorCode.CLIENT_MESSAGE_ID_REUSED);
			}
			return MessageResponse.of(message);
		}
		Message message = messageRepository.save(Message.text(roomId, userId, room.takeNextSequence(),
				request.text(), request.clientMessageId(), now()));
		messageRepository.flush();
		return MessageResponse.of(message);
	}

	// 트랜잭션이 끝나면 풀린다. 해시가 겹치면 서로 다른 키도 잠깐 기다릴 뿐 결과는 같다
	private void lockClientMessageId(UUID userId, UUID clientMessageId) {
		long key = userId.getMostSignificantBits() ^ userId.getLeastSignificantBits()
				^ Long.rotateLeft(clientMessageId.getMostSignificantBits() ^ clientMessageId.getLeastSignificantBits(), 31);
		entityManager.createNativeQuery("select pg_advisory_xact_lock(?1)").setParameter(1, key).getSingleResult();
	}

	// 본문은 받은 그대로 저장한다(앞뒤 공백·줄바꿈 포함). 공백만·NUL 문자 포함(PostgreSQL text가 저장 못 함)·1,000자 초과는 거부한다
	private void validate(SendMessageRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		if (request.clientMessageId() == null) {
			errors.add(new ErrorField("clientMessageId", "메시지마다 새 clientMessageId를 보내 주세요."));
		}
		if (request.text() == null || request.text().isBlank()) {
			errors.add(new ErrorField("text", "메시지를 입력해 주세요."));
		} else if (request.text().indexOf('\0') >= 0) {
			errors.add(new ErrorField("text", "보낼 수 없는 문자가 있습니다."));
		} else if (request.text().codePointCount(0, request.text().length()) > TEXT_MAX_LENGTH) {
			errors.add(new ErrorField("text", "메시지는 " + TEXT_MAX_LENGTH + "자까지 보낼 수 있습니다."));
		}
		if (!errors.isEmpty()) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.copyOf(errors));
		}
	}

	// 삭제된 여행·비참여·나간 여행의 방은 모두 같은 404로 숨긴다
	private void requireParticipant(ChatRoom room, UUID userId) {
		boolean tripAlive = tripRepository.findByIdAndDeletedAtIsNull(room.getTripId()).isPresent();
		boolean active = tripMemberRepository.findByTripIdAndUserId(room.getTripId(), userId)
				.filter(TripMember::isActive).isPresent();
		if (!tripAlive || !active) {
			throw new BusinessException(ChatErrorCode.CHAT_ROOM_NOT_FOUND);
		}
	}

	// 참여자는 지금 ACTIVE인 동행(참여 순), lastMessage는 방의 가장 큰 sequence
	private List<ChatRoomResponse> toResponses(UUID viewerId, List<ChatRoom> rooms) {
		if (rooms.isEmpty()) {
			return List.of();
		}
		List<UUID> tripIds = rooms.stream().map(ChatRoom::getTripId).toList();
		Map<UUID, List<TripMember>> membersByTrip = tripMemberRepository
				.findAllByTripIdInAndStatusOrderByJoinOrder(tripIds, TripMemberStatus.ACTIVE).stream()
				.collect(Collectors.groupingBy(TripMember::getTripId));
		Set<UUID> userIds = new LinkedHashSet<>();
		membersByTrip.values().forEach(members -> members.forEach(member -> userIds.add(member.getUserId())));
		Map<UUID, UserCard> cards = userCardReader.findCards(viewerId, userIds);
		Map<UUID, Message> lastMessages = messageRepository.findLastMessages(rooms.stream().map(ChatRoom::getId).toList())
				.stream().collect(Collectors.toMap(Message::getRoomId, Function.identity()));

		return rooms.stream().map(room -> new ChatRoomResponse(
				room.getId(),
				ChatRoomResponse.TYPE_TRIP,
				room.getTripId(),
				membersByTrip.getOrDefault(room.getTripId(), List.of()).stream()
						.map(member -> requireCard(cards, member))
						.toList(),
				Optional.ofNullable(lastMessages.get(room.getId())).map(MessageResponse::of).orElse(null)))
				.toList();
	}

	private UserCard requireCard(Map<UUID, UserCard> cards, TripMember member) {
		UserCard card = cards.get(member.getUserId());
		if (card == null) {
			throw new IllegalStateException("Trip member has no user record: " + member.getId());
		}
		return card;
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

}
