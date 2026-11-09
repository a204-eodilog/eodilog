package com.eodilog.photo.classification;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.eodilog.asset.AssetErrorCode;
import com.eodilog.global.ai.*;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.job.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import tools.jackson.databind.json.JsonMapper;

class ClassificationInterruptionTest {
    final JdbcTemplate jdbc=mock(JdbcTemplate.class);
    final ObjectStorage storage=mock(ObjectStorage.class);
    final ClassificationAccess access=mock(ClassificationAccess.class);
    final TestTransactions transactions=new TestTransactions();
    final AiServerClient ai=mock(AiServerClient.class);
    final ClassificationStager stager=new ClassificationStager(jdbc,storage,access,transactions);
    final ClassificationHandler handler=new ClassificationHandler(ai,stager,access);
    final AtomicInteger closed=new AtomicInteger();
    final UUID first=UUID.randomUUID(),second=UUID.randomUUID();
    ClassificationInterruptionTest() {
        when(access.allowed(any(),any())).thenReturn(true);
        when(jdbc.queryForObject(anyString(),eq(Boolean.class),any(),any(),any(),any())).thenReturn(true);
        when(storage.head(anyString())).thenReturn(Optional.of(new ObjectStorage.StoredObject(1,"image/png")));
        when(storage.open(anyString())).thenAnswer(invocation->stream(new byte[]{1}));
    }
    JobContext context() {
        var input=JsonMapper.builder().build().createObjectNode();var photos=input.putArray("photos");
        for(var id:List.of(first,second)) photos.addObject().put("photoId",id.toString()).put("assetId",UUID.randomUUID().toString()).put("displayKey",id.toString()).put("contentType","image/png").put("version",1);
        return new JobContext(UUID.randomUUID(),UUID.randomUUID(),1,new JobSubmission(UUID.randomUUID(),JobKind.PHOTO_CLASSIFICATION,UUID.randomUUID(),input,null,null));
    }
    InputStream stream(byte[] bytes) {
        return new ByteArrayInputStream(bytes) {public void close() throws IOException {closed.incrementAndGet();super.close();}};
    }
    Set<Path> tempFiles() throws IOException {
        try(var files=Files.list(Path.of(System.getProperty("java.io.tmpdir")))) {
            return files.filter(p->p.getFileName().toString().startsWith("eodilog-photo-") && p.getFileName().toString().endsWith(".image"))
                    .collect(java.util.stream.Collectors.toSet());
        }
    }
    @Test void interruptedWorkerDoesNotAcquireTripLockOrOpenStorage() {
        try {
            Thread.currentThread().interrupt();
            assertThatThrownBy(()->stager.stage(null)).isInstanceOf(CancellationException.class);
            verifyNoInteractions(jdbc,storage,access);
        } finally {Thread.interrupted();}
    }
    @Test void midDownloadInterruptionCleansPriorFileAndBothStreamsWithoutCallingAi() throws Exception {
        var before=tempFiles();
        when(storage.open(second.toString())).thenReturn(new InputStream() {
            public int read() throws IOException {throw new InterruptedIOException("provider-private-message");}
            public void close() {closed.incrementAndGet();}
        });
        try {
            assertThat(handler.execute(context()).failure()).isEqualTo(JobFailure.EXECUTION_FAILED);
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            assertThat(closed.get()).isEqualTo(2);verifyNoInteractions(ai);
        } finally {Thread.interrupted();}
        assertThat(tempFiles()).isEqualTo(before);
    }
    @Test void understatedHeadRejectsBoundedOversizeStreamAndKeepsTheOtherPhoto() throws Exception {
        var before=tempFiles();AtomicLong read=new AtomicLong();
        when(storage.open(first.toString())).thenReturn(new InputStream() {
            long remaining=ClassificationStager.MAX_BYTES*2;
            public int read() {throw new AssertionError("buffered reads required");}
            public int read(byte[] bytes,int offset,int count) {if(remaining==0)return -1;int n=(int)Math.min(remaining,count);remaining-=n;read.addAndGet(n);return n;}
            public void close() {closed.incrementAndGet();}
        });
        try(var result=stager.stage(context())) {
            assertThat(result.ids).containsExactly(second);
            assertThat(result.failures.path("photos").get(0).path("errorCode").asString()).isEqualTo("INPUT_LIMIT_EXCEEDED");
            assertThat(read.get()).isBetween(ClassificationStager.MAX_BYTES+1,ClassificationStager.MAX_BYTES+64*1024);
            assertThat(Files.size(result.files.getFirst().path())).isEqualTo(1);
        }
        assertThat(closed.get()).isEqualTo(2);assertThat(tempFiles()).isEqualTo(before);
    }
    @Test @org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
    void storageAndLocalIoFailuresAreRetryableAndCleanAllFiles(org.springframework.boot.test.system.CapturedOutput logs) throws Exception {
        var before=tempFiles();
        when(storage.open(second.toString())).thenThrow(new BusinessException(AssetErrorCode.STORAGE_UNAVAILABLE,"sensitive-provider-url"));
        var job=context();
        assertThat(handler.execute(job).failure()).isEqualTo(JobFailure.TEMPORARY_FAILURE);
        assertThat(tempFiles()).isEqualTo(before);verifyNoInteractions(ai);
        doReturn(new InputStream() {public int read() throws IOException {throw new IOException("private-path");}}).when(storage).open(second.toString());
        assertThat(handler.execute(context()).failure()).isEqualTo(JobFailure.TEMPORARY_FAILURE);
        assertThat(tempFiles()).isEqualTo(before);
        assertThat(logs.getAll()).contains("jobId="+job.jobId(),"category=storage","exceptionClass=BusinessException","category=io","exceptionClass=IOException")
                .doesNotContain("sensitive-provider-url","private-path");
    }
    @Test void failedCommitDeletesTheReturnedFileIncludingSynchronizationCleanup() throws Exception {
        var before=tempFiles();transactions.failCommit=true;
        assertThatThrownBy(()->stager.stage(context())).isInstanceOfSatisfying(AiServerException.class,ex->assertThat(ex.retryable()).isTrue());
        transactions.pathsAtCommit.removeAll(before);
        assertThat(transactions.pathsAtCommit).isNotEmpty();
        assertThat(transactions.pathsAtCommit).allMatch(p->!Files.exists(p));
        assertThat(tempFiles()).isEqualTo(before);assertThat(closed.get()).isEqualTo(1);
    }
    @Test void slowSecondFileStartsAfterTheFirstTransactionAndLockHaveFinished() throws Exception {
        var entered=new CountDownLatch(1);var released=new CountDownLatch(1);
        when(storage.open(second.toString())).thenAnswer(invocation->{
            assertThat(transactions.committed.get()).isEqualTo(1);
            assertThat(transactions.begun.get()).isEqualTo(2);
            assertThat(transactions.cleaned.get()).isEqualTo(1);
            entered.countDown();assertThat(released.await(5,TimeUnit.SECONDS)).isTrue();return stream(new byte[]{2});
        });
        try(var pool=Executors.newSingleThreadExecutor()) {
            var staged=pool.submit(()->stager.stage(context()));
            try {assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();assertThat(staged).isNotDone();}
            finally {released.countDown();}
            try(var result=staged.get(5,TimeUnit.SECONDS)){assertThat(result.ids).containsExactly(first,second);}
        }
        assertThat(transactions.committed.get()).isEqualTo(2);assertThat(transactions.cleaned.get()).isEqualTo(2);
    }
    class TestTransactions extends AbstractPlatformTransactionManager {
        final AtomicInteger begun=new AtomicInteger(),committed=new AtomicInteger(),cleaned=new AtomicInteger();
        final Set<Path> pathsAtCommit=new HashSet<>();boolean failCommit;
        protected Object doGetTransaction(){return new Object();}
        protected void doBegin(Object tx,TransactionDefinition definition){begun.incrementAndGet();}
        protected void doCommit(DefaultTransactionStatus status){
            if(failCommit) {try {pathsAtCommit.addAll(tempFiles());}catch(IOException ex){throw new IllegalStateException(ex);}throw new TransactionSystemException("simulated commit failure");}
            committed.incrementAndGet();
        }
        protected void doRollback(DefaultTransactionStatus status) { }
        protected void doCleanupAfterCompletion(Object transaction){cleaned.incrementAndGet();}
    }
}
