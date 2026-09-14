package com.sonngo.docscan.ui.view

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.graphics.RectF
import android.graphics.Shader
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import com.sonngo.docscan.scan.Quad
import com.sonngo.docscan.scan.ScanPoint
import kotlin.math.hypot
import kotlin.math.min

/**
 * View cắt ảnh thủ công: hiển thị ảnh, cho kéo 4 góc và 4 cạnh,
 * kèm kính lúp để đặt góc chính xác.
 */
class CropOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var bitmap: Bitmap? = null

    /** 4 góc lưu theo toạ độ ảnh gốc. */
    private val corners = ArrayList<ScanPoint>()

    private val imageMatrix = Matrix()
    private var imageScale = 1f
    private var imageOffsetX = 0f
    private var imageOffsetY = 0f

    private var draggingCorner = -1
    private var draggingEdge = -1
    private var lastTouch = PointF()
    private var touchPoint: PointF? = null

    private val imagePaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = Color.argb(48, 33, 150, 243)
    }

    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(2f)
        color = Color.rgb(66, 165, 245)
    }

    private val handlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = Color.WHITE
    }

    private val handleStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(2f)
        color = Color.rgb(33, 150, 243)
    }

    private val magnifierStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(2f)
        color = Color.WHITE
    }

    private val magnifierCross = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(1f)
        color = Color.rgb(255, 87, 34)
    }

    private var magnifierPaint: Paint? = null
    private val magnifierMatrix = Matrix()
    private val path = Path()

    private val handleRadius = dp(11f)
    private val touchRadius = dp(30f)
    private val magnifierRadius = dp(52f)
    private val magnifierZoom = 2.2f

    /** Gọi lại mỗi khi người dùng thay đổi khung cắt. */
    var onQuadChanged: ((Quad) -> Unit)? = null

    fun setBitmap(bitmap: Bitmap, quad: Quad?) {
        this.bitmap = bitmap
        magnifierPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
            shader = BitmapShader(bitmap, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        }
        setQuad(quad ?: defaultQuad(bitmap))
        requestLayout()
        invalidate()
    }

    fun setQuad(quad: Quad) {
        corners.clear()
        quad.points.forEach { corners.add(ScanPoint(it.x, it.y)) }
        invalidate()
        onQuadChanged?.invoke(currentQuad())
    }

    fun selectWholeImage() {
        val bmp = bitmap ?: return
        setQuad(Quad.fullFrame(bmp.width.toFloat(), bmp.height.toFloat()))
    }

    fun currentQuad(): Quad = Quad(corners.map { ScanPoint(it.x, it.y) })

    private fun defaultQuad(bitmap: Bitmap): Quad {
        val insetX = bitmap.width * 0.1f
        val insetY = bitmap.height * 0.1f
        return Quad(
            listOf(
                ScanPoint(insetX, insetY),
                ScanPoint(bitmap.width - insetX, insetY),
                ScanPoint(bitmap.width - insetX, bitmap.height - insetY),
                ScanPoint(insetX, bitmap.height - insetY)
            )
        )
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        updateMatrix()
    }

    private fun updateMatrix() {
        val bmp = bitmap ?: return
        if (width == 0 || height == 0) return
        imageScale = min(width.toFloat() / bmp.width, height.toFloat() / bmp.height)
        imageOffsetX = (width - bmp.width * imageScale) / 2f
        imageOffsetY = (height - bmp.height * imageScale) / 2f
        imageMatrix.reset()
        imageMatrix.postScale(imageScale, imageScale)
        imageMatrix.postTranslate(imageOffsetX, imageOffsetY)
    }

    private fun toView(point: ScanPoint) =
        PointF(point.x * imageScale + imageOffsetX, point.y * imageScale + imageOffsetY)

    private fun toImage(x: Float, y: Float) =
        PointF((x - imageOffsetX) / imageScale, (y - imageOffsetY) / imageScale)

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val bmp = bitmap ?: return
        if (imageScale <= 0f) updateMatrix()
        canvas.drawBitmap(bmp, imageMatrix, imagePaint)
        if (corners.size != 4) return

        val viewCorners = corners.map { toView(it) }
        path.reset()
        path.moveTo(viewCorners[0].x, viewCorners[0].y)
        for (i in 1 until 4) path.lineTo(viewCorners[i].x, viewCorners[i].y)
        path.close()
        canvas.drawPath(path, fillPaint)
        canvas.drawPath(path, linePaint)

        // Tay nắm giữa cạnh để kéo cả cạnh.
        for (i in 0 until 4) {
            val a = viewCorners[i]
            val b = viewCorners[(i + 1) % 4]
            val mid = PointF((a.x + b.x) / 2f, (a.y + b.y) / 2f)
            canvas.drawCircle(mid.x, mid.y, handleRadius * 0.6f, handlePaint)
            canvas.drawCircle(mid.x, mid.y, handleRadius * 0.6f, handleStrokePaint)
        }
        viewCorners.forEach {
            canvas.drawCircle(it.x, it.y, handleRadius, handlePaint)
            canvas.drawCircle(it.x, it.y, handleRadius, handleStrokePaint)
        }

        drawMagnifier(canvas)
    }

    private fun drawMagnifier(canvas: Canvas) {
        val focus = touchPoint ?: return
        val paint = magnifierPaint ?: return
        val imagePoint = toImage(focus.x, focus.y)
        val onLeft = focus.x > width / 2f
        val cx = if (onLeft) magnifierRadius + dp(16f) else width - magnifierRadius - dp(16f)
        val cy = magnifierRadius + dp(16f)

        val zoom = imageScale * magnifierZoom
        magnifierMatrix.reset()
        magnifierMatrix.postScale(zoom, zoom)
        magnifierMatrix.postTranslate(cx - imagePoint.x * zoom, cy - imagePoint.y * zoom)
        paint.shader?.setLocalMatrix(magnifierMatrix)

        canvas.drawCircle(cx, cy, magnifierRadius, paint)
        canvas.drawCircle(cx, cy, magnifierRadius, magnifierStroke)
        val cross = dp(9f)
        canvas.drawLine(cx - cross, cy, cx + cross, cy, magnifierCross)
        canvas.drawLine(cx, cy - cross, cx, cy + cross, magnifierCross)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (bitmap == null || corners.size != 4) return false
        val x = event.x
        val y = event.y
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                draggingCorner = nearestCorner(x, y)
                draggingEdge = if (draggingCorner < 0) nearestEdge(x, y) else -1
                if (draggingCorner < 0 && draggingEdge < 0) return false
                lastTouch.set(x, y)
                touchPoint = PointF(x, y)
                parent?.requestDisallowInterceptTouchEvent(true)
                invalidate()
                return true
            }

            MotionEvent.ACTION_MOVE -> {
                if (draggingCorner >= 0) {
                    moveCorner(draggingCorner, toImage(x, y))
                    touchPoint = PointF(x, y)
                } else if (draggingEdge >= 0) {
                    val dx = (x - lastTouch.x) / imageScale
                    val dy = (y - lastTouch.y) / imageScale
                    moveEdge(draggingEdge, dx, dy)
                    lastTouch.set(x, y)
                    touchPoint = PointF(x, y)
                } else {
                    return false
                }
                invalidate()
                onQuadChanged?.invoke(currentQuad())
                return true
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                draggingCorner = -1
                draggingEdge = -1
                touchPoint = null
                parent?.requestDisallowInterceptTouchEvent(false)
                invalidate()
                onQuadChanged?.invoke(currentQuad())
                return true
            }
        }
        return false
    }

    private fun moveCorner(index: Int, target: PointF) {
        val bmp = bitmap ?: return
        corners[index].set(
            target.x.coerceIn(0f, bmp.width.toFloat()),
            target.y.coerceIn(0f, bmp.height.toFloat())
        )
    }

    private fun moveEdge(edge: Int, dx: Float, dy: Float) {
        val bmp = bitmap ?: return
        val first = corners[edge]
        val second = corners[(edge + 1) % 4]
        val newFirstX = (first.x + dx).coerceIn(0f, bmp.width.toFloat())
        val newFirstY = (first.y + dy).coerceIn(0f, bmp.height.toFloat())
        val newSecondX = (second.x + dx).coerceIn(0f, bmp.width.toFloat())
        val newSecondY = (second.y + dy).coerceIn(0f, bmp.height.toFloat())
        first.set(newFirstX, newFirstY)
        second.set(newSecondX, newSecondY)
    }

    private fun nearestCorner(x: Float, y: Float): Int {
        var best = -1
        var bestDist = touchRadius
        corners.forEachIndexed { index, corner ->
            val view = toView(corner)
            val d = hypot(view.x - x, view.y - y)
            if (d < bestDist) {
                bestDist = d
                best = index
            }
        }
        return best
    }

    private fun nearestEdge(x: Float, y: Float): Int {
        var best = -1
        var bestDist = touchRadius
        for (i in 0 until 4) {
            val a = toView(corners[i])
            val b = toView(corners[(i + 1) % 4])
            val mx = (a.x + b.x) / 2f
            val my = (a.y + b.y) / 2f
            val d = hypot(mx - x, my - y)
            if (d < bestDist) {
                bestDist = d
                best = i
            }
        }
        return best
    }

    @Suppress("unused")
    fun imageBounds(): RectF {
        val bmp = bitmap ?: return RectF()
        return RectF(
            imageOffsetX,
            imageOffsetY,
            imageOffsetX + bmp.width * imageScale,
            imageOffsetY + bmp.height * imageScale
        )
    }

    private fun dp(value: Float): Float = value * resources.displayMetrics.density
}
