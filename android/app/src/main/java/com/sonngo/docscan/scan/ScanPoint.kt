package com.sonngo.docscan.scan

import kotlin.math.hypot

/**
 * Điểm 2 chiều dùng trong các thuật toán quét.
 *
 * Cố tình không dùng `android.graphics.PointF` để toàn bộ phần xử lý ảnh
 * chạy được trên JVM thường và có thể kiểm thử bằng unit test.
 */
data class ScanPoint(var x: Float, var y: Float) {

    fun set(x: Float, y: Float) {
        this.x = x
        this.y = y
    }

    fun distanceTo(other: ScanPoint): Float = hypot(other.x - x, other.y - y)
}
