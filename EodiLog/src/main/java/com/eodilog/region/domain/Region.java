package com.eodilog.region.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 법정동 기반 시드 지역. 테스트 문자열 코드와 기존 참조도 유지한다.
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
