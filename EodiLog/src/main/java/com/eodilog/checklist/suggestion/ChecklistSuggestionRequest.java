package com.eodilog.checklist.suggestion;

import io.swagger.v3.oas.annotations.media.Schema;

// 명세 §6 POST /trips/{tripId}/checklist-suggestions. 받을 필드가 없다. 본문은 생략하거나 {}로 보낸다
// 예전 명세의 date 등 다른 필드는 알 수 없는 필드로 400이다(정책 S-1·S-22)
@Schema(description = "받는 필드 없음. 본문을 생략하거나 {}로 보낸다")
public record ChecklistSuggestionRequest() {
}
