package com.eodilog.asset.domain;

// PENDING(업로드 대기) → READY(확인 완료) 또는 CANCELLED(업로드 취소). DELETING·DELETED는 사진 삭제 작업이 쓴다
public enum AssetStatus {
	PENDING, READY, DELETING, DELETED, CANCELLED
}
