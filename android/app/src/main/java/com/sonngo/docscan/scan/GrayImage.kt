package com.sonngo.docscan.scan

import android.graphics.Bitmap
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Ảnh xám 8 bit lưu trong IntArray, kèm các phép xử lý cơ bản
 * dùng cho việc dò tìm khung tài liệu.
 */
class GrayImage(val width: Int, val height: Int, val data: IntArray) {

    operator fun get(x: Int, y: Int): Int = data[y * width + x]

    /** Làm mờ Gauss 5x5 tách rời theo hai trục. */
    fun gaussianBlur(): GrayImage {
        val kernel = intArrayOf(1, 4, 6, 4, 1)
        val sum = 16
        val tmp = IntArray(width * height)
        val out = IntArray(width * height)
        for (y in 0 until height) {
            val row = y * width
            for (x in 0 until width) {
                var acc = 0
                for (k in -2..2) {
                    val xx = clamp(x + k, 0, width - 1)
                    acc += data[row + xx] * kernel[k + 2]
                }
                tmp[row + x] = acc / sum
            }
        }
        for (y in 0 until height) {
            for (x in 0 until width) {
                var acc = 0
                for (k in -2..2) {
                    val yy = clamp(y + k, 0, height - 1)
                    acc += tmp[yy * width + x] * kernel[k + 2]
                }
                out[y * width + x] = acc / sum
            }
        }
        return GrayImage(width, height, out)
    }

    /**
     * Làm mờ trung bình bằng ảnh tích phân — O(n) bất kể bán kính,
     * dùng để ước lượng nền sáng cho bộ lọc làm trắng giấy.
     */
    fun boxBlur(radius: Int): GrayImage {
        if (radius <= 0) return this
        val integral = LongArray((width + 1) * (height + 1))
        for (y in 0 until height) {
            var rowSum = 0L
            for (x in 0 until width) {
                rowSum += data[y * width + x]
                integral[(y + 1) * (width + 1) + (x + 1)] =
                    integral[y * (width + 1) + (x + 1)] + rowSum
            }
        }
        val out = IntArray(width * height)
        for (y in 0 until height) {
            val y0 = max(0, y - radius)
            val y1 = min(height - 1, y + radius)
            for (x in 0 until width) {
                val x0 = max(0, x - radius)
                val x1 = min(width - 1, x + radius)
                val a = integral[y0 * (width + 1) + x0]
                val b = integral[y0 * (width + 1) + (x1 + 1)]
                val c = integral[(y1 + 1) * (width + 1) + x0]
                val d = integral[(y1 + 1) * (width + 1) + (x1 + 1)]
                val count = (y1 - y0 + 1).toLong() * (x1 - x0 + 1).toLong()
                out[y * width + x] = ((d - b - c + a) / count).toInt()
            }
        }
        return GrayImage(width, height, out)
    }

    /** Xoay ảnh theo bội số 90 độ để đưa khung hình camera về chiều đứng. */
    fun rotated(degrees: Int): GrayImage {
        val normalized = ((degrees % 360) + 360) % 360
        if (normalized == 0) return this
        val swap = normalized == 90 || normalized == 270
        val outWidth = if (swap) height else width
        val outHeight = if (swap) width else height
        val out = IntArray(width * height)
        for (y in 0 until height) {
            for (x in 0 until width) {
                val value = data[y * width + x]
                val index = when (normalized) {
                    90 -> x * outWidth + (outWidth - 1 - y)
                    180 -> (height - 1 - y) * outWidth + (width - 1 - x)
                    else -> (outHeight - 1 - x) * outWidth + y
                }
                out[index] = value
            }
        }
        return GrayImage(outWidth, outHeight, out)
    }

    /** Biên độ gradient Sobel cùng hướng gradient rời rạc hoá thành 4 nhóm. */
    fun sobel(): SobelResult {
        val magnitude = IntArray(width * height)
        val direction = ByteArray(width * height)
        for (y in 1 until height - 1) {
            for (x in 1 until width - 1) {
                val i = y * width + x
                val tl = data[i - width - 1]
                val t = data[i - width]
                val tr = data[i - width + 1]
                val l = data[i - 1]
                val r = data[i + 1]
                val bl = data[i + width - 1]
                val b = data[i + width]
                val br = data[i + width + 1]
                val gx = (tr + 2 * r + br) - (tl + 2 * l + bl)
                val gy = (bl + 2 * b + br) - (tl + 2 * t + tr)
                magnitude[i] = sqrt((gx * gx + gy * gy).toDouble()).roundToInt()
                direction[i] = quantizeDirection(gx, gy)
            }
        }
        return SobelResult(width, height, magnitude, direction)
    }

    companion object {

        fun clamp(value: Int, lo: Int, hi: Int): Int = if (value < lo) lo else if (value > hi) hi else value

        /**
         * Chuyển Bitmap sang ảnh xám, thu nhỏ sao cho cạnh dài nhất không vượt [maxSize].
         */
        fun fromBitmap(bitmap: Bitmap, maxSize: Int): GrayImage {
            val scale = min(1f, maxSize.toFloat() / max(bitmap.width, bitmap.height))
            val w = max(1, (bitmap.width * scale).roundToInt())
            val h = max(1, (bitmap.height * scale).roundToInt())
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
            val out = IntArray(w * h)
            for (y in 0 until h) {
                val srcY = (y * bitmap.height) / h
                for (x in 0 until w) {
                    val srcX = (x * bitmap.width) / w
                    val c = pixels[srcY * bitmap.width + srcX]
                    val r = (c shr 16) and 0xFF
                    val g = (c shr 8) and 0xFF
                    val b = c and 0xFF
                    out[y * w + x] = (r * 299 + g * 587 + b * 114) / 1000
                }
            }
            return GrayImage(w, h, out)
        }

        /**
         * Chuyển mặt phẳng luma Y của khung hình camera sang ảnh xám thu nhỏ.
         */
        fun fromLuminance(
            luma: ByteArray,
            width: Int,
            height: Int,
            rowStride: Int,
            pixelStride: Int,
            maxSize: Int
        ): GrayImage {
            val scale = min(1f, maxSize.toFloat() / max(width, height))
            val w = max(1, (width * scale).roundToInt())
            val h = max(1, (height * scale).roundToInt())
            val out = IntArray(w * h)
            for (y in 0 until h) {
                val srcY = (y * height) / h
                val rowStart = srcY * rowStride
                for (x in 0 until w) {
                    val srcX = (x * width) / w
                    val index = rowStart + srcX * pixelStride
                    out[y * w + x] = if (index < luma.size) luma[index].toInt() and 0xFF else 0
                }
            }
            return GrayImage(w, h, out)
        }

        private fun quantizeDirection(gx: Int, gy: Int): Byte {
            val absGx = if (gx < 0) -gx else gx
            val absGy = if (gy < 0) -gy else gy
            // 0: ngang, 1: chéo 45°, 2: dọc, 3: chéo 135°
            return when {
                absGx == 0 && absGy == 0 -> 0
                absGy * 2 < absGx -> 0
                absGx * 2 < absGy -> 2
                (gx > 0) == (gy > 0) -> 1
                else -> 3
            }
        }
    }
}

class SobelResult(
    val width: Int,
    val height: Int,
    val magnitude: IntArray,
    val direction: ByteArray
)
