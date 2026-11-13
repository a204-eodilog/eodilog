package com.eodilog.expense.voice;

import static com.eodilog.global.security.AuthUserRequestPostProcessors.authUser;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.eodilog.TestcontainersConfiguration;
import com.eodilog.global.ai.*;
import com.eodilog.global.storage.*;
import com.eodilog.job.*;
import java.nio.file.Files;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, InMemoryStorageConfiguration.class})
class VoiceExpenseApiTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @Autowired InMemoryObjectStorage storage;
    @Autowired VoiceExpenseHandler handler;
    @Autowired VoiceExpensePolicy policy;
    @Autowired VoiceExpenseResultReader reader;
    @Autowired VoiceExpenseCleanup cleanup;
    @Autowired JobWorker worker;
    @MockitoBean AudioProbe probe;
    @MockitoBean AiServerClient ai;
    UUID user, friend, trip, member, friendMember;

    @BeforeEach void setup() throws Exception {
        user = user("나"); friend = user("민수");
        var data = data(mvc.perform(post("/api/v1/trips").with(authUser(user))
            .header("Idempotency-Key", UUID.randomUUID().toString())
            .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"음성 경비\"}"))
            .andExpect(status().isCreated()));
        trip = UUID.fromString(data.path("id").asString());
        member = UUID.fromString(data.path("ownerMemberId").asString());
        friendMember = member(friend, 2);
    }

    @AfterEach void cleanupTestJobs() {
        jdbc.update("update jobs set status='CANCELLED',finished_at=now(),execution_id=null,lease_until=null where trip_id=? and status in ('QUEUED','RUNNING')",trip);
        cleanup.runOnce();
    }

    @Test void realWorkerReturnsTwoDraftsWithMemberIdsAndDeletesAudioWithoutCreatingExpenses() throws Exception {
        when(ai.postMultipart(eq("/ai/v1/voice-expense-drafts"), any(), anyMap(), eq("audio"), anyList()))
            .thenAnswer(call -> {
                assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
                Map<String,String> fields = call.getArgument(2);
                var meta = json.readTree(fields.get("meta"));
                assertThat(meta.size()).isEqualTo(3);
                assertThat(meta.path("language").asString()).isEqualTo("ko");
                assertThat(meta.path("timeZone").asString()).isEqualTo("Asia/Seoul");
                Instant.parse(meta.path("referenceAt").asString());
                List<AiServerClient.MultipartFile> files = call.getArgument(4);
                assertThat(files).hasSize(1);
                assertThat(Files.readAllBytes(files.getFirst().path())).containsExactly(1,2,3);
                assertThat(files.getFirst().contentType()).isEqualTo("audio/mp4");
                return reply(2);
            });
        UUID job = submit("first", new byte[]{1,2,3});
        String key = objectKey(job);
        assertThat(storage.contains(key)).isTrue();
        assertThat(worker.pollOnce()).isTrue();
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
        while (!"SUCCEEDED".equals(state(job)) && System.nanoTime()<deadline) Thread.sleep(10);
        assertThat(state(job)).isEqualTo("SUCCEEDED");
        assertThat(storage.contains(key)).isFalse();
        assertThat(expenseCount()).isZero();
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(user)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.result.drafts.length()").value(2))
            .andExpect(jsonPath("$.data.result.drafts[0].draft.payerMemberId").value(friendMember.toString()))
            .andExpect(jsonPath("$.data.result.drafts[0].draft.participantMemberIds[0]").value(member.toString()))
            .andExpect(jsonPath("$.data.result.drafts[0].unresolvedFields[0]").value("spentAt"));
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(friend))).andExpect(status().isNotFound());
        verify(ai, times(1)).postMultipart(anyString(), any(), anyMap(), anyString(), anyList());
    }

    @Test void retriesSameAudioReturnOriginalJobAndDifferentAudioConflicts() throws Exception {
        UUID job=submit("same",new byte[]{1,2,3});
        assertThat(submit("same",new byte[]{1,2,3})).isEqualTo(job);
        upload("same",new MockMultipartFile("audio","renamed.m4a","audio/mp4",new byte[]{9}))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("IDEMPOTENCY_KEY_REUSED"));
        verify(probe,times(1)).validate(any());
        assertThat(jdbc.queryForObject("select count(*) from jobs where trip_id=?",Integer.class,trip)).isEqualTo(1);
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?",member);
        upload("same",audio(new byte[]{1,2,3})).andExpect(status().isNotFound());
    }

    @Test void validatesMultipartBeforeStoringAnything() throws Exception {
        upload("wrong",new MockMultipartFile("audio","x.mp3","audio/mpeg",new byte[]{1})).andExpect(status().isBadRequest());
        upload("empty",audio(new byte[0])).andExpect(status().isBadRequest());
        upload("large",audio(new byte[10*1024*1024+1])).andExpect(status().isUnprocessableEntity());
        mvc.perform(multipart(url()).file(audio(new byte[]{1})).file(audio(new byte[]{2}))
            .with(authUser(user)).header("Idempotency-Key","duplicate")).andExpect(status().isBadRequest());
        mvc.perform(multipart(url()).file(audio(new byte[]{1})).param("unknown","x")
            .with(authUser(user)).header("Idempotency-Key","extra")).andExpect(status().isBadRequest());
        mvc.perform(multipart(url()).file(audio(new byte[]{1})).with(authUser(user)))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(probe,ai);
        assertThat(jdbc.queryForObject("select count(*) from voice_expense_uploads where trip_id=?",Integer.class,trip)).isZero();
    }

    @Test void duplicateNamesAndHeadcountNeverSelectArbitraryMembers() {
        member(user("민수"),3);
        var result=reader.read(trip,user,reply(1));
        var draft=result.drafts().getFirst();
        assertThat(draft.draft().payerMemberId()).isNull();
        assertThat(draft.draft().participantMemberIds()).containsExactly(member);
        assertThat(draft.unresolvedFields()).contains("payerMemberId","participantMemberIds","spentAt");
        assertThat(draft.warnings()).anyMatch(w->w.code().equals("MEMBER_AMBIGUOUS"));
        var payload=reply(1);
        ((tools.jackson.databind.node.ObjectNode)payload.path("items").get(0)).set("participants",
            json.readTree("{\"mode\":\"UNKNOWN\",\"includeSpeaker\":null,\"names\":[],\"headcount\":2}"));
        assertThat(reader.read(trip,user,payload).drafts().getFirst().draft().participantMemberIds()).isEmpty();
    }

    @Test void missingAmountIsEditableButInvalidAndForeignAmountsFail() {
        var payload=reply(1);
        var item=(tools.jackson.databind.node.ObjectNode)payload.path("items").get(0);
        item.putNull("amountMinor");
        var draft=reader.read(trip,user,payload).drafts().getFirst();
        assertThat(draft.draft().amountMinor()).isNull();
        assertThat(draft.unresolvedFields()).contains("amountMinor");
        item.put("amountMinor",-1);
        assertThatThrownBy(()->reader.read(trip,user,payload)).isInstanceOf(VoiceExpenseResultReader.Invalid.class);
        item.put("amountMinor",100);item.put("currency","USD");
        assertThatThrownBy(()->reader.read(trip,user,payload)).isInstanceOfSatisfying(VoiceExpenseResultReader.Invalid.class,
            ex->assertThat(ex.failure).isEqualTo(JobFailure.VOICE_EXPENSE_UNSUPPORTED));
        assertThatThrownBy(()->reader.read(trip,user,reply(11))).isInstanceOfSatisfying(VoiceExpenseResultReader.Invalid.class,
            ex->assertThat(ex.failure).isEqualTo(JobFailure.VOICE_INPUT_LIMIT_EXCEEDED));
    }

    @Test void acceptsAiGlobalTotalMismatchWarningWithoutExposingProviderMessage() {
        var payload=reply(2);
        ((tools.jackson.databind.node.ObjectNode)payload).putArray("warnings").addObject()
            .put("code","TOTAL_MISMATCH").putNull("field").put("message","private provider content");
        var result=reader.read(trip,user,payload);
        assertThat(result.drafts()).hasSize(2);
        assertThat(result.warnings()).hasSize(1);
        assertThat(result.warnings().getFirst().code()).isEqualTo("TOTAL_MISMATCH");
        assertThat(result.warnings().getFirst().field()).isNull();
        assertThat(result.warnings().getFirst().message()).doesNotContain("private provider content");
    }

    @Test void providerFailureAndTimeoutDeleteRawAndAreNotRetryable() throws Exception {
        for(var error:List.of(new AiServerException(422,"INSUFFICIENT_DATA"),new AiServerException(true,true),
                new AiServerException(503,"PROVIDER_UNAVAILABLE"))) {
            UUID job=submit(UUID.randomUUID().toString(),new byte[]{1});
            doThrow(error).when(ai).postMultipart(anyString(),any(),anyMap(),anyString(),anyList());
            var outcome=handler.execute(context(job));
            assertThat(outcome.failure()).isEqualTo(error.timedOut()?JobFailure.VOICE_PROCESSING_TIMEOUT:
                error.status()==422?JobFailure.VOICE_NO_SPEECH_OR_EXPENSE:JobFailure.VOICE_PROVIDER_UNAVAILABLE);
            assertThat(outcome.failure().retryable()).isFalse();
            assertThat(storage.contains(objectKey(job))).isFalse();
        }
        assertThat(expenseCount()).isZero();
    }

    @Test void membershipRevocationAndExpiredResultsArePrivateAndCleaned() throws Exception {
        UUID job=submit("private",new byte[]{1});
        var context=context(job);
        jdbc.update("update trip_members set status='LEFT',left_at=now() where id=?",member);
        assertThat(policy.canExecute(context)).isFalse();
        assertThat(policy.canComplete(context)).isFalse();
        mvc.perform(get("/api/v1/jobs/{id}",job).with(authUser(user))).andExpect(status().isNotFound());
        jdbc.update("update voice_expense_uploads set expires_at=now()-interval '1 second' where job_id=?",job);
        cleanup.runOnce();
        assertThat(state(job)).isEqualTo("FAILED");
        assertThat(storage.contains(objectKey(job))).isFalse();
        jdbc.update("update jobs set finished_at=now()-interval '61 minutes',result_json='{\"transcript\":\"private\"}'::jsonb where id=?",job);
        cleanup.runOnce();
        assertThat(jdbc.queryForObject("select result_json is null and input_json='{}'::jsonb and deleted_at is not null from jobs where id=?",Boolean.class,job)).isTrue();
    }

    @Test void batchUsesEqualSharesAndReplaysExactlyOnce() throws Exception {
        String body="{\"items\":["+expense(friendMember,10001)+","+expense(member,3000)+"]}";
        var first=data(batch("batch",body).andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.expenses[0].shares[0].amountMinor").value(5001))
            .andExpect(jsonPath("$.data.expenses[0].shares[1].amountMinor").value(5000)));
        assertThat(data(batch("batch",body).andExpect(status().isCreated()))).isEqualTo(first);
        assertThat(expenseCount()).isEqualTo(2);
        assertThat(jdbc.queryForObject("select expense_version from trips where id=?",Long.class,trip)).isEqualTo(2L);
        batch("batch",body.replace("10001","10002")).andExpect(status().isConflict());
    }

    @Test void batchSecondInvalidMemberRollsBackFirstExpenseAndVersion() throws Exception {
        batch("rollback","{\"items\":["+expense(member,1000)+","+expense(UUID.randomUUID(),3000)+"]}")
            .andExpect(status().isUnprocessableEntity());
        assertThat(expenseCount()).isZero();
        assertThat(jdbc.queryForObject("select expense_version from trips where id=?",Long.class,trip)).isZero();
        batch("rollback","{\"items\":["+expense(member,1000)+"]}").andExpect(status().isCreated());
    }

    @Test void batchLimitsAndSwaggerContracts() throws Exception {
        batch("empty","{\"items\":[]}").andExpect(status().isBadRequest());
        batch("too-many","{\"items\":["+String.join(",",Collections.nCopies(11,expense(member,1)))+"]}")
            .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/expense-voice-drafts'].post.responses['202']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/trips/{tripId}/expenses/batch'].post.responses['201']").exists());
    }

    UUID user(String name) {UUID id=UUID.randomUUID();jdbc.update("insert into users(id,nickname,profile_completed,created_at,updated_at) values(?,?,true,now(),now())",id,name);return id;}
    UUID member(UUID user,long order) {UUID id=UUID.randomUUID();jdbc.update("insert into trip_members(id,trip_id,user_id,status,join_order,joined_at) values(?,?,?,'ACTIVE',?,now())",id,trip,user,order);return id;}
    String url(){return "/api/v1/trips/"+trip+"/expense-voice-drafts";}
    MockMultipartFile audio(byte[] bytes){return new MockMultipartFile("audio","recording.m4a","audio/mp4",bytes);}
    ResultActions upload(String key,MockMultipartFile audio)throws Exception{return mvc.perform(multipart(url()).file(audio).with(authUser(user)).header("Idempotency-Key",key));}
    UUID submit(String key,byte[] bytes)throws Exception{return UUID.fromString(data(upload(key,audio(bytes)).andExpect(status().isAccepted())).path("jobId").asString());}
    JsonNode data(ResultActions action)throws Exception{return json.readTree(action.andReturn().getResponse().getContentAsString()).path("data");}
    String objectKey(UUID job){return jdbc.queryForObject("select object_key from voice_expense_uploads where job_id=?",String.class,job);}
    String state(UUID job){return jdbc.queryForObject("select status from jobs where id=?",String.class,job);}
    int expenseCount(){return jdbc.queryForObject("select count(*) from expenses where trip_id=?",Integer.class,trip);}
    JobContext context(UUID job){return new JobContext(job,UUID.randomUUID(),1,new JobSubmission(user,JobKind.VOICE_EXPENSE_DRAFT,trip,
        json.readTree(jdbc.queryForObject("select input_json::text from jobs where id=?",String.class,job)),null,null));}
    JsonNode reply(int count){var root=json.createObjectNode().put("transcript","민수와 밥 먹고 커피 마셨어");var items=root.putArray("items");
        for(int i=0;i<count;i++)items.add(json.readTree("""
            {"transcriptSegment":"민수가 밥값 냈어","title":"식사","memo":null,"amountMinor":10000,"currency":"KRW",
             "payer":{"kind":"NAMED","name":"민수"},"participants":{"mode":"NAMED","includeSpeaker":true,"names":["민수"],"headcount":2},
             "spentAt":null,"spentAtExpression":null,"warnings":[]}
            """));root.putArray("warnings");return root;}
    String expense(UUID payer,long amount){return """
        {"title":"식사","memo":null,"amountMinor":%d,"currency":"KRW","payerMemberId":"%s",
         "participantMemberIds":["%s","%s"],"spentAt":"2026-11-12T01:00:00Z"}
        """.formatted(amount,payer,member,friendMember);}
    ResultActions batch(String key,String body)throws Exception{return mvc.perform(post("/api/v1/trips/{tripId}/expenses/batch",trip)
        .with(authUser(user)).header("Idempotency-Key",key).contentType(MediaType.APPLICATION_JSON).content(body));}
}
