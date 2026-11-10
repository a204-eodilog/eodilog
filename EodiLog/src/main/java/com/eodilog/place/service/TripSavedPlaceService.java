package com.eodilog.place.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.response.PageInfo;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.dto.SavedPlacePage;
import com.eodilog.place.dto.SavedPlaceView;
import com.eodilog.trip.service.TripAccessChecker;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TripSavedPlaceService {
    private final NamedParameterJdbcTemplate jdbc;
    private final PlaceReader places;
    private final TripAccessChecker access;
    private final Clock clock;
    private final com.eodilog.user.preference.PreferenceService preferences;

    public TripSavedPlaceService(NamedParameterJdbcTemplate jdbc, PlaceReader places,
            TripAccessChecker access, Clock clock,
            com.eodilog.user.preference.PreferenceService preferences) {
        this.preferences = preferences;
        this.jdbc = jdbc; this.places = places; this.access = access; this.clock = clock;
    }

    public enum Filter { ALL, OVERLAP }

    @Transactional(readOnly = true)
    public SavedPlacePage list(UUID userId, UUID tripId, Filter filter, UUID memberId,
            String bbox, String cursor, int limit) {
        access.requireActiveMember(tripId, userId);
        if (filter == null || limit < 1 || limit > 100) throw invalid();
        if (memberId != null && !memberBelongsToTrip(tripId, memberId)) throw invalid();
        Bounds bounds = Bounds.parse(bbox);
        var after = cursor == null ? null : CreatedAtCursor.decode(cursor);
        var params = new MapSqlParameterSource("tripId", tripId).addValue("limit", limit + 1);
        String grouped = "SELECT place_id,count(*) AS saved_count,max(created_at) AS latest "
                + "FROM trip_place_saves WHERE trip_id=:tripId GROUP BY place_id";
        long all = jdbc.queryForObject("SELECT count(*) FROM (" + grouped + ") g", params, Long.class);
        long overlap = jdbc.queryForObject("SELECT count(*) FROM (" + grouped + ") g WHERE saved_count>=2", params, Long.class);
        StringBuilder where = new StringBuilder(" WHERE true");
        if (filter == Filter.OVERLAP) where.append(" AND g.saved_count>=2");
        if (memberId != null) {
            where.append(" AND EXISTS (SELECT 1 FROM trip_place_saves own WHERE own.trip_id=:tripId"
                    + " AND own.place_id=g.place_id AND own.saved_by_member_id=:memberId)");
            params.addValue("memberId", memberId);
        }
        if (bounds != null) {
            where.append(" AND p.longitude BETWEEN :west AND :east AND p.latitude BETWEEN :south AND :north");
            params.addValue("west", bounds.west()).addValue("east", bounds.east())
                    .addValue("south", bounds.south()).addValue("north", bounds.north());
        }
        String base = " FROM (" + grouped + ") g JOIN places p ON p.id=g.place_id" + where;
        long filtered = jdbc.queryForObject("SELECT count(*)" + base, params, Long.class);
        if (after != null) {
            base += " AND (g.latest,g.place_id)<(:afterTime,:afterId)";
            params.addValue("afterTime", Timestamp.from(after.createdAt())).addValue("afterId", after.id());
        }
        List<Group> groups = jdbc.query("SELECT g.place_id,g.saved_count,g.latest" + base
                + " ORDER BY g.latest DESC,g.place_id DESC LIMIT :limit", params,
                (rs, n) -> new Group(rs.getObject("place_id", UUID.class), rs.getLong("saved_count"),
                        rs.getTimestamp("latest").toInstant()));
        boolean hasNext = groups.size() > limit;
        List<Group> page = groups.subList(0, Math.min(groups.size(), limit));
        List<SavedPlaceView> items = toViews(tripId, page);
        String next = hasNext ? new CreatedAtCursor(page.getLast().latest(), page.getLast().placeId()).encode() : null;
        return new SavedPlacePage(items, new SavedPlacePage.Totals(all, overlap, filtered), new PageInfo(next, hasNext));
    }

    @Transactional
    public SavedPlaceView put(UUID userId, UUID tripId, UUID placeId, String memo) {
        validateMemo(memo);
        var member = access.requireActiveMemberForUpdate(tripId, userId).member();
        requirePlace(placeId);
        preferences.lockSavedPlaces(userId);
        Instant now = clock.instant();
        jdbc.update("INSERT INTO trip_place_saves(trip_id,place_id,saved_by_member_id,memo,created_at,updated_at) "
                        + "VALUES(:tripId,:placeId,:memberId,:memo,:now,:now) "
                        + "ON CONFLICT(trip_id,place_id,saved_by_member_id) DO UPDATE "
                        + "SET memo=excluded.memo,updated_at=excluded.updated_at",
                new MapSqlParameterSource("tripId", tripId).addValue("placeId", placeId)
                        .addValue("memberId", member.getId()).addValue("memo", memo)
                        .addValue("now", Timestamp.from(now)));
        preferences.savedPlacesChanged(userId);
        return get(tripId, placeId);
    }

    @Transactional
    public SavedPlaceView patch(UUID userId, UUID tripId, UUID placeId, String memo) {
        validateMemo(memo);
        var member = access.requireActiveMemberForUpdate(tripId, userId).member();
        int changed = jdbc.update("UPDATE trip_place_saves SET memo=:memo,updated_at=:now "
                + "WHERE trip_id=:tripId AND place_id=:placeId AND saved_by_member_id=:memberId",
                new MapSqlParameterSource("tripId", tripId).addValue("placeId", placeId)
                        .addValue("memberId", member.getId()).addValue("memo", memo)
                        .addValue("now", Timestamp.from(clock.instant())));
        if (changed == 0) throw new BusinessException(CommonErrorCode.NOT_FOUND);
        return get(tripId, placeId);
    }

    @Transactional
    public void delete(UUID userId, UUID tripId, UUID placeId) {
        var member = access.requireActiveMemberForUpdate(tripId, userId).member();
        preferences.lockSavedPlaces(userId);
        jdbc.update("DELETE FROM trip_place_saves WHERE trip_id=:tripId AND place_id=:placeId "
                + "AND saved_by_member_id=:memberId",
                new MapSqlParameterSource("tripId", tripId).addValue("placeId", placeId)
                        .addValue("memberId", member.getId()));
        preferences.savedPlacesChanged(userId);
    }

    private SavedPlaceView get(UUID tripId, UUID placeId) {
        PlaceView place = requirePlace(placeId);
        List<SavedPlaceView.SavedBy> savers = jdbc.query("SELECT saved_by_member_id,memo FROM trip_place_saves s "
                + "JOIN trip_members m ON m.id=s.saved_by_member_id "
                + "WHERE s.trip_id=:tripId AND s.place_id=:placeId ORDER BY m.join_order",
                new MapSqlParameterSource("tripId", tripId).addValue("placeId", placeId),
                (rs, n) -> new SavedPlaceView.SavedBy(rs.getObject(1, UUID.class), rs.getString(2)));
        return new SavedPlaceView(place, savers, savers.size());
    }

    private List<SavedPlaceView> toViews(UUID tripId, List<Group> groups) {
        if (groups.isEmpty()) return List.of();
        List<UUID> ids = groups.stream().map(Group::placeId).toList();
        Map<UUID, PlaceView> placeMap = places.findAll(ids);
        Map<UUID, List<SavedPlaceView.SavedBy>> savedBy = new HashMap<>();
        jdbc.query("SELECT s.place_id,s.saved_by_member_id,s.memo FROM trip_place_saves s "
                        + "JOIN trip_members m ON m.id=s.saved_by_member_id "
                        + "WHERE s.trip_id=:tripId AND s.place_id IN (:ids) ORDER BY s.place_id,m.join_order",
                new MapSqlParameterSource("tripId", tripId).addValue("ids", ids), rs -> {
                    savedBy.computeIfAbsent(rs.getObject(1, UUID.class), ignored -> new ArrayList<>())
                            .add(new SavedPlaceView.SavedBy(rs.getObject(2, UUID.class), rs.getString(3)));
                });
        return groups.stream().map(group -> new SavedPlaceView(placeMap.get(group.placeId()),
                savedBy.getOrDefault(group.placeId(), List.of()), group.count())).toList();
    }

    private PlaceView requirePlace(UUID placeId) {
        return places.find(placeId).orElseThrow(() -> new BusinessException(CommonErrorCode.NOT_FOUND));
    }

    private boolean memberBelongsToTrip(UUID tripId, UUID memberId) {
        return jdbc.queryForObject("SELECT count(*) FROM trip_members WHERE trip_id=:tripId AND id=:memberId",
                new MapSqlParameterSource("tripId", tripId).addValue("memberId", memberId), Long.class) > 0;
    }

    private static void validateMemo(String memo) { if (memo != null && memo.length() > 2000) throw invalid(); }
    private static BusinessException invalid() { return new BusinessException(CommonErrorCode.VALIDATION_ERROR); }
    private record Group(UUID placeId, long count, Instant latest) {}

    private record Bounds(BigDecimal west, BigDecimal south, BigDecimal east, BigDecimal north) {
        static Bounds parse(String value) {
            if (value == null) return null;
            try {
                String[] parts = value.split(",", -1);
                if (parts.length != 4) throw new IllegalArgumentException();
                Bounds b = new Bounds(new BigDecimal(parts[0]), new BigDecimal(parts[1]),
                        new BigDecimal(parts[2]), new BigDecimal(parts[3]));
                if (b.west.compareTo(b.east) > 0 || b.south.compareTo(b.north) > 0
                        || b.west.compareTo(BigDecimal.valueOf(-180)) < 0 || b.east.compareTo(BigDecimal.valueOf(180)) > 0
                        || b.south.compareTo(BigDecimal.valueOf(-90)) < 0 || b.north.compareTo(BigDecimal.valueOf(90)) > 0)
                    throw new IllegalArgumentException();
                return b;
            } catch (NumberFormatException e) {
                throw invalid();
            } catch (IllegalArgumentException e) {
                throw invalid();
            }
        }
    }
}
