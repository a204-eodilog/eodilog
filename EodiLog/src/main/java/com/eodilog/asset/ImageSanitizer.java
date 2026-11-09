package com.eodilog.asset;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.GpsDirectory;
import com.eodilog.global.common.error.BusinessException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import javax.imageio.ImageIO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component @RequiredArgsConstructor
public class ImageSanitizer {
    private final AssetProperties properties;

    public record Result(byte[] bytes, String contentType, Map<String, Object> metadata) { }

    public Result sanitize(byte[] input, String declaredType) {
        try {
            Exif extracted = metadata(input);
            byte[] decodedInput = "image/heic".equals(declaredType) ? convertHeic(input) : input;
            String expected = "image/png".equals(declaredType) ? "png" : "JPEG";
            try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(decodedInput))) {
                var readers = ImageIO.getImageReaders(stream);
                if (!readers.hasNext()) throw invalid();
                var reader = readers.next();
                try {
                    reader.setInput(stream, true, true);
                    if (!reader.getFormatName().equalsIgnoreCase(expected)) throw invalid();
                    int width = reader.getWidth(0), height = reader.getHeight(0);
                    if (width < 1 || height < 1 || (long) width * height > properties.getMaxPixels()) throw invalid();
                    BufferedImage image = reader.read(0); // A header/signature alone can never become READY.
                    int orientation = "image/heic".equals(declaredType) ? 1 : extracted.orientation();
                    int outputWidth = orientation >= 5 ? height : width;
                    int outputHeight = orientation >= 5 ? width : height;
                    var pixels = new BufferedImage(outputWidth, outputHeight, expected.equals("png")
                            ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
                    var graphics = pixels.createGraphics();
                    try {
                        java.awt.geom.AffineTransform transform = switch (orientation) {
                            case 2 -> new java.awt.geom.AffineTransform(-1, 0, 0, 1, width, 0);
                            case 3 -> new java.awt.geom.AffineTransform(-1, 0, 0, -1, width, height);
                            case 4 -> new java.awt.geom.AffineTransform(1, 0, 0, -1, 0, height);
                            case 5 -> new java.awt.geom.AffineTransform(0, 1, 1, 0, 0, 0);
                            case 6 -> new java.awt.geom.AffineTransform(0, 1, -1, 0, height, 0);
                            case 7 -> new java.awt.geom.AffineTransform(0, -1, -1, 0, height, width);
                            case 8 -> new java.awt.geom.AffineTransform(0, -1, 1, 0, 0, width);
                            default -> new java.awt.geom.AffineTransform();
                        };
                        graphics.drawImage(image, transform, null);
                    } finally { graphics.dispose(); }
                    var output = new ByteArrayOutputStream();
                    if (!ImageIO.write(pixels, expected, output)) throw invalid();
                    if (output.size() > properties.getMaxBytes() * 4) throw invalid();
                    return new Result(output.toByteArray(), expected.equals("png") ? "image/png" : "image/jpeg", extracted.values());
                } finally { reader.dispose(); }
            }
        } catch (BusinessException ex) { throw ex; }
        catch (Exception ex) { throw invalid(); }
    }

    private byte[] convertHeic(byte[] input) throws Exception {
        // Restrict the container to HEIC before invoking a native decoder (never interpret SVG/PDF/delegates).
        if (input.length < 16 || !new String(input, 4, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("ftyp")) throw invalid();
        String brand = new String(input, 8, 4, java.nio.charset.StandardCharsets.US_ASCII);
        if (!java.util.Set.of("heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1").contains(brand)) throw invalid();
        long ftypSize = Integer.toUnsignedLong(java.nio.ByteBuffer.wrap(input, 0, 4).getInt());
        if (ftypSize < 16 || ftypSize > input.length || ftypSize > 1024) throw invalid();
        boolean hevcBrand = java.util.Set.of("heic", "heix", "heim", "heis", "hevc", "hevx").contains(brand);
        for (int offset = 16; offset + 4 <= ftypSize; offset += 4) {
            String compatible = new String(input, offset, 4, java.nio.charset.StandardCharsets.US_ASCII);
            hevcBrand |= java.util.Set.of("heic", "heix", "heim", "heis", "hevc", "hevx").contains(compatible);
        }
        if (!hevcBrand) throw invalid();
        Path directory = Files.createTempDirectory("eodilog-heic-");
        Path source = directory.resolve("source.heic"), target = directory.resolve("display.jpg"), dimensions = directory.resolve("dimensions.txt");
        Process process = null;
        try {
            Files.write(source, input);
            try {
                // Header-only probe checks primary image dimensions before asking libheif for decoded pixels.
                process = new ProcessBuilder(properties.getImageMagick(), "-limit", "memory", "256MiB",
                        "-limit", "map", "256MiB", "-limit", "disk", "256MiB", "-ping", "heic:" + source + "[0]",
                        "-format", "%w %h", "info:").redirectOutput(dimensions.toFile())
                        .redirectError(ProcessBuilder.Redirect.DISCARD).start();
                await(process);
                if (!Files.isRegularFile(dimensions) || Files.size(dimensions) > 128) throw invalid();
                String[] size = Files.readString(dimensions).trim().split("\\s+");
                if (size.length != 2) throw invalid();
                long width = Long.parseLong(size[0]), height = Long.parseLong(size[1]);
                if (width < 1 || height < 1 || width > properties.getMaxPixels() / height) throw invalid();
                process = new ProcessBuilder(properties.getImageMagick(), "-limit", "memory", "256MiB",
                        "-limit", "map", "256MiB", "-limit", "disk", "256MiB", "-limit", "area",
                        Long.toString(properties.getMaxPixels()), "heic:" + source + "[0]", "-auto-orient", "-strip",
                        "jpeg:" + target).redirectOutput(ProcessBuilder.Redirect.DISCARD)
                        .redirectError(ProcessBuilder.Redirect.DISCARD).start();
            } catch (java.io.IOException ex) { throw new BusinessException(AssetErrorCode.IMAGE_PROCESSOR_UNAVAILABLE); }
            await(process);
            if (!Files.isRegularFile(target)
                    || Files.size(target) > properties.getMaxBytes() * 4) throw invalid();
            return Files.readAllBytes(target);
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly().waitFor();
            Files.deleteIfExists(source);
            Files.deleteIfExists(target);
            Files.deleteIfExists(dimensions);
            Files.deleteIfExists(directory);
        }
    }

    private void await(Process process) throws InterruptedException {
        if (!process.waitFor(properties.getConversionTimeout().toMillis(), TimeUnit.MILLISECONDS)) {
            process.destroyForcibly().waitFor();
            throw new BusinessException(AssetErrorCode.IMAGE_PROCESSOR_UNAVAILABLE);
        }
        if (process.exitValue() != 0) throw invalid();
    }

    private record Exif(Map<String, Object> values, int orientation) { }
    private Exif metadata(byte[] input) {
        Map<String, Object> values = new LinkedHashMap<>();
        int orientation = 1;
        try {
            var metadata = ImageMetadataReader.readMetadata(new ByteArrayInputStream(input));
            var ifd = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            if (ifd != null && ifd.getInteger(ExifIFD0Directory.TAG_ORIENTATION) != null) {
                int found = ifd.getInteger(ExifIFD0Directory.TAG_ORIENTATION);
                if (found >= 1 && found <= 8) orientation = found;
            }
            var exif = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
            if (exif != null && exif.getString(ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL) != null)
                values.put("capturedAtLocal", exif.getString(ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL));
            var gps = metadata.getFirstDirectoryOfType(GpsDirectory.class);
            if (gps != null && gps.getGeoLocation() != null) {
                values.put("latitude", gps.getGeoLocation().getLatitude());
                values.put("longitude", gps.getGeoLocation().getLongitude());
            }
        } catch (Exception ignored) { /* Malformed optional metadata never bypasses the mandatory pixel decode. */ }
        return new Exif(values, orientation);
    }

    private BusinessException invalid() { return new BusinessException(AssetErrorCode.INVALID_ASSET); }
}
