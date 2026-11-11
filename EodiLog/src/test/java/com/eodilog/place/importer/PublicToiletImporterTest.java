package com.eodilog.place.importer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.eodilog.TestcontainersConfiguration;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** 공중화장실 표준데이터 CSV 적재(EODI-304). data.go.kr 파일처럼 EUC-KR로 쓴다 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class PublicToiletImporterTest {
	private static final Charset EUC_KR = Charset.forName("MS949");

	@Autowired PublicToiletImporter importer;
	@Autowired JdbcTemplate jdbc;
	@TempDir Path dir;

	@Test
	void importsValidRowsAndUpdatesTheSameToiletOnReimport() throws IOException {
		String tag = Long.toString(System.nanoTime(), 36);
		Path file = dir.resolve("toilets.csv");
		// 2025년 이후 원본 열 + 주소를 바꿔 붙인 위도·경도
		Files.writeString(file, String.join("\r\n",
				"관리번호,구분명,화장실명,소재지도로명주소,소재지지번주소,개방시간,개방시간상세,위도,경도",
				"1,공중화장실,\"공원, 화장실 " + tag + "\",서울특별시 중구 세종대로 110,,정시,09:00~18:00,37.5665,126.9780",
				"2,개방화장실,역 화장실 " + tag + ",,서울특별시 중구 태평로1가 31,상시,,37.5700,126.9800",
				"3,공중화장실,좌표 없음 " + tag + ",,,,,,",
				"4,공중화장실,바다 위 " + tag + ",,,,,0,0",
				"5,개방화장실,닫힌 화장실 " + tag + ",,,미개방,,37.5710,126.9810"), EUC_KR);
		assertThat(importer.importPath(file, EUC_KR)).isEqualTo(2);
		assertThat(jdbc.queryForList("SELECT address FROM public_toilets WHERE name LIKE ? ORDER BY latitude", String.class, "%" + tag))
				.containsExactly("서울특별시 중구 세종대로 110", "서울특별시 중구 태평로1가 31");
		assertThat(jdbc.queryForObject("SELECT open_time FROM public_toilets WHERE name = ?", String.class, "공원, 화장실 " + tag))
				.isEqualTo("정시 09:00~18:00");
		// 옛 표준데이터 열 이름(WGS84위도·WGS84경도)도 읽는다. 다시 넣어도 늘지 않고 개방 시간만 바뀐다
		Files.writeString(file, "화장실명,WGS84위도,WGS84경도,개방시간\r\n\"공원, 화장실 " + tag + "\",37.5665,126.9780,24시간", EUC_KR);
		importer.importPath(file, EUC_KR);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM public_toilets WHERE name LIKE ?", Integer.class, "%" + tag)).isEqualTo(2);
		assertThat(jdbc.queryForObject("SELECT open_time FROM public_toilets WHERE name = ?", String.class, "공원, 화장실 " + tag))
				.isEqualTo("24시간");
	}

	@Test
	void rejectsFilesWithoutRequiredColumns() throws IOException {
		Path file = dir.resolve("wrong.csv");
		Files.writeString(file, "이름,주소\r\n화장실,서울", EUC_KR);
		assertThatThrownBy(() -> importer.importPath(file, EUC_KR)).isInstanceOf(IOException.class).hasMessageContaining("화장실명");
	}
}
