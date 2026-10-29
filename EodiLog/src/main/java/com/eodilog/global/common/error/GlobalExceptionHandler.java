package com.eodilog.global.common.error;

import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.trace.TraceIdFilter;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.TypeMismatchException;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.validation.method.ParameterErrors;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.exc.UnrecognizedPropertyException;

// 컨트롤러 단계의 모든 예외를 API 명세 §2 공통 실패 형식으로 바꾼다. Security 필터 단계 오류는 ErrorResponseWriter가 맡는다
// 로그에 요청 본문·Authorization 헤더·토큰을 남기지 않는다
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

	private static final String UNKNOWN_FIELD_MESSAGE = "허용되지 않는 필드입니다.";
	private static final String INVALID_FORMAT_MESSAGE = "값의 형식이 올바르지 않습니다.";
	private static final String UNREADABLE_BODY_MESSAGE = "요청 본문을 읽을 수 없습니다.";

	@ExceptionHandler(BusinessException.class)
	public ResponseEntity<ErrorResponse> handleBusiness(BusinessException ex) {
		ErrorCode errorCode = ex.getErrorCode();
		if (errorCode.status().is5xxServerError()) {
			log.error("Business exception: {}", errorCode.code(), ex);
		}
		return toResponse(errorCode, ex.getMessage(), ex.getFields());
	}

	// 메서드 보안(@PreAuthorize 등)에서 던진 예외가 아래 Exception 처리기로 500이 되지 않게 한다
	@ExceptionHandler(AccessDeniedException.class)
	public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex) {
		return toResponse(CommonErrorCode.FORBIDDEN, CommonErrorCode.FORBIDDEN.message(), List.of());
	}

	@ExceptionHandler(AuthenticationException.class)
	public ResponseEntity<ErrorResponse> handleAuthentication(AuthenticationException ex) {
		return toResponse(CommonErrorCode.UNAUTHENTICATED, CommonErrorCode.UNAUTHENTICATED.message(), List.of());
	}

	// 예상하지 못한 예외는 내부 문구를 응답에 싣지 않는다
	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex) {
		log.error("Unhandled exception", ex);
		return toResponse(CommonErrorCode.INTERNAL_ERROR, CommonErrorCode.INTERNAL_ERROR.message(), List.of());
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		List<ErrorField> fields = new ArrayList<>();
		ex.getBindingResult().getFieldErrors()
				.forEach(error -> fields.add(new ErrorField(error.getField(), error.getDefaultMessage())));
		ex.getBindingResult().getGlobalErrors()
				.forEach(error -> fields.add(new ErrorField(error.getObjectName(), error.getDefaultMessage())));
		return handleExceptionInternal(ex, validationError(CommonErrorCode.VALIDATION_ERROR.message(), fields),
				headers, status, request);
	}

	@Override
	protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		List<ErrorField> fields = new ArrayList<>();
		for (ParameterValidationResult result : ex.getParameterValidationResults()) {
			if (result instanceof ParameterErrors parameterErrors) {
				for (FieldError error : parameterErrors.getFieldErrors()) {
					fields.add(new ErrorField(error.getField(), error.getDefaultMessage()));
				}
				continue;
			}
			String parameterName = result.getMethodParameter().getParameterName();
			for (MessageSourceResolvable error : result.getResolvableErrors()) {
				fields.add(new ErrorField(parameterName, error.getDefaultMessage()));
			}
		}
		return handleExceptionInternal(ex, validationError(CommonErrorCode.VALIDATION_ERROR.message(), fields),
				headers, status, request);
	}

	// 경로·쿼리 값의 형식 오류(예: UUID가 아닌 tripId, 없는 status 값)를 필드 단위로 알린다
	@Override
	protected ResponseEntity<Object> handleTypeMismatch(TypeMismatchException ex, HttpHeaders headers,
			HttpStatusCode status, WebRequest request) {
		List<ErrorField> fields = ex.getPropertyName() == null
				? List.of()
				: List.of(new ErrorField(ex.getPropertyName(), INVALID_FORMAT_MESSAGE));
		return handleExceptionInternal(ex, validationError(CommonErrorCode.VALIDATION_ERROR.message(), fields),
				headers, status, request);
	}

	// 알 수 없는 필드(spring.jackson.deserialization.fail-on-unknown-properties)와 형식 오류를 필드 단위로 알린다
	@Override
	protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
			if (cause instanceof UnrecognizedPropertyException unrecognized) {
				return handleExceptionInternal(ex, validationError(CommonErrorCode.VALIDATION_ERROR.message(),
						List.of(new ErrorField(fieldPath(unrecognized), UNKNOWN_FIELD_MESSAGE))), headers, status, request);
			}
			if (cause instanceof JacksonException jacksonException && !jacksonException.getPath().isEmpty()) {
				return handleExceptionInternal(ex, validationError(CommonErrorCode.VALIDATION_ERROR.message(),
						List.of(new ErrorField(fieldPath(jacksonException), INVALID_FORMAT_MESSAGE))), headers, status, request);
			}
		}
		return handleExceptionInternal(ex, validationError(UNREADABLE_BODY_MESSAGE, List.of()), headers, status, request);
	}

	// ResponseEntityExceptionHandler가 처리하는 나머지 MVC 예외(404 경로 없음, 405, 415 등)도 같은 형식으로 바꾼다
	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
			HttpStatusCode statusCode, WebRequest request) {
		Object errorBody = body instanceof ErrorResponse
				? body
				: ErrorResponse.of(CommonErrorCode.fromStatus(statusCode), TraceIdFilter.currentTraceId());
		if (statusCode.is5xxServerError()) {
			log.error("Spring MVC exception", ex);
		}
		return super.handleExceptionInternal(ex, errorBody, headers, statusCode, request);
	}

	private ResponseEntity<ErrorResponse> toResponse(ErrorCode errorCode, String message, List<ErrorField> fields) {
		return ResponseEntity.status(errorCode.status())
				.body(ErrorResponse.of(errorCode, message, fields, TraceIdFilter.currentTraceId()));
	}

	private ErrorResponse validationError(String message, List<ErrorField> fields) {
		return ErrorResponse.of(CommonErrorCode.VALIDATION_ERROR, message, fields, TraceIdFilter.currentTraceId());
	}

	// Jackson 경로를 "items[0].placeId" 형태로 만든다
	private String fieldPath(JacksonException ex) {
		StringBuilder path = new StringBuilder();
		for (JacksonException.Reference reference : ex.getPath()) {
			if (reference.getPropertyName() != null) {
				if (!path.isEmpty()) {
					path.append('.');
				}
				path.append(reference.getPropertyName());
			} else if (reference.getIndex() >= 0) {
				path.append('[').append(reference.getIndex()).append(']');
			}
		}
		return path.toString();
	}

}
