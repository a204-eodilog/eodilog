# 백엔드 테스트 커버리지

Jira: https://jira.example.com/browse/EODI-120

JaCoCo 0.8.16을 Java 25에 사용한다. 기존 testLogging과 의존성을 보존하고, 모든 프로덕션 코드를 측정하며 임의 제외나 최소 커버리지 강제 기준은 두지 않는다. 로그인·로컬 도구 MR과 독립적으로 dev에 병합할 수 있다.

```powershell
cd EodiLog
.\gradlew.bat clean build
# 리포트 작업을 직접 실행해도 테스트가 먼저 실행된다.
.\gradlew.bat jacocoTestReport
```

Docker Desktop과 Java 25가 필요하다. HTML은 `build/reports/jacoco/test/html/index.html`, XML은 `build/reports/jacoco/test/jacocoTestReport.xml`에 생성된다. CSV는 비활성화했다. `build/`는 기존 Git 제외 경로다.

일부 테스트만 실행하면 그 실행의 커버리지만 반영되므로 전체 수치로 보고하지 않는다. 테스트 실패 시에도 finalizer가 리포트를 만들 수 있으므로 파일 존재를 테스트 성공으로 해석하지 않는다. 중단 후 결과가 불완전하거나 이전 결과가 남았다면 `clean build`로 다시 확인한다.

커버리지 임계치와 CI 업로드는 후속이다. 공식 참고: https://www.jacoco.org/jacoco/trunk/doc/changes.html 및 https://docs.gradle.org/current/userguide/jacoco_plugin.html

분리 검증(2026-10-30): 최신 dev 기준 build 및 jacocoTestReport 성공, 전체 96개 테스트/실패·오류·건너뜀 0. HTML 존재 및 XML 파싱 확인. BRANCH: 220/253 = 86.96%; LINE: 687/712 = 96.49%. 이 수치는 로그인·로컬 도구를 포함하지 않은 독립 MR 범위의 측정치다.
