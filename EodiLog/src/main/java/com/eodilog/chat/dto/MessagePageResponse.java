package com.eodilog.chat.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

// 명세 §9 메시지 페이지 응답 {data, page:{nextBeforeSequence, hasNext}}. 공통 cursor 페이지(PageResponse)와 섞지 않는다
public record MessagePageResponse(
		@Schema(description = "메시지(sequence 내림차순)", requiredMode = Schema.RequiredMode.REQUIRED)
		List<MessageResponse> data,

		@Schema(description = "다음 페이지 정보", requiredMode = Schema.RequiredMode.REQUIRED)
		Page page
) {

	public record Page(
			@Schema(description = "다음 요청의 beforeSequence. 이 페이지의 가장 작은 sequence이며, 더 없으면 null",
					example = "21", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
			Long nextBeforeSequence,

			@Schema(description = "더 이전 메시지가 있는지", example = "true", requiredMode = Schema.RequiredMode.REQUIRED)
			boolean hasNext
	) {
	}

}
