/**
 * 소개 페이지에 나오는 글과 목록. 문구를 고칠 때는 이 파일만 보면 된다.
 */

/** 서비스 주소. 임시 QR이 가리키는 곳 */
export const SITE_URL = 'https://eodilog.example.com'

export type FeatureId = 'collect' | 'recommend' | 'decide' | 'course' | 'ontrip' | 'record' | 'map'

export type Feature = {
  id: FeatureId
  /** 여행 흐름에서의 단계 이름 */
  stage: string
  title: string
  body: string
  points: string[]
}

/**
 * 핵심 기능 네 가지. 여행 한 번의 흐름 순서다.
 * 화면 그림은 src/shots/<id>.png(또는 .webp, .jpg)를 넣으면 그 캡처로 바뀐다
 */
export const features: Feature[] = [
  {
    id: 'collect',
    stage: '모으기',
    title: '링크만 올리면\n장소가 정리돼요',
    body: '영상이나 블로그 링크, 캡처 사진을 올리면 그 안의 장소를 찾아 지도에 담아요. 동행이 담은 곳과 겹치는 곳도 한눈에 보여요.',
    points: ['링크와 캡처에서 장소 찾기', '내 저장과 그룹 저장', '겹친 곳만 모아 보기'],
  },
  {
    id: 'decide',
    stage: '정하기',
    title: '어디 갈지는\n투표로 깔끔하게',
    body: '후보를 올리고 여러 곳에 투표해요. 마감 시간이 되면 자동으로 확정되고, 그룹 채팅에 결과가 바로 올라와요.',
    points: ['지역 투표와 장소 투표', '마감되면 자동 확정', '여행마다 그룹 채팅'],
  },
  {
    id: 'course',
    stage: '짜기',
    title: '코스는 같이,\n동시에 고쳐요',
    body: '모은 장소로 날짜별 코스를 추천받고, 순서를 바꾸거나 장소를 빼고 넣어요. 구간마다 이동 시간도 함께 보여요.',
    points: ['날짜별 코스 자동 추천', '동행과 함께 편집', '구간별 이동 수단과 시간'],
  },
  {
    id: 'record',
    stage: '남기기',
    title: '사진과 경비는\n알아서 정리돼요',
    body: '올린 사진을 주제와 장소별로 나누고, 누가 얼마를 냈는지 적으면 정산 금액을 계산해요. 다녀온 곳에는 별점과 한 줄 평을 남겨요.',
    points: ['사진 주제별 분류', '경비 입력과 정산', '방문한 곳 평가'],
  },
]

export type TogetherIcon = 'edit' | 'card' | 'anyone' | 'undo'

/** 여럿이 같이 쓸 때 달라지는 점 */
export const together: { icon: TogetherIcon; title: string; body: string }[] = [
  { icon: 'edit', title: '코스를 동시에 고쳐요', body: '한 사람이 순서를 바꾸면 다른 사람 화면에도 바로 보여요. 문서를 돌려 가며 고칠 필요가 없어요.' },
  { icon: 'card', title: '소식이 채팅방에 카드로 와요', body: '투표가 열리거나 코스가 바뀌면 채팅방에 카드가 올라오고, 누르면 그 화면으로 바로 가요.' },
  { icon: 'anyone', title: '누구나 고치고 적용해요', body: '방장의 승인을 기다리지 않아요. 동행이라면 누구나 일정을 고치고 변경안을 적용할 수 있어요.' },
  { icon: 'undo', title: '잘못 눌러도 되돌려요', body: '변경안을 적용한 직후에는 한 번 되돌릴 수 있어서 마음 편히 눌러 볼 수 있어요.' },
]

export type AiIcon ='place' | 'recommend' | 'course' | 'weather' | 'checklist' | 'photo'

