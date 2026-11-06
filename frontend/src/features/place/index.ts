/**
 * 장소 기능에서 다른 기능이 쓰는 것만 내보낸다(S12 추출 결과에서 S13 장소 검색을 열어 장소를 고른다).
 * 다른 기능 폴더는 이 파일로만 불러온다(CONVENTION "다른 기능 폴더의 내부 파일을 직접 불러오지 않는다")
 */
export { pickPlace, type PickPlaceOptions } from './place-picker';
