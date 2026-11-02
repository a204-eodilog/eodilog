package com.eodilog.global.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class ExceptionDiagnosticsTest {
	@Test
	void boundsFramesAndCauseDepthAndOmitsMessagesAndFileNames() {
		Throwable error = null;
		for (int index = 0; index < 6; index++) {
			var next = new IllegalStateException("secret-token-" + index, error);
			next.setStackTrace(IntStream.range(0, 12)
					.mapToObj(i -> new StackTraceElement("framework.Frame" + i, "invoke", "secret.java", i)).toArray(StackTraceElement[]::new));
			error = next;
		}
		String summary = ExceptionDiagnostics.summarize(error);
		assertThat(summary).contains("framework.Frame7.invoke:7").doesNotContain("Frame8", "secret");
		assertThat(summary.split("causedBy=")).hasSize(4);
	}

	@Test
	void stopsAtApplicationFrameAndHandlesCyclicCauses() {
		var first = new RuntimeException("secret-first");
		var second = new IllegalArgumentException("secret-second", first);
		first.initCause(second);
		first.setStackTrace(new StackTraceElement[] {
				new StackTraceElement("framework.Driver", "query", "Driver.java", 1),
				new StackTraceElement("com.eodilog.user.Store", "find", "Store.java", 2),
				new StackTraceElement("hidden.Frame", "hidden", "Hidden.java", 3) });
		second.setStackTrace(new StackTraceElement[0]);
		assertThat(ExceptionDiagnostics.summarize(first)).contains("framework.Driver.query:1",
				"com.eodilog.user.Store.find:2", "java.lang.IllegalArgumentException[unknown]")
				.doesNotContain("hidden.Frame", "secret");
	}
}
