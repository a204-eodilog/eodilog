package com.eodilog.expense.voice;

import static org.assertj.core.api.Assertions.*;
import com.eodilog.global.common.error.BusinessException;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class FfprobeAudioProbeTest {
    final JsonMapper json=JsonMapper.builder().build();
    final FfprobeAudioProbe probe=new FfprobeAudioProbe(
        new VoiceExpenseProperties("nonexistent-ffprobe-voice-test",Duration.ofSeconds(1),false),json);
    String metadata(String codec,int channels,String rate,String seconds) {
        return """
            {"streams":[{"codec_type":"audio","codec_name":"%s","channels":%d,"sample_rate":"%s"}],
             "format":{"format_name":"mov,mp4,m4a,3gp,3g2,mj2","duration":"%s","tags":{"major_brand":"M4A "}}}
            """.formatted(codec,channels,rate,seconds);
    }
    @Test void acceptsContractAndEnforcesActualMediaDurationAndEncoding() {
        assertThatCode(()->probe.validateMetadata(json.readTree(metadata("aac",1,"44100","60.000")))).doesNotThrowAnyException();
        assertThatThrownBy(()->probe.validateMetadata(json.readTree(metadata("aac",1,"44100","60.001"))))
            .isInstanceOfSatisfying(BusinessException.class,e->assertThat(e.getErrorCode()).isEqualTo(VoiceExpenseError.INPUT_LIMIT_EXCEEDED));
        for(String value:new String[]{metadata("mp3",1,"44100","1"),metadata("aac",2,"44100","1"),
                metadata("aac",1,"48000","1"),metadata("aac",1,"44100","NaN"),metadata("aac",1,"44100","0"),"{}"})
            assertThatThrownBy(()->probe.validateMetadata(json.readTree(value))).isInstanceOf(BusinessException.class);
    }
    @Test void missingExecutableIsServiceUnavailableRatherThanInvalidAudio() {
        assertThatThrownBy(()->probe.validate(new byte[]{1,2,3})).isInstanceOfSatisfying(BusinessException.class,
            e->assertThat(e.getErrorCode()).isEqualTo(VoiceExpenseError.AUDIO_VALIDATOR_UNAVAILABLE));
    }
}
