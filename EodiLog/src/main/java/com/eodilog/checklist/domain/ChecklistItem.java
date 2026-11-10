package com.eodilog.checklist.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

// 여행 공동 준비물 한 줄. version은 expectedVersion 비교용으로, 서비스가 행 잠금 후 직접 비교·증가한다
@Entity
@Table(name = "checklist_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChecklistItem {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	private UUID tripId;

	private String label;

	private boolean checked;

	@Enumerated(EnumType.STRING)
	private ChecklistSource source;

	private UUID sourceJobId;

	// 채택한 제안의 순번(결과 items 위치). 같은 작업·순번은 한 번만 채택한다(DB 유니크)
	private Integer suggestionIndex;

	private String reason;

	private boolean modifiedByUser;

	private UUID createdByMemberId;

	private UUID checkedByMemberId;

	private Instant checkedAt;

	private long version;

	private Instant createdAt;

	private Instant deletedAt;

	public static ChecklistItem createManual(UUID tripId, String label, UUID createdByMemberId, Instant now) {
		ChecklistItem item = new ChecklistItem();
		item.tripId = tripId;
		item.label = label;
		item.source = ChecklistSource.MANUAL;
		item.createdByMemberId = createdByMemberId;
		item.version = 1;
		item.createdAt = now;
		return item;
	}

	// AI 제안 채택(정책 S-9). 멤버가 이름을 고쳐 보내면 제안 원문과 달라졌다고 표시한다. 이유는 제안의 것을 남긴다
	public static ChecklistItem adoptSuggestion(UUID tripId, String label, String suggestedLabel, String reason,
			UUID sourceJobId, int suggestionIndex, UUID createdByMemberId, Instant now) {
		ChecklistItem item = new ChecklistItem();
		item.tripId = tripId;
		item.label = label;
		item.source = ChecklistSource.AI;
		item.sourceJobId = sourceJobId;
		item.suggestionIndex = suggestionIndex;
		item.reason = reason;
		item.modifiedByUser = !label.equals(suggestedLabel);
		item.createdByMemberId = createdByMemberId;
		item.version = 1;
		item.createdAt = now;
		return item;
	}

	// 바뀐 값이 있을 때만 호출한다. 이름을 고치면 AI 제안 원문과 달라졌다고 표시한다
	public void update(String label, boolean checked, UUID actorMemberId, Instant now) {
		if (!this.label.equals(label)) {
			this.label = label;
			this.modifiedByUser = true;
		}
		// 체크 상태가 바뀔 때만 체크한 멤버·시각을 다시 쓴다. 이미 체크된 항목을 다시 체크해도 처음 기록을 유지한다
		if (this.checked != checked) {
			this.checked = checked;
			this.checkedByMemberId = checked ? actorMemberId : null;
			this.checkedAt = checked ? now : null;
		}
		this.version++;
	}

	public void delete(Instant now) {
		this.deletedAt = now;
	}

}
