"""캡처(스크린샷) 평가 세트를 만든다. 화면 S11에 올라올 캡처를 흉내 낸 합성 이미지다.

사용: uv run --with playwright python -m scripts.make_captures [--photos 경로]
출력: eval_data/captures/images/*.png, images/visible_text.json, eval_data/captures/labels.json

- HTML 목업을 휴대폰 크기(360x780 CSS px, 배율 3 → 1080x2340)로 렌더링한다. 일부는 잘린 크기다.
- 실제 서비스의 로고·이름·UI 자산은 쓰지 않는다. 앱 이름은 '지도앱', '블로그', 'SNS' 같은 일반 이름이다.
- 장소는 실제로 알려진 관광지·식당·카페이고, 작성자·리뷰어·대화 상대는 지어낸 이름이다.
- 사진은 --photos 폴더(eval_data/photos의 AI 생성 사진)에서 가져오고, 없으면 단색 자리 표시로 그린다.
- 정답표(labels.json)는 이 파일의 데이터에서 만든다. 모델 응답을 보고 만들지 않는다.
- Playwright 기본 chromium이 없으면 설치된 Edge·Chrome으로 렌더링한다.
"""

import argparse
import base64
import html
import json
from dataclasses import dataclass, field
from pathlib import Path

from app.core.text import normalize

OUT = Path("eval_data/captures")
W, H, SCALE = 360, 780, 3


@dataclass(frozen=True)
class Place:
    name: str  # 화면에 쓰는 이름
    aliases: tuple[str, ...]  # 정답으로 인정하는 다른 표기
    address: str  # 동네 수준까지만 쓴다
    category: str


def _p(name, aliases, address, category):
    return Place(name, tuple(aliases), address, category)


PLACES = {
    # 부산
    "haeundae": _p("해운대해수욕장", ["해운대 해변", "해운대해변"], "부산 해운대구 우동", "해수욕장"),
    "gwangalli": _p("광안리해수욕장", ["광안리 해변", "광안리해변"], "부산 수영구 광안동", "해수욕장"),
    "gamcheon": _p("감천문화마을", [], "부산 사하구 감천동", "관광명소"),
    "huinyeoul": _p("흰여울문화마을", [], "부산 영도구 영선동", "관광명소"),
    "yonggungsa": _p("해동용궁사", [], "부산 기장군 기장읍", "사찰"),
    "taejongdae": _p("태종대", ["태종대유원지"], "부산 영도구 동삼동", "관광명소"),
    "busantower": _p("부산타워", ["부산 타워"], "부산 중구 광복동", "전망대"),
    "jagalchi": _p("자갈치시장", ["자갈치 시장"], "부산 중구 남포동", "수산시장"),
    "leejaemo": _p("이재모피자 본점", ["이재모피자", "이재모 피자"], "부산 중구 광복동", "피자"),
    "singisanup": _p("신기산업", [], "부산 영도구 영선동", "카페"),
    "samjin": _p("삼진어묵 영도본점", ["삼진어묵", "삼진어묵 본점"], "부산 영도구 봉래동", "어묵"),
    "ssangdung": _p("쌍둥이돼지국밥", ["쌍둥이 돼지국밥"], "부산 남구 대연동", "돼지국밥"),
    "bonjeon": _p("본전돼지국밥", ["본전 돼지국밥"], "부산 동구 초량동", "돼지국밥"),
    "songjeong3": _p("송정3대국밥", ["송정 3대 국밥"], "부산 부산진구 부전동", "돼지국밥"),
    "kkangtong": _p("부평깡통시장", ["깡통시장", "부평 깡통시장"], "부산 중구 부평동", "시장"),
    "blueline": _p("해운대 블루라인파크", ["블루라인파크", "블루라인 파크"], "부산 해운대구 중동", "관광열차"),
    "amsogalbi": _p("해운대암소갈비집", ["해운대 암소갈비집", "암소갈비집"], "부산 해운대구 중동", "소갈비"),
    "geumsu": _p("금수복국 해운대본점", ["금수복국", "금수복국 해운대점"], "부산 해운대구 중동", "복어요리"),
    # 강릉
    "gyeongpo": _p("경포해변", ["경포해수욕장", "경포 해변"], "강원 강릉시 강문동", "해수욕장"),
    "terarosa": _p(
        "테라로사 커피공장 강릉본점",
        ["테라로사 커피공장", "테라로사", "테라로사 강릉본점", "테라로사커피공장"],
        "강원 강릉시 구정면",
        "카페",
    ),
    "jumunjin": _p("주문진수산시장", ["주문진 수산시장"], "강원 강릉시 주문진읍", "수산시장"),
    "toetmaru": _p("툇마루", ["툇마루커피", "툇마루 커피"], "강원 강릉시 초당동", "카페"),
    "bohemian": _p(
        "보헤미안 박이추커피 본점",
        ["보헤미안 박이추커피", "보헤미안박이추커피", "보헤미안 커피"],
        "강원 강릉시 사천면",
        "카페",
    ),
    "donghwa": _p("동화가든", ["동화가든 본점"], "강원 강릉시 초당동", "순두부"),
    "anmok": _p(
        "안목해변", ["안목해수욕장", "안목해변 커피거리", "안목 커피거리"], "강원 강릉시 견소동", "해변"
    ),
    "ojukheon": _p("오죽헌", [], "강원 강릉시 죽헌동", "유적지"),
    "gyeongpodae": _p("경포대", [], "강원 강릉시 저동", "정자"),
    "jeongdongjin": _p("정동진", ["정동진해변", "정동진 해변"], "강원 강릉시 강동면", "관광명소"),
    "haslla": _p("하슬라아트월드", ["하슬라 아트월드"], "강원 강릉시 강동면", "미술관"),
    # 제주
    "seongsan": _p("성산일출봉", ["성산 일출봉"], "제주 서귀포시 성산읍", "관광명소"),
    "woojin": _p("우진해장국", [], "제주 제주시 삼도이동", "해장국"),
    "osulloc": _p("오설록 티뮤지엄", ["오설록", "오설록티뮤지엄"], "제주 서귀포시 안덕면", "카페"),
    "seopjikoji": _p("섭지코지", [], "제주 서귀포시 성산읍", "관광명소"),
    "manjanggul": _p("만장굴", [], "제주 제주시 구좌읍", "동굴"),
    "cheonjiyeon": _p("천지연폭포", ["천지연 폭포"], "제주 서귀포시 천지동", "폭포"),
    "saryeoni": _p("사려니숲길", ["사려니 숲길"], "제주 제주시 조천읍", "숲길"),
    "hyeopjae": _p("협재해수욕장", ["협재해변", "협재 해수욕장"], "제주 제주시 한림읍", "해수욕장"),
    "hamdeok": _p("함덕해수욕장", ["함덕해변", "함덕 해수욕장"], "제주 제주시 조천읍", "해수욕장"),
    "geumneung": _p("금능해수욕장", ["금능해변", "금능 해수욕장"], "제주 제주시 한림읍", "해수욕장"),
    "iho": _p("이호테우해수욕장", ["이호테우해변", "이호테우 해수욕장"], "제주 제주시 이호일동", "해수욕장"),
    "gwangchigi": _p("광치기해변", ["광치기 해변"], "제주 서귀포시 성산읍", "해변"),
    "bomnal": _p("카페 봄날", ["봄날", "봄날카페", "카페봄날"], "제주 제주시 애월읍", "카페"),
    "saebyeol": _p("새별오름", [], "제주 제주시 애월읍", "오름"),
    "jamae": _p("자매국수", [], "제주 제주시 일도이동", "고기국수"),
    "sukseongdo": _p("숙성도", [], "제주 제주시 노형동", "흑돼지"),
    "myeongjin": _p("명진전복", [], "제주 제주시 구좌읍", "전복요리"),
    # 서울
    "gyeongbok": _p("경복궁", [], "서울 종로구 세종로", "고궁"),
    "gwangjang": _p("광장시장", ["광장 시장"], "서울 종로구 예지동", "전통시장"),
    "londonbagel": _p(
        "런던베이글뮤지엄 안국점",
        ["런던베이글뮤지엄", "런던 베이글 뮤지엄", "런던베이글뮤지엄 안국"],
        "서울 종로구 계동",
        "베이커리",
    ),
    "changdeok": _p("창덕궁", [], "서울 종로구 와룡동", "고궁"),
    "deoksu": _p("덕수궁", [], "서울 중구 정동", "고궁"),
    "changgyeong": _p("창경궁", [], "서울 종로구 와룡동", "고궁"),
    "mangwon": _p("망원시장", ["망원 시장"], "서울 마포구 망원동", "전통시장"),
    "tongin": _p("통인시장", ["통인 시장"], "서울 종로구 통인동", "전통시장"),
    "namdaemun": _p("남대문시장", ["남대문 시장"], "서울 중구 남창동", "전통시장"),
    "bukchon": _p("북촌한옥마을", ["북촌 한옥마을"], "서울 종로구 계동", "관광명소"),
    "namsan": _p(
        "남산서울타워", ["N서울타워", "남산타워", "서울타워", "남산 서울타워"], "서울 용산구 용산동2가", "전망대"
    ),
    "myeongdonggyoja": _p("명동교자 본점", ["명동교자"], "서울 중구 명동2가", "칼국수"),
    "uraeok": _p("우래옥", [], "서울 중구 주교동", "평양냉면"),
}

