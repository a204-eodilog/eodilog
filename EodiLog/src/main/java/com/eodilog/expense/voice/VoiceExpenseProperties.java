package com.eodilog.expense.voice;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
@ConfigurationProperties("app.voice-expense")
public record VoiceExpenseProperties(@DefaultValue("ffprobe") String ffprobeCommand,
        @DefaultValue("3s") Duration probeTimeout, @DefaultValue("true") boolean cleanupEnabled) {
    public VoiceExpenseProperties {
        if(ffprobeCommand == null || ffprobeCommand.isBlank() || probeTimeout == null || probeTimeout.isNegative()
                || probeTimeout.isZero() || probeTimeout.compareTo(Duration.ofSeconds(10)) > 0) throw new IllegalArgumentException("Invalid audio probe configuration");
    }
}
