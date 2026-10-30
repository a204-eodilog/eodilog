package com.eodilog.invitation.repository;

import com.eodilog.invitation.domain.TripInvitation;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TripInvitationRepository extends JpaRepository<TripInvitation, UUID> {

	Optional<TripInvitation> findByTokenHash(String tokenHash);

}
