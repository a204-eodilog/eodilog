package com.eodilog.checklist.service;

import com.eodilog.checklist.domain.ChecklistItem;
import com.eodilog.checklist.dto.ChecklistItemResponse;
import com.eodilog.checklist.dto.ChecklistResponse;
import com.eodilog.checklist.dto.CreateChecklistItemRequest;
import com.eodilog.checklist.dto.UpdateChecklistItemRequest;
import com.eodilog.checklist.exception.ChecklistErrorCode;
import com.eodilog.checklist.repository.ChecklistItemRepository;
import com.eodilog.checklist.suggestion.ChecklistSuggestionAccess;
import com.eodilog.checklist.suggestion.ChecklistSuggestionReader;
import com.eodilog.checklist.suggestion.ChecklistSuggestionResult;
import org.springframework.dao.DataIntegrityViolationException;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.service.TripAccessChecker;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 여행당 공동 준비물 목록 하나를 모든 ACTIVE 멤버가 함께 고친다(D-9)
@Service
@RequiredArgsConstructor
public class ChecklistService {

	private static final int LABEL_MAX_LENGTH = 255;

	private final ChecklistItemRepository checklistItemRepository;
	private final TripAccessChecker tripAccessChecker;
	private final ChecklistSuggestionAccess suggestionAccess;
	private final ChecklistSuggestionReader suggestionReader;
	private final Clock clock;

	@Transactional(readOnly = true)
	public ChecklistResponse getChecklist(UUID userId, UUID tripId) {
		tripAccessChecker.requireActiveMember(tripId, userId);
		List<ChecklistItemResponse> items = checklistItemRepository
				.findAllByTripIdAndDeletedAtIsNullOrderByCreatedAtAscIdAsc(tripId).stream()
				.map(ChecklistItemResponse::from)
				.toList();
		return new ChecklistResponse(items);
	}

	// sourceJobId·suggestionIndex가 없으면 직접 작성, 둘 다 있으면 AI 제안 채택(정책 S-9~S-11, S-13)
	@Transactional
	public ChecklistItemResponse addItem(UUID userId, UUID tripId, CreateChecklistItemRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		String label = validateLabel(request.label(), errors);
		boolean hasJob = request.sourceJobId() != null;
		boolean hasIndex = request.suggestionIndex() != null;
		if (hasJob != hasIndex) {
			errors.add(new ErrorField(hasJob ? "suggestionIndex" : "sourceJobId",
					"AI 제안을 추가하려면 sourceJobId와 suggestionIndex를 함께 보내 주세요."));
		} else if (hasIndex && request.suggestionIndex() < 0) {
			errors.add(new ErrorField("suggestionIndex", "제안 순번은 0 이상이어야 합니다."));
		}
		throwIfInvalid(errors);

		TripMember member = tripAccessChecker.requireActiveMember(tripId, userId).member();
		Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		if (!hasJob) {
			ChecklistItem item = checklistItemRepository.save(
					ChecklistItem.createManual(tripId, label, member.getId(), now));
			return ChecklistItemResponse.from(item);
		}
		return adoptSuggestion(userId, tripId, label, request.sourceJobId(), request.suggestionIndex(), member, now);
	}

	private ChecklistItemResponse adoptSuggestion(UUID userId, UUID tripId, String label, UUID jobId, int index,
			TripMember member, Instant now) {
		// 채택도 결과 반영이라 채택하는 사람의 설정을 본다(명세 §3 "자동 작업 시작과 결과 반영 모두에 적용")
		if (suggestionAccess.disabled(userId)) {
			throw new BusinessException(ChecklistErrorCode.AI_FEATURE_DISABLED);
		}
		// 작업 행을 잠가 같은 작업의 채택을 줄 세운다. 아래 존재 확인과 저장 사이에 다른 채택이 끼지 못한다
		ChecklistSuggestionResult result = suggestionReader.lockSucceeded(tripId, jobId)
				.orElseThrow(() -> invalid("sourceJobId", "이 여행에서 추가할 수 있는 준비물 제안이 아닙니다."));
		if (index >= result.items().size()) {
			throw invalid("suggestionIndex", "제안 결과에 없는 순번입니다.");
		}
		if (checklistItemRepository.existsBySourceJobIdAndSuggestionIndex(jobId, index)) {
			throw new BusinessException(ChecklistErrorCode.SUGGESTION_ALREADY_ADOPTED);
		}
		ChecklistSuggestionResult.Suggestion suggestion = result.items().get(index);
		try {
			ChecklistItem item = checklistItemRepository.saveAndFlush(ChecklistItem.adoptSuggestion(tripId, label,
					suggestion.label(), suggestion.reason(), jobId, index, member.getId(), now));
			return ChecklistItemResponse.from(item);
		} catch (DataIntegrityViolationException ex) {
			// 잠금으로 막히지만, 만일 유니크 제약에 걸리면 500 대신 같은 409로 응답한다
			throw new BusinessException(ChecklistErrorCode.SUGGESTION_ALREADY_ADOPTED);
		}
	}