/** AI가 돕는 순간. 무엇을 넣으면(from) 무엇이 나오는지(to)를 짝으로 보여 준다 */
export const aiMoments: { icon: AiIcon; title: string; from: string; to: string; body: string }[] = [
  { icon: 'place', title: '장소 찾기', from: '링크·캡처', to: '지도 위 장소', body: '영상이나 글 속에 나온 곳을 찾아 이름과 위치로 정리해요.' },
  { icon: 'recommend', title: '여행지 추천', from: '담은 곳·취향', to: '갈 만한 곳', body: '동행이 함께 담은 곳과 취향을 보고 추천하고, 이유도 알려 줘요.' },
  { icon: 'course', title: '코스 추천', from: '모은 장소·기간', to: '날짜별 코스', body: '모은 장소를 날짜에 맞춰 순서대로 놓고 이동 시간을 붙여요.' },
  { icon: 'weather', title: '날씨 대안', from: '오늘 날씨·코스', to: '바꿀 만한 곳', body: '비나 눈이 오면 시간을 옮기거나 다른 곳으로 바꾸는 안을 내요.' },
  { icon: 'checklist', title: '준비물 제안', from: '여행 정보', to: '챙길 것 목록', body: '여행에 맞는 준비물을 제안하고, 직접 고친 항목은 그대로 둬요.' },
  { icon: 'photo', title: '사진 분류', from: '올린 사진', to: '주제별 묶음', body: '음식, 풍경, 사람처럼 주제로 나누고 비슷한 사진은 묶어요.' },
]

export type ExtraIcon = 'ontrip' | 'map' | 'invite' | 'bell' | 'taste' | 'proposal' | 'trend' | 'timeline'

/** 큰 흐름 사이를 채우는 기능. 작은 카드로 모아 보여 준다 */
export const extras: { icon: ExtraIcon; title: string; body: string }[] = [
  { icon: 'ontrip', title: '여행 중 안내', body: '오늘 코스와 날씨를 보여 주고, 준비물을 같이 체크하고, 근처 화장실과 충전소를 찾아 줘요.' },
  { icon: 'map', title: '친구 여행 지도', body: '친구가 다녀온 여행이 지도에 나타나고, 마음에 든 장소는 내 저장 목록에 바로 담아요.' },
  { icon: 'invite', title: '링크 하나로 초대', body: '카카오톡으로 초대 링크를 보내면 누르는 것만으로 여행에 들어와요.' },
  { icon: 'taste', title: '여행 취향 입력', body: '좋아하는 여행 방식을 골라 두면 추천에 반영돼요. 어디까지 쓸지도 내가 정해요.' },
  { icon: 'proposal', title: '코스 변경안', body: '장소를 빼면 남은 코스를 다시 짜서 바뀌기 전과 후를 비교해 보여 줘요. 적용한 뒤 한 번 되돌릴 수 있어요.' },
  { icon: 'bell', title: '놓치지 않는 알림', body: '투표가 열리거나 마감이 가까워지면, 변경안이 올라오면 알려 줘요.' },
  { icon: 'trend', title: '요즘 뜨는 여행지', body: '최근에 사람들이 많이 다녀온 여행지를 모아 보여 줘요.' },
  { icon: 'timeline', title: '타임라인과 요약 카드', body: '다녀온 여행이 시간 순서로 쌓이고, 여행마다 지도와 사진, 기간, 경비가 한 장으로 정리돼요.' },
]

/** 서비스가 풀려는 불편 */
export const pains = [
  { title: '단톡방에 묻힌 링크', body: '누가 올린 맛집이었는지 다시 찾느라 스크롤만 올려요.' },
  { title: '정해지지 않는 여행지', body: '다 좋다고 하는데 아무도 정하지 않아요.' },
  { title: '혼자 짜는 일정표', body: '한 사람이 문서에 일정을 적고 나머지는 보기만 해요.' },
  { title: '여행 뒤에 남는 숙제', body: '사진은 흩어지고 정산은 몇 주째 미뤄져요.' },
]

export type Release = {
  version: string
  date: string
  note: string
  /** APK를 내려받는 주소. 아직 없으면 null로 두면 '준비 중'으로 보인다 */
  url: string | null
}

/**
 * 배포한 APK 목록. 새 버전은 맨 위에 한 줄 추가한다.
 * 첫 번째 항목의 url이 있으면 QR도 그 주소로 바뀐다
 */
export const releases: Release[] = [
  { version: '준비 중', date: '곧 공개', note: '첫 안드로이드 설치 파일을 준비하고 있어요.', url: null },
]
