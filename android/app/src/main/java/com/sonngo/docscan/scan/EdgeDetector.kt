package com.sonngo.docscan.scan

import android.graphics.Bitmap
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Dò tìm khung tài liệu trong ảnh bằng Canny + truy vết đường bao,
 * có phương án dự phòng dùng biến đổi Hough khi đường bao bị đứt đoạn.
 *
 * Toàn bộ thuật toán viết thuần Kotlin nên APK không cần thư viện gốc nào.
 */
object EdgeDetector {

    /** Cạnh dài nhất của ảnh dùng để phân tích; đủ nhỏ để chạy realtime. */
    const val WORK_SIZE = 360

    /**
     * Ngưỡng trên của Canny lấy theo phân vị này của biên độ gradient.
     * Phân vị cao hơn (0.9+) khiến chữ trong trang lấn át mép giấy và bỏ sót khung.
     */
    private const val EDGE_PERCENTILE = 0.80f

    /** Các mức làm mờ Gauss được thử lần lượt. */
    private val BLUR_LEVELS = intArrayOf(1, 2)

    private const val MIN_AREA_RATIO = 0.12f
    private const val MAX_AREA_RATIO = 0.995f

    fun detect(bitmap: Bitmap): Quad? {
        val gray = GrayImage.fromBitmap(bitmap, WORK_SIZE)
        val quad = detect(gray) ?: return null
        return quad.scaled(bitmap.width.toFloat() / gray.width, bitmap.height.toFloat() / gray.height)
    }

    /**
     * Trả về khung tài liệu theo toạ độ của chính [gray], hoặc null nếu không tìm thấy.
     */
    fun detect(gray: GrayImage): Quad? {
        // Ảnh nhiều chữ cần ít làm mờ để mép giấy không bị nuốt mất, còn ảnh nhiễu
        // mạnh lại cần làm mờ thêm. Thử lần lượt từng mức, chỉ tính mức sau khi cần.
        val edgeMaps = ArrayList<ByteArray>(BLUR_LEVELS.size)
        for (passes in BLUR_LEVELS) {
            val edges = cannyEdges(blur(gray, passes).sobel())
            edgeMaps.add(edges)
            fromContours(edges, gray.width, gray.height)?.let { return it }
        }
        // Đường bao đứt đoạn thì chuyển sang tìm 4 đường thẳng mạnh nhất.
        for (edges in edgeMaps) {
            fromHoughLines(edges, gray.width, gray.height)?.let { return it }
        }
        return null
    }

    private fun blur(gray: GrayImage, passes: Int): GrayImage {
        var result = gray.gaussianBlur()
        repeat(passes - 1) { result = result.gaussianBlur() }
        return result
    }

    // ----------------------------------------------------------------------
    // Bước 1: tách biên kiểu Canny
    // ----------------------------------------------------------------------

    private fun cannyEdges(sobel: SobelResult): ByteArray {
        val w = sobel.width
        val h = sobel.height
        val magnitude = sobel.magnitude
        val suppressed = IntArray(w * h)

        for (y in 1 until h - 1) {
            for (x in 1 until w - 1) {
                val i = y * w + x
                val m = magnitude[i]
                if (m == 0) continue
                val (n1, n2) = when (sobel.direction[i].toInt()) {
                    0 -> magnitude[i - 1] to magnitude[i + 1]
                    2 -> magnitude[i - w] to magnitude[i + w]
                    1 -> magnitude[i - w - 1] to magnitude[i + w + 1]
                    else -> magnitude[i - w + 1] to magnitude[i + w - 1]
                }
                if (m >= n1 && m >= n2) suppressed[i] = m
            }
        }

        val high = percentile(suppressed, EDGE_PERCENTILE).coerceAtLeast(36)
        val low = max(12, (high * 0.4f).roundToInt())

        val edges = ByteArray(w * h)
        val stack = IntArray(w * h)
        var top = 0
        for (i in suppressed.indices) {
            if (suppressed[i] >= high) {
                edges[i] = 1
                stack[top++] = i
            }
        }
        while (top > 0) {
            val i = stack[--top]
            val x = i % w
            val y = i / w
            for (dy in -1..1) {
                for (dx in -1..1) {
                    if (dx == 0 && dy == 0) continue
                    val nx = x + dx
                    val ny = y + dy
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
                    val ni = ny * w + nx
                    if (edges[ni].toInt() == 0 && suppressed[ni] >= low) {
                        edges[ni] = 1
                        stack[top++] = ni
                    }
                }
            }
        }
        return dilate(edges, w, h)
    }

