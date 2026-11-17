-- 홈 지도 시연용 데모 계정 5개와 게시 피드. prod 프로필에서만 읽는다(application-prod.yaml의 spring.flyway.locations)
-- 공개 계정이라 팔로우하면 바로 수락된다. 카카오 연결이 없어 이 계정으로 로그인할 수는 없다.
-- ID는 md5('eodilog-demo-...')로 고정한다. 지울 때는 파일 끝의 "지우기" 순서대로 새 마이그레이션을 만든다.
CREATE TEMP TABLE demo_users(no int, nickname text) ON COMMIT DROP;
INSERT INTO demo_users VALUES
 (1,'바다마중'),(2,'솔솔바람'),(3,'산책하는곰'),(4,'길위의펭귄'),(5,'노을수집가');

CREATE TEMP TABLE demo_trips(user_no int, trip_no int, title text, body text, start_date date, end_date date, codes text[]) ON COMMIT DROP;
INSERT INTO demo_trips VALUES
 (1,1,'강릉·속초 바다 여행','파도 소리 듣고 왔어요','2026-05-02','2026-05-04','{5115000000,5121000000}'),
 (1,2,'제주 한 바퀴','렌트카로 한 바퀴','2026-03-14','2026-03-17','{5011000000,5013000000}'),
 (1,3,'경주 벚꽃 산책','보문호 벚꽃 최고','2026-04-05','2026-04-06','{4713000000}'),
 (2,1,'겨울 강릉','눈 오는 경포대','2026-01-10','2026-01-11','{5115000000}'),
 (2,2,'제주 맛집 여행','먹다가 끝난 여행','2026-06-20','2026-06-22','{5011000000}'),
 (2,3,'부산·여수 남해안','남해안 따라 쭉','2026-08-01','2026-08-04','{2635000000,1213000000}'),
 (2,4,'서울 궁궐 나들이','경복궁 한복 산책','2026-10-03','2026-10-03','{1111000000}'),
 (3,1,'강릉·양양 서핑','첫 서핑 성공','2026-07-12','2026-07-14','{5115000000,5183000000}'),
 (3,2,'전주 한옥마을','비빔밥 두 그릇','2026-09-06','2026-09-07','{5211000000}'),
 (3,3,'해운대 여름휴가','바다 수영','2026-08-15','2026-08-17','{2635000000}'),
 (3,4,'제주 오름','새별오름 일몰','2026-02-20','2026-02-23','{5011000000}'),
 (3,5,'속초 당일치기','중앙시장 닭강정','2026-10-18','2026-10-18','{5121000000}'),
 (4,1,'경주·부산','역사 여행 후 바다','2026-04-25','2026-04-27','{4713000000,2635000000}'),
 (4,2,'평창·강릉 겨울','눈꽃 축제','2026-01-24','2026-01-26','{5176000000,5115000000}'),
 (4,3,'전주·통영','한옥과 바다','2026-05-30','2026-06-01','{5211000000,4822000000}'),
 (5,1,'여수 밤바다','낭만 포차','2026-07-04','2026-07-05','{1213000000}'),
 (5,2,'남해 드라이브','독일마을 들렀어요','2026-09-20','2026-09-21','{4884000000}'),
 (5,3,'강릉 커피거리','안목해변 커피','2026-11-01','2026-11-02','{5115000000}'),
 (5,4,'제주 동쪽','성산 일출','2026-03-28','2026-03-30','{5011000000}'),
 (5,5,'부산 광안리','광안대교 야경','2026-06-06','2026-06-07','{2650000000}'),
 (5,6,'경주 야경','동궁과 월지','2026-10-10','2026-10-11','{4713000000}');

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


-- 지우기 (팔로우·알림 등 데모 계정을 가리키는 다른 행이 생겼으면 먼저 지운다)
-- DELETE FROM follows WHERE follower_user_id IN (SELECT md5('eodilog-demo-u'||g)::uuid FROM generate_series(1,5) g)
--                        OR followee_user_id IN (SELECT md5('eodilog-demo-u'||g)::uuid FROM generate_series(1,5) g);
-- DELETE FROM feed_regions WHERE feed_id IN (SELECT id FROM feeds WHERE trip_id IN (SELECT id FROM trips WHERE owner_user_id IN (SELECT md5('eodilog-demo-u'||g)::uuid FROM generate_series(1,5) g)));
-- DELETE FROM feeds WHERE trip_id IN (SELECT id FROM trips WHERE owner_user_id IN (SELECT md5('eodilog-demo-u'||g)::uuid FROM generate_series(1,5) g));
-- DELETE FROM trip_members WHERE user_id IN (SELECT md5('eodilog-demo-u'||g)::uuid FROM generate_series(1,5) g);
-- DELETE FROM trips WHERE owner_user_id IN (SELECT md5('eodilog-demo-u'||g)::uuid FROM generate_series(1,5) g);
-- DELETE FROM users WHERE id IN (SELECT md5('eodilog-demo-u'||g)::uuid FROM generate_series(1,5) g);
