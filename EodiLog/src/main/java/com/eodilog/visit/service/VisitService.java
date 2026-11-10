package com.eodilog.visit.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.trip.service.TripAccess;
import com.eodilog.trip.service.TripAccessChecker;
import com.eodilog.visit.domain.Review;
import com.eodilog.visit.domain.Visit;
import com.eodilog.visit.domain.VisitEvidenceType;
import com.eodilog.visit.dto.CreateVisitRequest;
import com.eodilog.visit.dto.VisitResponse;
import com.eodilog.visit.dto.VisitReviewStatus;
import com.eodilog.visit.exception.VisitErrorCode;
import com.eodilog.visit.repository.ReviewRepository;
import com.eodilog.visit.repository.VisitRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 실제 방문 기록(명세 §6, 정책 §16). ACTIVE 멤버가 자기 방문만 체크·해제하고, 같은 여행 멤버의 방문을 조회한다
// 체크·해제는 여행 행을 잠근 뒤 한다. 나가기·내보내기와 순서가 맞고, 같은 장소 동시 체크도 하나로 모인다
@Service
@RequiredArgsConstructor
public class VisitService {

	public static final int DEFAULT_LIMIT = 20;
	public static final int MAX_LIMIT = 100;

	// 기기 시계 차이로 방금 다녀온 체크가 거부되지 않도록 둔 여유
	private static final Duration FUTURE_TOLERANCE = Duration.ofMinutes(5);

	private final VisitRepository visitRepository;
	private final ReviewRepository reviewRepository;
	private final TripMemberRepository tripMemberRepository;
	private final TripAccessChecker tripAccessChecker;
	private final PlaceReader placeReader;
	private final EntityManager entityManager;
	private final VisitUncheckListener uncheckListener;
	private final Clock clock;

	public record CreateResult(VisitResponse visit, boolean created) {
	}

	// 판정 순서: 입력 400 → 여행 행 잠금 후 ACTIVE 404 → 없는 장소 400 → 이미 체크한 장소면 기존 방문(200) → 생성(201)
	// 여행·멤버·장소당 방문은 하나라(VS-1) 재시도·중복 체크도 기존 방문을 돌려주므로 Idempotency-Key를 요구하지 않는다
	@Transactional
	public CreateResult createVisit(UUID userId, UUID tripId, CreateVisitRequest request) {
		Instant now = now();
		List<ErrorField> errors = new ArrayList<>();
		if (request.placeId() == null) {
			errors.add(new ErrorField("placeId", "다녀온 장소를 골라 주세요."));
		}
		if (request.visitedAt() == null) {
			errors.add(new ErrorField("visitedAt", "다녀온 시각을 보내 주세요."));
		} else if (request.visitedAt().isAfter(now.plus(FUTURE_TOLERANCE))) {
			errors.add(new ErrorField("visitedAt", "아직 오지 않은 시각은 다녀온 시각으로 기록할 수 없습니다."));
		}
		if (request.evidenceType() == null) {
			errors.add(new ErrorField("evidenceType", "방문 근거를 보내 주세요. 직접 체크는 MANUAL입니다."));
		} else if (request.evidenceType() != VisitEvidenceType.MANUAL) {
			errors.add(new ErrorField("evidenceType", "직접 체크는 MANUAL만 보낼 수 있습니다. 사진 방문은 방문 후보 확인으로 기록합니다."));
		}
		throwIfInvalid(errors);

		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		if (placeReader.find(request.placeId()).isEmpty()) {
			throw invalid("placeId", "존재하지 않는 장소입니다.");
		}
		UUID memberId = access.member().getId();
		Optional<Visit> existing = visitRepository.findByTripIdAndMemberIdAndPlaceIdAndDeletedAtIsNull(tripId, memberId,
				request.placeId());
		if (existing.isPresent()) {
			return new CreateResult(VisitResponse.of(existing.get(),
					reviewRepository.findByVisitId(existing.get().getId()).orElse(null)), false);
		}
		Visit visit = visitRepository.saveAndFlush(Visit.manual(tripId, memberId, request.placeId(),
				request.visitedAt().truncatedTo(ChronoUnit.MICROS), now));
		return new CreateResult(VisitResponse.of(visit, null), true);
	}

