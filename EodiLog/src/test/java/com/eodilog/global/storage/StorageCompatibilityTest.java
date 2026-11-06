package com.eodilog.global.storage;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;

class StorageCompatibilityTest {
    @Test void deployedStorageNamesWinAndLegacyAliasesStillResolve() {
        var yaml=new YamlPropertiesFactoryBean(); yaml.setResources(new ClassPathResource("application.yaml"));
        var defaults=yaml.getObject();
        var env=new MockEnvironment(); defaults.forEach((key,value)->env.withProperty(key.toString(),value.toString()));
        assertThat(env.getProperty("app.storage.upload-url-ttl")).isEqualTo("10m");
        assertThat(env.getProperty("app.assets.max-bytes",Long.class)).isEqualTo(15L*1024*1024);
        env.withProperty("S3_BUCKET","alias-bucket").withProperty("AWS_REGION","alias-region")
                .withProperty("S3_ENDPOINT","http://alias.example").withProperty("ASSET_UPLOAD_TTL","15m").withProperty("ASSET_MAX_BYTES","20971520");
        assertThat(env.getProperty("app.storage.bucket")).isEqualTo("alias-bucket");
        assertThat(env.getProperty("app.storage.region")).isEqualTo("alias-region");
        assertThat(env.getProperty("app.storage.endpoint")).isEqualTo("http://alias.example");
        assertThat(env.getProperty("app.storage.upload-url-ttl")).isEqualTo("15m");
        assertThat(env.getProperty("app.assets.max-bytes",Long.class)).isEqualTo(20971520);
        env.withProperty("STORAGE_BUCKET","primary-bucket").withProperty("STORAGE_REGION","primary-region")
                .withProperty("STORAGE_ENDPOINT","http://primary.example").withProperty("STORAGE_UPLOAD_URL_TTL","10m").withProperty("STORAGE_MAX_BYTES","15728640");
        assertThat(env.getProperty("app.storage.bucket")).isEqualTo("primary-bucket");
        assertThat(env.getProperty("app.storage.region")).isEqualTo("primary-region");
        assertThat(env.getProperty("app.storage.endpoint")).isEqualTo("http://primary.example");
        assertThat(env.getProperty("app.storage.upload-url-ttl")).isEqualTo("10m");
        assertThat(env.getProperty("app.assets.max-bytes",Long.class)).isEqualTo(15728640);
    }
}
