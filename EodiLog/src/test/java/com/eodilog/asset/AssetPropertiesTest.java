package com.eodilog.asset;

import static org.assertj.core.api.Assertions.assertThat;
import com.eodilog.global.storage.StorageProperties;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.ConfigurationPropertiesAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class AssetPropertiesTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(ConfigurationPropertiesAutoConfiguration.class))
            .withBean(StorageProperties.class, () -> new StorageProperties("test-bucket", "ap-northeast-2", null, null, Duration.ofMinutes(10), ""))
            .withBean(AssetProperties.class);

    @Test void validDefaultsStart() {
        runner.run(context -> assertThat(context).hasNotFailed().hasSingleBean(AssetProperties.class));
    }

    @Test void rejectsIncompleteLifetimeShorterThanSignedUrlAtStartup() {
        runner.withPropertyValues("app.assets.incomplete-ttl=5m").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasRootCauseMessage(
                    "app.assets.incomplete-ttl must not be shorter than app.storage.upload-url-ttl");
        });
    }
}
