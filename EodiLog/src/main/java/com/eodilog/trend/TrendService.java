package com.eodilog.trend;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.PageResponse;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Region trends (decision Q-9 as implemented): regions ranked by the number of allowed published feeds whose trip period
 * overlaps [from,to]. Ranks are standard competition ranks over publishedTripCount (ties share a rank, next rank skips);
 * ties are listed by region code ASC. The previous window is the same number of days ending the day before {@code from}.
 * Computed on request; updatedAt is the computation time.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly=true)
public class TrendService {
    /** Longest accepted window in days (inclusive), one leap year. */
    public static final int MAX_DAYS=366;
    /** Below this many sampled feeds every row is flagged insufficientData. */
    public static final int MIN_SAMPLE_SIZE=5;
    /** Accepted year range of from/to. */
    public static final int MIN_YEAR=1900,MAX_YEAR=9999;
    private final TrendRepository repository;
    private final Clock clock;

    public PageResponse<TrendRegion> regions(UUID viewer,LocalDate from,LocalDate to,String cursor,int limit) {
        if(limit<1 || limit>100) throw invalid("limit","limit은 1~100입니다.");
        if(from.getYear()<MIN_YEAR || from.getYear()>MAX_YEAR) throw invalid("from","연도는 "+MIN_YEAR+"~"+MAX_YEAR+"입니다.");
        if(to.getYear()<MIN_YEAR || to.getYear()>MAX_YEAR) throw invalid("to","연도는 "+MIN_YEAR+"~"+MAX_YEAR+"입니다.");
        if(from.isAfter(to)) throw invalid("from","from은 to보다 늦을 수 없습니다.");
        long days=ChronoUnit.DAYS.between(from,to)+1;
        if(days>MAX_DAYS) throw invalid("to","기간은 최대 "+MAX_DAYS+"일입니다.");
        TrendCursor after=cursor==null?null:TrendCursor.decode(cursor,from,to);
        var rows=repository.page(viewer,from,to,from.minusDays(days),from.minusDays(1),after,limit+1);
        boolean next=rows.size()>limit;
        var page=next?rows.subList(0,limit):rows;
        var now=clock.instant();
        List<TrendRegion> items=page.stream().map(r->new TrendRegion(r.region(),r.rank(),r.previousRank(),
                r.previousRank()==null?null:r.previousRank()-r.rank(),r.previousRank()==null,r.count(),r.followingCount(),
                from,to,r.sampleSize(),now,r.sampleSize()<MIN_SAMPLE_SIZE)).toList();
        String nextCursor=next?new TrendCursor(from,to,page.getLast().count(),page.getLast().region().code()).encode():null;
        return PageResponse.of(items,nextCursor,next);
    }

    private static BusinessException invalid(String field,String reason) {
        return new BusinessException(CommonErrorCode.VALIDATION_ERROR,CommonErrorCode.VALIDATION_ERROR.message(),List.of(new ErrorField(field,reason)));
    }
}
