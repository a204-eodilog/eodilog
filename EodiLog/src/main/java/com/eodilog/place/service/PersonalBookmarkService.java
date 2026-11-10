package com.eodilog.place.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.place.dto.BookmarkView;
import com.eodilog.place.dto.PlaceView;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PersonalBookmarkService {
    private final JdbcTemplate jdbc;
    private final PlaceReader places;
    private final Clock clock;
    private final com.eodilog.user.preference.PreferenceService preferences;

    public PersonalBookmarkService(JdbcTemplate jdbc, PlaceReader places, Clock clock,
            com.eodilog.user.preference.PreferenceService preferences) {
        this.preferences = preferences;
        this.jdbc = jdbc;
        this.places = places;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PageResponse<BookmarkView> list(UUID userId, UUID regionId, String cursor, int limit) {
        if (limit < 1 || limit > 100) throw invalid();
        CreatedAtCursor after = cursor == null ? null : CreatedAtCursor.decode(cursor);
        String sql = "SELECT b.place_id,b.memo,b.source_feed_id,b.retained_place_name,"
                + "b.retained_latitude,b.retained_longitude,b.created_at FROM personal_bookmarks b "
                + "JOIN places p ON p.id=b.place_id WHERE b.user_id=?"
                + (regionId == null ? "" : " AND p.region_id=?")
                + (after == null ? "" : " AND (b.created_at,b.place_id) < (?,?)")
                + " ORDER BY b.created_at DESC,b.place_id DESC LIMIT ?";
        List<Object> args = new ArrayList<>();
        args.add(userId);
        if (regionId != null) args.add(regionId);
        if (after != null) { args.add(Timestamp.from(after.createdAt())); args.add(after.id()); }
        args.add(limit + 1);
        List<Row> rows = jdbc.query(sql, (rs, n) -> row(rs), args.toArray());
        boolean hasNext = rows.size() > limit;
        List<Row> page = rows.subList(0, Math.min(rows.size(), limit));
        var placeMap = places.findAll(page.stream().map(Row::placeId).toList());
        List<BookmarkView> data = page.stream().map(row -> view(row, placeMap.get(row.placeId()))).toList();
        String next = hasNext ? new CreatedAtCursor(page.getLast().createdAt(), page.getLast().placeId()).encode() : null;
        return PageResponse.of(data, next, hasNext);
    }

    @Transactional
    public BookmarkView put(UUID userId, UUID placeId, String memo, UUID sourceFeedId) {
        validateMemo(memo);
        // 피드 저장은 피드·열람권한 API가 생긴 뒤 연결한다. 제공된 ID를 무시하고 저장하지 않는다.
        if (sourceFeedId != null) throw invalid();
        PlaceView place = places.find(placeId).orElseThrow(() -> new BusinessException(CommonErrorCode.NOT_FOUND));
        preferences.lockSavedPlaces(userId);
        Instant now = clock.instant();
        jdbc.update("INSERT INTO personal_bookmarks(user_id,place_id,memo,retained_place_name,retained_latitude,"
                + "retained_longitude,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) "
                + "ON CONFLICT(user_id,place_id) DO UPDATE SET memo=excluded.memo,updated_at=excluded.updated_at",
                userId, placeId, memo, place.name(), place.latitude(), place.longitude(),
                Timestamp.from(now), Timestamp.from(now));
        preferences.savedPlacesChanged(userId);
        return get(userId, placeId);
    }

    @Transactional
    public BookmarkView patch(UUID userId, UUID placeId, String memo) {
        validateMemo(memo);
        int changed = jdbc.update("UPDATE personal_bookmarks SET memo=?,updated_at=? WHERE user_id=? AND place_id=?",
                memo, Timestamp.from(clock.instant()), userId, placeId);
        if (changed == 0) throw new BusinessException(CommonErrorCode.NOT_FOUND);
        return get(userId, placeId);
    }

    @Transactional
    public void delete(UUID userId, UUID placeId) {
        preferences.lockSavedPlaces(userId);
        jdbc.update("DELETE FROM personal_bookmarks WHERE user_id=? AND place_id=?", userId, placeId);
        preferences.savedPlacesChanged(userId);
    }

    private BookmarkView get(UUID userId, UUID placeId) {
        Row row = jdbc.query("SELECT place_id,memo,source_feed_id,retained_place_name,retained_latitude,"
                + "retained_longitude,created_at FROM personal_bookmarks WHERE user_id=? AND place_id=?",
                rs -> rs.next() ? row(rs) : null, userId, placeId);
        if (row == null) throw new BusinessException(CommonErrorCode.NOT_FOUND);
        return view(row, places.find(placeId).orElse(null));
    }

    private static BookmarkView view(Row row, PlaceView place) {
        return new BookmarkView(place,
                new BookmarkView.RetainedPlace(row.name(), row.latitude(), row.longitude()),
                row.memo(), row.sourceFeedId(), place == null, row.createdAt());
    }

    private static Row row(ResultSet rs) throws SQLException {
        return new Row(rs.getObject("place_id", UUID.class), rs.getString("memo"),
                rs.getObject("source_feed_id", UUID.class), rs.getString("retained_place_name"),
                rs.getBigDecimal("retained_latitude"), rs.getBigDecimal("retained_longitude"),
                rs.getTimestamp("created_at").toInstant());
    }

    private static void validateMemo(String memo) {
        if (memo != null && memo.length() > 2000) throw invalid();
    }

    private static BusinessException invalid() { return new BusinessException(CommonErrorCode.VALIDATION_ERROR); }

    private record Row(UUID placeId, String memo, UUID sourceFeedId, String name,
                       java.math.BigDecimal latitude, java.math.BigDecimal longitude, Instant createdAt) {}

}
