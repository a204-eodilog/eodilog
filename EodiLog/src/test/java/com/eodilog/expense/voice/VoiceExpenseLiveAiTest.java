package com.eodilog.expense.voice;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.storage.*;
import com.eodilog.job.JobWorker;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 실제 ffprobe → FastAPI → GMS 왕복. EODILOG_VOICE_REAL_S3=true이면 저장소도 실제 S3. */
@EnabledIfEnvironmentVariable(named="EODILOG_VOICE_LIVE",matches="true")
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class,VoiceExpenseLiveAiTest.TestStorage.class})
class VoiceExpenseLiveAiTest {
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    static class TestStorage {
        @org.springframework.context.annotation.Bean
        @org.springframework.context.annotation.Primary
        @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="eodilog.voice.real-s3",havingValue="false",matchIfMissing=true)
        InMemoryObjectStorage memoryStorage(){return new InMemoryObjectStorage();}
    }
    @DynamicPropertySource static void liveProperties(DynamicPropertyRegistry props) {
        props.add("app.ai.base-url",()->System.getenv("EODILOG_VOICE_AI_URL"));
        props.add("app.ai.internal-token",()->System.getenv("EODILOG_VOICE_AI_TOKEN"));
        props.add("app.voice-expense.ffprobe-command",()->System.getenv("EODILOG_VOICE_FFPROBE"));
        boolean realS3="true".equals(System.getenv("EODILOG_VOICE_REAL_S3"));
        props.add("eodilog.voice.real-s3",()->realS3);
        if(realS3) {
            props.add("app.storage.bucket",()->System.getenv("STORAGE_BUCKET"));
            props.add("app.storage.region",()->System.getenv("STORAGE_REGION"));
            props.add("app.storage.access-key-id",()->System.getenv("AWS_ACCESS_KEY_ID"));
            props.add("app.storage.secret-access-key",()->System.getenv("AWS_SECRET_ACCESS_KEY"));
            props.add("app.storage.endpoint",()->"");
        }
    }
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired JobWorker worker;
    @Autowired ObjectStorage storage;
    @Autowired VoiceExpenseCleanup cleanup;
    UUID requester,trip,ownerMember,minsu,jiyeon;
    final Set<UUID> submittedJobs=new HashSet<>();

    @BeforeEach void setup()throws Exception {
        requester=user("테스트화자");
        var response=mvc.perform(post("/api/v1/trips").with(authUser(requester))
            .header("Idempotency-Key",UUID.randomUUID().toString())
            .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"실제 음성 연동 전용\"}"))
            .andExpect(status().isCreated()).andReturn().getResponse();
        var data=json.readTree(response.getContentAsString()).path("data");
        trip=UUID.fromString(data.path("id").asString());ownerMember=UUID.fromString(data.path("ownerMemberId").asString());
        minsu=member(user("민수"),2);jiyeon=member(user("지연"),3);
    }
    @AfterEach void cleanupJobs() {
        jdbc.update("update jobs set status='CANCELLED',finished_at=now(),execution_id=null,lease_until=null where trip_id=? and status in ('QUEUED','RUNNING')",trip);
        cleanup.runOnce();
    }

    @Test void actualKoreanSpeechCreatesTwoEditableDraftsThenSavesThemAtomically()throws Exception {
        byte[] bytes=Files.readAllBytes(Path.of(System.getenv("EODILOG_VOICE_SAMPLE")));
        String idem=UUID.randomUUID().toString();
        UUID job=submit(bytes,idem);
        assertThat(worker.pollOnce()).isTrue();
        var state=awaitTerminal(job);
        assertThat(state.path("status").asString()).withFailMessage("실제 AI 작업 실패: %s",state.path("error")).isEqualTo("SUCCEEDED");
        var drafts=state.path("result").path("drafts");
        assertThat(drafts.size()).isEqualTo(2);
        var amounts=new ArrayList<Long>();var batch=json.createObjectNode();var items=batch.putArray("items");
        for(var row:drafts) {
            var draft=(tools.jackson.databind.node.ObjectNode)row.path("draft").deepCopy();
            amounts.add(draft.path("amountMinor").asLong());
            assertThat(draft.path("payerMemberId").isString()).isTrue();
            assertThat(draft.path("participantMemberIds").size()).isGreaterThanOrEqualTo(2);
            assertThat(draft.path("spentAt").isNull()).isTrue();
            // 앱에서 사용자가 빠진 시각을 확인한 것과 같이 채운다.
            draft.put("spentAt",Instant.now().toString());items.add(draft);
        }
        assertThat(amounts).containsExactlyInAnyOrder(24000L,12000L);
        assertThat(drafts.get(0).path("draft").path("payerMemberId").asString()).isEqualTo(ownerMember.toString());
        assertThat(drafts.get(0).path("draft").path("participantMemberIds").size()).isEqualTo(3);
        assertThat(drafts.get(1).path("draft").path("payerMemberId").asString()).isEqualTo(jiyeon.toString());
        assertThat(expenseCount()).isZero();
        assertRawGone(job);
        assertThat(submit(bytes,idem)).isEqualTo(job);
        String batchKey=UUID.randomUUID().toString();
        for(int i=0;i<2;i++)mvc.perform(post("/api/v1/trips/{id}/expenses/batch",trip).with(authUser(requester))
            .header("Idempotency-Key",batchKey).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(batch)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.data.expenses.length()").value(2));
        assertThat(expenseCount()).isEqualTo(2);
        assertThat(jdbc.queryForObject("select sum(amount_minor) from expenses where trip_id=?",Long.class,trip)).isEqualTo(36000L);
        System.out.println("LIVE_VOICE_SUCCESS drafts=2 expenses=2 totalKRW=36000 idempotency=OK rawDeleted=true");
    }

    @Test void actualSilenceFailsWithoutExpensesOrAutomaticRetryAndDeletesRaw()throws Exception {
        UUID job=submit(Files.readAllBytes(Path.of(System.getenv("EODILOG_VOICE_SILENCE"))),UUID.randomUUID().toString());
        assertThat(worker.pollOnce()).isTrue();
        var state=awaitTerminal(job);
        assertThat(state.path("status").asString()).isEqualTo("FAILED");
        assertThat(state.path("error").path("code").asString()).isEqualTo("VOICE_NO_SPEECH_OR_EXPENSE");
        assertRawGone(job);assertThat(expenseCount()).isZero();
        assertThat(jdbc.queryForObject("select attempt from jobs where id=?",Integer.class,job)).isEqualTo(1);
        System.out.println("LIVE_VOICE_SILENCE error=VOICE_NO_SPEECH_OR_EXPENSE attempt=1 rawDeleted=true");
    }

    UUID submit(byte[] bytes,String key)throws Exception {
        var response=mvc.perform(multipart("/api/v1/trips/{id}/expense-voice-drafts",trip)
            .file(new MockMultipartFile("audio","recording.m4a","audio/mp4",bytes))
            .with(authUser(requester)).header("Idempotency-Key",key)).andExpect(status().isAccepted()).andReturn().getResponse();
        UUID job=UUID.fromString(json.readTree(response.getContentAsString()).path("data").path("jobId").asString());
        if(submittedJobs.add(job)) {
            if("true".equals(System.getenv("EODILOG_VOICE_REAL_S3")))assertThat(storage).isInstanceOf(S3ObjectStorage.class);
            String objectKey=objectKey(job);
            var uploaded=storage.head(objectKey).orElseThrow();
            assertThat(uploaded.byteSize()).isEqualTo(bytes.length);
            assertThat(uploaded.contentType()).isEqualTo("audio/mp4");
            assertThat(storage.read(objectKey,VoiceExpenseService.MAX_BYTES)).containsExactly(bytes);
            System.out.println("LIVE_VOICE_UPLOAD storage="+storage.getClass().getSimpleName()+" bytes="+bytes.length+" readback=OK key="+objectKey);
        }
        return job;
    }
    JsonNode awaitTerminal(UUID job)throws Exception {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(65);JsonNode data;
        do {
            data=json.readTree(mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(requester)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data");
            if(Set.of("SUCCEEDED","FAILED","CANCELLED").contains(data.path("status").asString()))return data;
            Thread.sleep(100);
        }while(System.nanoTime()<deadline);
        throw new AssertionError("음성 작업이 제한 시간 내 종료되지 않았습니다.");
    }
    String objectKey(UUID job){return jdbc.queryForObject("select object_key from voice_expense_uploads where job_id=?",String.class,job);}
    void assertRawGone(UUID job){assertThat(storage.head(objectKey(job))).isEmpty();}
    int expenseCount(){return jdbc.queryForObject("select count(*) from expenses where trip_id=?",Integer.class,trip);}
    UUID user(String name){UUID id=UUID.randomUUID();jdbc.update("insert into users(id,nickname,profile_completed,created_at,updated_at) values(?,?,true,now(),now())",id,name);return id;}
    UUID member(UUID user,long order){UUID id=UUID.randomUUID();jdbc.update("insert into trip_members(id,trip_id,user_id,status,join_order,joined_at) values(?,?,?,'ACTIVE',?,now())",id,trip,user,order);return id;}
}
