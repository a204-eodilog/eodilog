package com.eodilog.place.importer;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 공중화장실 공공데이터 CSV를 public_toilets에 넣는다(EODI-304).
 * 공급자 고유 번호가 없어 이름·좌표가 같으면 같은 화장실로 보고 주소·개방 시간만 고친다. 다시 넣어도 늘지 않는다.
 * 2025년 2월부터 원본에 좌표가 없어, 주소를 좌표로 바꿔 위도·경도 열을 붙인 파일을 넣는다. 옛 표준데이터의
 * WGS84위도·WGS84경도 열도 읽는다. 미개방 화장실은 건너뛴다
 */
@Service
public class PublicToiletImporter {

	private static final double MIN_LAT = 32.5, MAX_LAT = 39.5, MIN_LNG = 124.0, MAX_LNG = 132.5;

	private final JdbcTemplate jdbc;

	public PublicToiletImporter(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public long importPath(Path path, Charset charset) throws IOException {
		try (BufferedReader reader = Files.newBufferedReader(path, charset); var csv = new CsvRecords(reader)) {
			List<String> header = csv.next();
			if (header == null) return 0;
			Map<String, Integer> columns = new HashMap<>();
			for (int i = 0; i < header.size(); i++) columns.put(header.get(i).replace("﻿", "").strip(), i);
			Integer name = column(columns, "화장실명");
			Integer latitude = column(columns, "WGS84위도", "위도");
			Integer longitude = column(columns, "WGS84경도", "경도");
			if (name == null || latitude == null || longitude == null)
				throw new IOException("Missing toilet CSV column: 화장실명, 위도(WGS84위도), 경도(WGS84경도)");
			Integer road = column(columns, "소재지도로명주소");
			Integer lot = column(columns, "소재지지번주소");
			Integer open = column(columns, "개방시간");
			Integer openDetail = column(columns, "개방시간상세");
			List<Object[]> batch = new ArrayList<>(500);
			long total = 0;
			for (List<String> record; (record = csv.next()) != null;) {
				String title = field(record, name);
				Double lat = number(field(record, latitude));
				Double lng = number(field(record, longitude));
				if (title == null || lat == null || lng == null || lat < MIN_LAT || lat > MAX_LAT || lng < MIN_LNG || lng > MAX_LNG) continue;
				// 이용할 수 없는 화장실은 넣지 않는다
				String openTime = field(record, open);
				if ("미개방".equals(openTime)) continue;
				String detail = field(record, openDetail);
				String address = field(record, road);
				batch.add(new Object[] { cut(title, 200), cut(address != null ? address : field(record, lot), 500), lat, lng,
						cut(openTime == null ? detail : detail == null ? openTime : openTime + " " + detail, 200) });
				if (batch.size() == 500) {
					total += write(batch);
					batch.clear();
				}
			}
			return total + write(batch);
		}
	}

	private long write(List<Object[]> batch) {
		if (batch.isEmpty()) return 0;
		jdbc.batchUpdate("INSERT INTO public_toilets (id, name, address, latitude, longitude, open_time, updated_at)"
				+ " VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, now()) ON CONFLICT (name, latitude, longitude)"
				+ " DO UPDATE SET address = excluded.address, open_time = excluded.open_time, updated_at = excluded.updated_at", batch);
		return batch.size();
	}

	private static Integer column(Map<String, Integer> columns, String... names) {
		for (String key : names) if (columns.containsKey(key)) return columns.get(key);
		return null;
	}

	private static String field(List<String> row, Integer index) {
		if (index == null || index >= row.size()) return null;
		String value = row.get(index).strip();
		return value.isEmpty() ? null : value;
	}

	private static Double number(String value) {
		try {
			return value == null ? null : Double.valueOf(value);
		} catch (NumberFormatException e) {
			return null;
		}
	}

	private static String cut(String value, int max) {
		return value == null || value.length() <= max ? value : value.substring(0, max);
	}

}
