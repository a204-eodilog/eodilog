package com.eodilog.chat.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

// 명세 §9 메시지 전송. clientMessageId가 재전송 판별 키다(같은 보낸 사람·같은 ID는 처음 메시지를 돌려준다)
public record SendMessageRequest(
		@Schema(description = "클라이언트가 메시지마다 새로 만드는 UUID. 재전송할 때는 같은 값을 보낸다",
				example = "6d0f7c2e-1b7a-4f0e-9a51-7f3c1e2d4b8a", requiredMode = Schema.RequiredMode.REQUIRED)
		UUID clientMessageId,

		@Schema(description = "본문(공백만은 불가, 최대 1,000자)", example = "내일 9시에 만나요",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String text
) {
}
