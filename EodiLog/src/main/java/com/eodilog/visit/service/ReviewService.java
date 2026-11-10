package com.eodilog.visit.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.trip.service.TripAccess;
import com.eodilog.trip.service.TripAccessChecker;
import com.eodilog.visit.domain.Review;
import com.eodilog.visit.domain.Visit;
import com.eodilog.visit.dto.ReviewResponse;
import com.eodilog.visit.dto.ReviewWriteRequest;
import com.eodilog.visit.exception.VisitErrorCode;
import com.eodilog.visit.repository.ReviewRepository;
import com.eodilog.visit.repository.VisitRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 방문 평가(명세 §7, 정책 §18). 방문한 본인만 쓰고·고치고·지우며, 같은 여행 ACTIVE 멤버는 여행 평가 목록을 본다
// 쓰기는 방문 체크·해제와 같이 여행 행을 잠근 뒤 한다. 나가기·여행 삭제와 순서가 맞고, 같은 방문의 동시 첫 작성도 한 행으로 모인다
@Service
@RequiredArgsConstructor
public class ReviewService {

	public static final int DEFAULT_LIMIT = 20;
	public static final int MAX_LIMIT = 100;
	public static final int MIN_SCORE = 1;
	public static final int MAX_SCORE = 5;
	public static final int BODY_MAX_LENGTH = 1_000;

	private final ReviewRepository reviewRepository;
	private final VisitRepository visitRepository;
	private final TripMemberRepository tripMemberRepository;
	private final TripAccessChecker tripAccessChecker;
	private final PlaceReader placeReader;
	private final EntityManager entityManager;
	private final Clock clock;

	// 쓰기·고치기. 판정 순서: 입력 400 → 여행 행 잠금 후 ACTIVE 404 → 방문 404 → 내 방문이 아니면 403
	// → 평가가 있으면 expectedVersion 409(생략하면 덮어쓰기), 없으면 expectedVersion을 보냈을 때 400 → 저장. 생성·수정 모두 200
	@Transactional
	public ReviewResponse writeReview(UUID userId, UUID tripId, UUID visitId, ReviewWriteRequest request) {
		validate(request);
		Visit visit = requireMyVisit(userId, tripId, visitId);
		Instant now = now();
		Optional<Review> existing = reviewRepository.findByVisitId(visitId);
		Review review;
		if (existing.isPresent()) {
			review = existing.get();
			if (request.expectedVersion() != null && request.expectedVersion() != review.getVersion()) {
				throw new BusinessException(VisitErrorCode.VERSION_CONFLICT);
			}
			review.update(request.score(), request.body(), now);
		} else {
			if (request.expectedVersion() != null) {
				throw invalid("expectedVersion", "아직 이 방문의 평가가 없습니다. 처음 쓸 때는 expectedVersion을 보내지 마세요.");
			}
			review = reviewRepository.save(Review.write(visitId, request.score(), request.body(), now));
		}
		reviewRepository.flush();
		return ReviewResponse.of(review, visit, placeReader.find(visit.getPlaceId()).orElse(null));
	}

	// 지우기(물리 삭제). 판정 순서: 여행 행 잠금 후 ACTIVE 404 → 방문 404 → 평가 404 → 내 방문이 아니면 403
	@Transactional
	public void deleteReview(UUID userId, UUID tripId, UUID visitId) {
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Visit visit = visitRepository.findByIdAndTripIdAndDeletedAtIsNull(visitId, tripId)
				.orElseThrow(() -> new BusinessException(VisitErrorCode.VISIT_NOT_FOUND));
		Review review = reviewRepository.findByVisitId(visitId)
				.orElseThrow(() -> new BusinessException(VisitErrorCode.REVIEW_NOT_FOUND));
		if (!visit.getMemberId().equals(access.member().getId())) {
			throw new BusinessException(CommonErrorCode.FORBIDDEN, "내 평가만 지울 수 있습니다.");
		}
		reviewRepository.delete(review);
		reviewRepository.flush();
	}