# 장소가 아닌데 화면에 보이는 글자. 나와도 정답으로 세지 않고 지어낸 이름으로도 세지 않는다
UI_TEXT = {
    "detail": ["지도앱", "길찾기", "저장", "공유", "리뷰", "메뉴"],
    "list": ["지도앱", "지도", "목록"],
    "blog": ["블로그"],
    "sns": ["SNS"],
    "chat": ["채팅"],
}

# --- 이미지 정의 -------------------------------------------------------------------------


@dataclass
class Capture:
    id: str
    type: str  # detail, list, blog, sns, chat, hard, negative
    template: str
    args: dict
    places: list[str]  # PLACES 키
    also_visible: list[str] = field(default_factory=list)
    height: int = H  # CSS px. H보다 작으면 잘린 캡처
    hard: str | None = None  # small_text, dark, cut, ads
    cut: list[str] = field(default_factory=list)  # 화면 경계에 걸려 글자가 잘린 장소


def detail(i, key, query, photo, nearby="", reviews=(), height=H, dark=False, hard=None):
    return Capture(
        f"c{i:02d}",
        "hard" if hard else "detail",
        "detail",
        {"key": key, "query": query, "photo": photo, "nearby": nearby, "reviews": reviews, "dark": dark},
        [key],
        [nearby.split(" ")[0]] if nearby else [],
        height,
        hard,
    )


REVIEWS = {
    "beach": [("바다조아**", "물이 정말 맑고 산책하기 좋아요. 아침 일찍 가면 한산합니다."), ("t***k", "주차는 조금 어려워요.")],
    "food": [("먹보여행자", "웨이팅 30분 했는데 기다린 보람이 있어요."), ("ha***", "양이 많고 직원분들이 친절해요.")],
    "cafe": [("커피한잔**", "창가 자리 뷰가 최고예요. 디저트도 맛있어요."), ("m***n", "주말엔 사람이 많아요.")],
    "sight": [("주말산책", "사진 찍기 좋은 곳이 많아요. 편한 신발 추천!"), ("y***2", "오르막이 꽤 있어요.")],
}

