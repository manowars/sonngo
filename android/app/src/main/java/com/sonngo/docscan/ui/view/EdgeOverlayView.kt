package com.sonngo.docscan.ui.view

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.util.AttributeSet
import android.view.View
import com.sonngo.docscan.scan.Quad
import kotlin.math.min

/**
 * Lớp phủ trên preview camera, vẽ khung tài liệu vừa nhận diện được.
 *
 * Toạ độ đưa vào tính theo ảnh phân tích đã xoay đứng; view tự quy đổi sang
 * toạ độ màn hình theo kiểu canh giữa - vừa khung (giống PreviewView FIT_CENTER).
 */
class EdgeOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = Color.argb(56, 33, 150, 243)
    }

    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(2.5f)
        strokeJoin = Paint.Join.ROUND
        color = Color.WHITE
    }

    private val cornerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = Color.WHITE
    }

    private val path = Path()
    private var mapped: List<PointF> = emptyList()

    private var sourceWidth = 0
    private var sourceHeight = 0

    /** Khung chuyển sang màu xanh lá khi đủ ổn định để chụp tự động. */
    var locked: Boolean = false
        set(value) {
            if (field != value) {
                field = value
                fillPaint.color = if (value) Color.argb(72, 76, 175, 80) else Color.argb(56, 33, 150, 243)
                strokePaint.color = if (value) Color.rgb(129, 255, 133) else Color.WHITE
                invalidate()
            }
        }

    fun setQuad(quad: Quad?, sourceWidth: Int, sourceHeight: Int) {
        this.sourceWidth = sourceWidth
        this.sourceHeight = sourceHeight
        mapped = quad?.let { mapToView(it) } ?: emptyList()
        invalidate()
    }

    fun clear() {
        mapped = emptyList()
        locked = false
        invalidate()
    }

    private fun mapToView(quad: Quad): List<PointF> {
        if (sourceWidth <= 0 || sourceHeight <= 0 || width == 0 || height == 0) return emptyList()
        val scale = min(width.toFloat() / sourceWidth, height.toFloat() / sourceHeight)
        val offsetX = (width - sourceWidth * scale) / 2f
        val offsetY = (height - sourceHeight * scale) / 2f
        return quad.points.map { PointF(it.x * scale + offsetX, it.y * scale + offsetY) }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (mapped.size != 4) return
        path.reset()
        path.moveTo(mapped[0].x, mapped[0].y)
        for (i in 1 until mapped.size) path.lineTo(mapped[i].x, mapped[i].y)
        path.close()
        canvas.drawPath(path, fillPaint)
        canvas.drawPath(path, strokePaint)
        val radius = dp(4f)
        mapped.forEach { canvas.drawCircle(it.x, it.y, radius, cornerPaint) }
    }

    private fun dp(value: Float): Float = value * resources.displayMetrics.density
}
