package com.eodilog.user.preference;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.job.*;
import com.eodilog.trip.service.TripAccessChecker;
import java.time.Clock;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PreferenceService {
    private final PreferenceRepository repository;
    private final JobService jobs;
    private final TripAccessChecker access;
    private final Clock clock;

    @Transactional(readOnly=true)
    public Preferences get(UUID id) {
        var user=repository.user(id,false);
        return new Preferences(repository.items(id,"EXPLICIT"), user.consent()?repository.items(id,"INFERRED"):List.of(),user.consent(),user.scope(),user.updatedAt());
    }
    @Transactional
    public Preferences put(UUID id, Preferences.Write body) {
        var items=normalize(body.explicitItems());
        if(body.allowInference()==null || body.sharingScope()==null) throw invalid();
        var old=repository.user(id,true); repository.initialize(id);
        boolean changed=!repository.items(id,"EXPLICIT").equals(items);
        // A newly explicit key must never remain represented as inferred.
        var explicitKeys=items.stream().map(i->canonical(i.key())).collect(java.util.stream.Collectors.toSet());
        repository.replace(id,"INFERRED",repository.items(id,"INFERRED").stream().filter(i->!explicitKeys.contains(canonical(i.key()))).toList());
        repository.replace(id,"EXPLICIT",items);
        repository.settings(id,body);
        if(!body.allowInference()) repository.replace(id,"INFERRED",List.of());
        if(changed || old.consent()!=body.allowInference()) repository.bump(id,clock.instant());
        if(body.allowInference() && (changed || !old.consent())) submit(id);
        return get(id);
    }
    @Transactional
    public void delete(UUID id,String key) {
        repository.user(id,true); repository.initialize(id);
        if(!PreferenceInferenceHandler.TAGS.contains(key)) throw invalid();
        repository.reject(id,key); repository.bump(id,clock.instant());
    }
    /** Called before saved-place writes. Trip callers have already locked their trip. */
    @Transactional(propagation=org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void lockSavedPlaces(UUID id) { if(repository.lockIfEligible(id).isPresent()) repository.initialize(id); }
    /** The fingerprint covers only unique place IDs, never memo, duplicate source or consent. */
    @Transactional(propagation=org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void savedPlacesChanged(UUID id) {
        var eligible=repository.lockIfEligible(id);
        if(eligible.isEmpty()) return;
        var user=eligible.get();
        String fingerprint=PreferenceRepository.fingerprint(repository.places(id));
        if(fingerprint.equals(repository.fingerprint(id))) return;
        repository.changePlaces(id,fingerprint); repository.bump(id,clock.instant());
        if(user.consent()) submit(id);
    }
    private void submit(UUID id) { jobs.submit(new JobSubmission(id,JobKind.PREFERENCE_INFERENCE,null,repository.snapshot(id),repository.version(id),null)); }
    @Transactional
    public Preferences.Consent consent(UUID id,UUID tripId,Preferences.TripScope scope) {
        var member=access.requireActiveMemberForUpdate(tripId,id).member();
        var user=repository.user(id,true);
        if(scope==null) throw invalid();
        repository.tripScope(member.getId(),scope);
        var effective=scope==Preferences.TripScope.INHERIT?user.scope():Preferences.Scope.valueOf(scope.name());
        if(!user.consent() && effective==Preferences.Scope.EXPLICIT_AND_INFERRED) effective=Preferences.Scope.EXPLICIT_ONLY;
        return new Preferences.Consent(scope,effective);
    }
    static List<Preferences.Item> normalize(List<Preferences.Item> items) {
        if(items==null || items.size()>20) throw invalid();
        Set<String> keys=new HashSet<>(); List<Preferences.Item> result=new ArrayList<>();
        for(var item:items) {
            if(item==null || item.key()==null || item.value()==null) throw invalid();
            String key=clean(item.key()),value=clean(item.value());
            if(key.isEmpty() || key.codePointCount(0,key.length())>20 || !key.equals(value) || !keys.add(canonical(key))) throw invalid();
            result.add(new Preferences.Item(key,value));
        }
        return List.copyOf(result);
    }
    static String clean(String value) { return value.replaceAll("(?U)\\s+"," ").strip(); }
    static String canonical(String value) { return clean(value).toLowerCase(Locale.ROOT); }
    private static BusinessException invalid() { return new BusinessException(CommonErrorCode.VALIDATION_ERROR); }
}