CAPTURES: list[Capture] = [
    # 단일 장소 상세 12장 (일부는 위쪽만 잘린 캡처)
    detail(1, "haeundae", "해운대", "LANDSCAPE/l01_haeundae_beach_day.jpg", "해운대역 5번 출구 도보 10분", REVIEWS["beach"]),
    detail(2, "gamcheon", "감천", "LANDSCAPE/l03_huinyeoul_village_sea.jpg", "", REVIEWS["sight"]),
    detail(3, "leejaemo", "이재모피자", None, "남포역 7번 출구 도보 5분", REVIEWS["food"], height=430),
    detail(4, "gyeongpo", "경포", "LANDSCAPE/l05_gangneung_pine_beach.jpg", "", REVIEWS["beach"]),
    detail(5, "terarosa", "테라로사", "FOOD/f06_latte_art_cafe.jpg", "", REVIEWS["cafe"]),
    detail(6, "jumunjin", "주문진 수산시장", "FOOD/f09_seafood_market_crab.jpg", "", REVIEWS["food"], height=430),
    detail(7, "seongsan", "성산일출봉", "LANDSCAPE/l04_jeju_oreum_grass.jpg", "", REVIEWS["sight"]),
    detail(8, "woojin", "우진해장국", "FOOD/f01_dwaeji_gukbap.jpg", "", REVIEWS["food"]),
    detail(9, "osulloc", "오설록", None, "", REVIEWS["cafe"], height=480),
    detail(10, "gyeongbok", "경복궁", "LANDSCAPE/l07_gyeongju_hanok_roof.jpg", "경복궁역 5번 출구 도보 3분", REVIEWS["sight"]),
    detail(11, "gwangjang", "광장시장", "FOOD/f05_tteokbokki_street.jpg", "종로5가역 8번 출구 도보 2분", REVIEWS["food"]),
    detail(12, "londonbagel", "런던베이글", "FOOD/f08_bread_bakery_tray.jpg", "안국역 3번 출구 도보 3분", REVIEWS["food"]),
    # 여러 장소 목록 8장
    Capture("c13", "list", "list", {"query": "부산 가볼만한곳", "map": 120}, ["taejongdae", "yonggungsa", "gamcheon", "huinyeoul", "busantower"]),
    Capture("c14", "list", "list", {"query": "강릉 카페", "map": 220}, ["toetmaru", "terarosa", "bohemian"]),
    Capture("c15", "list", "list", {"query": "제주 가볼만한곳", "map": 180}, ["seopjikoji", "manjanggul", "cheonjiyeon", "saryeoni"]),
    Capture("c16", "list", "list", {"query": "서울 고궁", "map": 180}, ["gyeongbok", "changdeok", "deoksu", "changgyeong"]),
    Capture("c17", "list", "list", {"query": "부산 돼지국밥", "map": 0}, ["ssangdung", "bonjeon", "songjeong3"], height=470),
    Capture("c18", "list", "list", {"query": "제주 해수욕장", "map": 180}, ["hyeopjae", "hamdeok", "geumneung", "iho"]),
    Capture("c19", "list", "list", {"query": "강릉 가볼만한곳", "map": 120}, ["ojukheon", "gyeongpodae", "jeongdongjin", "anmok", "haslla"]),
    Capture("c20", "list", "list", {"query": "서울 전통시장", "map": 0}, ["gwangjang", "mangwon", "tongin", "namdaemun"], height=560),
    # 블로그 8장
    Capture("c21", "blog", "blog", {"title": "부산 영도 반나절 코스 정리", "author": "여행하는 고양이", "blocks": [
        ("img", "LANDSCAPE/l03_huinyeoul_village_sea.jpg"),
        ("p", "첫 번째로 간 곳은 흰여울문화마을! 바다를 따라 하얀 집들이 이어져 있어서 걷기만 해도 좋았어요."),
        ("p", "마을 구경 후에는 언덕 위 카페 신기산업에 갔어요. 통창으로 보이는 바다 뷰가 정말 멋졌습니다."),
    ]}, ["huinyeoul", "singisanup"]),
    Capture("c22", "blog", "blog", {"title": "강릉 초당 짬뽕순두부 후기", "author": "두부러버", "blocks": [
        ("img", "FOOD/f04_bibimbap_bowl.jpg"),
        ("p", "강릉 가면 꼭 먹어야 한다는 짬뽕순두부. 초당동 순두부 골목에 있는 동화가든에 다녀왔어요."),
        ("p", "오픈 30분 전에 갔는데도 대기가 있었어요. 얼큰하고 부드러운 맛이라 해장으로 최고!"),
    ]}, ["donghwa"], ["초당동", "강릉"]),
    Capture("c23", "blog", "blog", {"title": "제주 동쪽 하루 코스 (렌트카)", "author": "섬여행일기", "blocks": [
        ("p", "아침 일찍 성산일출봉에 올라 일출을 봤어요. 정상까지 30분 정도 걸립니다."),
        ("img", "LANDSCAPE/l04_jeju_oreum_grass.jpg"),
        ("p", "내려와서 섭지코지까지 차로 10분. 바람이 세니 겉옷 꼭 챙기세요."),
        ("p", "마지막은 광치기해변에서 노을 보기. 물때가 맞으면 이끼 낀 바위가 드러나요."),
    ]}, ["seongsan", "seopjikoji", "gwangchigi"], ["제주", "제주 동쪽"]),
    Capture("c24", "blog", "blog", {"title": "서울 북촌 산책 코스", "author": "골목탐험가", "blocks": [
        ("img", "LANDSCAPE/l07_gyeongju_hanok_roof.jpg"),
        ("p", "안국역에서 내려 북촌한옥마을 골목을 천천히 걸었어요. 주민들이 사는 곳이라 조용히 다니는 게 예의!"),
        ("p", "걷다 보면 창덕궁 돌담길로 이어집니다. 후원은 예약이 필요해요."),
    ]}, ["bukchon", "changdeok"], ["안국역"], height=620),
    Capture("c25", "blog", "blog", {"title": "부산 남포동 먹방 투어", "author": "먹방기록장", "blocks": [
        ("p", "점심은 줄 서서 먹는다는 이재모피자. 치즈가 정말 듬뿍 올라가요."),
        ("img", "FOOD/f03_korean_bbq_grill.jpg"),
        ("p", "영도로 넘어가서 삼진어묵 영도본점에서 어묵 고로케도 샀어요. 선물용 포장도 됩니다."),
    ]}, ["leejaemo", "samjin"], ["남포동", "영도"]),
    Capture("c26", "blog", "blog", {"title": "제주 애월·한림 카페와 바다", "author": "바다보러가자", "blocks": [
        ("img", "FOOD/f13_cafe_table_with_sea_view.jpg"),
        ("p", "애월 바닷가 언덕에 있는 카페 봄날. 창밖으로 에메랄드빛 바다가 보여요."),
        ("p", "오후에는 협재해수욕장으로 이동! 물이 얕아서 아이들과 놀기 좋아요."),
    ]}, ["bomnal", "hyeopjae"], ["애월", "한림"]),
    Capture("c27", "blog", "blog", {"title": "강릉 커피 여행", "author": "카페인중독", "blocks": [
        ("p", "강릉 하면 커피! 바다 앞 카페들이 줄지어 있는 안목해변에 다녀왔어요."),
        ("img", "FOOD/f07_cake_dessert_plate.jpg"),
        ("p", "날씨가 좋아서 테이크아웃해서 모래사장에 앉아 마셨어요."),
    ]}, ["anmok"], ["강릉"], height=640),
    Capture("c28", "blog", "blog", {"title": "서울 남산 야경 데이트", "author": "서울산책러", "blocks": [
        ("p", "저녁은 명동교자 본점에서 칼국수와 만두. 마늘 김치가 중독적이에요."),
        ("p", "소화시킬 겸 케이블카 타고 남산서울타워 전망대까지! 야경이 정말 예뻐요."),
        ("img", "LANDSCAPE/l02_gwangalli_bridge_night.jpg"),
    ]}, ["myeongdonggyoja", "namsan"], ["명동", "남산", "케이블카"]),
    # SNS 6장
    Capture("c29", "sns", "sns", {"user": "night_ocean_22", "photo": "LANDSCAPE/l02_gwangalli_bridge_night.jpg",
        "caption": "밤바다 산책 🌉 바람 선선하니 딱 좋다", "tags": ["광안리해수욕장", "부산여행", "야경맛집"]},
        ["gwangalli"], ["부산여행", "야경맛집"]),
    Capture("c30", "sns", "sns", {"user": "coffee.daily.log", "photo": "FOOD/f06_latte_art_cafe.jpg",
        "caption": "흑임자라떼 진짜 고소함 ☕️", "tags": ["툇마루", "강릉카페", "흑임자라떼"]},
        ["toetmaru"], ["강릉카페", "흑임자라떼"]),
    Capture("c31", "sns", "sns", {"user": "busan_eats", "photo": "FOOD/f12_hotteok_hand_a.jpg",
        "caption": "씨앗호떡은 사랑입니다", "tags": ["부평깡통시장", "부산여행", "씨앗호떡"]},
        ["kkangtong"], ["부산여행", "씨앗호떡"]),
    Capture("c32", "sns", "sns", {"user": "walk_jeju", "photo": "LANDSCAPE/l04_jeju_oreum_grass.jpg",
        "caption": "억새 시즌 시작 🌾 바람 엄청 불어요", "tags": ["새별오름", "제주오름", "억새"]},
        ["saebyeol"], ["제주오름", "억새"]),
    Capture("c33", "sns", "sns", {"user": "noodle_hunter", "photo": "FOOD/f11_cold_noodles_a.jpg",
        "caption": "육수 한 모금에 여름 끝", "tags": ["우래옥", "평양냉면", "서울맛집"]},
        ["uraeok"], ["평양냉면", "서울맛집"], height=600),
    Capture("c34", "sns", "sns", {"user": "green.tea.mood", "photo": None, "location": "오설록 티뮤지엄",
        "caption": "녹차 아이스크림 🍵 비 와도 좋았던 날", "tags": ["제주도", "녹차"]},
        ["osulloc"], ["제주도", "녹차"]),
    # 채팅 6장
    Capture("c35", "chat", "chat", {"room": "부산 여행 🏖️", "count": 4, "messages": [
        ("민지", "부산 가면 이재모피자 꼭 먹자"), ("me", "ㅇㅇ 웨이팅 각오해야 됨"),
        ("준호", "그리고 해운대 블루라인파크 타보고 싶음"), ("서연", "좋아 그거 예약해야 하나?"),
        ("준호", "주말은 예약하는 게 나을 듯"),
    ]}, ["leejaemo", "blueline"], ["민지", "준호", "서연", "부산", "부산 여행"]),
    Capture("c36", "chat", "chat", {"room": "강릉 1박", "count": 3, "messages": [
        ("다은", "툇마루 줄 엄청 길대"), ("me", "그럼 테라로사 커피공장 가자"),
        ("다은", "오케이 저녁은?"), ("me", "주문진수산시장 가서 회 먹자"), ("현우", "콜 🐟"),
    ]}, ["toetmaru", "terarosa", "jumunjin"], ["다은", "현우", "강릉", "강릉 1박"]),
    Capture("c37", "chat", "chat", {"room": "제주 가족여행", "count": 5, "messages": [
        ("엄마", "첫날 아침은 어디서 먹니"), ("me", "우진해장국! 고사리육개장 유명해요"),
        ("아빠", "그다음은"), ("me", "함덕해수욕장 가서 산책해요"),
    ]}, ["woojin", "hamdeok"], ["엄마", "아빠", "제주", "제주 가족여행", "고사리육개장"]),
    Capture("c38", "chat", "chat", {"room": "서울 나들이", "count": 3, "messages": [
        ("지훈", "런던베이글뮤지엄 안국점 웨이팅 몇 분이야?"), ("me", "평일 오전이면 1시간 정도?"),
        ("수아", "끝나고 광장시장 빈대떡도 ㄱㄱ"), ("지훈", "좋다 ㅋㅋ"),
    ]}, ["londonbagel", "gwangjang"], ["지훈", "수아", "서울", "서울 나들이", "빈대떡"], height=560),
    Capture("c39", "chat", "chat", {"room": "부산 여행 🏖️", "count": 4, "link": "gamcheon", "messages": [
        ("서연", "여기 사진 잘 나온대"), ("me", "오 태종대도 가까워?"),
        ("민지", "버스로 40분쯤?"),
    ]}, ["gamcheon", "taejongdae"], ["서연", "민지", "부산", "부산 여행"]),
    Capture("c40", "chat", "chat", {"room": "강릉 1박", "count": 3, "messages": [
        ("현우", "정동진 일출 보러 가자"), ("다은", "새벽 5시 출발 가능?"), ("me", "알람 3개 맞춘다"),
    ]}, ["jeongdongjin"], ["현우", "다은", "강릉", "강릉 1박"], height=520),
    # 어려운 사례 4장
    Capture("c41", "hard", "list", {"query": "제주 맛집", "map": 100, "zoom": 0.55},
        ["jamae", "sukseongdo", "myeongjin", "woojin"], hard="small_text"),
    detail(42, "yonggungsa", "용궁사", "LANDSCAPE/l11_sunset_ocean_horizon_a.jpg", "", REVIEWS["sight"], dark=True, hard="dark"),
    Capture("c43", "hard", "list", {"query": "부산 영도·남포", "map": 0, "scroll": 104},
        ["huinyeoul", "taejongdae", "jagalchi"], hard="cut", cut=["huinyeoul"], height=450),
    Capture("c44", "hard", "list", {"query": "해운대 맛집", "map": 0, "ads": True},
        ["amsogalbi", "geumsu"], hard="ads"),
    # 장소 없음 6장
    Capture("c45", "negative", "sns", {"user": "today.meal", "photo": "FOOD/f03_korean_bbq_grill.jpg",
        "caption": "오늘은 삼겹살 데이 🥓 불금 최고", "tags": ["삼겹살", "맛스타그램", "불금"]}, [],
        ["SNS", "삼겹살", "맛스타그램", "불금"]),
    Capture("c46", "negative", "sns", {"user": "home_cafe_sun", "photo": "FOOD/f07_cake_dessert_plate.jpg",
        "caption": "동생 생일 케이크 직접 만들었어요 🎂", "tags": ["홈카페", "케이크", "생일"]}, [],
        ["SNS", "홈카페", "케이크", "생일"]),
    Capture("c47", "negative", "weather", {"region": "부산광역시 해운대구", "temp": 18, "desc": "맑음", "dark": False},
        [], ["날씨", "부산광역시 해운대구", "부산광역시", "해운대구", "부산"]),
    Capture("c48", "negative", "weather", {"region": "강원특별자치도 강릉시", "temp": 11, "desc": "비", "dark": True},
        [], ["날씨", "강원특별자치도 강릉시", "강원특별자치도", "강릉시", "강릉"], height=600),
    Capture("c49", "negative", "settings", {}, [], ["설정"]),
    Capture("c50", "negative", "chat", {"room": "여행 준비", "count": 3, "messages": [
        ("유진", "짐 다 쌌어?"), ("me", "거의! 충전기만 챙기면 됨"), ("유진", "우산도 챙겨 비 온대"),
        ("태오", "내일 7시에 만나자"), ("me", "ㅇㅋ 늦지 마"),
    ]}, [], ["채팅", "유진", "태오", "여행 준비"]),
]