    private fun percentile(values: IntArray, ratio: Float): Int {
        val histogram = IntArray(1024)
        var count = 0
        for (v in values) {
            if (v <= 0) continue
            histogram[min(v, 1023)]++
            count++
        }
        if (count == 0) return 0
        val target = (count * ratio).roundToInt()
        var acc = 0
        for (bucket in histogram.indices) {
            acc += histogram[bucket]
            if (acc >= target) return bucket
        }
        return 1023
    }

    /** Giãn nở 3x3 để nối các đoạn biên bị đứt. */
    private fun dilate(src: ByteArray, w: Int, h: Int): ByteArray {
        val out = ByteArray(w * h)
        for (y in 0 until h) {
            for (x in 0 until w) {
                var on = false
                var dy = -1
                while (dy <= 1 && !on) {
                    var dx = -1
                    while (dx <= 1) {
                        val nx = x + dx
                        val ny = y + dy
                        if (nx in 0 until w && ny in 0 until h && src[ny * w + nx].toInt() == 1) {
                            on = true
                            break
                        }
                        dx++
                    }
                    dy++
                }
                if (on) out[y * w + x] = 1
            }
        }
        return out
    }

    // ----------------------------------------------------------------------
    // Bước 2a: truy vết đường bao rồi rút gọn về tứ giác
    // ----------------------------------------------------------------------

    private fun fromContours(edges: ByteArray, w: Int, h: Int): Quad? {
        val imageArea = (w * h).toFloat()
        var best: Quad? = null
        var bestArea = 0f
        for (contour in traceContours(edges, w, h)) {
            if (contour.size < 24) continue
            val perimeter = perimeterOf(contour)
            if (perimeter < (w + h) * 0.5f) continue
            for (factor in EPSILON_FACTORS) {
                val simplified = douglasPeucker(contour, perimeter * factor)
                if (simplified.size != 4) continue
                val quad = Quad(simplified)
                val ratio = quad.area / imageArea
                if (ratio < MIN_AREA_RATIO || ratio > MAX_AREA_RATIO) continue
                if (!quad.isPlausibleDocument()) continue
                if (quad.area > bestArea) {
                    bestArea = quad.area
                    best = quad
                }
                break
            }
        }
        return best
    }

    private val EPSILON_FACTORS = floatArrayOf(0.02f, 0.03f, 0.045f, 0.06f)

    private val NEIGHBOR_DX = intArrayOf(1, 1, 0, -1, -1, -1, 0, 1)
    private val NEIGHBOR_DY = intArrayOf(0, 1, 1, 1, 0, -1, -1, -1)

