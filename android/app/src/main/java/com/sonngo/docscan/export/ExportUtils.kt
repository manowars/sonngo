package com.sonngo.docscan.export

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.sonngo.docscan.data.Document
import java.io.File
import java.io.FileInputStream

/** Chia sẻ file ra ngoài và lưu ảnh vào thư viện ảnh của máy. */
object ExportUtils {

    private const val RELATIVE_PATH = "Pictures/DocScan"

    fun uriFor(context: Context, file: File): Uri =
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)

    fun sharePdf(context: Context, file: File, title: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uriFor(context, file))
            putExtra(Intent.EXTRA_SUBJECT, title)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, title))
    }

    fun shareImages(context: Context, files: List<File>, title: String) {
        if (files.isEmpty()) return
        val uris = ArrayList(files.map { uriFor(context, it) })
        val intent = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).apply {
                type = "image/jpeg"
                putExtra(Intent.EXTRA_STREAM, uris[0])
            }
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                type = "image/jpeg"
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            }
        }
        intent.putExtra(Intent.EXTRA_SUBJECT, title)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(intent, title))
    }

    /** Lưu một trang scan vào thư viện ảnh; trả về Uri nếu thành công. */
    fun saveImageToGallery(context: Context, source: File, displayName: String): Uri? {
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.RELATIVE_PATH, RELATIVE_PATH)
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return null
        runCatching {
            resolver.openOutputStream(uri)?.use { out ->
                FileInputStream(source).use { input -> input.copyTo(out) }
            }
        }.onFailure {
            resolver.delete(uri, null, null)
            return null
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        }
        return uri
    }

    /** Tên file PDF an toàn, suy ra từ tên tài liệu. */
    fun pdfFileName(document: Document): String {
        val safe = document.name.replace(Regex("[^\\p{L}\\p{N} _-]"), "_").trim().ifEmpty { "document" }
        return "$safe.pdf"
    }

    fun exportCacheDir(context: Context): File =
        File(context.cacheDir, "export").apply { mkdirs() }

    @Suppress("unused")
    fun publicPicturesDir(): File? =
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)

    @Suppress("unused")
    fun writeBitmap(bitmap: Bitmap, file: File) {
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
    }
}
