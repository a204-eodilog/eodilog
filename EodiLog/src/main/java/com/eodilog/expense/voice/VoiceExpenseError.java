package com.eodilog.expense.voice;
import com.eodilog.global.common.error.ErrorCode;
import org.springframework.http.HttpStatus;
public enum VoiceExpenseError implements ErrorCode {
    INPUT_LIMIT_EXCEEDED(HttpStatus.UNPROCESSABLE_CONTENT,"녹음은 60초·10MiB 이내로 보내 주세요."),
    AUDIO_VALIDATOR_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE,"음성 파일 검사 기능을 사용할 수 없습니다.");
    private final HttpStatus status; private final String message;
    VoiceExpenseError(HttpStatus status,String message){this.status=status;this.message=message;}
    public HttpStatus status(){return status;} public String message(){return message;} public String code(){return name();}
}
