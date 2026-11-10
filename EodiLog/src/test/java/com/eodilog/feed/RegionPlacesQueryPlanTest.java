package com.eodilog.feed;

import static org.assertj.core.api.Assertions.assertThat;
import com.eodilog.TestcontainersConfiguration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/** Region place ranking on a seeded province: the region index drives the scope lookups and the route check runs per feed. */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class RegionPlacesQueryPlanTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired NamedParameterJdbcTemplate named;
    @Autowired FeedExposureRepository repository;

    @Test void provinceRankingUsesTheRegionIndex() {
        UUID viewer=UUID.randomUUID(),province=UUID.randomUUID();
        jdbc.update("insert into users(id,nickname,profile_completed,account_visibility,created_at,updated_at) values(?,'plan',true,'PUBLIC',now(),now())",viewer);
        jdbc.update("insert into regions(id,code,name) values(?,?,'계획 도')",province,"PLAN-"+province);
        jdbc.update("""
                insert into regions(id,code,name,parent_id)
                select gen_random_uuid(),'PLAN-'||?||'-'||g,'계획 시군구',? from generate_series(1,20) g
                """,province.toString(),province);
        // 500 live feeds of one PUBLIC member, 6 snapshot places each, spread over the province's 20 children
        jdbc.update("""
                with t as (insert into trips(id,owner_user_id,title,created_at,updated_at)
                  select gen_random_uuid(),?,'Trip',now(),now() from generate_series(1,500) returning id),
                 m as (insert into trip_members(id,trip_id,user_id,join_order,joined_at) select gen_random_uuid(),id,?,1,now() from t returning trip_id)
                insert into feeds(id,trip_id,title,body,published_at,snapshot_json) select gen_random_uuid(),trip_id,'Feed','',now(),'{}' from m
                """,viewer,viewer);
        jdbc.update("""
                insert into places(id,region_id,name,latitude,longitude,source,created_at,updated_at)
                select gen_random_uuid(),(select id from regions where parent_id=? order by id offset g%20 limit 1),'P',37,127,'MANUAL',now(),now()
                from generate_series(1,600) g
                """,province);
        jdbc.update("""
                insert into feed_places(feed_id,place_id,region_id)
                select f.id,p.id,p.region_id from (select id,row_number() over (order by id) n from feeds f
                  where exists (select 1 from trip_members m where m.trip_id=f.trip_id and m.user_id=?)) f
                cross join lateral (select id,region_id from places where region_id in (select id from regions where parent_id=?)
                  order by id offset (f.n*6)%594 limit 6) p
                """,viewer,province);
        // unrelated rows elsewhere so the scope is a small slice of feed_places
        jdbc.update("""
                insert into feed_places(feed_id,place_id,region_id)
                select f.id,gen_random_uuid(),r.id from feeds f cross join generate_series(1,60) g
                cross join lateral (select id from regions where code ~ '^[0-9]{10}$' order by md5(f.id::text||g::text) limit 1) r
                on conflict do nothing
                """);
        for(String table:List.of("regions","feed_places","feeds","trips","trip_members","places","users")) jdbc.execute("analyze "+table);
        assertThat(jdbc.queryForObject("select count(*) from feed_places fp join regions r on r.id=fp.region_id where r.parent_id=?",Long.class,province)).isEqualTo(3000);

        var params=repository.regionPlacesParams(viewer,province,5);
        String plan=String.join("\n",named.queryForList("explain "+FeedExposureRepository.regionPlacesSql(),params,String.class));
        assertThat(plan).contains("idx_feed_places_region");
        assertThat(repository.regionPlaces(viewer,province,5)).hasSize(5);
    }
}
