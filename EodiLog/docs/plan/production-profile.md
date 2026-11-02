# 운영 프로필 (EODI-129)

운영 실행에는 `SPRING_PROFILES_ACTIVE=prod` 또는 `--spring.profiles.active=prod`를 지정한다. Swagger UI·OpenAPI는 비활성화되고 프레임워크 오류의 메시지·스택·예외 정보는 응답에 포함하지 않는다. 개발 Swagger 공개 경로는 유지한다.

운영은 `.env`를 자동으로 읽지 않는다. DB 접속 정보와 KAKAO_CLIENT_ID·KAKAO_CLIENT_SECRET·KAKAO_ALLOWED_REDIRECTS·JWT_SECRET을 배포 환경의 비밀 설정으로 제공한다. local과 prod를 함께 활성화하지 않는다. 실제 서버 기동·배포·Expo 연동은 이번 검증 범위 밖이다.

이 MR은 129만 구현한다. CORS·오류 로그·테스트 프로필은 130·131·132의 별도 MR로 반영한다. 함께 포함된 B 정책 답변·다음 분담 MD는 전달용 문서이며 후속 기능 구현 완료를 뜻하지 않는다.
