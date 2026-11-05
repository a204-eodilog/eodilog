package com.eodilog.poll.service;

import com.eodilog.notification.NotificationEventRegistrar;
import com.eodilog.notification.NotificationEventRegistrar.EventCommand;
import com.eodilog.poll.domain.Poll;
import com.eodilog.poll.repository.PollTallyRepository;
import com.eodilog.trip.repository.TripMemberRepository;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 투표 알림 5종을 남긴다(명세 §9). 업무 트랜잭션 안에서 불러 투표 저장과 함께 커밋·롤백된다
// 수신자는 지금 ACTIVE인 멤버이고 행동한 본인은 뺀다. 같은 deduplicationKey는 한 번만 남는다(NotificationEventRegistrar)
@Component
public class PollNotifier {

	static final String TARGET_TYPE = "POLL";

	private final NotificationEventRegistrar registrar;
	private final TripMemberRepository tripMemberRepository;
	private final PollTallyRepository pollTallyRepository;

	public PollNotifier(NotificationEventRegistrar registrar, TripMemberRepository tripMemberRepository,
			PollTallyRepository pollTallyRepository) {
		this.registrar = registrar;
		this.tripMemberRepository = tripMemberRepository;
		this.pollTallyRepository = pollTallyRepository;
	}

	@Transactional(propagation = Propagation.MANDATORY)
	public void opened(Poll poll, UUID actorUserId) {
		register(poll, "POLL_OPENED", actorUserId, "새 투표 \"" + poll.getTitle() + "\"이 열렸어요.",
				"POLL_OPENED:" + poll.getId(), excluding(tripMemberRepository.findActiveUserIds(poll.getTripId()),
						actorUserId));
	}

	// 이미 표를 낸 멤버만 받는다. 새 후보를 보고 선택을 바꿀 수 있게 알린다
	@Transactional(propagation = Propagation.MANDATORY)
	public void candidateAdded(Poll poll, UUID candidateId, UUID actorUserId) {
		register(poll, "POLL_CANDIDATE_ADDED", actorUserId, "\"" + poll.getTitle() + "\" 투표에 후보가 추가됐어요.",
				"POLL_CANDIDATE_ADDED:" + poll.getId() + ":" + candidateId,
				excluding(pollTallyRepository.activeVoterUserIds(poll.getId()), actorUserId));
	}

	// 서버가 마감하므로 행동한 사람이 없다. 확정·0표 마감은 type이 다르지만 한 투표는 한 번만 마감하므로 키를 같이 쓴다
	@Transactional(propagation = Propagation.MANDATORY)
	public void closed(Poll poll, boolean withVotes) {
		String type = withVotes ? "POLL_FINALIZED" : "POLL_CLOSED_NO_VOTES";
		String message = withVotes
				? "\"" + poll.getTitle() + "\" 투표가 마감됐어요. 결과를 확인해 보세요."
				: "\"" + poll.getTitle() + "\" 투표가 아무도 참여하지 않아 마감됐어요.";
		register(poll, type, null, message, "POLL_CLOSED:" + poll.getId(),
				tripMemberRepository.findActiveUserIds(poll.getTripId()));
	}

	// 아직 표를 내지 않은 멤버만 받는다. 받을 사람이 없으면 이벤트를 남기지 않는다
	@Transactional(propagation = Propagation.MANDATORY)
	public void reminder(Poll poll, Collection<UUID> nonVoterUserIds) {
		if (nonVoterUserIds.isEmpty()) {
			return;
		}
		register(poll, "POLL_REMINDER", null, "\"" + poll.getTitle() + "\" 투표가 1시간 뒤 마감돼요.",
				"POLL_REMINDER:" + poll.getId(), nonVoterUserIds);
	}

	private void register(Poll poll, String type, UUID actorUserId, String message, String deduplicationKey,
			Collection<UUID> recipients) {
		registrar.register(new EventCommand(type, poll.getTripId(), actorUserId, TARGET_TYPE, poll.getId(), message,
				deduplicationKey), recipients);
	}

	private static List<UUID> excluding(List<UUID> userIds, UUID actorUserId) {
		return userIds.stream().filter(userId -> !userId.equals(actorUserId)).toList();
	}

}
