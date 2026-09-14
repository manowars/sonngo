package com.sonngo.docscan.scan

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Nắn phẳng vùng tài liệu: ánh xạ tứ giác đã chọn về hình chữ nhật.
 */
object PerspectiveTransform {

    private const val MAX_OUTPUT_SIDE = 3200
    private const val MIN_OUTPUT_SIDE = 64

    /**
     * Cắt [source] theo [quad] (toạ độ tính trên chính [source]) và trả về ảnh đã nắn thẳng.
     */
    fun crop(source: Bitmap, quad: Quad): Bitmap {
        var outWidth = quad.estimatedWidth.roundToInt()
        var outHeight = quad.estimatedHeight.roundToInt()
        if (outWidth < MIN_OUTPUT_SIDE || outHeight < MIN_OUTPUT_SIDE) {
            outWidth = max(outWidth, MIN_OUTPUT_SIDE)
            outHeight = max(outHeight, MIN_OUTPUT_SIDE)
        }
        val longest = max(outWidth, outHeight)
        if (longest > MAX_OUTPUT_SIDE) {
            val scale = MAX_OUTPUT_SIDE.toFloat() / longest
            outWidth = max(MIN_OUTPUT_SIDE, (outWidth * scale).roundToInt())
            outHeight = max(MIN_OUTPUT_SIDE, (outHeight * scale).roundToInt())
        }

        val src = quad.toFloatArray()
        val dst = floatArrayOf(
            0f, 0f,
            outWidth.toFloat(), 0f,
            outWidth.toFloat(), outHeight.toFloat(),
            0f, outHeight.toFloat()
        )

        val matrix = Matrix()
        // setPolyToPoly với 4 điểm cho phép biến đổi phối cảnh đầy đủ.
        if (!matrix.setPolyToPoly(src, 0, dst, 0, 4)) {
            return source.copy(Bitmap.Config.ARGB_8888, true) ?: source
        }

        val output = Bitmap.createBitmap(outWidth, outHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        canvas.drawColor(android.graphics.Color.WHITE)
        val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        canvas.drawBitmap(source, matrix, paint)
        return output
    }

    /** Xoay ảnh quanh tâm theo bội số 90 độ. */
    fun rotate(source: Bitmap, degrees: Int): Bitmap {
        val normalized = ((degrees % 360) + 360) % 360
        if (normalized == 0) return source
        val matrix = Matrix().apply { postRotate(normalized.toFloat()) }
        return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
    }
}
