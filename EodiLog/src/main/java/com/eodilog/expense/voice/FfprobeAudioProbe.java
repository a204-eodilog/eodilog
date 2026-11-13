package com.eodilog.expense.voice;
import com.eodilog.global.common.error.*;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import tools.jackson.databind.json.JsonMapper;
@Component @RequiredArgsConstructor @EnableConfigurationProperties(VoiceExpenseProperties.class)
public class FfprobeAudioProbe implements AudioProbe {
    private final VoiceExpenseProperties properties; private final JsonMapper json;
    @Override public void validate(byte[] audio) {
        Path input=null; Process process=null;
        try {
            input=Files.createTempFile("voice-expense-", ".m4a");
            Files.write(input,audio);
            try {
                process=new ProcessBuilder(properties.ffprobeCommand(),"-v","error","-protocol_whitelist","file","-f","mov","-show_entries",
                    "format=duration,format_name:format_tags=major_brand:stream=codec_type,codec_name,sample_rate,channels",
                    "-of","json",input.toString()).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            } catch(IOException missing) { throw new BusinessException(VoiceExpenseError.AUDIO_VALIDATOR_UNAVAILABLE); }
            final Process running=process;
            byte[] output;
            try(var reader=Executors.newVirtualThreadPerTaskExecutor()) {
                var future=reader.submit(()->running.getInputStream().readNBytes(65537));
                if(!running.waitFor(properties.probeTimeout().toMillis(),TimeUnit.MILLISECONDS)) {
                    running.destroyForcibly(); throw invalid();
                }
                output=future.get(1,TimeUnit.SECONDS);
            }
            if(process.exitValue()!=0 || output.length>65536) throw invalid();
            validateMetadata(json.readTree(output));
        } catch(BusinessException ex){throw ex;}
        catch(InterruptedException ex){Thread.currentThread().interrupt();throw invalid();}
        catch(Exception ex){throw invalid();}
        finally {
            if(process!=null && process.isAlive())process.destroyForcibly();
            if(input!=null)try{Files.deleteIfExists(input);}catch(IOException ignored){}
        }
    }
    void validateMetadata(tools.jackson.databind.JsonNode data) {
        try {
            var streams=data.path("streams");var format=data.path("format");
            if(!streams.isArray() || streams.size()!=1)throw invalid();
            var stream=streams.get(0);
            String brand=format.path("tags").path("major_brand").asString("").strip();
            if(!"audio".equals(stream.path("codec_type").asString()) || !"aac".equals(stream.path("codec_name").asString())
                || !format.path("format_name").asString("").contains("mp4")
                || !Set.of("M4A","isom","iso2","mp41","mp42").contains(brand)
                || !"44100".equals(stream.path("sample_rate").asString()) || stream.path("channels").asInt()!=1)throw invalid();
            double seconds=Double.parseDouble(format.path("duration").asString());
            if(!Double.isFinite(seconds) || seconds<=0)throw invalid();
            if(seconds>60)throw new BusinessException(VoiceExpenseError.INPUT_LIMIT_EXCEEDED);
        } catch(BusinessException ex) { throw ex; }
        catch(RuntimeException ex) { throw invalid(); }
    }
    private BusinessException invalid(){return new BusinessException(CommonErrorCode.VALIDATION_ERROR,
        "M4A/AAC 모노 44,100Hz 녹음을 보내 주세요.",List.of(new ErrorField("audio","지원하지 않는 녹음입니다.")));}
}
