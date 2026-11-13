package com.eodilog.expense.voice;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.*;
@Schema(description="요청자 전용 음성 경비 초안. 경비 등록 전 사용자가 확인한다")
public record VoiceExpenseResult(@Schema(description="인식문") String transcript,
    @Schema(description="입력 순서의 초안 1~10건") List<Item> drafts,@Schema(description="전체 확인 안내") List<Warning> warnings) {
    @Schema(name="VoiceExpenseDraftItem",description="한 지출의 인식 결과")
    public record Item(@Schema(description="서버 발급 초안 UUID") UUID draftId,@Schema(description="해당 초안의 발화") String transcriptSegment,
        @Schema(description="확인할 경비 필드") Draft draft,@Schema(description="사용자가 채울 필드") List<String> unresolvedFields,
        @Schema(description="항목별 확인 안내") List<Warning> warnings){}
    @Schema(name="VoiceExpenseDraft",description="사용자 확인 전 경비 값")
    public record Draft(@Schema(description="경비 이름",nullable=true) String title,@Schema(description="메모",nullable=true) String memo,
        @Schema(description="원 단위 정수 금액",nullable=true) Long amountMinor,@Schema(description="KRW",nullable=true) String currency,
        @Schema(description="결제자의 여행 멤버 UUID",nullable=true) UUID payerMemberId,@Schema(description="확정 가능한 분담자 UUID") List<UUID> participantMemberIds,
        @Schema(description="지출 시각 UTC. 모호하면 null",nullable=true) Instant spentAt){}
    @Schema(name="VoiceExpenseWarning",description="사용자가 확인할 필드와 이유")
    public record Warning(@Schema(description="서버가 허용한 안내 코드") String code,@Schema(description="대상 필드") String field,
        @Schema(description="확인 안내") String message){}
}