    /**
     * Truy vết đường bao ngoài theo thuật toán Moore-neighbor.
     */
    private fun traceContours(edges: ByteArray, w: Int, h: Int): List<List<ScanPoint>> {
        val visited = BooleanArray(w * h)
        val contours = ArrayList<List<ScanPoint>>()
        val maxSteps = w * h * 4

        for (y in 0 until h) {
            for (x in 0 until w) {
                val start = y * w + x
                if (edges[start].toInt() != 1 || visited[start]) continue
                if (y > 0 && edges[start - w].toInt() == 1) continue

                val points = ArrayList<ScanPoint>()
                var cx = x
                var cy = y
                var searchFrom = 7 // bắt đầu quét ngay sau hướng Bắc
                var steps = 0
                var firstMove = -1
                var closed = false

                while (steps < maxSteps) {
                    visited[cy * w + cx] = true
                    points.add(ScanPoint(cx.toFloat(), cy.toFloat()))
                    var moved = false
                    for (k in 0 until 8) {
                        val dir = (searchFrom + k) % 8
                        val nx = cx + NEIGHBOR_DX[dir]
                        val ny = cy + NEIGHBOR_DY[dir]
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
                        if (edges[ny * w + nx].toInt() != 1) continue
                        if (firstMove < 0) firstMove = dir
                        cx = nx
                        cy = ny
                        searchFrom = (dir + 5) % 8 // quay lại pixel trước rồi tiến một bước
                        moved = true
                        break
                    }
                    if (!moved) break
                    if (cx == x && cy == y) {
                        closed = true
                        break
                    }
                    steps++
                }
                if (closed && points.size >= 24) contours.add(points)
            }
        }
        return contours
    }

    private fun perimeterOf(points: List<ScanPoint>): Float {
        var sum = 0f
        for (i in points.indices) {
            val a = points[i]
            val b = points[(i + 1) % points.size]
            sum += hypot(b.x - a.x, b.y - a.y)
        }
        return sum
    }

    /** Rút gọn đa giác khép kín bằng Douglas-Peucker. */
    private fun douglasPeucker(points: List<ScanPoint>, epsilon: Float): List<ScanPoint> {
        if (points.size < 4) return points
        val anchor = points[0]
        var farIndex = 0
        var farDist = -1f
        for (i in points.indices) {
            val d = hypot(points[i].x - anchor.x, points[i].y - anchor.y)
            if (d > farDist) {
                farDist = d
                farIndex = i
            }
        }
        val first = simplifySegment(points.subList(0, farIndex + 1), epsilon)
        val second = simplifySegment(points.subList(farIndex, points.size), epsilon)
        val result = ArrayList<ScanPoint>(first.size + second.size)
        result.addAll(first)
        // Bỏ điểm đầu của nhánh sau vì trùng điểm cuối nhánh trước.
        result.addAll(second.subList(1, second.size))
        if (result.size > 1) {
            val head = result.first()
            val tail = result.last()
            if (hypot(head.x - tail.x, head.y - tail.y) < 1f) result.removeAt(result.size - 1)
        }
        return result
    }

    private fun simplifySegment(points: List<ScanPoint>, epsilon: Float): List<ScanPoint> {
        if (points.size < 3) return points.toList()
        val start = points.first()
        val end = points.last()
        var maxDist = 0f
        var index = 0
        for (i in 1 until points.size - 1) {
            val d = pointLineDistance(points[i], start, end)
            if (d > maxDist) {
                maxDist = d
                index = i
            }
        }
        return if (maxDist > epsilon) {
            val left = simplifySegment(points.subList(0, index + 1), epsilon)
            val right = simplifySegment(points.subList(index, points.size), epsilon)
            val merged = ArrayList<ScanPoint>(left.size + right.size)
            merged.addAll(left)
            merged.addAll(right.subList(1, right.size))
            merged
        } else {
            listOf(start, end)
        }
    }

    private fun pointLineDistance(p: ScanPoint, a: ScanPoint, b: ScanPoint): Float {
        val dx = b.x - a.x
        val dy = b.y - a.y
        val len = hypot(dx, dy)
        if (len < 1e-4f) return hypot(p.x - a.x, p.y - a.y)
        return abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
    }

    // ----------------------------------------------------------------------
    // Bước 2b: dự phòng bằng biến đổi Hough
    // ----------------------------------------------------------------------

    private class Line(val rho: Float, val theta: Float, val votes: Int)

