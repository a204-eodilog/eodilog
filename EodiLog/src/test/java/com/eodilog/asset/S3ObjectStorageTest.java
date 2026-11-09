package com.eodilog.asset;

import static org.assertj.core.api.Assertions.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

/** Real S3 SDK HTTP against Adobe's S3 substitute. IAM/private bucket enforcement needs live AWS verification. */
@Testcontainers
class S3ObjectStorageTest {
    @Container static GenericContainer<?> s3 = new GenericContainer<>("adobe/s3mock:4.10.0")
            .withExposedPorts(9090).waitingFor(Wait.forListeningPort());

    @Test void presignedPutUsesDeclaredHeadersAndPrivateObjects() throws Exception {
        URI endpoint = URI.create("http://" + s3.getHost() + ":" + s3.getMappedPort(9090));
        String bucket = "photo-test";
        System.setProperty("aws.accessKeyId", "test-access");
        System.setProperty("aws.secretAccessKey", "test-secret-password");

        try (var client = S3Client.builder().endpointOverride(endpoint).region(Region.of("ap-northeast-2"))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test-access", "test-secret-password"))).build()) {
            var presigner = software.amazon.awssdk.services.s3.presigner.S3Presigner.builder().endpointOverride(endpoint)
                    .region(Region.of("ap-northeast-2")).serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                    .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test-access", "test-secret-password"))).build();
            var storage = new com.eodilog.global.storage.S3ObjectStorage(client, presigner, bucket);
            client.createBucket(b -> b.bucket(bucket));
            byte[] bytes = {1, 2, 3, 4};
            String url = storage.presignUpload("uploads/one", "image/jpeg", bytes.length, Duration.ofMinutes(10)).url();
            assertThat(url).contains("X-Amz-Expires=600", "X-Amz-Signature=", "X-Amz-SignedHeaders=");
            // Java HttpClient, like browsers, generates Content-Length from the body instead of setting it manually.
            try (var http = HttpClient.newHttpClient()) {
                var response = http.send(HttpRequest.newBuilder(URI.create(url)).header("Content-Type", "image/jpeg")
                        .PUT(HttpRequest.BodyPublishers.ofByteArray(bytes)).build(), HttpResponse.BodyHandlers.discarding());
                assertThat(response.statusCode()).isEqualTo(200);
            }
            assertThat(storage.read("uploads/one", 4)).containsExactly(bytes);
            assertThatThrownBy(() -> storage.read("uploads/one", 3)).hasMessageContaining(AssetErrorCode.INVALID_ASSET.message());
            storage.write("display/one", bytes, "image/png");
            assertThat(client.headObject(b -> b.bucket(bucket).key("display/one")).cacheControl()).isEqualTo("private, no-store");
            storage.delete("uploads/one"); storage.delete("uploads/one");
            assertThatThrownBy(() -> storage.read("uploads/one", 4)).hasMessageContaining(AssetErrorCode.INVALID_ASSET.message());
            storage.delete("display/one");
        } finally {
            System.clearProperty("aws.accessKeyId"); System.clearProperty("aws.secretAccessKey");
        }
    }
}
