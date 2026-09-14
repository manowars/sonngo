package com.sonngo.docscan.scan

import android.graphics.Bitmap
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Các chế độ hậu xử lý ảnh scan. */
enum class ScanFilter {
    /** Giữ nguyên màu gốc. */
    ORIGINAL,

    /** Làm trắng nền, tăng tương phản chữ — giống chế độ "magic color". */
    MAGIC,

    /** Ảnh xám đã cân bằng sáng. */
    GRAYSCALE,

    /** Đen trắng hai mức, phù hợp văn bản và fax. */
    BLACK_WHITE,

    /** Giữ màu nhưng làm sáng và bớt bóng đổ. */
    SOFT
}

/**
 * Bộ lọc ảnh scan. Tất cả đều chạy trên IntArray pixel nên không cần RenderScript.
 */
object ImageFilters {

    /**
     * Áp dụng [filter] rồi chỉnh [brightness] (-100..100) và [contrast] (-100..100).
     */
    fun apply(
        source: Bitmap,
        filter: ScanFilter,
        brightness: Int = 0,
        contrast: Int = 0
    ): Bitmap {
        val width = source.width
        val height = source.height
        val pixels = IntArray(width * height)
        source.getPixels(pixels, 0, width, 0, 0, width, height)

        when (filter) {
            ScanFilter.ORIGINAL -> Unit
            ScanFilter.MAGIC -> magicColor(pixels, width, height, strength = 1f)
            ScanFilter.SOFT -> magicColor(pixels, width, height, strength = 0.55f)
            ScanFilter.GRAYSCALE -> grayscale(pixels, width, height)
            ScanFilter.BLACK_WHITE -> blackWhite(pixels, width, height)
        }

        if (brightness != 0 || contrast != 0) {
            adjust(pixels, brightness, contrast)
        }

        return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    }

    /**
     * Chia ảnh cho phiên bản làm mờ mạnh của chính nó để loại bóng đổ và
     * làm nền giấy trắng đều, sau đó kéo giãn tương phản.
     */
    private fun magicColor(pixels: IntArray, width: Int, height: Int, strength: Float) {
        val radius = max(8, min(width, height) / 12)
        val background = channelBackground(pixels, width, height, radius)

        for (i in pixels.indices) {
            val c = pixels[i]
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF
            val nr = dodge(r, background.red[i], strength)
            val ng = dodge(g, background.green[i], strength)
            val nb = dodge(b, background.blue[i], strength)
            pixels[i] = (0xFF shl 24) or (nr shl 16) or (ng shl 8) or nb
        }
        stretchContrast(pixels, lowPercentile = 0.01f, highPercentile = 0.99f)
        saturate(pixels, 1f + 0.25f * strength)
    }

    private fun dodge(value: Int, background: Int, strength: Float): Int {
        val normalized = (value * 255f / max(1, background)).coerceIn(0f, 255f)
        val mixed = value + (normalized - value) * strength
        return mixed.roundToInt().coerceIn(0, 255)
    }

    private class Background(val red: IntArray, val green: IntArray, val blue: IntArray)

    private fun channelBackground(pixels: IntArray, width: Int, height: Int, radius: Int): Background {
        val r = IntArray(pixels.size)
        val g = IntArray(pixels.size)
        val b = IntArray(pixels.size)
        for (i in pixels.indices) {
            val c = pixels[i]
            r[i] = (c shr 16) and 0xFF
            g[i] = (c shr 8) and 0xFF
            b[i] = c and 0xFF
        }
        return Background(
            GrayImage(width, height, r).boxBlur(radius).data,
            GrayImage(width, height, g).boxBlur(radius).data,
            GrayImage(width, height, b).boxBlur(radius).data
        )
    }

