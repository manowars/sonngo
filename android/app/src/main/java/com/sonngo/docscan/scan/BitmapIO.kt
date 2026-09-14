package com.sonngo.docscan.scan

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.InputStream

/** Đọc ghi ảnh kèm xử lý hướng EXIF và giới hạn kích thước để tránh tràn bộ nhớ. */
object BitmapIO {

    /** Cạnh dài tối đa khi nạp ảnh để xử lý. */
    const val MAX_WORKING_SIDE = 2600

    fun decodeFile(file: File, maxSide: Int = MAX_WORKING_SIDE): Bitmap? {
        if (!file.exists()) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight, maxSide)
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val bitmap = BitmapFactory.decodeFile(file.absolutePath, options) ?: return null
        val rotation = runCatching { ExifInterface(file.absolutePath).rotationDegrees }.getOrDefault(0)
        return applyRotation(bitmap, rotation)
    }

    fun decodeUri(context: Context, uri: Uri, maxSide: Int = MAX_WORKING_SIDE): Bitmap? {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return null
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight, maxSide)
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val bitmap = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        } ?: return null
        val rotation = resolver.openInputStream(uri)?.use { readRotation(it) } ?: 0
        return applyRotation(bitmap, rotation)
    }

    fun writeJpeg(bitmap: Bitmap, file: File, quality: Int = 92): File {
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, quality, it) }
        return file
    }

    private fun readRotation(stream: InputStream): Int =
        runCatching { ExifInterface(stream).rotationDegrees }.getOrDefault(0)

    private fun applyRotation(bitmap: Bitmap, degrees: Int): Bitmap {
        if (degrees == 0) return bitmap
        val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        if (rotated != bitmap) bitmap.recycle()
        return rotated
    }

    private fun sampleSizeFor(width: Int, height: Int, maxSide: Int): Int {
        var sample = 1
        while (width / sample > maxSide || height / sample > maxSide) sample *= 2
        return sample
    }
}
