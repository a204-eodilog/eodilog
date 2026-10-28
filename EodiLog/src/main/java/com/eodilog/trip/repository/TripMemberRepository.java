package com.eodilog.trip.repository;

import com.eodilog.trip.domain.TripMember;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TripMemberRepository extends JpaRepository<TripMember, UUID> {
}
