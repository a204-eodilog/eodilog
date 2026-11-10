package com.eodilog.visit.candidate;

import com.eodilog.photo.PhotoEvidenceInvalidator;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.service.PlaceReader;
import java.sql.Array;
import java.sql.SQLException;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * visit_candidates 읽기와 사진 변경에 따른 무효화. 후보의 근거 사진은 모두 "같은 여행·후보 본인 업로드·삭제 안 됨"이어야 살아 있다.
 * 사진 이동·삭제 승인·장소 변경 때 PENDING 후보를 INVALIDATED로 바꾸고(version 증가), 다른 경로(본인 자료 일괄 삭제 등)로 근거가 사라진
 * PENDING 후보도 조회·확정 때 같은 기준(live)으로 무효로 본다.
 */
@Component
@RequiredArgsConstructor
public class VisitCandidateStore implements PhotoEvidenceInvalidator {

	static final String LIVE_EVIDENCE = """
			(exists(select 1 from visit_candidate_photos l where l.candidate_id=c.id)
			 and not exists(select 1 from visit_candidate_photos l left join photos p on p.id=l.photo_id and p.trip_id=c.trip_id
			                and p.uploader_member_id=c.member_id and p.deleted_at is null
			                where l.candidate_id=c.id and p.id is null))""";

	private static final String SELECT = "select c.id,c.member_id,c.place_id,c.visited_at,c.status,c.version,c.visit_id,"
			+ " array(select l.photo_id from visit_candidate_photos l where l.candidate_id=c.id order by l.photo_id) as photos,"
			+ LIVE_EVIDENCE + " as live from visit_candidates c ";

	private final JdbcTemplate jdbc;
	private final PlaceReader places;

	record Row(UUID id, UUID memberId, UUID placeId, java.time.Instant visitedAt, String status, long version, UUID visitId,
			List<UUID> photoIds, boolean live) {

		String effectiveStatus() {
			return "PENDING".equals(status) && !live ? "INVALIDATED" : status;
		}

	}

	/** 사진 이동·삭제 승인·장소 변경과 같은 트랜잭션에서 부른다. 그 사진을 근거로 둔 미확정 후보를 무효로 만든다. */
	@Override
	public void photosChanged(Collection<UUID> photoIds) {
		if (photoIds.isEmpty()) {
			return;
		}
		jdbc.update(con -> {
			var statement = con.prepareStatement("""
					update visit_candidates set status='INVALIDATED',version=version+1
					where status='PENDING' and id in (select candidate_id from visit_candidate_photos where photo_id=any(?))""");
			statement.setArray(1, uuids(con, photoIds));
			return statement;
		});
	}

	List<VisitCandidateResponse> findByJob(UUID jobId) {
		var rows = jdbc.query(SELECT + "where c.job_id=? order by c.visited_at,c.id", VisitCandidateStore::map, jobId);
		Map<UUID, PlaceView> found = places.findAll(rows.stream().map(Row::placeId).distinct().toList());
		return rows.stream().filter(row -> found.containsKey(row.placeId()))
				.map(row -> new VisitCandidateResponse(row.id(), row.memberId(), found.get(row.placeId()), row.visitedAt(),
						row.photoIds(), row.effectiveStatus(), row.version(), row.visitId()))
				.toList();
	}

	// 호출한 트랜잭션에서 후보 행을 잠근다
	java.util.Optional<Row> lock(UUID candidateId, UUID tripId) {
		jdbc.query("select id from visit_candidates where id=? and trip_id=? for update", (rs, row) -> rs.getObject(1), candidateId, tripId);
		return jdbc.query(SELECT + "where c.id=? and c.trip_id=?", VisitCandidateStore::map, candidateId, tripId).stream().findFirst();
	}

	private static Row map(java.sql.ResultSet rs, int row) throws SQLException {
		UUID[] photos = (UUID[]) rs.getArray("photos").getArray();
		return new Row(rs.getObject("id", UUID.class), rs.getObject("member_id", UUID.class), rs.getObject("place_id", UUID.class),
				rs.getTimestamp("visited_at").toInstant(), rs.getString("status"), rs.getLong("version"),
				rs.getObject("visit_id", UUID.class), List.of(photos), rs.getBoolean("live"));
	}

	private static Array uuids(java.sql.Connection con, Collection<UUID> ids) throws SQLException {
		return con.createArrayOf("uuid", ids.toArray());
	}

}
