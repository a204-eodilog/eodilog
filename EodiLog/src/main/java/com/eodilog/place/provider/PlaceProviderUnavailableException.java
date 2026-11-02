package com.eodilog.place.provider;

/** 공급자 장애. 응답 원문·키를 메시지에 담지 않는다. */
public class PlaceProviderUnavailableException extends RuntimeException {

	public PlaceProviderUnavailableException(Throwable cause) {
		super("Place provider unavailable", cause);
	}

}