	// 기본은 본인 방문. memberId로 같은 여행 멤버(나간 멤버 포함)의 방문을 본다. 최근 등록 순(createdAt DESC, id DESC)
	@Transactional(readOnly = true)
	public PageResponse<VisitResponse> getVisits(UUID userId, UUID tripId, UUID memberId, UUID placeId,
			VisitReviewStatus reviewStatus, String cursor, int limit) {
		TripAccess access = tripAccessChecker.requireActiveMember(tripId, userId);
		UUID targetMemberId = memberId == null ? access.member().getId() : memberId;
		if (memberId != null && tripMemberRepository.findById(memberId)
				.map(TripMember::getTripId).filter(tripId::equals).isEmpty()) {
			throw invalid("memberId", "같은 여행 동행의 방문만 볼 수 있습니다.");
		}
		CreatedAtCursor after = cursor == null || cursor.isBlank() ? null : CreatedAtCursor.decode(cursor);

		String jpql = "select v from Visit v where v.tripId = :tripId and v.memberId = :memberId and v.deletedAt is null"
				+ (placeId == null ? "" : " and v.placeId = :placeId")
				+ switch (reviewStatus) {
					case ALL -> "";
					case WRITTEN -> " and exists (select r.id from Review r where r.visitId = v.id)";
					case UNWRITTEN -> " and not exists (select r.id from Review r where r.visitId = v.id)";
				}
				+ (after == null ? "" : " and (v.createdAt < :cursorCreatedAt or (v.createdAt = :cursorCreatedAt and v.id < :cursorId))")
				+ " order by v.createdAt desc, v.id desc";
		TypedQuery<Visit> query = entityManager.createQuery(jpql, Visit.class)
				.setParameter("tripId", tripId)
				.setParameter("memberId", targetMemberId)
				.setMaxResults(limit + 1);
		if (placeId != null) {
			query.setParameter("placeId", placeId);
		}
		if (after != null) {
			query.setParameter("cursorCreatedAt", after.createdAt()).setParameter("cursorId", after.id());
		}
		List<Visit> found = query.getResultList();
		boolean hasNext = found.size() > limit;
		List<Visit> page = hasNext ? found.subList(0, limit) : found;
		String nextCursor = hasNext
				? new CreatedAtCursor(page.getLast().getCreatedAt(), page.getLast().getId()).encode()
				: null;
		// 평가는 한 페이지 분을 한 번에 읽는다(방문 하나당 평가 하나)
		Map<UUID, Review> reviews = page.isEmpty() ? Map.of()
				: reviewRepository.findAllByVisitIdIn(page.stream().map(Visit::getId).toList()).stream()
						.collect(Collectors.toMap(Review::getVisitId, Function.identity()));
		return PageResponse.of(page.stream().map(visit -> VisitResponse.of(visit, reviews.get(visit.getId()))).toList(),
				nextCursor, hasNext);
	}

	// 체크 해제. 판정 순서: 여행 행 잠금 후 ACTIVE 404 → 방문 404 → 본인 방문이 아니면 403 → 평가가 있으면 409 REVIEW_EXISTS
	// 평가는 여행 행 잠금 아래에서만 생기므로 확인과 해제 사이에 새 평가가 끼어들지 않는다
	// 사진 후보를 확정해 만든(또는 연결한) 방문이면 그 후보는 같은 트랜잭션에서 INVALIDATED가 된다
	@Transactional
	public void deleteVisit(UUID userId, UUID tripId, UUID visitId) {
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Visit visit = visitRepository.findByIdAndTripIdAndDeletedAtIsNull(visitId, tripId)
				.orElseThrow(() -> new BusinessException(VisitErrorCode.VISIT_NOT_FOUND));
		if (!visit.getMemberId().equals(access.member().getId())) {
			throw new BusinessException(CommonErrorCode.FORBIDDEN, "내 방문 기록만 지울 수 있습니다.");
		}
		if (reviewRepository.existsByVisitId(visitId)) {
			throw new BusinessException(VisitErrorCode.REVIEW_EXISTS);
		}
		visit.delete(now());
		visitRepository.flush();
		uncheckListener.visitUnchecked(visitId);
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

	private BusinessException invalid(String field, String message) {
		return new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
				List.of(new ErrorField(field, message)));
	}

	private void throwIfInvalid(List<ErrorField> errors) {
		if (!errors.isEmpty()) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.copyOf(errors));
		}
	}

}
