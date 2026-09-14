package com.sonngo.docscan.scan

import kotlin.math.hypot
import kotlin.math.max
import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Kiểm thử bộ dò khung tài liệu trên ảnh tổng hợp.
 *
 * Chạy được trên JVM thường vì toàn bộ thuật toán chỉ dùng [GrayImage] và [ScanPoint].
 */
class EdgeDetectorTest {

    @Test
    fun `nhan dien to giay dat thang`() {
        val corners = listOf(60f to 40f, 300f to 40f, 300f to 440f, 60f to 440f)
        assertDetected("giấy đặt thẳng", renderDocument(360, 480, corners), corners, tolerance = 8f)
    }

    @Test
    fun `nhan dien to giay nghieng phoi canh`() {
        val corners = listOf(70f to 60f, 300f to 30f, 330f to 430f, 45f to 400f)
        assertDetected("giấy nghiêng", renderDocument(360, 480, corners, noise = 6), corners, tolerance = 12f)
    }

    @Test
    fun `nhan dien khi nen it tuong phan`() {
        val corners = listOf(50f to 70f, 310f to 55f, 315f to 420f, 45f to 410f)
        val image = renderDocument(360, 480, corners, paper = 245, background = 150, noise = 4)
        assertDetected("nền ít tương phản", image, corners, tolerance = 14f)
    }

    @Test
    fun `nhan dien khi to giay gan kin khung hinh`() {
        val corners = listOf(8f to 10f, 352f to 8f, 354f to 470f, 6f to 468f)
        assertDetected("giấy gần kín khung", renderDocument(360, 480, corners, noise = 3), corners, tolerance = 14f)
    }

    @Test
    fun `nhan dien to giay nam ngang`() {
        val corners = listOf(40f to 90f, 440f to 70f, 445f to 300f, 35f to 290f)
        assertDetected("giấy nằm ngang", renderDocument(480, 360, corners, noise = 5), corners, tolerance = 12f)
    }

    /** Trường hợp thực tế nhất: trang giấy đầy chữ, biên chữ mạnh hơn cả mép giấy. */
    @Test
    fun `nhan dien trang giay day chu`() {
        val corners = listOf(55f to 55f, 305f to 45f, 315f to 425f, 48f to 415f)
        val image = withText(renderDocument(360, 480, corners, noise = 4), corners, lines = 22)
        assertDetected("trang đầy chữ", image, corners, tolerance = 12f)
    }

    @Test
    fun `nhan dien khi co chu va bong do`() {
        val corners = listOf(55f to 55f, 305f to 45f, 315f to 425f, 48f to 415f)
        val image = withShadow(withText(renderDocument(360, 480, corners, noise = 4), corners))
        assertDetected("chữ và bóng đổ", image, corners, tolerance = 14f)
    }

    @Test
    fun `nhan dien khi nhieu anh rat manh`() {
        val corners = listOf(55f to 55f, 305f to 45f, 315f to 425f, 48f to 415f)
        val image = withText(renderDocument(360, 480, corners, noise = 18, seed = 21), corners)
        assertDetected("nhiễu rất mạnh", image, corners, tolerance = 14f)
    }

    @Test
    fun `nhan dien khi nen ban lon xon`() {
        val corners = listOf(55f to 55f, 305f to 45f, 315f to 425f, 48f to 415f)
        val image = withClutter(withText(renderDocument(360, 480, corners, noise = 5), corners), corners)
        assertDetected("nền bàn lộn xộn", image, corners, tolerance = 14f)
    }

    @Test
    fun `khong bao khung tren anh dong mau`() {
        assertNull(EdgeDetector.detect(GrayImage(360, 480, IntArray(360 * 480) { 128 })))
    }

    @Test
    fun `khong bao khung tren anh chi co nhieu`() {
        val random = Random(3)
        assertNull(EdgeDetector.detect(GrayImage(360, 480, IntArray(360 * 480) { random.nextInt(100, 160) })))
    }

    private fun assertDetected(
        name: String,
        image: GrayImage,
        expected: List<Pair<Float, Float>>,
        tolerance: Float
    ) {
        val quad = EdgeDetector.detect(image)
        assertNotNull("Không tìm thấy khung cho: $name", quad)
        val ordered = Quad(expected.map { ScanPoint(it.first, it.second) })
        var worst = 0f
        for (i in 0 until 4) {
            worst = max(
                worst,
                hypot(quad!!.points[i].x - ordered.points[i].x, quad.points[i].y - ordered.points[i].y)
            )
        }
        assertTrue("Sai số góc $worst px vượt ngưỡng $tolerance px cho: $name", worst <= tolerance)
    }

    // ------------------------------------------------------------------
    // Công cụ dựng ảnh thử
    // ------------------------------------------------------------------

