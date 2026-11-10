package com.eodilog.feed;

import com.eodilog.asset.AssetErrorCode;
import com.eodilog.global.common.error.BusinessException;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

/** Admission uses the same trip-first lock order as original photo mutations. No asset-service dependency. */
@Component
@RequiredArgsConstructor
public class FeedAssetAccess {
    private final JdbcTemplate jdbc;
    @Transactional(propagation=Propagation.MANDATORY)
    public void require(UUID feed,UUID asset,UUID trip) {
        if(trip==null || jdbc.query("select id from trips where id=? and deleted_at is null for update",
                (rs,n)->rs.getObject(1,UUID.class),trip).isEmpty()) deny();
        Long count=jdbc.queryForObject("""
                select count(*) from feeds f join feed_photos fp on fp.feed_id=f.id
                join photos p on p.id=fp.photo_id and p.asset_id=fp.asset_id and p.trip_id=f.trip_id
                join assets a on a.id=p.asset_id and a.trip_id=f.trip_id
                where f.id=? and f.trip_id=? and fp.asset_id=? and f.deleted_at is null
                and p.deleted_at is null and a.deleted_at is null and a.status='READY' and a.purpose='TRIP_PHOTO'
                """,Long.class,feed,trip,asset);
        if(count==null || count!=1) deny();
    }
    private void deny() { throw new BusinessException(AssetErrorCode.ASSET_NOT_FOUND); }
}
