package com.eodilog.region.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 주소 앞부분(시·도 + 시·군·구)으로 지역 코드를 찾는다. 공급자가 지역 코드를 주지 않는 장소(네이버)에 쓴다.
 * 규칙은 DB 함수 region_code_for_address에 있다. 기존 장소 일괄 채우기 마이그레이션도 같은 함수를 쓴다.
 */
@Service
public class RegionAddressMatcher {

	private final JdbcTemplate jdbcTemplate;

	public RegionAddressMatcher(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	/** regions.code를 돌려준다. 주소가 없거나 맞는 지역이 없으면 null이다. */
	public String regionCode(String address) {
		if (address == null || address.isBlank()) {
			return null;
		}
		return jdbcTemplate.queryForObject("SELECT region_code_for_address(?)", String.class, address);
	}

}