# --- HTML 템플릿 -------------------------------------------------------------------------

BASE_CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 360px; height: 100%; overflow: hidden; }
body { font-family: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
  background: #fff; color: #1f2328; font-size: 14px; line-height: 1.45; }
.status { height: 28px; display: flex; justify-content: space-between; align-items: center;
  padding: 0 16px; font-size: 12px; font-weight: 600; }
.ph { width: 100%; object-fit: cover; display: block; }
.ph.box { background: linear-gradient(135deg, #b9d7c3, #6f9f88); }
.muted { color: #6b7280; }
.dark { background: #121417; color: #e8eaed; }
.dark .muted { color: #9aa0a6; }
.dark .card, .dark .row { border-color: #2b2f36 !important; }
"""


def esc(text) -> str:
    return html.escape(str(text))


class Photos:
    def __init__(self, root: Path | None):
        self.root = root

    def tag(self, rel: str | None, height: int, extra: str = "") -> str:
        path = self.root / rel if self.root and rel else None
        if path and path.exists():
            data = base64.b64encode(path.read_bytes()).decode()
            src = f"data:image/jpeg;base64,{data}"
            return f'<img class="ph {extra}" style="height:{height}px" src="{src}">'
        return f'<div class="ph box {extra}" style="height:{height}px"></div>'


def status(dark=False) -> str:
    return '<div class="status"><span>9:41</span><span>LTE ▮▮▮ 82%</span></div>'


def render_detail(c: Capture, photos: Photos) -> str:
    a = c.args
    p = PLACES[a["key"]]
    reviews = "".join(
        f'<div class="row" style="padding:10px 16px;border-top:1px solid #eee">'
        f'<b>{esc(nick)}</b> <span style="color:#f5a623">★★★★★</span>'
        f'<div>{esc(text)}</div><div class="muted" style="font-size:11px">10.2{n}.일 · 방문 1번째</div></div>'
        for n, (nick, text) in enumerate(a["reviews"])
    )
    nearby = f'<div class="muted" style="font-size:12px;margin-left:20px">{esc(a["nearby"])}</div>' if a["nearby"] else ""
    return f"""<body class="{'dark' if a['dark'] else ''}">{status()}
<div style="display:flex;align-items:center;gap:10px;padding:6px 12px">
  <span style="font-size:22px">‹</span>
  <div class="card" style="flex:1;border:1px solid #ddd;border-radius:20px;padding:6px 14px">{esc(a['query'])}</div>
  <span class="muted" style="font-size:11px">지도앱</span></div>
{photos.tag(a['photo'], 210)}
<div style="padding:14px 16px 8px">
  <div style="font-size:22px;font-weight:700">{esc(p.name)}</div>
  <div class="muted" style="font-size:13px">{esc(p.category)}</div>
  <div style="font-size:13px;margin-top:4px"><span style="color:#f5a623">★</span> 4.{len(p.name) % 5 + 3}
   <span class="muted">· 방문자 리뷰 {len(p.name) * 431:,} · 블로그 리뷰 {len(p.name) * 97:,}</span></div>
</div>
<div style="display:flex;justify-content:space-around;padding:10px 0;border-top:1px solid #eee;border-bottom:1px solid #eee" class="row">
  <span>길찾기</span><span>저장</span><span>공유</span><span>전화</span></div>
<div style="padding:12px 16px;font-size:13px">
  <div>📍 {esc(p.address)}</div>{nearby}
  <div style="margin-top:6px">🕘 <b style="color:#1a9b5a">영업 중</b> · 21:00에 영업 종료</div>
</div>
<div style="display:flex;gap:22px;padding:8px 16px;font-weight:600;border-bottom:2px solid #eee" class="row">
  <span>홈</span><span>메뉴</span><span style="border-bottom:2px solid currentColor">리뷰</span><span>사진</span></div>
{reviews}</body>"""


def render_list(c: Capture, photos: Photos) -> str:
    a = c.args
    items = []
    if a.get("ads"):
        items.append(
            '<div class="row" style="display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid #eee;background:#fffbea">'
            '<div class="ph box" style="width:72px;height:72px;border-radius:8px;background:#f2c94c"></div>'
            '<div><span style="font-size:10px;border:1px solid #c9a227;color:#c9a227;padding:0 3px">광고</span>'
            ' <b style="font-size:16px">오션스테이 호텔</b><div class="muted" style="font-size:12px">숙박 · 오늘만 객실 40% 특가</div>'
            '<div style="font-size:12px;color:#d14">쿠폰 받기 ›</div></div></div>'
        )
    for n, key in enumerate(c.places, 1):
        p = PLACES[key]
        items.append(
            f'<div class="row" style="display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid #eee">'
            f'<div class="ph box" style="width:72px;height:72px;border-radius:8px;flex:none;'
            f'background:hsl({n * 67 % 360},35%,70%)"></div>'
            f'<div><div><b style="font-size:16px">{esc(p.name)}</b> <span class="muted" style="font-size:12px">{esc(p.category)}</span></div>'
            f'<div style="font-size:12px"><span style="color:#f5a623">★</span> 4.{(n * 3) % 5 + 4} '
            f'<span class="muted">· 리뷰 {n * 1234:,}</span></div>'
            f'<div class="muted" style="font-size:12px">{esc(p.address)} · {n * 1.3:.1f}km</div></div></div>'
        )
        if a.get("ads") and n == 1:
            items.append(
                '<div style="margin:10px 16px;padding:12px;border-radius:10px;background:#eef3ff;font-size:13px">'
                '<b>여행카드</b> 결제 시 맛집 10% 즉시 할인 · 11월 30일까지 <span class="muted">AD</span></div>'
            )
    mp = a.get("map", 0)
    pins = "".join(
        f'<span style="position:absolute;left:{40 + n * 61}px;top:{25 + (n * 37) % max(mp - 50, 1)}px;'
        f'background:#2f80ed;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;font-size:12px">{n}</span>'
        for n in range(1, len(c.places) + 1)
    )
    map_html = (
        f'<div style="position:relative;height:{mp}px;background:repeating-linear-gradient(0deg,#e8efe6 0 38px,#dfe8dc 38px 40px),#e8efe6">{pins}</div>'
        if mp
        else ""
    )
    zoom = a.get("zoom", 1)
    scroll = a.get("scroll", 0)
    body = f"""<div style="display:flex;align-items:center;gap:10px;padding:6px 12px">
  <span style="font-size:22px">‹</span>
  <div class="card" style="flex:1;border:1px solid #ddd;border-radius:20px;padding:6px 14px">{esc(a['query'])}</div>
  <span class="muted" style="font-size:11px">지도앱</span></div>
<div style="display:flex;gap:6px;padding:4px 12px 8px;font-size:12px">
  <span class="card" style="border:1px solid #ddd;border-radius:14px;padding:2px 10px">관련도순</span>
  <span class="card" style="border:1px solid #ddd;border-radius:14px;padding:2px 10px">영업 중</span>
  <span class="card" style="border:1px solid #ddd;border-radius:14px;padding:2px 10px">지도 보기</span></div>
{map_html}{''.join(items)}"""
    if scroll:
        # 목록을 위로 밀어 첫 항목 이름이 상태 표시줄 아래에서 잘리게 한다
        return f"""<body>{status()}<div style="position:relative;height:{c.height - 28}px;overflow:hidden">
<div style="position:absolute;top:-{scroll}px;left:0;right:0">{body}</div></div></body>"""
    return f'<body>{status()}<div style="zoom:{zoom}">{body}</div></body>'


def render_blog(c: Capture, photos: Photos) -> str:
    a = c.args
    blocks = "".join(
        f'<p style="padding:8px 18px;font-size:15px;line-height:1.7">{esc(v)}</p>'
        if kind == "p"
        else f'<div style="padding:8px 0">{photos.tag(v, 200)}</div>'
        for kind, v in a["blocks"]
    )
    return f"""<body>{status()}
<div style="display:flex;justify-content:space-between;padding:8px 16px;font-weight:700">
  <span>‹ 블로그</span><span class="muted" style="font-weight:400">공유 ⋯</span></div>
<div style="padding:10px 18px 6px"><div class="muted" style="font-size:12px">국내여행</div>
  <div style="font-size:21px;font-weight:700;line-height:1.35">{esc(a['title'])}</div>
  <div style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px">
   <span style="width:28px;height:28px;border-radius:50%;background:#cdd5df;display:inline-block"></span>
   <b>{esc(a['author'])}</b><span class="muted">2026. 10. 12. 21:30</span></div></div>
<div style="border-top:1px solid #eee;margin-top:8px"></div>
{blocks}
<div class="muted" style="padding:10px 18px;font-size:13px">♡ 공감 128 · 댓글 14</div></body>"""


def render_sns(c: Capture, photos: Photos) -> str:
    a = c.args
    tags = " ".join(f'<span style="color:#2f6fd6">#{esc(t)}</span>' for t in a["tags"])
    loc = f'<div style="font-size:11px">{esc(a["location"])}</div>' if a.get("location") else ""
    photo = (
        photos.tag(a["photo"], 360)
        if a["photo"]
        else '<div class="ph box" style="height:360px;background:linear-gradient(160deg,#a7c957,#386641)"></div>'
    )
    return f"""<body>{status()}
<div style="display:flex;justify-content:space-between;padding:6px 14px;font-size:20px;font-weight:700">
  <span>SNS</span><span style="font-size:16px">♡ ✉</span></div>
<div style="display:flex;align-items:center;gap:10px;padding:8px 14px">
  <span style="width:32px;height:32px;border-radius:50%;background:linear-gradient(45deg,#f7b267,#f25c54);display:inline-block"></span>
  <div><b style="font-size:13px">{esc(a['user'])}</b>{loc}</div><span style="margin-left:auto">⋯</span></div>
{photo}
<div style="padding:8px 14px;font-size:20px">♡ 💬 ➤ <span style="float:right">🔖</span></div>
<div style="padding:0 14px;font-size:13px"><b>좋아요 1,024개</b></div>
<div style="padding:4px 14px;font-size:13px"><b>{esc(a['user'])}</b> {esc(a['caption'])}<br>{tags}</div>
<div class="muted" style="padding:2px 14px;font-size:12px">댓글 23개 모두 보기</div>
<div style="padding:2px 14px;font-size:13px"><b>sunny_day.01</b> 와 저도 가보고 싶어요</div>
<div class="muted" style="padding:2px 14px;font-size:11px">3일 전</div></body>"""


def render_chat(c: Capture, photos: Photos) -> str:
    a = c.args
    rows = []
    if a.get("link"):
        p = PLACES[a["link"]]
        rows.append(
            '<div style="display:flex;gap:8px;padding:4px 12px"><span style="width:34px;height:34px;border-radius:12px;background:#b8c4d6;flex:none"></span>'
            f'<div><div style="font-size:12px">{esc(a["messages"][0][0])}</div>'
            '<div style="background:#fff;border-radius:10px;width:220px;overflow:hidden;font-size:13px">'
            '<div style="height:110px;background:linear-gradient(135deg,#f6d186,#e56b6f)"></div>'
            f'<div style="padding:8px"><b>{esc(p.name)}</b><div class="muted" style="font-size:11px">{esc(p.address)} · 지도앱</div></div>'
            "</div></div></div>"
        )
    for sender, text in a["messages"]:
        if sender == "me":
            rows.append(
                '<div style="display:flex;justify-content:flex-end;align-items:flex-end;gap:4px;padding:4px 12px">'
                '<span class="muted" style="font-size:10px">오후 9:12</span>'
                f'<div style="background:#bfe3c6;border-radius:14px;padding:7px 11px;max-width:230px">{esc(text)}</div></div>'
            )
        else:
            rows.append(
                '<div style="display:flex;gap:8px;padding:4px 12px"><span style="width:34px;height:34px;border-radius:12px;background:#b8c4d6;flex:none"></span>'
                f'<div><div style="font-size:12px">{esc(sender)}</div><div style="display:flex;align-items:flex-end;gap:4px">'
                f'<div style="background:#fff;border-radius:14px;padding:7px 11px;max-width:230px">{esc(text)}</div>'
                '<span class="muted" style="font-size:10px">오후 9:11</span></div></div></div>'
            )
    return f"""<body style="background:#c9d6e3">{status()}
<div style="display:flex;justify-content:space-between;padding:8px 14px;font-weight:700">
  <span>‹ {esc(a['room'])} <span class="muted" style="font-weight:400">{a['count']}</span></span><span>🔍 ☰</span></div>
<div style="text-align:center;margin:8px"><span style="background:rgba(0,0,0,.15);border-radius:10px;padding:2px 10px;font-size:11px">2026년 10월 30일 목요일</span></div>
{''.join(rows)}
<div style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:10px 12px;display:flex;gap:8px;font-size:13px">
  <span>＋</span><span class="muted" style="flex:1">메시지 입력</span><span>☺ #</span></div></body>"""


def render_weather(c: Capture, photos: Photos) -> str:
    a = c.args
    hours = "".join(
        f'<div style="text-align:center;font-size:12px">{h}시<div style="font-size:18px">{"☀" if a["desc"] == "맑음" else "🌧"}</div>{a["temp"] + d}°</div>'
        for h, d in [(15, 0), (16, 1), (17, 0), (18, -1), (19, -2), (20, -3)]
    )
    days = "".join(
        f'<div class="row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(128,128,128,.25)">'
        f'<span>{d}</span><span>{"☀" if n % 2 else "⛅"}</span><span>{a["temp"] - 5 + n}° / {a["temp"] + 2 + n}°</span></div>'
        for n, d in enumerate(["내일", "토", "일", "월", "화"])
    )
    bg = "#1b2330" if a["dark"] else "#e7f1fb"
    return f"""<body class="{'dark' if a['dark'] else ''}" style="background:{bg}">{status()}
<div style="padding:8px 18px;font-weight:700">날씨</div>
<div style="text-align:center;padding:16px 0">
  <div style="font-size:16px">📍 {esc(a['region'])}</div>
  <div style="font-size:72px;font-weight:300;line-height:1.1">{a['temp']}°</div>
  <div style="font-size:18px">{esc(a['desc'])}</div>
  <div class="muted">최고 {a['temp'] + 3}° / 최저 {a['temp'] - 5}° · 체감 {a['temp'] - 1}°</div></div>
<div style="display:flex;justify-content:space-around;margin:0 14px;padding:12px 0;border-radius:14px;background:rgba(128,128,128,.12)">{hours}</div>
<div style="display:flex;justify-content:space-around;margin:12px 14px;font-size:13px">
  <span>미세먼지 좋음</span><span>자외선 보통</span><span>습도 62%</span></div>
<div style="margin:0 18px">{days}</div></body>"""


def render_settings(c: Capture, photos: Photos) -> str:
    rows = [
        ("계정", "로그인 정보 · 비밀번호"),
        ("알림", "푸시 알림 켜짐"),
        ("위치 서비스", "앱 사용 중에만 허용"),
        ("다크 모드", "시스템 설정 따르기"),
        ("저장 공간", "캐시 128MB"),
        ("언어", "한국어"),
        ("개인정보 처리방침", ""),
        ("오픈소스 라이선스", ""),
        ("버전 정보", "1.2.0 (최신 버전)"),
    ]
    items = "".join(
        f'<div class="row" style="display:flex;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eee">'
        f'<span>{esc(t)}</span><span class="muted" style="font-size:12px">{esc(s)} ›</span></div>'
        for t, s in rows
    )
    return f"""<body style="background:#f5f6f8">{status()}
<div style="padding:10px 18px;font-size:20px;font-weight:700">설정</div>
<div style="background:#fff;margin:6px 0">{items}</div>
<div class="muted" style="text-align:center;font-size:12px;padding:16px">로그아웃</div></body>"""


RENDERERS = {
    "detail": render_detail,
    "list": render_list,
    "blog": render_blog,
    "sns": render_sns,
    "chat": render_chat,
    "weather": render_weather,
    "settings": render_settings,
}

# 화면 안에 실제로 보이는 글자만 모은다. 잘려서 넘친 글자는 정답표 검사에서 빠져야 한다
VISIBLE_TEXT_JS = """() => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.bottom > 0 && r.top < window.innerHeight && r.width > 0) { out.push(node.textContent.trim()); break; }
    }
  }
  return out;
}"""

# --- 정답표 ------------------------------------------------------------------------------


def region_tokens(address: str) -> list[str]:
    parts = address.split()
    return [" ".join(parts[: i + 1]) for i in range(len(parts))] + parts


def label_for(c: Capture) -> dict:
    places = [[PLACES[k].name, *PLACES[k].aliases] for k in c.places]
    also = list(c.also_visible) + UI_TEXT.get(c.template, [])
    if c.template in ("detail", "list"):
        for k in c.places:
            also += region_tokens(PLACES[k].address) + [PLACES[k].category]
    if c.args.get("link"):
        also += region_tokens(PLACES[c.args["link"]].address)
    if c.hard == "ads":
        also += ["오션스테이 호텔", "오션스테이", "여행카드"]
    label = {
        "type": c.type,
        "expected": [name for aliases in places for name in aliases],
        "places": places,
        "also_visible": list(dict.fromkeys(also)),
    }
    if c.hard:
        label["hard"] = c.hard
    if c.cut:
        label["cut"] = [PLACES[k].name for k in c.cut]
    if c.height != H:
        label["size"] = f"{W * SCALE}x{c.height * SCALE}"
    return label


NOTE = (
    "합성 캡처 평가 세트. places: 찾아야 하는 장소마다 인정 표기 목록(첫 번째가 화면에 쓴 이름). "
    "expected: places를 펼친 것(eval_places.score_image 호환, 하나라도 맞으면 correct). "
    "also_visible: 화면에 보이지만 장소가 아닌 글자(지역명, 앱 이름, 해시태그, 사람 이름, 광고). "
    "나와도 정답으로 세지 않고 지어낸 이름으로도 세지 않는다. type=negative는 장소가 없는 캡처다. "
    "hard: 어려운 사례 종류. cut: 화면 경계에서 글자가 잘린 장소. 정답표는 생성 스크립트의 데이터로 만들며 실행 결과를 보고 고치지 않는다."
)


def check_label(name: str, label: dict, visible: list[str]) -> list[str]:
    """정답 장소가 화면 글자에 실제로 있는지 확인한다. 잘린 장소는 빼고 본다."""
    text = normalize(" ".join(visible))
    problems = []
    for aliases in label["places"]:
        if aliases[0] in label.get("cut", []):
            continue
        if not any(normalize(a) in text for a in aliases):
            problems.append(f"{name}: '{aliases[0]}'이 화면에 없다")
    return problems


def launch(p):
    try:
        return p.chromium.launch()
    except Exception:
        for channel in ("msedge", "chrome"):
            try:
                return p.chromium.launch(channel=channel)
            except Exception:
                continue
        raise


def main() -> None:
    from playwright.sync_api import sync_playwright

    parser = argparse.ArgumentParser()
    parser.add_argument("--photos", type=Path, default=Path("eval_data/photos"))
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    photos = Photos(args.photos if args.photos.exists() else None)
    if not photos.root:
        print("사진 폴더가 없어 단색 자리 표시로 그린다:", args.photos)
    images = args.out / "images"
    images.mkdir(parents=True, exist_ok=True)

    ids = [c.id for c in CAPTURES]
    assert len(ids) == len(set(ids)), "중복 id"
    labels, visible_all, problems = {}, {}, []
    with sync_playwright() as p:
        browser = launch(p)
        for c in CAPTURES:
            page = browser.new_page(
                viewport={"width": W, "height": c.height}, device_scale_factor=SCALE
            )
            doc = f"<!doctype html><html><head><meta charset='utf-8'><style>{BASE_CSS}</style></head>"
            page.set_content(doc + RENDERERS[c.template](c, photos) + "</html>")
            page.wait_for_load_state("load")
            name = f"{c.id}_{c.type}.png"
            page.screenshot(path=str(images / name))
            visible = page.evaluate(VISIBLE_TEXT_JS)
            page.close()
            labels[name] = label_for(c)
            visible_all[name] = visible
            problems += check_label(name, labels[name], visible)
            print(name, labels[name]["places"] and [a[0] for a in labels[name]["places"]])
        browser.close()

    (images / "visible_text.json").write_text(
        json.dumps(visible_all, ensure_ascii=False, indent=1), "utf-8"
    )
    (args.out / "labels.json").write_text(
        json.dumps({"_note": NOTE, "images": labels}, ensure_ascii=False, indent=1) + "\n", "utf-8"
    )
    for problem in problems:
        print("정답표 문제:", problem)
    print(f"{len(labels)}장 생성, 정답표 문제 {len(problems)}건")


if __name__ == "__main__":
    main()
