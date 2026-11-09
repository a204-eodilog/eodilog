package com.eodilog.photo.dto;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.deser.std.StdDeserializer;

/** Accept integer JSON tokens without truncating fractions or coercing strings. */
public class StrictLongDeserializer extends StdDeserializer<Long> {
    public StrictLongDeserializer() { super(Long.class); }
    @Override public Long deserialize(JsonParser parser, DeserializationContext context) {
        if (parser.currentToken() != JsonToken.VALUE_NUMBER_INT)
            return context.reportInputMismatch(this, "정수만 받습니다.");
        return parser.getLongValue();
    }
}
