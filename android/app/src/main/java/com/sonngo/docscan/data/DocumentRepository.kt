package com.sonngo.docscan.data

import android.content.Context
import android.graphics.Bitmap
import com.sonngo.docscan.scan.ScanFilter
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * Lưu trữ tài liệu dưới dạng thư mục trong bộ nhớ riêng của ứng dụng.
 *
 *   files/documents/<docId>/meta.json
 *   files/documents/<docId>/src_<pageId>.jpg   ảnh gốc
 *   files/documents/<docId>/page_<pageId>.jpg  ảnh sau xử lý
 */
class DocumentRepository(context: Context) {

    private val appContext = context.applicationContext
    private val rootDir: File = File(appContext.filesDir, "documents").apply { mkdirs() }

    val cacheDir: File = File(appContext.cacheDir, "capture").apply { mkdirs() }

    fun documentDir(documentId: String): File =
        File(rootDir, documentId).apply { mkdirs() }

    fun listDocuments(): List<Document> =
        (rootDir.listFiles() ?: emptyArray())
            .filter { it.isDirectory }
            .mapNotNull { readDocument(it) }
            .sortedByDescending { it.updatedAt }

    fun getDocument(documentId: String): Document? = readDocument(File(rootDir, documentId))

    fun createDocument(name: String? = null): Document {
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val document = Document(
            id = id,
            name = name ?: defaultName(now),
            createdAt = now,
            updatedAt = now,
            pages = emptyList()
        )
        documentDir(id)
        save(document)
        return document
    }

    fun rename(document: Document, newName: String): Document {
        val updated = document.copy(name = newName, updatedAt = System.currentTimeMillis())
        save(updated)
        return updated
    }

    fun delete(document: Document) {
        File(rootDir, document.id).deleteRecursively()
    }

    fun deletePage(document: Document, page: Page): Document {
        val dir = documentDir(document.id)
        page.sourceFile(dir).delete()
        page.resultFile(dir).delete()
        val updated = document.copy(
            pages = document.pages.filterNot { it.id == page.id },
            updatedAt = System.currentTimeMillis()
        )
        save(updated)
        return updated
    }

    fun movePage(document: Document, fromIndex: Int, toIndex: Int): Document {
        if (fromIndex !in document.pages.indices || toIndex !in document.pages.indices) return document
        val pages = document.pages.toMutableList()
        pages.add(toIndex, pages.removeAt(fromIndex))
        val updated = document.copy(pages = pages, updatedAt = System.currentTimeMillis())
        save(updated)
        return updated
    }

    /**
     * Ghi một trang mới hoặc cập nhật trang đã có, kèm ảnh gốc và ảnh kết quả.
     */
    fun savePage(
        document: Document,
        pageId: String?,
        source: Bitmap,
        result: Bitmap,
        quad: FloatArray?,
        filter: ScanFilter,
        brightness: Int,
        contrast: Int,
        rotation: Int
    ): Pair<Document, Page> {
        val dir = documentDir(document.id)
        val id = pageId ?: UUID.randomUUID().toString()
        val page = Page(
            id = id,
            sourceFileName = "src_$id.jpg",
            resultFileName = "page_$id.jpg",
            quad = quad,
            filter = filter,
            brightness = brightness,
            contrast = contrast,
            rotation = rotation
        )
        writeJpeg(source, page.sourceFile(dir), quality = 88)
        writeJpeg(result, page.resultFile(dir), quality = 92)

        val pages = document.pages.toMutableList()
        val existingIndex = pages.indexOfFirst { it.id == id }
        if (existingIndex >= 0) pages[existingIndex] = page else pages.add(page)

        val updated = document.copy(pages = pages, updatedAt = System.currentTimeMillis())
        save(updated)
        return updated to page
    }

    fun save(document: Document) {
        val dir = documentDir(document.id)
        val json = JSONObject().apply {
            put("id", document.id)
            put("name", document.name)
            put("createdAt", document.createdAt)
            put("updatedAt", document.updatedAt)
            put("pages", JSONArray().apply {
                document.pages.forEach { put(pageToJson(it)) }
            })
        }
        File(dir, META_FILE).writeText(json.toString())
    }

    fun newCaptureFile(): File =
        File(cacheDir, "capture_${System.currentTimeMillis()}.jpg")

    fun clearCaptureCache() {
        cacheDir.listFiles()?.forEach { it.delete() }
    }

    private fun readDocument(dir: File): Document? {
        val metaFile = File(dir, META_FILE)
        if (!metaFile.exists()) return null
        return runCatching {
            val json = JSONObject(metaFile.readText())
            val pagesArray = json.optJSONArray("pages") ?: JSONArray()
            val pages = (0 until pagesArray.length()).mapNotNull { index ->
                pageFromJson(pagesArray.optJSONObject(index) ?: return@mapNotNull null)
            }.filter { File(dir, it.resultFileName).exists() }
            Document(
                id = json.optString("id", dir.name),
                name = json.optString("name", dir.name),
                createdAt = json.optLong("createdAt", dir.lastModified()),
                updatedAt = json.optLong("updatedAt", dir.lastModified()),
                pages = pages
            )
        }.getOrNull()
    }

    private fun pageToJson(page: Page): JSONObject = JSONObject().apply {
        put("id", page.id)
        put("source", page.sourceFileName)
        put("result", page.resultFileName)
        put("filter", page.filter.name)
        put("brightness", page.brightness)
        put("contrast", page.contrast)
        put("rotation", page.rotation)
        page.quad?.let { values ->
            put("quad", JSONArray().apply { values.forEach { put(it.toDouble()) } })
        }
    }

    private fun pageFromJson(json: JSONObject): Page? {
        val id = json.optString("id").takeIf { it.isNotEmpty() } ?: return null
        val quadArray = json.optJSONArray("quad")
        val quad = if (quadArray != null && quadArray.length() == 8) {
            FloatArray(8) { quadArray.optDouble(it, 0.0).toFloat() }
        } else {
            null
        }
        val filter = runCatching { ScanFilter.valueOf(json.optString("filter", ScanFilter.MAGIC.name)) }
            .getOrDefault(ScanFilter.MAGIC)
        return Page(
            id = id,
            sourceFileName = json.optString("source", "src_$id.jpg"),
            resultFileName = json.optString("result", "page_$id.jpg"),
            quad = quad,
            filter = filter,
            brightness = json.optInt("brightness", 0),
            contrast = json.optInt("contrast", 0),
            rotation = json.optInt("rotation", 0)
        )
    }

    private fun writeJpeg(bitmap: Bitmap, file: File, quality: Int) {
        FileOutputStream(file).use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
        }
    }

    private fun defaultName(timestamp: Long): String =
        "Scan " + SimpleDateFormat("dd-MM-yyyy HH:mm", Locale.getDefault()).format(Date(timestamp))

    companion object {
        private const val META_FILE = "meta.json"
    }
}
