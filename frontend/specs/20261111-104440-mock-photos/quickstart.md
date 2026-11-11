# Quickstart: 시험 데이터에 사진 넣기

## 자동 확인

```bash
cd frontend
npx jest src/lib src/components/ui
npx jest && npx tsc --noEmit && npx expo lint
```

## 테스트 모드에서 눌러 보기 (인터넷 필요)

1. 여행 탭 → 부산 바다 여행 → 사진: 사진 10장이 보인다. 앱을 껐다 켜도 같은 사진이다.
2. 홈 → 지역 → 피드 카드 → 피드 상세: 표지와 사진 3장, 장소 사진이 보인다.
3. 여행 상세의 동행 얼굴, 채팅 탭, 친구 목록: 사진 얼굴과 글자 얼굴이 섞여 보인다. 내 얼굴은 글자다.
4. 인터넷을 끊고 같은 화면을 연다. 결과는 [photo-check.md](./photo-check.md)와 같아야 한다.
