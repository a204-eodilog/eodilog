package com.eodilog.asset;

import java.time.Duration;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import com.eodilog.global.storage.StorageProperties;

@Getter @Setter @Component
@ConfigurationProperties(prefix = "app.assets")
public class AssetProperties {
    @Autowired private StorageProperties storageProperties;
    private long maxBytes = 15 * 1024 * 1024;
    private long maxPixels = 40_000_000;
    private Duration batchTtl = Duration.ofHours(24);
    private Duration incompleteTtl = Duration.ofHours(24);
    private String imageMagick = "magick";
    private Duration conversionTimeout = Duration.ofSeconds(30);

    @PostConstruct void validate() {
        if (maxBytes < 1 || maxBytes > (Integer.MAX_VALUE - 1L) / 4 || maxPixels < 1
                || batchTtl.isNegative() || batchTtl.isZero() || incompleteTtl.isNegative() || incompleteTtl.isZero()
                || conversionTimeout.isNegative() || conversionTimeout.isZero())
            throw new IllegalArgumentException("Invalid asset size or expiry configuration");
        if (storageProperties != null && incompleteTtl.compareTo(storageProperties.uploadUrlTtl()) < 0)
            throw new IllegalArgumentException("app.assets.incomplete-ttl must not be shorter than app.storage.upload-url-ttl");
    }
}
