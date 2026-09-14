package com.sonngo.docscan.export

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import com.sonngo.docscan.data.Document
import java.io.File
import java.io.FileOutputStream
import kotlin.math.min
import kotlin.math.roundToInt

/** Xuất tài liệu nhiều trang ra file PDF. */
object PdfExporter {

    /** Khổ A4 tính theo điểm in (72 dpi). */
    private const val A4_WIDTH = 595
    private const val A4_HEIGHT = 842
    private const val MARGIN = 24

    enum class PageSize {
        /** Mỗi trang PDF là khổ A4, ảnh được canh giữa. */
        A4,

        /** Trang PDF khớp đúng tỉ lệ ảnh, không có lề. */
        FIT_IMAGE
    }

    /**
     * Ghi [document] ra [target]. Trả về file đã ghi, hoặc null nếu tài liệu rỗng.
     */
    fun export(
        document: Document,
        documentDir: File,
        target: File,
        pageSize: PageSize = PageSize.A4
    ): File? {
        if (document.pages.isEmpty()) return null
        val pdf = PdfDocument()
        val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)

        document.pages.forEachIndexed { index, page ->
            val bitmap = decodeScaled(page.resultFile(documentDir), 2400) ?: return@forEachIndexed
            val (pageWidth, pageHeight) = when (pageSize) {
                PageSize.A4 ->
                    if (bitmap.width > bitmap.height) A4_HEIGHT to A4_WIDTH else A4_WIDTH to A4_HEIGHT
                PageSize.FIT_IMAGE -> {
                    val scale = min(1f, A4_WIDTH * 2f / bitmap.width)
                    (bitmap.width * scale).roundToInt() to (bitmap.height * scale).roundToInt()
                }
            }
            val info = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, index + 1).create()
            val pdfPage = pdf.startPage(info)
            val canvas = pdfPage.canvas
            canvas.drawColor(Color.WHITE)

            val margin = if (pageSize == PageSize.A4) MARGIN else 0
            val available = Rect(margin, margin, pageWidth - margin, pageHeight - margin)
            canvas.drawBitmap(bitmap, null, fitInside(bitmap, available), paint)

            pdf.finishPage(pdfPage)
            bitmap.recycle()
        }

        FileOutputStream(target).use { pdf.writeTo(it) }
        pdf.close()
        return target
    }

    private fun fitInside(bitmap: Bitmap, bounds: Rect): Rect {
        val scale = min(
            bounds.width().toFloat() / bitmap.width,
            bounds.height().toFloat() / bitmap.height
        )
        val width = (bitmap.width * scale).roundToInt()
        val height = (bitmap.height * scale).roundToInt()
        val left = bounds.left + (bounds.width() - width) / 2
        val top = bounds.top + (bounds.height() - height) / 2
        return Rect(left, top, left + width, top + height)
    }

    private fun decodeScaled(file: File, maxSide: Int): Bitmap? {
        if (!file.exists()) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        var sample = 1
        while (bounds.outWidth / sample > maxSide || bounds.outHeight / sample > maxSide) {
            sample *= 2
        }
        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        return BitmapFactory.decodeFile(file.absolutePath, options)
    }
}
