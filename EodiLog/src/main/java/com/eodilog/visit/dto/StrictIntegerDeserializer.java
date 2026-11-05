package com.eodilog.visit.dto;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.deser.std.StdDeserializer;

// JSON 정수만 받는다. Jackson 기본 변환은 2.5를 2로, "3"을 3으로 바꿔 받아 반 점·문자열 점수를 거부하지 못한다(명세 §7 "반 점 거부")
// 공통 설정(application.yaml)은 다른 API에도 영향이 있어 바꾸지 않고 이 필드에만 붙인다. 오류는 400 VALIDATION_ERROR(필드 경로 포함)가 된다
public class StrictIntegerDeserializer extends StdDeserializer<Integer> {

	public StrictIntegerDeserializer() {
		super(Integer.class);
	}

	@Override
	public Integer deserialize(JsonParser parser, DeserializationContext context) {
		if (parser.currentToken() != JsonToken.VALUE_NUMBER_INT) {
			return context.reportInputMismatch(this, "정수만 받습니다.");
		}
		return parser.getIntValue();
	}

}
