# CORS 설정 (EODI-130)

`CORS_ALLOWED_ORIGINS`에 실제 웹 프론트 origin을 쉼표로 지정한다. 형식은 `https://host[:port]`이며 경로·끝 슬래시·와일드카드·앱 스킴은 받지 않는다. 빈 값은 교차 origin 접근 허용 없음이다. 실제 origin은 프론트와 확인한 값만 지정한다. 네이티브 API base URL과 브라우저 origin은 구분한다.

local은 기존 `.env` import로 읽고 운영은 환경변수로 제공한다. 실제 `.env`는 수정하지 않는다.

`/api/**`의 GET·POST·PUT·PATCH·DELETE·OPTIONS를 허용한다. 요청 헤더는 Authorization·Content-Type·Idempotency-Key, 노출 헤더는 X-Trace-Id다. 쿠키 credentials는 허용하지 않으며 Bearer 인증은 유지한다. HEAD는 허용 목록 밖이다.

허용 origin preflight는 인증 전에 처리한다. 미허용 CORS 요청은 Spring 기본 문자열 403을 사용한다. 브라우저에서 해당 응답 본문을 읽을 수 없으며 API 업무 오류 JSON과 별도로 취급한다.
