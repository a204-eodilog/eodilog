package com.eodilog.photo.classification;

import com.eodilog.asset.AssetErrorCode;
import com.eodilog.global.common.error.*;
import com.eodilog.global.id.UuidV7;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.*;
import com.eodilog.photo.PhotoErrorCode;
import com.eodilog.photo.PhotoService;
import com.eodilog.photo.dto.*;
import com.eodilog.trip.service.TripAccessChecker;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

@Service @RequiredArgsConstructor
public class ClassificationService {
    private final JdbcTemplate jdbc;
    private final TripAccessChecker trips;
    private final ClassificationAccess access;
    private final IdempotencyService idempotency;
    private final JobService jobs;
    private final JsonMapper json;
    private final Clock clock;
    private static final Set<String> TOPICS=Set.of("LANDSCAPE","FOOD","PEOPLE","OTHER");

    @Transactional
    public JobRef request(UUID user,UUID trip,String key,PhotoClassificationRequest request) {
        idempotency.validateKey(key);
        trips.requireActiveMemberForUpdate(trip,user);
        enabled(user);
        validateIds(request.photoIds());
        // Validate even on idempotent replay: removed photos never resurrect an old request.
        ObjectNode snapshot=json.createObjectNode(); var photos=snapshot.putArray("photos");
        for(UUID id:request.photoIds()) {
            var rows=jdbc.query("select p.asset_id,p.version,a.display_key,a.display_content_type from photos p join assets a on a.id=p.asset_id where p.id=? and p.trip_id=? and p.deleted_at is null and a.status='READY'",
                    (rs,row)->json.createObjectNode().put("photoId",id.toString()).put("assetId",rs.getObject(1,UUID.class).toString()).put("version",rs.getLong(2)).put("displayKey",rs.getString(3)).put("contentType",rs.getString(4)),id,trip);
            if(rows.isEmpty()) throw new BusinessException(PhotoErrorCode.PHOTO_NOT_FOUND);
            photos.add(rows.getFirst());
        }
        return idempotency.execute(user,"POST /api/v1/trips/"+trip+"/photo-classifications",key,request,JobRef.class,HttpStatus.ACCEPTED,
                ()->jobs.submit(new JobSubmission(user,JobKind.PHOTO_CLASSIFICATION,trip,snapshot,null,null)));
    }

