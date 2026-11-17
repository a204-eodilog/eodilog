-- 홈 지도 시연용 데모 계정을 10명으로 늘린다. prod 프로필에서만 읽는다(application-prod.yaml의 spring.flyway.locations)
-- 앞 마이그레이션(V202611171500)의 5명은 사람 이름 닉네임으로 바꾸고, 5명과 여행·게시 피드를 더한다.
-- ID 규칙은 앞 마이그레이션과 같다: md5('eodilog-demo-u<번호>'), 여행 md5('eodilog-demo-t<회원>-<여행>') 등
UPDATE users u SET nickname=v.nickname,updated_at=now()
FROM (VALUES (1,'김민준'),(2,'이서연'),(3,'박지훈'),(4,'최유나'),(5,'정재원')) v(no,nickname)
WHERE u.id=md5('eodilog-demo-u'||v.no)::uuid;

CREATE TEMP TABLE demo_users(no int, nickname text) ON COMMIT DROP;
INSERT INTO demo_users VALUES
 (6,'강하은'),(7,'윤서진'),(8,'장도윤'),(9,'임채원'),(10,'신예준');

CREATE TEMP TABLE demo_trips(user_no int, trip_no int, title text, body text, start_date date, end_date date, codes text[]) ON COMMIT DROP;
INSERT INTO demo_trips VALUES
 (6,1,'강릉 바다 기차여행','KTX 타고 경포까지','2026-02-14','2026-02-15','{5115000000}'),
 (6,2,'여수·순천 남도 여행','순천만 갈대밭 산책','2026-10-24','2026-10-26','{1213000000,1215000000}'),
 (6,3,'가평 캠핑','장작 불멍','2026-06-13','2026-06-14','{4182000000}'),
 (6,4,'경주 다시 가기','수학여행 그 코스 그대로','2026-09-12','2026-09-13','{4713000000}'),
 (7,1,'제주 한 달 살기','애월에서 서귀포까지','2026-04-01','2026-04-30','{5011000000,5013000000}'),
 (7,2,'해운대 불꽃축제','광안대교 불꽃','2026-11-07','2026-11-08','{2635000000}'),
 (7,3,'춘천 닭갈비 투어','소양강 스카이워크','2026-03-07','2026-03-08','{5111000000}'),
 (7,4,'안동 하회마을','찜닭 먹고 탈춤 보고','2026-08-22','2026-08-23','{4717000000}'),
 (8,1,'부산 원도심 산책','국제시장과 해운대','2026-05-16','2026-05-18','{2611000000,2635000000}'),
 (8,2,'전주 한옥 스테이','한옥에서 하룻밤','2026-10-10','2026-10-11','{5211000000}'),
 (8,3,'단양 패러글라이딩','하늘에서 본 남한강','2026-07-25','2026-07-26','{4380000000}'),
 (8,4,'거제 바람의 언덕','바람 엄청 불어요','2026-04-18','2026-04-19','{4831000000}'),
 (9,1,'강릉·속초 드라이브','동해안 7번 국도','2026-08-08','2026-08-10','{5115000000,5121000000}'),
 (9,2,'서울 마포 카페 투어','연남동 골목','2026-09-27','2026-09-27','{1144000000}'),
 (9,3,'담양 죽녹원','대나무 숲 산책','2026-05-23','2026-05-24','{1271000000}'),
 (9,4,'태안 꽃지 해변','할미할아비바위 노을','2026-06-27','2026-06-28','{4482500000}'),
 (9,5,'포항 호미곶 일출','새해 첫 해','2026-01-01','2026-01-02','{4711000000}'),
 (10,1,'제주 서쪽 일주','협재 바다 색 최고','2026-07-18','2026-07-20','{5011000000}'),
 (10,2,'경주·포항','황리단길 지나 영일대','2026-03-21','2026-03-22','{4713000000,4711000000}'),
 (10,3,'강화도 역사 여행','고인돌과 전등사','2026-10-17','2026-10-17','{2871000000}'),
 (10,4,'목포 맛집 여행','민어회와 낙지','2026-02-07','2026-02-08','{1211000000}'),
 (10,5,'남원 광한루','춘향제 구경','2026-05-09','2026-05-10','{5219000000}');
INSERT INTO users(id,nickname,profile_completed,account_visibility,created_at,updated_at)
SELECT md5('eodilog-demo-u'||no)::uuid,nickname,true,'PUBLIC',now(),now() FROM demo_users
ON CONFLICT (id) DO NOTHING;

INSERT INTO trips(id,owner_user_id,title,start_date,end_date,status,created_at,updated_at)
SELECT md5('eodilog-demo-t'||user_no||'-'||trip_no)::uuid,md5('eodilog-demo-u'||user_no)::uuid,title,start_date,end_date,'COMPLETED',
 start_date::timestamptz-interval '7 days',end_date::timestamptz+interval '1 day'
FROM demo_trips ON CONFLICT (id) DO NOTHING;

INSERT INTO trip_members(id,trip_id,user_id,join_order,joined_at)
SELECT md5('eodilog-demo-m'||user_no||'-'||trip_no)::uuid,md5('eodilog-demo-t'||user_no||'-'||trip_no)::uuid,
 md5('eodilog-demo-u'||user_no)::uuid,1,start_date::timestamptz-interval '7 days'
FROM demo_trips ON CONFLICT (id) DO NOTHING;

-- 스냅샷은 앱이 게시할 때 만드는 Feed 모양을 따른다(사진·장소·코스·후기·경비 없음)
INSERT INTO feeds(id,trip_id,title,body,published_at,start_date,end_date,snapshot_json)
SELECT md5('eodilog-demo-f'||d.user_no||'-'||d.trip_no)::uuid,md5('eodilog-demo-t'||d.user_no||'-'||d.trip_no)::uuid,d.title,d.body,
 d.end_date::timestamptz+interval '1 day',d.start_date,d.end_date,
 jsonb_build_object(
  'id',md5('eodilog-demo-f'||d.user_no||'-'||d.trip_no)::uuid,
  'tripId',md5('eodilog-demo-t'||d.user_no||'-'||d.trip_no)::uuid,
  'title',d.title,'body',d.body,
  'publishedAt',to_char((d.end_date::timestamptz+interval '1 day') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'coverPhotoId',null,
  'regions',(SELECT jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'name',r.name,'parentId',r.parent_id,
                 'latitude',r.latitude,'longitude',r.longitude) ORDER BY array_position(d.codes,r.code))
             FROM regions r WHERE r.code=ANY(d.codes)),
  'startDate',d.start_date,'endDate',d.end_date,
  'photos','[]'::jsonb,'places','[]'::jsonb,'publicItinerary',null,'publicReviews','[]'::jsonb,'expenseSummary',null,
  'likedByMe',false,'likeCount',0,'version',1)
FROM demo_trips d ON CONFLICT (id) DO NOTHING;

INSERT INTO feed_regions(feed_id,region_id)
SELECT md5('eodilog-demo-f'||d.user_no||'-'||d.trip_no)::uuid,r.id
FROM demo_trips d JOIN regions r ON r.code=ANY(d.codes)
ON CONFLICT DO NOTHING;

-- 지우기: 앞 마이그레이션의 "지우기" 순서대로 하되 generate_series(1,5)를 generate_series(1,10)으로 바꾼다
