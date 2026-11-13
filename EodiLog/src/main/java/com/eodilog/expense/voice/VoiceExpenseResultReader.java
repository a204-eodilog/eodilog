package com.eodilog.expense.voice;
import com.eodilog.global.id.UuidV7;
import com.eodilog.job.JobFailure;
import java.time.*;
import java.util.*;
import java.text.Normalizer;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
@Component @RequiredArgsConstructor
public class VoiceExpenseResultReader {
    private final JdbcTemplate jdbc;
    record Member(UUID id,UUID user,String nickname){}
    static class Invalid extends RuntimeException { final JobFailure failure;Invalid(JobFailure failure){this.failure=failure;} }
    private static final Set<String> CODES=Set.of("TITLE_UNKNOWN","AMOUNT_MISSING","PAYER_UNKNOWN","PARTICIPANTS_UNKNOWN","MEMBER_AMBIGUOUS","MEMBER_NOT_FOUND","SPENT_AT_UNKNOWN","COUNT_MISMATCH");
    private static final Set<String> FIELDS=Set.of("title","memo","amountMinor","currency","payerMemberId","participantMemberIds","spentAt");
    VoiceExpenseResult read(UUID trip,UUID user,JsonNode data) {
        if(data==null || !data.isObject())throw invalid();
        String transcript=text(data,"transcript",16000);if(transcript==null)throw new Invalid(JobFailure.VOICE_NO_SPEECH_OR_EXPENSE);
        JsonNode items=data.path("items");if(!items.isArray())throw invalid();
        if(items.isEmpty())throw new Invalid(JobFailure.VOICE_NO_SPEECH_OR_EXPENSE);
        if(items.size()>10)throw new Invalid(JobFailure.VOICE_INPUT_LIMIT_EXCEEDED);
        var members=jdbc.query("""
            select m.id,m.user_id,u.nickname from trip_members m join users u on u.id=m.user_id
            where m.trip_id=? and m.status='ACTIVE' and u.status='ACTIVE' and u.profile_completed order by m.join_order,m.id
            """,(r,n)->new Member(r.getObject(1,UUID.class),r.getObject(2,UUID.class),r.getString(3)),trip);
        UUID actor=members.stream().filter(m->m.user().equals(user)).map(Member::id).findFirst().orElseThrow(VoiceExpenseResultReader::invalid);
        Map<String,List<UUID>> names=new HashMap<>();for(var m:members)names.computeIfAbsent(normalize(m.nickname()),k->new ArrayList<>()).add(m.id());
        List<VoiceExpenseResult.Item> out=new ArrayList<>();
        for(var item:items) {
            if(!item.isObject())throw invalid();
            var warnings=new ArrayList<VoiceExpenseResult.Warning>();addWarnings(item.path("warnings"),warnings,false);
            var unresolved=new LinkedHashSet<String>();
            String title=text(item,"title",200),memo=text(item,"memo",4000),currency=text(item,"currency",8);
            if(title==null){unresolved.add("title");warn(warnings,"TITLE_UNKNOWN","title");}
            if(currency!=null&&!currency.equals("KRW"))throw new Invalid(JobFailure.VOICE_EXPENSE_UNSUPPORTED);
            if(currency==null)unresolved.add("currency");
            Long amount=null;var value=item.path("amountMinor");
            if(!value.isNull()&&!value.isMissingNode()) {
                if(!value.isIntegralNumber() || !value.canConvertToLong() || value.asLong()<1 || value.asLong()>9007199254740991L)throw invalid();
                amount=value.asLong();
            }
            if(amount==null){unresolved.add("amountMinor");warn(warnings,"AMOUNT_MISSING","amountMinor");}
            UUID payer=null;var p=item.path("payer");String kind=p.path("kind").asString("");
            switch(kind) {
                case "SELF" -> payer=actor;
                case "NAMED" -> payer=resolve(text(p,"name",100),names,warnings,"payerMemberId");
                case "UNKNOWN" -> { }
                default -> throw invalid();
            }
            if(payer==null){unresolved.add("payerMemberId");warn(warnings,"PAYER_UNKNOWN","payerMemberId");}
            var party=item.path("participants");String mode=party.path("mode").asString("");
            var include=party.path("includeSpeaker");if(!include.isNull()&&!include.isMissingNode()&&!include.isBoolean())throw invalid();
            Set<UUID> participants=new LinkedHashSet<>();boolean unknown=false;
            switch(mode) {
                case "ALL_ACTIVE" -> {for(var m:members)if(!include.isBoolean()||include.asBoolean()||!m.id().equals(actor))participants.add(m.id());}
                case "NAMED" -> {
                    var list=party.path("names");if(!list.isArray()||list.size()>100)throw invalid();
                    if(include.isBoolean()&&include.asBoolean())participants.add(actor);
                    if(!include.isBoolean())unknown=true;
                    for(var n:list){if(!n.isString()||n.asString().length()>100)throw invalid();var id=resolve(n.asString(),names,warnings,"participantMemberIds");if(id==null)unknown=true;else participants.add(id);}
                }
                case "UNKNOWN" -> unknown=true;
                default -> throw invalid();
            }
            var count=party.path("headcount");
            if(!count.isNull()&&!count.isMissingNode()) {
                if(!count.isIntegralNumber()||!count.canConvertToInt()||count.asInt()<1)throw invalid();
                if(count.asInt()!=participants.size()){unknown=true;warn(warnings,"COUNT_MISMATCH","participantMemberIds");}
            }
            if(unknown||participants.isEmpty()){unresolved.add("participantMemberIds");warn(warnings,"PARTICIPANTS_UNKNOWN","participantMemberIds");}
            Instant spentAt=null;String at=text(item,"spentAt",50),expression=text(item,"spentAtExpression",500);
            if(at!=null){if(expression==null)throw invalid();try{spentAt=Instant.parse(at);}catch(RuntimeException ex){throw invalid();}}
            if(spentAt==null){unresolved.add("spentAt");warn(warnings,"SPENT_AT_UNKNOWN","spentAt");}
            for(var warning:warnings)unresolved.add(warning.field());
            out.add(new VoiceExpenseResult.Item(UuidV7.generate(),text(item,"transcriptSegment",8000),
                new VoiceExpenseResult.Draft(title,memo,amount,currency,payer,List.copyOf(participants),spentAt),List.copyOf(unresolved),List.copyOf(warnings)));
        }
        var warnings=new ArrayList<VoiceExpenseResult.Warning>();addWarnings(data.path("warnings"),warnings,true);
        return new VoiceExpenseResult(transcript,List.copyOf(out),List.copyOf(warnings));
    }
    private UUID resolve(String name,Map<String,List<UUID>> names,List<VoiceExpenseResult.Warning> warnings,String field){
        var ids=name==null?List.<UUID>of():names.getOrDefault(normalize(name),List.of());
        if(ids.size()==1)return ids.getFirst();warn(warnings,ids.isEmpty()?"MEMBER_NOT_FOUND":"MEMBER_AMBIGUOUS",field);return null;
    }
    private static String normalize(String s){return Normalizer.normalize(s==null?"":s,Normalizer.Form.NFKC).strip();}
    private String text(JsonNode node,String field,int max){var n=node.path(field);if(n.isNull()||n.isMissingNode())return null;if(!n.isString()||n.asString().length()>max)throw invalid();String value=n.asString().strip();return value.isEmpty()?null:value;}
    private void addWarnings(JsonNode source,List<VoiceExpenseResult.Warning> warnings,boolean global){
        if(source.isMissingNode()||source.isNull())return;
        if(!source.isArray()||source.size()>100)throw invalid();
        for(var n:source){String code=text(n,"code",80),field=text(n,"field",80);
            if(global&&"TOTAL_MISMATCH".equals(code)&&field==null){warn(warnings,code,null);continue;}
            if(!CODES.contains(code==null?"":code))throw invalid();
            field=switch(field==null?"":field){case "payer"->"payerMemberId";case "participants"->"participantMemberIds";default->field;};
            if(field==null||!FIELDS.contains(field))throw invalid();warn(warnings,code,field);}
    }
    private void warn(List<VoiceExpenseResult.Warning> warnings,String code,String field){
        if(warnings.stream().noneMatch(w->w.code().equals(code)&&Objects.equals(w.field(),field)))warnings.add(new VoiceExpenseResult.Warning(code,field,
            "TOTAL_MISMATCH".equals(code)?"말한 합계와 항목 금액의 합을 확인해 주세요.":"인식 결과를 확인하고 필요한 값을 직접 선택해 주세요."));
    }
    private static Invalid invalid(){return new Invalid(JobFailure.VOICE_PROCESSING_INTERRUPTED);}
}
