package com.eodilog.global.common.error;

import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

// Throwable 자체는 메시지·SQL·토큰을 노출할 수 있어 로거 인자로 전달하지 않는다.
public final class ExceptionDiagnostics {
	private static final int MAX_CAUSES = 4;
	private static final int MAX_FRAMES = 8;
	private static final String APPLICATION_PACKAGE = "com.eodilog.";

	private ExceptionDiagnostics() {
	}

	public static String summarize(Throwable exception) {
		var causes = new ArrayList<String>();
		Set<Throwable> visited = Collections.newSetFromMap(new IdentityHashMap<>());
		for (Throwable current = exception; current != null && causes.size() < MAX_CAUSES && visited.add(current);
				current = current.getCause()) {
			var frames = new ArrayList<String>();
			for (StackTraceElement frame : current.getStackTrace()) {
				frames.add(frame.getClassName() + "." + frame.getMethodName() + ":" + frame.getLineNumber());
				if (frames.size() >= MAX_FRAMES || frame.getClassName().startsWith(APPLICATION_PACKAGE)) {
					break;
				}
			}
			causes.add(current.getClass().getName() + "[" + (frames.isEmpty() ? "unknown" : String.join(" <- ", frames)) + "]");
		}
		return String.join(" causedBy=", causes);
	}
}