    private fun renderDocument(
        width: Int,
        height: Int,
        corners: List<Pair<Float, Float>>,
        paper: Int = 235,
        background: Int = 70,
        noise: Int = 0,
        seed: Int = 7
    ): GrayImage {
        val random = Random(seed)
        val data = IntArray(width * height)
        for (y in 0 until height) {
            for (x in 0 until width) {
                var value = if (pointInPolygon(x + 0.5f, y + 0.5f, corners)) paper else background
                if (noise > 0) value += random.nextInt(-noise, noise + 1)
                data[y * width + x] = value.coerceIn(0, 255)
            }
        }
        return GrayImage(width, height, data)
    }

    private fun withText(
        image: GrayImage,
        corners: List<Pair<Float, Float>>,
        lines: Int = 12
    ): GrayImage {
        val minX = corners.minOf { it.first }
        val maxX = corners.maxOf { it.first }
        val minY = corners.minOf { it.second }
        val maxY = corners.maxOf { it.second }
        val data = image.data.copyOf()
        val step = (maxY - minY) / (lines + 2)
        for (line in 1..lines) {
            val startY = (minY + step * (line + 0.5f)).toInt()
            val thickness = max(2, (step * 0.35f).toInt())
            val startX = (minX + (maxX - minX) * 0.12f).toInt()
            val endX = (maxX - (maxX - minX) * if (line % 4 == 0) 0.45f else 0.12f).toInt()
            for (y in startY until minOf(image.height, startY + thickness)) {
                for (x in max(0, startX) until minOf(image.width, endX)) {
                    if (pointInPolygon(x + 0.5f, y + 0.5f, corners)) data[y * image.width + x] = 35
                }
            }
        }
        return GrayImage(image.width, image.height, data)
    }

    private fun withShadow(image: GrayImage, strength: Float = 0.45f): GrayImage {
        val data = IntArray(image.data.size)
        for (y in 0 until image.height) {
            for (x in 0 until image.width) {
                val ramp = (x.toFloat() / image.width + y.toFloat() / image.height) / 2f
                data[y * image.width + x] =
                    (image.data[y * image.width + x] * (1f - strength * ramp)).toInt().coerceIn(0, 255)
            }
        }
        return GrayImage(image.width, image.height, data)
    }

    private fun withClutter(
        image: GrayImage,
        corners: List<Pair<Float, Float>>,
        blocks: Int = 14,
        seed: Int = 11
    ): GrayImage {
        val random = Random(seed)
        val data = image.data.copyOf()
        repeat(blocks) {
            val left = random.nextInt(0, image.width)
            val top = random.nextInt(0, image.height)
            val blockWidth = random.nextInt(10, 70)
            val blockHeight = random.nextInt(6, 50)
            val tone = random.nextInt(0, 255)
            for (y in top until minOf(image.height, top + blockHeight)) {
                for (x in left until minOf(image.width, left + blockWidth)) {
                    if (!pointInPolygon(x + 0.5f, y + 0.5f, corners)) data[y * image.width + x] = tone
                }
            }
        }
        return GrayImage(image.width, image.height, data)
    }

    private fun pointInPolygon(px: Float, py: Float, polygon: List<Pair<Float, Float>>): Boolean {
        var inside = false
        var j = polygon.size - 1
        for (i in polygon.indices) {
            val (xi, yi) = polygon[i]
            val (xj, yj) = polygon[j]
            if ((yi > py) != (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside
            j = i
        }
        return inside
    }

    @Test
    fun `xoay anh xam giu nguyen noi dung`() {
        val image = GrayImage(4, 2, intArrayOf(1, 2, 3, 4, 5, 6, 7, 8))
        val rotated = image.rotated(90)
        assertEquals(2, rotated.width)
        assertEquals(4, rotated.height)
        assertEquals(listOf(5, 1, 6, 2, 7, 3, 8, 4), rotated.data.toList())
        assertEquals(
            image.data.toList(),
            image.rotated(90).rotated(90).rotated(90).rotated(90).data.toList()
        )
    }

    @Test
    fun `sap xep dinh theo thu tu TL TR BR BL`() {
        val quad = Quad(
            listOf(
                ScanPoint(300f, 400f),
                ScanPoint(20f, 30f),
                ScanPoint(310f, 25f),
                ScanPoint(15f, 410f)
            )
        )
        assertEquals(20f, quad.topLeft.x, 0.01f)
        assertEquals(310f, quad.topRight.x, 0.01f)
        assertEquals(300f, quad.bottomRight.x, 0.01f)
        assertEquals(15f, quad.bottomLeft.x, 0.01f)
    }

    @Test
    fun `to giac lom bi loai`() {
        val concave = Quad(
            listOf(
                ScanPoint(0f, 0f),
                ScanPoint(100f, 0f),
                ScanPoint(50f, 50f),
                ScanPoint(0f, 100f)
            )
        )
        assertTrue(!concave.isPlausibleDocument())
    }
}
