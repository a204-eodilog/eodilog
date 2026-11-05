import { RegionSearchScreen } from '@/features/trip/screens/region-search-screen';

/** S19 여행 설정의 여행지 줄에서 여는 검색. 고른 값은 수정 입력 스토어에 담긴다 */
export default function SettingsRegionRoute() {
  return <RegionSearchScreen draft="edit" />;
}
