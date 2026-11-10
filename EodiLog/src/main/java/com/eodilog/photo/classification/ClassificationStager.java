package com.eodilog.photo.classification;

import com.eodilog.asset.AssetErrorCode;
import com.eodilog.global.ai.*;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.job.JobContext;
import java.nio.file.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

@Component @RequiredArgsConstructor @Slf4j
public class ClassificationStager {
    static final long MAX_BYTES=15L*1024*1024;
    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;
    private final ClassificationAccess access;
    private final PlatformTransactionManager manager;
    public static final class Staged implements AutoCloseable {
        public final List<UUID> ids=new ArrayList<>();
        public final List<AiServerClient.MultipartFile> files=new ArrayList<>();
        public final ObjectNode failures=JsonNodeFactory.instance.objectNode();
        // Ownership starts before commit so failed commits cannot orphan temporary files.
        final Set<Path> ownedPaths=new HashSet<>();
        Staged() { failures.putArray("photos"); }
        public void close() { ownedPaths.forEach(ClassificationStager::delete); }
    }
    /** Each display read is serialized with deletion, releasing its trip lock between files. */
    public Staged stage(JobContext c) {
        checkInterrupted();
        Staged out=new Staged();
        var tx=new TransactionTemplate(manager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        try {
            for(var p:c.submission().input().path("photos")) {
                checkInterrupted();
                var piece=tx.execute(status->read(c,p,out));
                if(piece.file()!=null) {
                    out.ids.add(UUID.fromString(p.path("photoId").asString()));out.files.add(piece.file());
                } else {
                    var f=out.failures.withArray("photos").addObject().put("photoId",p.path("photoId").asString())
                            .put("status","FAILED").put("errorCode",piece.error()).putNull("groupId");
                    f.putArray("topics");
                }
            }
            return out;
        } catch(RuntimeException ex) {
            out.close();
            if(ex instanceof java.util.concurrent.CancellationException || Thread.currentThread().isInterrupted()) throw ex;
            if(ex instanceof AiServerException) throw ex;
            log.warn("photo_staging_failed jobId={} category=transaction exceptionClass={}",c.jobId(),ex.getClass().getSimpleName());
            throw new AiServerException(true);
        }
    }
    private Piece read(JobContext c,JsonNode p,Staged owner) {
        Path temp=null;boolean keep=false;
        try {
            checkInterrupted();
            jdbc.query("select id from trips where id=? for update",(rs,row)->rs.getObject(1),c.submission().tripId());
            if(!access.allowed(c.submission().tripId(),c.submission().requestedByUserId()))
                throw new java.util.concurrent.CancellationException("Classification access revoked");
            UUID id=UUID.fromString(p.path("photoId").asString());
            boolean live=Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from photos p join assets a on a.id=p.asset_id where p.id=? and p.trip_id=? and p.asset_id=? and p.deleted_at is null and a.status='READY' and a.display_key=?)",Boolean.class,id,c.submission().tripId(),UUID.fromString(p.path("assetId").asString()),p.path("displayKey").asString()));
            if(!live) return new Piece(null,"FILE_UNAVAILABLE");
            var head=storage.head(p.path("displayKey").asString());
            if(head.isEmpty()) return new Piece(null,"FILE_UNAVAILABLE");
            if(head.get().byteSize()>MAX_BYTES) return new Piece(null,"INPUT_LIMIT_EXCEEDED");
            temp=Files.createTempFile("eodilog-photo-",".image");owner.ownedPaths.add(temp);
            Path admitted=temp;
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) { if(status!=STATUS_COMMITTED) delete(admitted); }
            });
            try(var input=storage.open(p.path("displayKey").asString());var output=Files.newOutputStream(temp)) {
                byte[] buffer=new byte[64*1024];long count=0;int n;
                while((n=input.read(buffer))!=-1) {
                    checkInterrupted();count+=n;
                    if(count>MAX_BYTES) return new Piece(null,"INPUT_LIMIT_EXCEEDED");
                    output.write(buffer,0,n);
                }
            }
            checkInterrupted();keep=true;
            return new Piece(new AiServerClient.MultipartFile(temp,p.path("contentType").asString()),null);
        } catch(java.io.InterruptedIOException ex) {
            Thread.currentThread().interrupt();throw new java.util.concurrent.CancellationException("Classification interrupted");
        } catch(java.io.IOException ex) {
            log.warn("photo_staging_failed jobId={} category=io exceptionClass={}",c.jobId(),ex.getClass().getSimpleName());
            throw new AiServerException(true);
        } catch(BusinessException ex) {
            if(Thread.currentThread().isInterrupted()) throw new java.util.concurrent.CancellationException("Classification interrupted");
            if(ex.getErrorCode()==AssetErrorCode.INVALID_ASSET) return new Piece(null,"FILE_UNAVAILABLE");
            log.warn("photo_staging_failed jobId={} category=storage exceptionClass={}",c.jobId(),ex.getClass().getSimpleName());
            throw new AiServerException(true);
        } finally {
            if(temp!=null && !keep) { delete(temp);owner.ownedPaths.remove(temp); }
        }
    }
    private record Piece(AiServerClient.MultipartFile file,String error) { }
    private static void delete(Path path) {
        try { Files.deleteIfExists(path); } catch(java.io.IOException ex) { path.toFile().deleteOnExit(); }
    }
    static void checkInterrupted() {
        if(Thread.currentThread().isInterrupted()) throw new java.util.concurrent.CancellationException("Classification interrupted");
    }
}
