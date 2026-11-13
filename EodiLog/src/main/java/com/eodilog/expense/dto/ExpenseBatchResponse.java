package com.eodilog.expense.dto;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
@Schema(description="전체 등록된 경비. 요청 순서와 동일")
public record ExpenseBatchResponse(@Schema(description="등록된 경비",requiredMode=Schema.RequiredMode.REQUIRED) List<ExpenseResponse> expenses) {}
