package com.eodilog.region;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;

import java.util.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.TestcontainersConfiguration;
import com.eodilog.region.dto.RegionView;
import com.eodilog.region.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@Transactional
class RegionFoundationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired RegionReader reader;
    @Autowired RegionCodeResolver resolver;
    @Autowired RegionService service;
    @Autowired MockMvc mvc;
    @Autowired com.eodilog.domain.auth.Tokens tokens;
    UUID user;
    @BeforeEach void user() {
        user = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,nickname,profile_completed,created_at,updated_at) VALUES (?,'지역테스트',true,now(),now())", user);
    }
    @Test void seedHasOfficialHierarchyAndAllAliasesResolve() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM regions WHERE code ~ '^[0-9]{10}$'", Integer.class)).isEqualTo(245);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM regions WHERE code ~ '^[0-9]{10}$' AND parent_id IS NULL", Integer.class)).isEqualTo(16);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM regions WHERE code ~ '^[0-9]{10}$' AND parent_id IS NOT NULL", Integer.class)).isEqualTo(229);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM region_code_aliases", Integer.class)).isEqualTo(39);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM region_code_targets", Integer.class)).isEqualTo(230);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM regions c JOIN regions p ON p.id=c.parent_id WHERE p.parent_id IS NOT NULL", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM region_code_aliases a JOIN regions r ON r.code=a.code", Integer.class)).isZero();
        jdbc.query("SELECT a.code,r.code target FROM region_code_aliases a JOIN regions r ON r.id=a.region_id", rs -> {
            String target = rs.getString("target");
            assertThat(resolver.resolve(rs.getString("code").substring(0,5)+"12345")).hasValueSatisfying(r -> assertThat(r.code()).isEqualTo(target));
        });
        assertThat(resolver.resolve("4111112345")).hasValueSatisfying(r -> assertThat(r.code()).isEqualTo("4111000000"));
        assertThat(resolver.resolve("3611012345")).hasValueSatisfying(r -> { assertThat(r.code()).isEqualTo("3611000000"); assertThat(r.parentId()).isNull(); });
        UUID jongno = jdbc.queryForObject("SELECT id FROM regions WHERE code='1111000000'",UUID.class);
        for (String code : List.of("1111000000", "1111012345")) {
            assertThat(resolver.resolve(code)).hasValueSatisfying(r -> {
                assertThat(r.code()).isEqualTo("1111000000"); assertThat(r.id()).isEqualTo(jongno);
            });
        }
        for (String code : List.of("", "123", "abcdefghij", "9999912345", "2911012345", "4611012345", "1100000000")) assertThat(resolver.resolve(code)).isEmpty();
        assertThat(resolver.resolve(null)).isEmpty();
        jdbc.query("SELECT id,name,latitude,longitude FROM regions WHERE code ~ '^[0-9]{10}$'", rs -> {
            assertThat(rs.getObject("id", UUID.class).version()).isEqualTo(7);
            assertThat(rs.getString("name")).isEqualTo(rs.getString("name").strip());
            assertThat(rs.getBigDecimal("latitude")).isNull(); assertThat(rs.getBigDecimal("longitude")).isNull();
        });
    }
    @Test void readerDeduplicatesAndOmitsMissingAndPagesAreCompleteAndLiteral() {
        var expected = jdbc.queryForList("SELECT id FROM regions WHERE strpos(name,'시')>0 ORDER BY code,id", UUID.class);
        var actual = new ArrayList<UUID>(); String cursor = null;
        do {
            var page = service.search(" 시 ", cursor, 7);
            page.data().forEach(r -> actual.add(r.id())); cursor = page.page().nextCursor();
        } while (cursor != null);
        assertThat(actual).containsExactlyElementsOf(expected).doesNotHaveDuplicates();
        UUID id = actual.getFirst();
        assertThat(reader.findAll(List.of(id,id,UUID.randomUUID()))).containsOnlyKeys(id);
        assertThat(reader.find(UUID.randomUUID())).isEmpty(); assertThat(reader.findAll(List.of())).isEmpty();
        assertThat(service.search("없는지역이름",null,20).data()).isEmpty();
        UUID literal = UUID.randomUUID();
        jdbc.update("INSERT INTO regions(id,code,name) VALUES (?,'TEST-LITERAL','특수%_문자')",literal);
        assertThat(service.search("%_",null,20).data()).extracting(RegionView::id).containsExactly(literal);
        String next = service.search("시",null,2).page().nextCursor();
        assertThatThrownBy(() -> service.search("구",next,20)).isInstanceOfSatisfying(BusinessException.class,
                ex -> assertThat(ex.getErrorCode()).isEqualTo(CommonErrorCode.VALIDATION_ERROR));
    }
    @Test void readerAndDetailPreserveEveryChildField() throws Exception {
        UUID parent = jdbc.queryForObject("SELECT id FROM regions WHERE code='1100000000'",UUID.class);
        UUID id = UUID.randomUUID();
        var latitude = new BigDecimal("37.1234567"); var longitude = new BigDecimal("126.7654321");
        jdbc.update("INSERT INTO regions(id,code,name,parent_id,latitude,longitude) VALUES (?,'TEST-CHILD','필드검증 자식',?,?,?)",id,parent,latitude,longitude);
        var expected = new RegionView(id,"TEST-CHILD","필드검증 자식",parent,latitude,longitude);
        assertThat(reader.find(id)).contains(expected);
        assertThat(reader.findAll(List.of(id))).containsEntry(id,expected);
        mvc.perform(get("/api/v1/regions/"+id).with(authUser(user))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.region.id").value(id.toString()))
                .andExpect(jsonPath("$.data.region.code").value("TEST-CHILD"))
                .andExpect(jsonPath("$.data.region.name").value("필드검증 자식"))
                .andExpect(jsonPath("$.data.region.parentId").value(parent.toString()))
                .andExpect(jsonPath("$.data.region.latitude").value(latitude.doubleValue()))
                .andExpect(jsonPath("$.data.region.longitude").value(longitude.doubleValue()));
    }
    @Test void controlledPaginationAndStructuredCursorValidation() throws Exception {
        String query = "페이지경계검증";
        UUID first=UUID.randomUUID(), second=UUID.randomUUID(), third=UUID.randomUUID();
        jdbc.update("INSERT INTO regions(id,code,name) VALUES (?,'TEST|REGION',?), (?,'TEST}REGION',?)",first,query,second,query);
        var exact = service.search(query,null,2);
        assertThat(exact.data()).extracting(RegionView::id).containsExactly(first,second);
        assertThat(exact.page().hasNext()).isFalse(); assertThat(exact.page().nextCursor()).isNull();
        jdbc.update("INSERT INTO regions(id,code,name) VALUES (?,'TEST~REGION',?)",third,query);
        var plusOne = service.search(query,null,2);
        assertThat(plusOne.data()).extracting(RegionView::id).containsExactly(first,second);
        assertThat(plusOne.page().hasNext()).isTrue();
        var following = service.search(query,plusOne.page().nextCursor(),2);
        assertThat(following.data()).extracting(RegionView::id).containsExactly(third);
        assertThat(following.page().hasNext()).isFalse();
        var pipePage = service.search(query,null,1);
        assertThat(service.search(query,pipePage.page().nextCursor(),1).data()).extracting(RegionView::id).containsExactly(second);
        var empty = service.search(query,cursor(query,"TEST~REGION",third.toString()),2);
        assertThat(empty.data()).isEmpty(); assertThat(empty.page().hasNext()).isFalse(); assertThat(empty.page().nextCursor()).isNull();
        mvc.perform(get("/api/v1/regions").with(authUser(user)).param("query","다른검색어").param("cursor",plusOne.page().nextCursor()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/regions").with(authUser(user)).param("query","앞\0뒤"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        for (String malformed : List.of(b64("one|two"), b64("!|"+b64("code")+"|"+first),
                cursor(query,"",first.toString()), cursor(query,"a".repeat(101),first.toString()),
                cursor(query,"a\0b",first.toString()), cursor(query,"code","not-uuid"),
                cursor(query,"code","1-1-1-1-1"), cursor(query,"code",first.toString())+"=")) {
            mvc.perform(get("/api/v1/regions").with(authUser(user)).param("query",query).param("cursor",malformed))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        }
    }
    private static String b64(String value) { return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8)); }
    private static String cursor(String query,String code,String id) { return b64(b64(query)+"|"+b64(code)+"|"+id); }
    @Test void apiValidatesAndPreservesResponseAndSecurityContracts() throws Exception {
        mvc.perform(get("/api/v1/regions").param("query","서울")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
        mvc.perform(get("/api/v1/regions").with(authUser(user)).param("query"," 서울 ").param("limit","2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2)).andExpect(jsonPath("$.page.hasNext").value(true));
        for (String query : List.of("", " ", "가".repeat(201))) mvc.perform(get("/api/v1/regions").with(authUser(user)).param("query",query)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/regions").with(authUser(user))).andExpect(status().isBadRequest());
        for (String limit : List.of("0","101","abc")) mvc.perform(get("/api/v1/regions").with(authUser(user)).param("query","시").param("limit",limit)).andExpect(status().isBadRequest());
        for (String cursor : List.of("", "malformed", "%%%")) mvc.perform(get("/api/v1/regions").with(authUser(user)).param("query","시").param("cursor",cursor)).andExpect(status().isBadRequest());
        UUID id = jdbc.queryForObject("SELECT id FROM regions WHERE code='3611000000'",UUID.class);
        mvc.perform(get("/api/v1/regions/"+id).with(authUser(user))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.region.code").value("3611000000"))
                .andExpect(jsonPath("$.data.introduction").isEmpty()).andExpect(jsonPath("$.data.representativePlaces").isEmpty()).andExpect(jsonPath("$.data.partialErrors").isEmpty());
        mvc.perform(get("/api/v1/regions/"+UUID.randomUUID()).with(authUser(user))).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("REGION_NOT_FOUND"));
        for (String invalid : List.of("not-uuid", "1-1-1-1-1")) mvc.perform(get("/api/v1/regions/"+invalid).with(authUser(user))).andExpect(status().isBadRequest());
        jdbc.update("UPDATE users SET profile_completed=false,nickname='' WHERE id=?",user);
        UUID session = UUID.randomUUID();
        jdbc.update("INSERT INTO sessions(id,user_id,refresh_token_hash,expires_at,created_at) VALUES (?,? ,?,now()+interval '1 day',now())",session,user,"region-test-"+session);
        mvc.perform(get("/api/v1/regions").header("Authorization","Bearer "+tokens.issue(user,session)).param("query","서울")).andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("PROFILE_INCOMPLETE"));
    }
    @Test void swaggerDocumentsPathsDtosAndBearer() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/regions'].get.tags[0]").value("지역"))
                .andExpect(jsonPath("$.paths['/api/v1/regions/{regionId}'].get.responses['404'].description").value("REGION_NOT_FOUND: 없는 지역"))
                .andExpect(jsonPath("$.components.schemas.RegionView.properties.latitude").exists())
                .andExpect(jsonPath("$.components.schemas.RegionDetail.properties.representativePlaces").exists())
                .andExpect(jsonPath("$.security").isNotEmpty());
    }
    @Test void seedPreservesExistingIdCoordinatesAndForeignKeys() throws Exception {
        // Isolated PostgreSQL schema in this rolled-back transaction models a pre-seed database.
        jdbc.execute("CREATE SCHEMA region_seed_test"); jdbc.execute("SET LOCAL search_path TO region_seed_test");
        jdbc.execute("CREATE TABLE regions(id uuid PRIMARY KEY,code varchar(100) UNIQUE NOT NULL,name varchar(200) NOT NULL,parent_id uuid REFERENCES regions(id),latitude numeric(10,7),longitude numeric(10,7))");
        UUID existing=UUID.randomUUID(); UUID province=UUID.randomUUID();
        jdbc.update("INSERT INTO regions(id,code,name) VALUES (?,'4100000000','기존경기도')",province);
        jdbc.update("INSERT INTO regions(id,code,name,latitude,longitude) VALUES (?,'4111000000','기존수원',37,127)",existing);
        UUID obsolete=UUID.randomUUID(), ordinaryGu=UUID.randomUUID();
        jdbc.update("INSERT INTO regions(id,code,name,parent_id) VALUES (?,'2911000000','폐지지역',?), (?,'4111100000','기존일반구',?)",obsolete,province,ordinaryGu,existing);
        jdbc.update("INSERT INTO regions(id,code,name,parent_id) VALUES (?,'4113000000','잘못된부모의성남',?)",UUID.randomUUID(),existing);
        jdbc.execute("CREATE TABLE refs(region_id uuid REFERENCES regions(id))"); jdbc.update("INSERT INTO refs VALUES (?)",existing);
        jdbc.update("INSERT INTO refs VALUES (?),(?)",obsolete,ordinaryGu);
        String sql = new ClassPathResource("db/migration/V202611021500__seed_regions.sql").getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        for (String statement : sql.split(";")) if (!statement.isBlank()) jdbc.execute(statement);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM regions",Integer.class)).isEqualTo(247);
        assertThat(jdbc.queryForObject("SELECT id FROM regions WHERE code='4111000000'",UUID.class)).isEqualTo(existing);
        assertThat(jdbc.queryForObject("SELECT latitude FROM regions WHERE id=?",Integer.class,existing)).isEqualTo(37);
        assertThat(jdbc.queryForList("SELECT region_id FROM refs",UUID.class)).containsExactlyInAnyOrder(existing,obsolete,ordinaryGu);
        assertThat(jdbc.queryForObject("SELECT region_id FROM region_code_aliases WHERE code='4111100000'",UUID.class)).isEqualTo(existing);
        assertThat(jdbc.queryForObject("SELECT parent_id FROM regions WHERE code='4113000000'",UUID.class)).isEqualTo(province);
        assertThat(jdbc.queryForObject("SELECT parent_id FROM regions WHERE id=?",UUID.class,existing)).isEqualTo(province);
        assertThat(jdbc.queryForObject("SELECT name FROM regions WHERE id=?",String.class,existing)).isEqualTo("기존수원");
        assertThat(jdbc.queryForObject("SELECT longitude FROM regions WHERE id=?",Integer.class,existing)).isEqualTo(127);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM regions WHERE id IN (?,?)",Integer.class,obsolete,ordinaryGu)).isEqualTo(2);
        assertThat(resolver.resolve("4111000000")).hasValueSatisfying(r -> {assertThat(r.id()).isEqualTo(existing); assertThat(r.parentId()).isEqualTo(province);});
        assertThat(resolver.resolve("4111100000")).hasValueSatisfying(r -> assertThat(r.id()).isEqualTo(existing));
        assertThat(resolver.resolve("2911000000")).isEmpty();
    }
}
