package com.eodilog.asset;

import static org.assertj.core.api.Assertions.*;
import com.drew.imaging.ImageMetadataReader;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.Test;

class ImageSanitizerTest {
    @Test @EnabledIfEnvironmentVariable(named = "IMAGE_MAGICK", matches = ".+")
    void actuallyDecodesHeicAndProducesMetadataFreeJpeg() throws Exception {
        var properties = new AssetProperties(); properties.setImageMagick(System.getenv("IMAGE_MAGICK"));
        byte[] fixture;
        try (var source = getClass().getResourceAsStream("/images/example.heic")) { fixture = source.readAllBytes(); }
        var result = new ImageSanitizer(properties).sanitize(fixture, "image/heic");
        assertThat(result.contentType()).isEqualTo("image/jpeg");
        var image = ImageIO.read(new ByteArrayInputStream(result.bytes()));
        assertThat(image.getWidth()).isEqualTo(1280); assertThat(image.getHeight()).isEqualTo(854);
        assertThat(ImageMetadataReader.readMetadata(new ByteArrayInputStream(result.bytes()))
                .getFirstDirectoryOfType(com.drew.metadata.exif.GpsDirectory.class)).isNull();
        // A plausible HEIC signature with no decodable pixels must fail through the same actual native decoder.
        assertThatThrownBy(() -> new ImageSanitizer(properties).sanitize(java.util.Arrays.copyOf(fixture, 128), "image/heic"))
                .hasMessageContaining(AssetErrorCode.INVALID_ASSET.message());
    }
    @Test void decodesAndReencodesImagesWithoutMetadata() throws Exception {
        var sanitizer = new ImageSanitizer(new AssetProperties());
        byte[] jpeg = image("jpeg");
        var result = sanitizer.sanitize(jpeg, "image/jpeg");
        assertThat(result.contentType()).isEqualTo("image/jpeg");
        assertThat(ImageIO.read(new ByteArrayInputStream(result.bytes())).getWidth()).isEqualTo(3);
        assertThat(result.metadata()).isEmpty();
        assertThat(sanitizer.sanitize(image("png"), "image/png").contentType()).isEqualTo("image/png");
        assertThatThrownBy(() -> sanitizer.sanitize(jpeg, "image/png")).hasMessageContaining(AssetErrorCode.INVALID_ASSET.message());
    }

    @Test void rejectsFakeHeicAndHeadersWithoutPixels() {
        var sanitizer = new ImageSanitizer(new AssetProperties());
        assertThatThrownBy(() -> sanitizer.sanitize(new byte[]{(byte)0xff, (byte)0xd8}, "image/jpeg"))
                .hasMessageContaining(AssetErrorCode.INVALID_ASSET.message());
        assertThatThrownBy(() -> sanitizer.sanitize("not a HEIC".getBytes(), "image/heic"))
                .hasMessageContaining(AssetErrorCode.INVALID_ASSET.message());
    }

    @Test void refusesImagesBeyondPixelBudget() throws Exception {
        var properties = new AssetProperties(); properties.setMaxPixels(2);
        assertThatThrownBy(() -> new ImageSanitizer(properties).sanitize(image("png"), "image/png"))
                .hasMessageContaining(AssetErrorCode.INVALID_ASSET.message());
    }

