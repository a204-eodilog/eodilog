package com.eodilog.invitation.repository;

import com.eodilog.invitation.domain.TripFriendInvitation;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TripFriendInvitationRepository extends JpaRepository<TripFriendInvitation, UUID> {

	// 받은 사람 본인의 초대만 찾는다. 수락은 이 값으로 여행 행을 먼저 잠근 뒤 초대 행을 잠가 다시 읽는다
	@Query("select i.tripId from TripFriendInvitation i where i.id = :id and i.inviteeUserId = :inviteeUserId")
	Optional<UUID> findTripIdForInvitee(@Param("id") UUID id, @Param("inviteeUserId") UUID inviteeUserId);

	Optional<TripFriendInvitation> findByIdAndInviteeUserId(UUID id, UUID inviteeUserId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select i from TripFriendInvitation i where i.id = :id and i.inviteeUserId = :inviteeUserId")
	Optional<TripFriendInvitation> findForUpdate(@Param("id") UUID id, @Param("inviteeUserId") UUID inviteeUserId);

	// 취소는 여행 행을 잠근 뒤 이 행도 잠가, 동시에 들어온 거절(초대 행만 잠금)을 덮어쓰지 않게 한다
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select i from TripFriendInvitation i where i.id = :id and i.tripId = :tripId")
	Optional<TripFriendInvitation> findByIdAndTripIdForUpdate(@Param("id") UUID id, @Param("tripId") UUID tripId);

	// 대기 초대는 여행·받는 사람마다 하나다(부분 유니크 인덱스). 기간이 지났어도 PENDING이면 찾는다.
	// 다시 보낼 때 기간 지난 대기 초대를 CANCELED로 바꾸므로 거절과 겹치지 않게 잠가 읽는다
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select i from TripFriendInvitation i where i.tripId = :tripId and i.inviteeUserId = :inviteeUserId"
			+ " and i.status = com.eodilog.invitation.domain.TripFriendInvitationStatus.PENDING")
	Optional<TripFriendInvitation> findPending(@Param("tripId") UUID tripId, @Param("inviteeUserId") UUID inviteeUserId);

	// 지금 수락할 수 있는 이 여행의 대기 초대. 기간이 남았고 초대한 멤버가 아직 여행에 있다
	@Query(value = """
			select i.* from trip_friend_invitations i
			join trip_members m on m.id = i.inviter_member_id and m.status = 'ACTIVE'
			where i.trip_id = :tripId and i.status = 'PENDING' and i.expires_at > :now""", nativeQuery = true)
	List<TripFriendInvitation> findUsablePendingByTrip(@Param("tripId") UUID tripId, @Param("now") Instant now);

	// 받은 사람이 지금 수락할 수 있는 초대. 삭제된 여행·초대한 멤버가 나간 초대·링크 등으로 이미 참여한 여행은 뺀다
	@Query(value = """
			select i.* from trip_friend_invitations i
			join trips t on t.id = i.trip_id and t.deleted_at is null
			join trip_members m on m.id = i.inviter_member_id and m.status = 'ACTIVE'
			where i.invitee_user_id = :inviteeUserId and i.status = 'PENDING' and i.expires_at > :now
			  and not exists (select 1 from trip_members x
			                  where x.trip_id = i.trip_id and x.user_id = i.invitee_user_id and x.status = 'ACTIVE')
			order by i.created_at desc, i.id desc""", nativeQuery = true)
	List<TripFriendInvitation> findUsablePendingByInvitee(@Param("inviteeUserId") UUID inviteeUserId,
			@Param("now") Instant now);

}