    @Transactional
    public PhotoClassificationResponse apply(UUID user,UUID trip,UUID job,ApplyPhotoClassificationRequest request) {
        var member=trips.requireActiveMemberForUpdate(trip,user).member();
        enabled(user);
        var wanted=request.expectedPhotoVersions();
        validateIds(wanted.stream().map(ApplyPhotoClassificationRequest.PhotoVersion::photoId).toList());
        if(wanted.stream().anyMatch(p->p.version()<1)) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        var rows=jdbc.query("select input_json::text,result_json::text,requested_by_user_id from jobs where id=? and trip_id=? and kind='PHOTO_CLASSIFICATION' and status='SUCCEEDED' and deleted_at is null for update",
                (rs,row)->new Stored(json.readTree(rs.getString(1)),json.readTree(rs.getString(2)),rs.getObject(3,UUID.class)),job,trip);
        if(rows.isEmpty()) throw new BusinessException(ClassificationError.JOB_NOT_FOUND);
        var stored=rows.getFirst();
        if(!access.allowed(trip,stored.requester())) throw new BusinessException(ClassificationError.JOB_NOT_FOUND);
        Map<UUID,JsonNode> snapshots=new HashMap<>();
        for(var p:stored.input().path("photos")) snapshots.put(UUID.fromString(p.path("photoId").asString()),p);
        var result=ClassificationResult.sanitize(stored.result(),snapshots.keySet());
        Map<UUID,JsonNode> successful=new HashMap<>();
        for(var p:result.path("photos")) if("SUCCEEDED".equals(p.path("status").asString())) successful.put(UUID.fromString(p.path("photoId").asString()),p);
        var receipt=jdbc.query("select request_json::text,response_json::text from photo_classification_applies where job_id=?",
                (rs,row)->new JsonNode[]{json.readTree(rs.getString(1)),json.readTree(rs.getString(2))},job);
        // Normalize numeric node types through the wire representation before comparing with jsonb.
        JsonNode body=json.readTree(json.writeValueAsString(request));
        boolean replay=!receipt.isEmpty();
        if(replay && !body.equals(receipt.getFirst()[0])) throw new BusinessException(ClassificationError.VERSION_CONFLICT);
        for(var target:wanted) {
            UUID id=target.photoId();
            if(!successful.containsKey(id) || !snapshots.containsKey(id)) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
            var current=jdbc.query("select version,(topics_manually_edited or exists(select 1 from photo_topics t where t.photo_id=photos.id and t.source='MANUAL')),asset_id from photos where id=? and trip_id=? and deleted_at is null for update",
                    (rs,row)->new Current(rs.getLong(1),rs.getBoolean(2),rs.getObject(3,UUID.class)),id,trip);
            if(current.isEmpty()) throw new BusinessException(PhotoErrorCode.PHOTO_NOT_FOUND);
            long snapshot=snapshots.get(id).path("version").asLong();
            if(target.version()!=snapshot || current.getFirst().version()!=snapshot+(replay?1:0) || current.getFirst().manual()
                    || !current.getFirst().asset().toString().equals(snapshots.get(id).path("assetId").asString())) throw new BusinessException(ClassificationError.VERSION_CONFLICT);
        }
        if(replay) return json.treeToValue(receipt.getFirst()[1],PhotoClassificationResponse.class);
        List<Assignment> assignments=new ArrayList<>();
        for(var target:wanted) {
            var prediction=successful.get(target.photoId());
            UUID group=prediction.path("groupId").isNull()?null:UUID.fromString(prediction.path("groupId").asString());
            assignments.add(new Assignment(target.photoId(),prediction.path("topics").get(0).asString(),group));
        }
        ObjectNode response=write(trip,job,assignments);
        jdbc.update("insert into photo_classification_applies(job_id,request_json,response_json) values(?,?::jsonb,?::jsonb)",job,json.writeValueAsString(body),json.writeValueAsString(response));
        jdbc.update("update jobs set applied_at=?,applied_by_member_id=? where id=?",Timestamp.from(clock.instant()),member.getId(),job);
        return json.treeToValue(response,PhotoClassificationResponse.class);
    }
    /**
     * On-device results for the caller's own just-uploaded photos. Same checks as apply minus the job: ACTIVE member,
     * setting not OFF, every photo the caller's live photo in this trip (404 PHOTO_NOT_FOUND), then version and manual
     * topic protection (409 VERSION_CONFLICT). Nothing is written unless every photo passes.
     */
    @Transactional
    public PhotoClassificationResponse applyDevice(UUID user,UUID trip,DevicePhotoClassificationRequest request) {
        var member=trips.requireActiveMemberForUpdate(trip,user).member();
        enabled(user);
        var wanted=request.photos();
        List<UUID> ids=wanted.stream().map(DevicePhotoClassificationRequest.Photo::photoId).toList();
        validateIds(ids);
        if(wanted.stream().anyMatch(p->p.expectedVersion()==null || p.expectedVersion()<1 || p.topic()==null || !TOPICS.contains(p.topic())
                || (p.groupKey()!=null && (p.groupKey().isEmpty() || p.groupKey().length()>64)))) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
        List<Object> params=new ArrayList<>(ids);
        params.add(trip); params.add(member.getId());
        // Same lock order as the photo batch API: trip, then photos by id.
        Map<UUID,Current> current=new HashMap<>();
        jdbc.query("select id,version,(topics_manually_edited or exists(select 1 from photo_topics t where t.photo_id=photos.id and t.source='MANUAL')),asset_id from photos where id in ("
                        +String.join(",",Collections.nCopies(ids.size(),"?"))+") and trip_id=? and uploader_member_id=? and deleted_at is null order by id for update",
                (rs,row)->current.put(rs.getObject(1,UUID.class),new Current(rs.getLong(2),rs.getBoolean(3),rs.getObject(4,UUID.class))),params.toArray());
        if(current.size()!=ids.size()) throw new BusinessException(PhotoErrorCode.PHOTO_NOT_FOUND);
        for(var target:wanted) {
            var photo=current.get(target.photoId());
            if(photo.version()!=target.expectedVersion() || photo.manual()) throw new BusinessException(ClassificationError.VERSION_CONFLICT);
        }
        // Client keys only say which photos belong together; the stored group id is always generated here.
        Map<String,UUID> keys=new HashMap<>();
        List<Assignment> assignments=new ArrayList<>();
        for(var target:wanted) assignments.add(new Assignment(target.photoId(),target.topic(),
                target.groupKey()==null?null:keys.computeIfAbsent(target.groupKey(),k->UuidV7.generate())));
        return json.treeToValue(write(trip,null,assignments),PhotoClassificationResponse.class);
    }

    /** Shared write: groups with 2+ photos get a photo_groups row (null job = on-device), then one AI topic and a version bump per photo. */
    private ObjectNode write(UUID trip,UUID job,List<Assignment> assignments) {
        Map<UUID,Integer> groups=new HashMap<>();
        for(var target:assignments) if(target.group()!=null) groups.merge(target.group(),1,Integer::sum);
        for(var entry:groups.entrySet()) if(entry.getValue()>=2) {
            int inserted=jdbc.update("insert into photo_groups(id,trip_id,source_job_id) values(?,?,?) on conflict(id) do nothing",entry.getKey(),trip,job);
            if(inserted!=1) throw new BusinessException(ClassificationError.VERSION_CONFLICT);
        }
        ObjectNode response=json.createObjectNode(); var photos=response.putArray("photos");
        for(var target:assignments) {
            UUID group=target.group();
            if(group!=null && groups.get(group)<2) group=null;
            jdbc.update("update photos set group_id=?,version=version+1 where id=?",group,target.photoId());
            jdbc.update("delete from photo_topics where photo_id=?",target.photoId());
            jdbc.update("insert into photo_topics(photo_id,topic,source) values(?,?,'AI')",target.photoId(),target.topic());
            PhotoResponse photo=jdbc.queryForObject(PhotoService.PHOTO_SELECT+" where id=?",PhotoService::map,target.photoId());
            photos.add(json.valueToTree(photo));
        }
        return response;
    }
    private void enabled(UUID user) { if(access.disabled(user)) throw new BusinessException(ClassificationError.AI_FEATURE_DISABLED); }
    private static void validateIds(List<UUID> ids) {
        if(ids.size()>50) throw new BusinessException(AssetErrorCode.INPUT_LIMIT_EXCEEDED);
        if(ids.isEmpty() || ids.stream().anyMatch(Objects::isNull) || new HashSet<>(ids).size()!=ids.size()) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
    }
    private record Stored(JsonNode input,JsonNode result,UUID requester) { }
    private record Current(long version,boolean manual,UUID asset) { }
    private record Assignment(UUID photoId,String topic,UUID group) { }
}