    @Test void rotatesPixelsBeforeStrippingExifOrientation() throws Exception {
        // Minimal little-endian EXIF IFD0: orientation=6 (90 degrees clockwise).
        byte[] exif = {0x45,0x78,0x69,0x66,0,0,0x49,0x49,0x2a,0,8,0,0,0,1,0,0x12,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0};
        var asymmetric = new BufferedImage(120, 80, BufferedImage.TYPE_INT_RGB);
        var graphics = asymmetric.createGraphics();
        graphics.setColor(java.awt.Color.RED); graphics.fillRect(0, 0, 60, 40);
        graphics.setColor(java.awt.Color.GREEN); graphics.fillRect(60, 0, 60, 40);
        graphics.setColor(java.awt.Color.BLUE); graphics.fillRect(0, 40, 60, 40);
        graphics.setColor(java.awt.Color.YELLOW); graphics.fillRect(60, 40, 60, 40); graphics.dispose();
        var encoded = new ByteArrayOutputStream(); ImageIO.write(asymmetric, "jpeg", encoded);
        byte[] original = encoded.toByteArray();
        var out = new ByteArrayOutputStream(); out.write(original, 0, 2);
        out.write(0xff); out.write(0xe1); out.write(0); out.write(exif.length + 2); out.write(exif);
        out.write(original, 2, original.length - 2);
        var result = new ImageSanitizer(new AssetProperties()).sanitize(out.toByteArray(), "image/jpeg");
        var pixels = ImageIO.read(new ByteArrayInputStream(result.bytes()));
        assertThat(pixels.getWidth()).isEqualTo(80); assertThat(pixels.getHeight()).isEqualTo(120);
        assertColor(pixels, 20, 30, java.awt.Color.BLUE);
        assertColor(pixels, 60, 30, java.awt.Color.RED);
        assertColor(pixels, 20, 90, java.awt.Color.YELLOW);
        assertColor(pixels, 60, 90, java.awt.Color.GREEN);
        assertThat(ImageMetadataReader.readMetadata(new ByteArrayInputStream(result.bytes()))
                .getFirstDirectoryOfType(com.drew.metadata.exif.ExifIFD0Directory.class)).isNull();
    }

    private static void assertColor(BufferedImage image, int x, int y, java.awt.Color expected) {
        var actual = new java.awt.Color(image.getRGB(x, y));
        assertThat(actual.getRed()).isCloseTo(expected.getRed(), within(30));
        assertThat(actual.getGreen()).isCloseTo(expected.getGreen(), within(30));
        assertThat(actual.getBlue()).isCloseTo(expected.getBlue(), within(30));
    }

    @Test void keepsGpsAndCaptureTimePrivateWhileRemovingThemFromDisplay() throws Exception {
        var tiff=java.nio.ByteBuffer.allocate(178).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        tiff.put((byte)'I').put((byte)'I').putShort((short)42).putInt(8);
        tiff.putShort((short)2);
        entry(tiff,0x8769,4,1,38); entry(tiff,0x8825,4,1,76); tiff.putInt(0);
        tiff.putShort((short)1); entry(tiff,0x9003,2,20,56); tiff.putInt(0);
        tiff.put("2026:11:06 12:00:00\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        tiff.putShort((short)4); entry(tiff,1,2,2,'N'); entry(tiff,2,5,3,130);
        entry(tiff,3,2,2,'E'); entry(tiff,4,5,3,154); tiff.putInt(0);
        for(int value:new int[]{37,30,0,126,15,0}) tiff.putInt(value).putInt(1);
        var exif=new ByteArrayOutputStream(); exif.write(new byte[]{'E','x','i','f',0,0}); exif.write(tiff.array());
        var original=image("jpeg"); var input=new ByteArrayOutputStream();
        input.write(original,0,2); input.write(0xff); input.write(0xe1);
        int length=exif.size()+2; input.write(length>>8); input.write(length&255); input.write(exif.toByteArray());
        input.write(original,2,original.length-2);
        var result=new ImageSanitizer(new AssetProperties()).sanitize(input.toByteArray(),"image/jpeg");
        assertThat(result.metadata()).containsEntry("latitude",37.5).containsEntry("longitude",126.25)
                .containsEntry("capturedAtLocal","2026:11:06 12:00:00");
        var metadata=ImageMetadataReader.readMetadata(new ByteArrayInputStream(result.bytes()));
        assertThat(metadata.getFirstDirectoryOfType(com.drew.metadata.exif.GpsDirectory.class)).isNull();
        assertThat(metadata.getFirstDirectoryOfType(com.drew.metadata.exif.ExifSubIFDDirectory.class)).isNull();
    }

    private static void entry(java.nio.ByteBuffer tiff,int tag,int type,int count,int offset) {
        tiff.putShort((short)tag).putShort((short)type).putInt(count).putInt(offset);
    }

    public static byte[] image(String format) throws Exception {
        var output = new ByteArrayOutputStream();
        var image = new BufferedImage(3, 2, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, 0x00ff00);
        ImageIO.write(image, format, output); return output.toByteArray();
    }
}
