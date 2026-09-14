package com.sonngo.docscan.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.widget.ImageView
import com.sonngo.docscan.R
import java.io.File
import java.util.concurrent.Executors

/**
 * Tải ảnh thu nhỏ trên luồng nền kèm bộ nhớ đệm, đủ dùng cho danh sách
 * tài liệu mà không cần thêm thư viện ảnh bên ngoài.
 */
class ThumbnailLoader(private val targetSize: Int = 320) {

    private val cache = object : LruCache<String, Bitmap>(CACHE_SIZE_BYTES) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }
    private val executor = Executors.newFixedThreadPool(2)
    private val mainHandler = Handler(Looper.getMainLooper())

    fun load(imageView: ImageView, file: File) {
        val key = "${file.absolutePath}:${file.lastModified()}"
        imageView.setTag(R.id.thumbnail_tag, key)
        cache.get(key)?.let {
            imageView.setImageBitmap(it)
            return
        }
        imageView.setImageDrawable(null)
        executor.execute {
            val bitmap = decode(file) ?: return@execute
            cache.put(key, bitmap)
            mainHandler.post {
                if (imageView.getTag(R.id.thumbnail_tag) == key) imageView.setImageBitmap(bitmap)
            }
        }
    }

    fun evict(file: File) {
        cache.evictAll()
    }

    private fun decode(file: File): Bitmap? {
        if (!file.exists()) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0) return null
        var sample = 1
        while (bounds.outWidth / sample > targetSize * 2 || bounds.outHeight / sample > targetSize * 2) {
            sample *= 2
        }
        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.RGB_565
        }
        return BitmapFactory.decodeFile(file.absolutePath, options)
    }

    companion object {
        private const val CACHE_SIZE_BYTES = 12 * 1024 * 1024
    }
}
