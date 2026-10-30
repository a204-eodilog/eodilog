package com.eodilog.global.id;

import java.util.UUID;
import org.hibernate.id.uuid.UuidVersion7Strategy;

/** JPA의 VERSION_7과 동일한 생성 전략을 JDBC 저장에도 사용한다. */
public final class UuidV7 {
    private UuidV7() {
    }

    public static UUID generate() {
        // Hibernate 7.4의 v7 전략은 세션에 의존하지 않는다.
        return UuidVersion7Strategy.INSTANCE.generateUuid(null);
    }
}