	private BusinessException invalid(String field, String message) {
		return new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
				List.of(new ErrorField(field, message)));
	}

	// 항목 행을 잠근 뒤 expectedVersion을 비교해 다른 멤버의 수정·체크를 덮어쓰지 않는다
	@Transactional
	public ChecklistItemResponse updateItem(UUID userId, UUID tripId, UUID itemId, UpdateChecklistItemRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		if (request.getExpectedVersion() == null) {
			errors.add(new ErrorField("expectedVersion", "수정 전에 조회한 version을 보내 주세요."));
		}
		String requestedLabel = request.sentLabel() ? validateLabel(request.getLabel(), errors) : null;
		if (request.sentChecked() && request.getChecked() == null) {
			errors.add(new ErrorField("checked", "체크 여부는 true 또는 false로 보내 주세요."));
		}
		throwIfInvalid(errors);

		TripMember member = tripAccessChecker.requireActiveMember(tripId, userId).member();
		ChecklistItem item = checklistItemRepository.findActiveForUpdate(tripId, itemId)
				.orElseThrow(() -> new BusinessException(ChecklistErrorCode.CHECKLIST_ITEM_NOT_FOUND));
		if (item.getVersion() != request.getExpectedVersion()) {
			throw new BusinessException(ChecklistErrorCode.VERSION_CONFLICT);
		}

		String label = requestedLabel != null ? requestedLabel : item.getLabel();
		boolean checked = request.sentChecked() ? request.getChecked() : item.isChecked();
		// 바뀐 값이 없으면 version을 올리지 않는다(여행 수정 P-8과 같은 규칙)
		if (label.equals(item.getLabel()) && checked == item.isChecked()) {
			return ChecklistItemResponse.from(item);
		}

		item.update(label, checked, member.getId(), clock.instant().truncatedTo(ChronoUnit.MICROS));
		checklistItemRepository.flush();
		return ChecklistItemResponse.from(item);
	}

	// 행을 남기고 deleted_at만 채운다. 이후 AI 재제안이 지운 항목을 되살리지 않게 하기 위해서다
	@Transactional
	public void deleteItem(UUID userId, UUID tripId, UUID itemId) {
		tripAccessChecker.requireActiveMember(tripId, userId);
		ChecklistItem item = checklistItemRepository.findActiveForUpdate(tripId, itemId)
				.orElseThrow(() -> new BusinessException(ChecklistErrorCode.CHECKLIST_ITEM_NOT_FOUND));
		item.delete(clock.instant().truncatedTo(ChronoUnit.MICROS));
	}

	private String validateLabel(String rawLabel, List<ErrorField> errors) {
		String label = rawLabel == null ? "" : rawLabel.strip();
		if (label.isEmpty()) {
			errors.add(new ErrorField("label", "준비물 이름을 입력해 주세요."));
		} else if (label.length() > LABEL_MAX_LENGTH) {
			errors.add(new ErrorField("label", "준비물 이름은 " + LABEL_MAX_LENGTH + "자 이하로 입력해 주세요."));
		}
		return label;
	}

	private void throwIfInvalid(List<ErrorField> errors) {
		if (!errors.isEmpty()) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.copyOf(errors));
		}
	}

}