    private fun fromHoughLines(edges: ByteArray, w: Int, h: Int): Quad? {
        val thetaSteps = 180
        val diagonal = hypot(w.toFloat(), h.toFloat()).roundToInt()
        val rhoOffset = diagonal
        val rhoSize = diagonal * 2 + 1
        val accumulator = IntArray(thetaSteps * rhoSize)
        val sinTable = FloatArray(thetaSteps)
        val cosTable = FloatArray(thetaSteps)
        for (t in 0 until thetaSteps) {
            val angle = Math.PI * t / thetaSteps
            sinTable[t] = sin(angle).toFloat()
            cosTable[t] = cos(angle).toFloat()
        }

        var edgeCount = 0
        for (y in 0 until h) {
            for (x in 0 until w) {
                if (edges[y * w + x].toInt() != 1) continue
                edgeCount++
                for (t in 0 until thetaSteps) {
                    val rho = (x * cosTable[t] + y * sinTable[t]).roundToInt() + rhoOffset
                    if (rho in 0 until rhoSize) accumulator[t * rhoSize + rho]++
                }
            }
        }
        if (edgeCount < 40) return null

        val threshold = max(30, (min(w, h) * 0.35f).roundToInt())
        val candidates = ArrayList<Line>()
        for (t in 0 until thetaSteps) {
            for (r in 1 until rhoSize - 1) {
                val votes = accumulator[t * rhoSize + r]
                if (votes < threshold) continue
                // Chỉ giữ đỉnh cục bộ để tránh nhiều đường trùng nhau.
                if (votes < accumulator[t * rhoSize + r - 1] || votes < accumulator[t * rhoSize + r + 1]) continue
                candidates.add(Line((r - rhoOffset).toFloat(), Math.PI.toFloat() * t / thetaSteps, votes))
            }
        }
        if (candidates.size < 4) return null
        candidates.sortByDescending { it.votes }

        val horizontal = ArrayList<Line>()
        val vertical = ArrayList<Line>()
        for (line in candidates) {
            val degrees = Math.toDegrees(line.theta.toDouble())
            val isHorizontal = degrees in 50.0..130.0
            val target = if (isHorizontal) horizontal else vertical
            val minSeparation = (if (isHorizontal) h else w) * 0.25f
            if (target.size >= 2) continue
            if (target.any { abs(it.rho - line.rho) < minSeparation }) continue
            target.add(line)
        }
        if (horizontal.size < 2 || vertical.size < 2) return null

        horizontal.sortBy { it.rho }
        vertical.sortBy { it.rho }

        val corners = listOf(
            intersect(horizontal[0], vertical[0]),
            intersect(horizontal[0], vertical[1]),
            intersect(horizontal[1], vertical[1]),
            intersect(horizontal[1], vertical[0])
        )
        if (corners.any { it == null }) return null
        val points = corners.filterNotNull()
        val margin = max(w, h) * 0.15f
        if (points.any { it.x < -margin || it.y < -margin || it.x > w + margin || it.y > h + margin }) return null

        val clamped = points.map {
            ScanPoint(it.x.coerceIn(0f, w.toFloat()), it.y.coerceIn(0f, h.toFloat()))
        }
        val quad = Quad(clamped)
        val ratio = quad.area / (w * h).toFloat()
        if (ratio < MIN_AREA_RATIO || ratio > MAX_AREA_RATIO) return null
        if (!quad.isPlausibleDocument()) return null
        return quad
    }

    private fun intersect(a: Line, b: Line): ScanPoint? {
        val cosA = cos(a.theta.toDouble())
        val sinA = sin(a.theta.toDouble())
        val cosB = cos(b.theta.toDouble())
        val sinB = sin(b.theta.toDouble())
        val det = cosA * sinB - sinA * cosB
        if (abs(det) < 1e-6) return null
        val x = (a.rho * sinB - b.rho * sinA) / det
        val y = (b.rho * cosA - a.rho * cosB) / det
        return ScanPoint(x.toFloat(), y.toFloat())
    }
}