	// 기본은 여행 전체 평가(동행 후기 포함). memberId로 같은 여행 멤버(나간 멤버 포함) 한 명의 평가만 본다
	// 최근 작성 순(createdAt DESC, id DESC). 장소는 한 페이지 분을 한 번에 읽는다
	@Transactional(readOnly = true)
	public PageResponse<ReviewResponse> getReviews(UUID userId, UUID tripId, UUID memberId, String cursor, int limit) {
		tripAccessChecker.requireActiveMember(tripId, userId);
		if (memberId != null && tripMemberRepository.findById(memberId)
				.map(TripMember::getTripId).filter(tripId::equals).isEmpty()) {
			throw invalid("memberId", "같은 여행 동행의 평가만 볼 수 있습니다.");
		}
		CreatedAtCursor after = cursor == null || cursor.isBlank() ? null : CreatedAtCursor.decode(cursor);

		// 평가가 있는 방문은 해제할 수 없다(REVIEW_EXISTS). 단 피드 '내 기록까지 삭제'는 방문을 먼저 숨기고 정리 작업이 평가를 지우므로, 지운 방문의 평가가 잠시(작업 실패 시 계속) 남을 수 있다. 반드시 지운 방문은 뺀다
		String jpql = "select r, v from Review r join Visit v on v.id = r.visitId"
				+ " where v.tripId = :tripId and v.deletedAt is null"
				+ (memberId == null ? "" : " and v.memberId = :memberId")
				+ (after == null ? "" : " and (r.createdAt < :cursorCreatedAt or (r.createdAt = :cursorCreatedAt and r.id < :cursorId))")
				+ " order by r.createdAt desc, r.id desc";
		TypedQuery<Object[]> query = entityManager.createQuery(jpql, Object[].class)
				.setParameter("tripId", tripId)
				.setMaxResults(limit + 1);
		if (memberId != null) {
			query.setParameter("memberId", memberId);
		}
		if (after != null) {
			query.setParameter("cursorCreatedAt", after.createdAt()).setParameter("cursorId", after.id());
		}
		List<Object[]> found = query.getResultList();
		boolean hasNext = found.size() > limit;
		List<Object[]> page = hasNext ? found.subList(0, limit) : found;
		Map<UUID, PlaceView> places = placeReader.findAll(page.stream().map(row -> ((Visit) row[1]).getPlaceId())
				.distinct().toList());
		List<ReviewResponse> items = page.stream().map(row -> {
			Visit visit = (Visit) row[1];
			return ReviewResponse.of((Review) row[0], visit, places.get(visit.getPlaceId()));
		}).toList();
		String nextCursor = null;
		if (hasNext) {
			Review last = (Review) page.getLast()[0];
			nextCursor = new CreatedAtCursor(last.getCreatedAt(), last.getId()).encode();
		}
		return PageResponse.of(items, nextCursor, hasNext);
	}

	private Visit requireMyVisit(UUID userId, UUID tripId, UUID visitId) {
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Visit visit = visitRepository.findByIdAndTripIdAndDeletedAtIsNull(visitId, tripId)
				.orElseThrow(() -> new BusinessException(VisitErrorCode.VISIT_NOT_FOUND));
		if (!visit.getMemberId().equals(access.member().getId())) {
			throw new BusinessException(CommonErrorCode.FORBIDDEN, "내 방문에만 평가를 남길 수 있습니다.");
		}
		return visit;
	}

	// 모든 입력 오류를 한 번에 알린다. 본문은 받은 그대로 저장하고 공백만·NUL 문자(PostgreSQL text가 저장 못 함)·1,000자 초과를 거부한다
	private void validate(ReviewWriteRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		if (request.score() == null) {
			errors.add(new ErrorField("score", "점수를 골라 주세요."));
		} else if (request.score() < MIN_SCORE || request.score() > MAX_SCORE) {
			errors.add(new ErrorField("score", "점수는 " + MIN_SCORE + "~" + MAX_SCORE + " 사이 정수로 골라 주세요."));
		}
		String body = request.body();
		if (body == null || body.isBlank()) {
			errors.add(new ErrorField("body", "평가 내용을 입력해 주세요."));
		} else if (body.indexOf('\0') >= 0) {
			errors.add(new ErrorField("body", "저장할 수 없는 문자가 있습니다."));
		} else if (body.codePointCount(0, body.length()) > BODY_MAX_LENGTH) {
			errors.add(new ErrorField("body", "평가는 " + BODY_MAX_LENGTH + "자까지 쓸 수 있습니다."));
		}
		if (request.expectedVersion() != null && request.expectedVersion() < 1) {
			errors.add(new ErrorField("expectedVersion", "version은 1 이상입니다."));
		}
		if (!errors.isEmpty()) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.copyOf(errors));
		}
	}

	private BusinessException invalid(String field, String message) {
		return new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
				List.of(new ErrorField(field, message)));
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

}
