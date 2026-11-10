package com.eodilog.feed;

import com.eodilog.feed.DiscoveryItem.Type;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

/**
 * Opaque discovery scroll state: the window fixed on the first page ({@code since}..{@code now}), the last feed and last place
 * already returned (null when that side has not started), and which kind the alternation emits next.
 */
public record DiscoveryCursor(Instant since,Instant now,FeedKey feed,PlaceKey place,Type next) {
    /** Feed keyset position: like_count DESC, published_at DESC, id DESC. */
    public record FeedKey(long likeCount,Instant publishedAt,UUID id) { }
    /** Place keyset position: allowed-feed count DESC, place id DESC. */
    public record PlaceKey(long count,UUID id) { }

    public String encode() {
        String raw=String.join("|",since.toString(),now.toString(),
                feed==null?"-":feed.likeCount()+"",feed==null?"-":feed.publishedAt().toString(),feed==null?"-":feed.id().toString(),
                place==null?"-":place.count()+"",place==null?"-":place.id().toString(),next.name());
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static DiscoveryCursor decode(String cursor) {
        try {
            String[] k=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split("\\|",-1);
            if(k.length!=8) throw new IllegalArgumentException();
            Instant since=Instant.parse(k[0]),now=Instant.parse(k[1]);
            if(since.isAfter(now)) throw new IllegalArgumentException();
            FeedKey feed=k[2].equals("-") && k[3].equals("-") && k[4].equals("-")?null
                    :new FeedKey(nonNegative(k[2]),Instant.parse(k[3]),UUID.fromString(k[4]));
            PlaceKey place=k[5].equals("-") && k[6].equals("-")?null:new PlaceKey(nonNegative(k[5]),UUID.fromString(k[6]));
            DiscoveryCursor result=new DiscoveryCursor(since,now,feed,place,Type.valueOf(k[7]));
            if(!result.encode().equals(cursor)) throw new IllegalArgumentException();
            return result;
        } catch(RuntimeException ex) {
            throw new BusinessException(CommonErrorCode.VALIDATION_ERROR,CommonErrorCode.VALIDATION_ERROR.message(),
                    List.of(new ErrorField("cursor","올바르지 않은 추천 커서입니다.")));
        }
    }

    private static long nonNegative(String value) {
        long n=Long.parseLong(value);
        if(n<0) throw new IllegalArgumentException();
        return n;
    }
}
