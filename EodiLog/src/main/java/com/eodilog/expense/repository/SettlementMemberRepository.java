package com.eodilog.expense.repository;

import com.eodilog.expense.domain.SettlementMember;
import com.eodilog.expense.domain.SettlementMemberId;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SettlementMemberRepository extends JpaRepository<SettlementMember, SettlementMemberId> {

	List<SettlementMember> findAllBySettlementIdIn(Collection<UUID> settlementIds);

}
