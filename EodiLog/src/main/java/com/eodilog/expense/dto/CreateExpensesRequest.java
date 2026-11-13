package com.eodilog.expense.dto;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
@Schema(description="확인한 경비 1~10건의 원자적 등록 요청")
public record CreateExpensesRequest(@Schema(description="입력 순서대로 등록할 경비",requiredMode=Schema.RequiredMode.REQUIRED) List<CreateExpenseRequest> items) {}
