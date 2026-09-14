package com.sonngo.docscan.scan

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max

/**
 * Tứ giác 4 đỉnh mô tả khung tài liệu, luôn được sắp theo thứ tự
 * trái-trên, phải-trên, phải-dưới, trái-dưới.
 */
class Quad(points: List<ScanPoint>) {

    val points: List<ScanPoint> = order(points)

    val topLeft get() = points[0]
    val topRight get() = points[1]
    val bottomRight get() = points[2]
    val bottomLeft get() = points[3]

    /** Diện tích tứ giác theo công thức shoelace. */
    val area: Float
        get() {
            var sum = 0f
            for (i in points.indices) {
                val a = points[i]
                val b = points[(i + 1) % points.size]
                sum += a.x * b.y - b.x * a.y
            }
            return abs(sum) / 2f
        }

    /** Chiều rộng ước lượng của tài liệu sau khi nắn phẳng. */
    val estimatedWidth: Float
        get() = max(dist(topLeft, topRight), dist(bottomLeft, bottomRight))

    /** Chiều cao ước lượng của tài liệu sau khi nắn phẳng. */
    val estimatedHeight: Float
        get() = max(dist(topLeft, bottomLeft), dist(topRight, bottomRight))

    fun scaled(factorX: Float, factorY: Float): Quad =
        Quad(points.map { ScanPoint(it.x * factorX, it.y * factorY) })

    fun toFloatArray(): FloatArray {
        val out = FloatArray(8)
        points.forEachIndexed { i, p ->
            out[i * 2] = p.x
            out[i * 2 + 1] = p.y
        }
        return out
    }

    /** Khoảng cách trung bình giữa các đỉnh tương ứng của hai tứ giác. */
    fun distanceTo(other: Quad): Float {
        var sum = 0f
        for (i in points.indices) sum += dist(points[i], other.points[i])
        return sum / points.size
    }

    /** Tứ giác lồi và không có góc quá nhọn thì mới coi là khung tài liệu hợp lệ. */
    fun isPlausibleDocument(): Boolean {
        if (!isConvex()) return false
        for (i in points.indices) {
            val prev = points[(i + 3) % 4]
            val cur = points[i]
            val next = points[(i + 1) % 4]
            val v1x = prev.x - cur.x
            val v1y = prev.y - cur.y
            val v2x = next.x - cur.x
            val v2y = next.y - cur.y
            val len1 = hypot(v1x, v1y)
            val len2 = hypot(v2x, v2y)
            if (len1 < 1f || len2 < 1f) return false
            val cos = (v1x * v2x + v1y * v2y) / (len1 * len2)
            // Cho phép góc từ 60° đến 120° để chấp nhận biến dạng phối cảnh.
            if (abs(cos) > 0.5f) return false
        }
        return true
    }

    private fun isConvex(): Boolean {
        var positive = false
        var negative = false
        for (i in points.indices) {
            val a = points[i]
            val b = points[(i + 1) % 4]
            val c = points[(i + 2) % 4]
            val cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
            if (cross > 0) positive = true
            if (cross < 0) negative = true
            if (positive && negative) return false
        }
        return true
    }

    companion object {

        fun dist(a: ScanPoint, b: ScanPoint): Float = hypot(b.x - a.x, b.y - a.y)

        fun fullFrame(width: Float, height: Float): Quad = Quad(
            listOf(
                ScanPoint(0f, 0f),
                ScanPoint(width, 0f),
                ScanPoint(width, height),
                ScanPoint(0f, height)
            )
        )

        fun fromFloatArray(values: FloatArray): Quad? {
            if (values.size < 8) return null
            return Quad((0 until 4).map { ScanPoint(values[it * 2], values[it * 2 + 1]) })
        }

        /**
         * Sắp xếp 4 điểm bất kỳ về thứ tự TL, TR, BR, BL bằng cách so sánh với tâm.
         */
        private fun order(input: List<ScanPoint>): List<ScanPoint> {
            require(input.size == 4) { "Quad cần đúng 4 điểm" }
            val cx = input.sumOf { it.x.toDouble() }.toFloat() / 4f
            val cy = input.sumOf { it.y.toDouble() }.toFloat() / 4f
            val top = input.filter { it.y <= cy }.sortedBy { it.x }
            val bottom = input.filter { it.y > cy }.sortedBy { it.x }
            if (top.size == 2 && bottom.size == 2) {
                return listOf(top[0], top[1], bottom[1], bottom[0])
            }
            // Trường hợp suy biến: sắp theo góc quanh tâm rồi xoay về đỉnh trên-trái.
            val sorted = input.sortedBy { Math.atan2((it.y - cy).toDouble(), (it.x - cx).toDouble()) }
            val startIndex = sorted.indices.minByOrNull { sorted[it].x + sorted[it].y } ?: 0
            return List(4) { sorted[(startIndex + it) % 4] }
        }
    }
}
