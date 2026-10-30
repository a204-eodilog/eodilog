package com.eodilog.invitation.repository;

import com.eodilog.invitation.domain.TripInvitation;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TripInvitationRepository extends JpaRepository<TripInvitation, UUID> {

	Optional<TripInvitation> findByTokenHash(String tokenHash);

	// 여행 행 잠금을 잡은 뒤 DB에서 다시 확인한다. 잠금을 기다리는 동안 새 발급으로 무효화됐을 수 있다
	boolean existsByIdAndRevokedAtIsNull(UUID id);

	// 새 링크를 발급하기 전에 같은 여행의 살아 있는 링크를 모두 막는다. 이미 만료된 링크는 만료로 남겨 사유가 섞이지 않게 한다
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("update TripInvitation i set i.revokedAt = :now"
			+ " where i.tripId = :tripId and i.revokedAt is null and i.expiresAt > :now")
	int revokeAllByTripId(@Param("tripId") UUID tripId, @Param("now") Instant now);

}