    private fun grayscale(pixels: IntArray, width: Int, height: Int) {
        val luma = IntArray(pixels.size)
        for (i in pixels.indices) {
            val c = pixels[i]
            luma[i] = (((c shr 16) and 0xFF) * 299 + ((c shr 8) and 0xFF) * 587 + (c and 0xFF) * 114) / 1000
        }
        val radius = max(8, min(width, height) / 12)
        val background = GrayImage(width, height, luma.copyOf()).boxBlur(radius).data
        for (i in pixels.indices) {
            val v = dodge(luma[i], background[i], 0.85f)
            pixels[i] = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
        }
        stretchContrast(pixels, lowPercentile = 0.02f, highPercentile = 0.98f)
    }

    /**
     * Nhị phân hoá thích nghi: so sánh từng điểm với độ sáng trung bình lân cận.
     */
    private fun blackWhite(pixels: IntArray, width: Int, height: Int) {
        val luma = IntArray(pixels.size)
        for (i in pixels.indices) {
            val c = pixels[i]
            luma[i] = (((c shr 16) and 0xFF) * 299 + ((c shr 8) and 0xFF) * 587 + (c and 0xFF) * 114) / 1000
        }
        val radius = max(6, min(width, height) / 40)
        val mean = GrayImage(width, height, luma.copyOf()).boxBlur(radius).data
        val offset = 8
        for (i in pixels.indices) {
            val value = if (luma[i] + offset < mean[i]) 0 else 255
            pixels[i] = (0xFF shl 24) or (value shl 16) or (value shl 8) or value
        }
    }

    /** Kéo giãn histogram về dải đầy đủ, bỏ qua phần đuôi nhiễu. */
    private fun stretchContrast(pixels: IntArray, lowPercentile: Float, highPercentile: Float) {
        val histogram = IntArray(256)
        for (c in pixels) {
            val luma = (((c shr 16) and 0xFF) * 299 + ((c shr 8) and 0xFF) * 587 + (c and 0xFF) * 114) / 1000
            histogram[luma]++
        }
        val total = pixels.size
        var low = 0
        var high = 255
        var acc = 0
        for (v in 0..255) {
            acc += histogram[v]
            if (acc >= total * lowPercentile) {
                low = v
                break
            }
        }
        acc = 0
        for (v in 255 downTo 0) {
            acc += histogram[v]
            if (acc >= total * (1f - highPercentile)) {
                high = v
                break
            }
        }
        if (high - low < 16) return

        val lut = IntArray(256)
        for (v in 0..255) {
            lut[v] = (((v - low) * 255f) / (high - low)).roundToInt().coerceIn(0, 255)
        }
        for (i in pixels.indices) {
            val c = pixels[i]
            pixels[i] = (c and 0xFF000000.toInt()) or
                (lut[(c shr 16) and 0xFF] shl 16) or
                (lut[(c shr 8) and 0xFF] shl 8) or
                lut[c and 0xFF]
        }
    }

    private fun saturate(pixels: IntArray, factor: Float) {
        if (factor == 1f) return
        for (i in pixels.indices) {
            val c = pixels[i]
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF
            val luma = (r * 299 + g * 587 + b * 114) / 1000f
            val nr = (luma + (r - luma) * factor).roundToInt().coerceIn(0, 255)
            val ng = (luma + (g - luma) * factor).roundToInt().coerceIn(0, 255)
            val nb = (luma + (b - luma) * factor).roundToInt().coerceIn(0, 255)
            pixels[i] = (c and 0xFF000000.toInt()) or (nr shl 16) or (ng shl 8) or nb
        }
    }

    private fun adjust(pixels: IntArray, brightness: Int, contrast: Int) {
        val contrastFactor = (259f * (contrast + 255f)) / (255f * (259f - contrast))
        val lut = IntArray(256)
        for (v in 0..255) {
            val withContrast = contrastFactor * (v - 128f) + 128f
            lut[v] = (withContrast + brightness).roundToInt().coerceIn(0, 255)
        }
        for (i in pixels.indices) {
            val c = pixels[i]
            pixels[i] = (c and 0xFF000000.toInt()) or
                (lut[(c shr 16) and 0xFF] shl 16) or
                (lut[(c shr 8) and 0xFF] shl 8) or
                lut[c and 0xFF]
        }
    }
}
