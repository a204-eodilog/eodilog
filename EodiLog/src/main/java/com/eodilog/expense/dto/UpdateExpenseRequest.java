package com.eodilog.expense.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// 명세 §10 ExpensePatch. 생략한 필드는 유지하고 memo만 null로 비울 수 있다. 분담자는 전체 교체한다
// record는 "생략"과 "null"을 구분하지 못하므로 setter가 불렸는지로 보낸 필드를 기록한다(UpdateTripRequest와 같은 방식)
public class UpdateExpenseRequest {

	@Schema(description = "조회한 경비의 version. 그 사이 다른 수정이 있으면 409", example = "1",
			requiredMode = Schema.RequiredMode.REQUIRED)
	private Long expectedVersion;

	@Schema(description = "새 경비 이름. 앞뒤 공백 제거 후 1~200자", example = "흑돼지 저녁")
	private String title;

	@Schema(description = "새 메모. null이면 비움", nullable = true)
	private String memo;

	@Schema(description = "새 원금(원). 양의 정수. 바꾸면 분담액을 다시 계산한다", example = "130000")
	private Long amountMinor;

	@Schema(description = "통화. 보내면 KRW여야 한다", example = "KRW")
	private String currency;

	@Schema(description = "새 결제자 멤버십 ID", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e7f")
	private UUID payerMemberId;

	@Schema(description = "분담자 전체 목록. 바꾸면 분담액을 다시 계산한다. 새로 넣는 분담자는 ACTIVE 멤버여야 한다")
	private List<UUID> participantMemberIds;

	@Schema(description = "새 지출 시각(UTC)", example = "2026-11-01T11:30:00Z")
	private Instant spentAt;

	private boolean titleSent;
	private boolean memoSent;
	private boolean amountMinorSent;
	private boolean currencySent;
	private boolean payerMemberIdSent;
	private boolean participantMemberIdsSent;
	private boolean spentAtSent;

	public Long getExpectedVersion() {
		return expectedVersion;
	}

	public String getTitle() {
		return title;
	}

	public String getMemo() {
		return memo;
	}

	public Long getAmountMinor() {
		return amountMinor;
	}

	public String getCurrency() {
		return currency;
	}

	public UUID getPayerMemberId() {
		return payerMemberId;
	}

	public List<UUID> getParticipantMemberIds() {
		return participantMemberIds;
	}

	public Instant getSpentAt() {
		return spentAt;
	}

	@JsonSetter("expectedVersion")
	public void setExpectedVersion(Long expectedVersion) {
		this.expectedVersion = expectedVersion;
	}

	@JsonSetter("title")
	public void setTitle(String title) {
		this.title = title;
		this.titleSent = true;
	}

	@JsonSetter("memo")
	public void setMemo(String memo) {
		this.memo = memo;
		this.memoSent = true;
	}

	@JsonSetter("amountMinor")
	public void setAmountMinor(Long amountMinor) {
		this.amountMinor = amountMinor;
		this.amountMinorSent = true;
	}

	@JsonSetter("currency")
	public void setCurrency(String currency) {
		this.currency = currency;
		this.currencySent = true;
	}

	@JsonSetter("payerMemberId")
	public void setPayerMemberId(UUID payerMemberId) {
		this.payerMemberId = payerMemberId;
		this.payerMemberIdSent = true;
	}

	@JsonSetter("participantMemberIds")
	public void setParticipantMemberIds(List<UUID> participantMemberIds) {
		this.participantMemberIds = participantMemberIds;
		this.participantMemberIdsSent = true;
	}

	@JsonSetter("spentAt")
	public void setSpentAt(Instant spentAt) {
		this.spentAt = spentAt;
		this.spentAtSent = true;
	}

	public boolean sentTitle() {
		return titleSent;
	}

	public boolean sentMemo() {
		return memoSent;
	}

	public boolean sentAmountMinor() {
		return amountMinorSent;
	}

	public boolean sentCurrency() {
		return currencySent;
	}

	public boolean sentPayerMemberId() {
		return payerMemberIdSent;
	}

	public boolean sentParticipantMemberIds() {
		return participantMemberIdsSent;
	}

	public boolean sentSpentAt() {
		return spentAtSent;
	}

}
