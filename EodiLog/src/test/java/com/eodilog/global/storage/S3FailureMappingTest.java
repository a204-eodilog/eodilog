package com.eodilog.global.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import com.eodilog.asset.AssetErrorCode;
import com.eodilog.global.common.error.BusinessException;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

class S3FailureMappingTest {
    @Test void mapsSdkFailuresAcrossEveryOperationWithoutProviderMessages() {
        var client=mock(S3Client.class); var presigner=mock(S3Presigner.class);
        var failure=SdkClientException.create("https://private.example/?credential=do-not-log");
        when(client.headObject(any(HeadObjectRequest.class))).thenThrow(failure);
        when(client.getObject(any(GetObjectRequest.class))).thenThrow(failure);
        when(client.getObjectAsBytes(any(GetObjectRequest.class))).thenThrow(failure);
        when(client.putObject(any(PutObjectRequest.class),any(RequestBody.class))).thenThrow(failure);
        when(client.deleteObject(any(DeleteObjectRequest.class))).thenThrow(failure);
        when(presigner.presignPutObject(any(PutObjectPresignRequest.class))).thenThrow(failure);
        var storage=new S3ObjectStorage(client,presigner,"test-bucket");
        List<Runnable> calls=List.of(()->storage.head("key"),()->storage.open("key"),()->storage.readPrefix("key",4),
                ()->storage.write("key",new byte[]{1},"image/png"),()->storage.delete("key"),
                ()->storage.presignUpload("key","image/png",1,Duration.ofMinutes(10)));
        for(var call:calls) assertThatThrownBy(call::run).isInstanceOfSatisfying(BusinessException.class, ex->{
            assertThat(ex.getErrorCode()).isEqualTo(AssetErrorCode.STORAGE_UNAVAILABLE);
            assertThat(ex.getErrorCode().status().value()).isEqualTo(503);
            assertThat(ex.getMessage()).doesNotContain("private.example","credential","do-not-log");
            assertThat(ex.getCause()).isNull();
        });
    }

    @Test void missingObjectHeadStillReturnsEmpty() {
        var client=mock(S3Client.class);
        when(client.headObject(any(HeadObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(404).message("provider-message").build());
        assertThat(new S3ObjectStorage(client,mock(S3Presigner.class),"test-bucket").head("missing")).isEmpty();
    }
}
