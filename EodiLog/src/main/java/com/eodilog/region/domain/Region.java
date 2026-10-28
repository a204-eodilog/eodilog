package com.eodilog.region.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 지역 코드 체계(Q-8)가 정해지기 전이라 생성 기능은 두지 않는다. 테스트 자료는 SQL로 넣는다
@Entity
@Table(name = "regions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Region {

	@Id
	private UUID id;

	private String code;

	private String name;

	private UUID parentId;

	private BigDecimal latitude;

	private BigDecimal longitude;

}
