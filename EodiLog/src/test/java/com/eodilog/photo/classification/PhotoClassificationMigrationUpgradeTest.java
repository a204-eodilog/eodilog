package com.eodilog.photo.classification;

import static org.assertj.core.api.Assertions.*;
import com.eodilog.TestcontainersConfiguration;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** Upgrade the already-deployed B schema, without touching the shared test schema or any real DB. */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class PhotoClassificationMigrationUpgradeTest {
    @Autowired DataSource dataSource;
    @Autowired PostgreSQLContainer postgres;

    @Test void upgrades1200To1300PreservingPhotosCourseUndoAndTheirConstraints() {
        String schema="photo_upgrade_"+UUID.randomUUID().toString().replace("-","");
        var shared=new JdbcTemplate(dataSource);
        shared.execute("create schema "+schema);
        try {
            // Extension operator classes live in public; only application tables belong to our schema.
            String url=postgres.getJdbcUrl()+(postgres.getJdbcUrl().contains("?")?"&":"?")+"currentSchema="+schema+",public";
            var isolated=new DriverManagerDataSource(url,postgres.getUsername(),postgres.getPassword());
            var before=Flyway.configure().dataSource(isolated).schemas(schema).defaultSchema(schema)
                    .locations("classpath:db/migration").target("202611091200").load();
            before.migrate();before.validate();
            assertThat(before.info().current().getVersion().getVersion()).isEqualTo("202611091200");
            var jdbc=new JdbcTemplate(isolated);
            UUID user=UUID.randomUUID(),trip=UUID.randomUUID(),member=UUID.randomUUID(),asset=UUID.randomUUID();
            UUID batch=UUID.randomUUID(),photo=UUID.randomUUID(),itinerary=UUID.randomUUID();
            UUID placeA=UUID.randomUUID(),placeB=UUID.randomUUID(),itemA=UUID.randomUUID(),itemB=UUID.randomUUID();
            UUID leg=UUID.randomUUID(),photoJob=UUID.randomUUID(),courseJob=UUID.randomUUID();
            jdbc.update("insert into users(id,nickname,profile_completed,created_at,updated_at) values(?,'upgrade',true,now(),now())",user);
            jdbc.update("insert into trips(id,owner_user_id,title,created_at,updated_at) values(?,?,'upgrade trip',now(),now())",trip,user);
            jdbc.update("insert into trip_members(id,trip_id,user_id,join_order,joined_at) values(?,?,?,1,now())",member,trip,user);
            jdbc.update("insert into photo_upload_batches(id,trip_id,created_by_member_id,file_count,registered_count,created_at,expires_at) values(?,?,?,1,1,now(),now()+interval '1 day')",batch,trip,member);
            jdbc.update("insert into assets(id,owner_user_id,trip_id,purpose,object_key,content_type,byte_size,status,created_at,upload_batch_id,display_content_type) values(?,?,?,'TRIP_PHOTO',?,'image/png',123,'READY',now(),?,'image/png')",asset,user,trip,"upgrade/"+asset,batch);
            jdbc.update("insert into photos(id,batch_id,trip_id,uploader_member_id,asset_id,version,created_at,place_manually_edited,topics_manually_edited) values(?,?,?,?,?,7,now(),true,true)",photo,batch,trip,member,asset);
            jdbc.update("insert into photo_topics(photo_id,topic,source) values(?,'FOOD','MANUAL')",photo);
            for(UUID place:new UUID[]{placeA,placeB}) jdbc.update("insert into places(id,name,latitude,longitude,source,created_at,updated_at) values(?,'upgrade place',37,127,'MANUAL',now(),now())",place);
            jdbc.update("insert into itineraries(id,trip_id,version,updated_by_member_id,updated_at) values(?,?,2,?,now())",itinerary,trip,member);
            jdbc.update("insert into itinerary_items(id,itinerary_id,place_id,day,sequence) values(?,?,?,1,1),(?,?,?,1,2)",itemA,itinerary,placeA,itemB,itinerary,placeB);
            jdbc.update("insert into route_legs(id,itinerary_id,from_item_id,to_item_id,transport_mode,duration_seconds,status,queried_at) values(?,?,?,?,'WALK',300,'AVAILABLE',now())",leg,itinerary,itemA,itemB);
            for(UUID job:new UUID[]{photoJob,courseJob}) jdbc.update("insert into jobs(id,requested_by_user_id,trip_id,kind,status,input_json,result_json,next_attempt_at,created_at,finished_at,applied_by_member_id,applied_at) values(?,?,?,?,'SUCCEEDED','{}','{}',now(),now(),now(),?,now())",job,user,trip,job.equals(photoJob)?"PHOTO_CLASSIFICATION":"ITINERARY_PROPOSAL",member);
            jdbc.update("insert into itinerary_undo_states(itinerary_id,applied_job_id,applied_version,before_content_json,applied_by_member_id,created_at) values(?,?,2,'{\"items\":[],\"legs\":[]}',?,now())",itinerary,courseJob,member);
            var photoBefore=jdbc.queryForMap("select p.*,a.display_key,a.object_key,a.status from photos p join assets a on a.id=p.asset_id where p.id=?",photo);
            var undoBefore=jdbc.queryForMap("select * from itinerary_undo_states where itinerary_id=?",itinerary);
            var legBefore=jdbc.queryForMap("select * from route_legs where id=?",leg);
            assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema=? and table_name='photos' and column_name='group_id'",Integer.class,schema)).isZero();

            // 이후 마이그레이션이 늘어도 이 회귀는 1200 → 1300 한 단계만 검사한다
            var upgraded=Flyway.configure().dataSource(isolated).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").target("202611091300").load();
            assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);upgraded.validate();
            assertThat(upgraded.info().current().getVersion().getVersion()).isEqualTo("202611091300");
            var photoAfter=jdbc.queryForMap("select p.*,a.display_key,a.object_key,a.status from photos p join assets a on a.id=p.asset_id where p.id=?",photo);
            assertThat(photoAfter.remove("group_id")).isNull();assertThat(photoAfter).isEqualTo(photoBefore);
            assertThat(jdbc.queryForMap("select * from itinerary_undo_states where itinerary_id=?",itinerary)).isEqualTo(undoBefore);
            assertThat(jdbc.queryForMap("select * from route_legs where id=?",leg)).isEqualTo(legBefore);
            assertThat(jdbc.queryForMap("select topic,source from photo_topics where photo_id=?",photo)).containsEntry("topic","FOOD").containsEntry("source","MANUAL");
            assertThat(jdbc.queryForObject("select count(*) from itinerary_items where itinerary_id=?",Integer.class,itinerary)).isEqualTo(2);

            UUID group=UUID.randomUUID();
            jdbc.update("insert into photo_groups(id,trip_id,source_job_id) values(?,?,?)",group,trip,photoJob);
            jdbc.update("update photos set group_id=? where id=?",group,photo);
            jdbc.update("insert into photo_classification_applies(job_id,request_json,response_json) values(?,'{}','{\"photos\":[]}')",photoJob);
            assertThatThrownBy(()->jdbc.update("delete from photo_groups where id=?",group)).isInstanceOf(DataIntegrityViolationException.class);
            UUID otherTrip=UUID.randomUUID(),otherGroup=UUID.randomUUID();
            jdbc.update("insert into trips(id,owner_user_id,title,created_at,updated_at) values(?,?,'other',now(),now())",otherTrip,user);
            jdbc.update("insert into photo_groups(id,trip_id,source_job_id) values(?,?,?)",otherGroup,otherTrip,photoJob);
            assertThatThrownBy(()->jdbc.update("update photos set group_id=? where id=?",otherGroup,photo)).isInstanceOf(DataIntegrityViolationException.class);
            assertThatThrownBy(()->jdbc.update("update photos set version=0 where id=?",photo)).isInstanceOf(DataIntegrityViolationException.class);
            assertThatThrownBy(()->jdbc.update("insert into photo_topics(photo_id,topic,source) values(?,'INVALID','AI')",photo)).isInstanceOf(DataIntegrityViolationException.class);
            assertThatThrownBy(()->jdbc.update("update itinerary_undo_states set applied_version=0 where itinerary_id=?",itinerary)).isInstanceOf(DataIntegrityViolationException.class);
            assertThatThrownBy(()->jdbc.update("update route_legs set duration_seconds=null where id=?",leg)).isInstanceOf(DataIntegrityViolationException.class);
            assertThatThrownBy(()->jdbc.update("update route_legs set duration_seconds=-1 where id=?",leg)).isInstanceOf(DataIntegrityViolationException.class);
            assertThatThrownBy(()->jdbc.update("update route_legs set distance_meters=-1 where id=?",leg)).isInstanceOf(DataIntegrityViolationException.class);
            assertThatThrownBy(()->jdbc.update("update route_legs set status='UNAVAILABLE' where id=?",leg)).isInstanceOf(DataIntegrityViolationException.class);
            assertThat(jdbc.queryForObject("select group_id from photos where id=?",UUID.class,photo)).isEqualTo(group);
            upgraded.validate();
        } finally {
            // The generated schema belongs only to this regression in the Testcontainers database.
            shared.execute("drop schema "+schema+" cascade");
        }
    }
}
