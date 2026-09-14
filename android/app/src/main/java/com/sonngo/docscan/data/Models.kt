package com.sonngo.docscan.data

import com.sonngo.docscan.scan.ScanFilter
import java.io.File

/**
 * Một trang trong tài liệu: giữ cả ảnh gốc lẫn ảnh đã xử lý để có thể chỉnh lại sau.
 */
data class Page(
    val id: String,
    /** Tên file ảnh chụp gốc, dùng khi người dùng muốn cắt lại. */
    val sourceFileName: String,
    /** Tên file ảnh đã nắn phẳng và lọc — đây là ảnh hiển thị và xuất PDF. */
    val resultFileName: String,
    /** 8 số toạ độ 4 góc trên ảnh gốc, null nếu trang được nhập thẳng. */
    val quad: FloatArray? = null,
    val filter: ScanFilter = ScanFilter.MAGIC,
    val brightness: Int = 0,
    val contrast: Int = 0,
    val rotation: Int = 0
) {
    fun sourceFile(dir: File) = File(dir, sourceFileName)
    fun resultFile(dir: File) = File(dir, resultFileName)

    override fun equals(other: Any?): Boolean = other is Page && other.id == id
    override fun hashCode(): Int = id.hashCode()
}

/** Tài liệu gồm nhiều trang scan. */
data class Document(
    val id: String,
    val name: String,
    val createdAt: Long,
    val updatedAt: Long,
    val pages: List<Page>
) {
    val pageCount: Int get() = pages.size
}
