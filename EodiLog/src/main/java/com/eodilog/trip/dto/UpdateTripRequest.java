package com.eodilog.trip.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

// 명세 §4 PATCH /trips/{tripId}. 생략한 필드는 유지하고, 기간은 null로 비울 수 있다
// record는 "생략"과 "null"을 구분하지 못하므로 setter가 불렸는지로 보낸 필드를 기록한다
public class UpdateTripRequest {

	@Schema(description = "조회한 여행의 version. 그 사이 다른 수정이 있으면 409", example = "1",
			requiredMode = Schema.RequiredMode.REQUIRED)
	private Long expectedVersion;

	@Schema(description = "새 여행 이름. 생략하면 유지. 앞뒤 공백 제거 후 1~200자", example = "제주 4박 5일")
	private String title;

	@Schema(description = "새 시작일. 생략하면 유지, null이면 비움. 종료일과 함께 있거나 함께 비어야 한다",
			example = "2026-11-01", nullable = true)
	private LocalDate startDate;

	@Schema(description = "새 종료일. 생략하면 유지, null이면 비움", example = "2026-11-05", nullable = true)
	private LocalDate endDate;

	@Schema(description = "여행지 지역 ID 전체 목록(순서 유지). 생략하면 유지, []이면 모두 비움",
			example = "[\"3f2b8c1e-5d4a-4e7b-9c1f-2a6d8e0b7c45\"]")
	private List<UUID> destinationRegionIds;

	private boolean titleSent;
	private boolean startDateSent;
	private boolean endDateSent;
	private boolean destinationRegionIdsSent;

	public Long getExpectedVersion() {
		return expectedVersion;
	}

	public String getTitle() {
		return title;
	}

	public LocalDate getStartDate() {
		return startDate;
	}

	public LocalDate getEndDate() {
		return endDate;
	}

	public List<UUID> getDestinationRegionIds() {
		return destinationRegionIds;
	}

	@JsonSetter("expectedVersion")
	public void setExpectedVersion(Long expectedVersion) {
		this.expectedVersion = expectedVersion;
	}

	@JsonSetter("title")
	public void setTitle(String title) {
		this.title = title;
		this.titleSent = true;
	}

	@JsonSetter("startDate")
	public void setStartDate(LocalDate startDate) {
		this.startDate = startDate;
		this.startDateSent = true;
	}

	@JsonSetter("endDate")
	public void setEndDate(LocalDate endDate) {
		this.endDate = endDate;
		this.endDateSent = true;
	}

	@JsonSetter("destinationRegionIds")
	public void setDestinationRegionIds(List<UUID> destinationRegionIds) {
		this.destinationRegionIds = destinationRegionIds;
		this.destinationRegionIdsSent = true;
	}

	public boolean sentTitle() {
		return titleSent;
	}

	public boolean sentStartDate() {
		return startDateSent;
	}

	public boolean sentEndDate() {
		return endDateSent;
	}

	public boolean sentDestinationRegionIds() {
		return destinationRegionIdsSent;
	}

}
