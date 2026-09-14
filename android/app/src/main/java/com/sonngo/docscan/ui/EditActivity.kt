package com.sonngo.docscan.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.chip.Chip
import com.sonngo.docscan.R
import com.sonngo.docscan.data.Document
import com.sonngo.docscan.data.DocumentRepository
import com.sonngo.docscan.databinding.ActivityEditBinding
import com.sonngo.docscan.scan.BitmapIO
import com.sonngo.docscan.scan.ImageFilters
import com.sonngo.docscan.scan.PerspectiveTransform
import com.sonngo.docscan.scan.ScanFilter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.roundToInt

/**
 * Hậu xử lý ảnh scan: chọn bộ lọc, chỉnh sáng/tương phản, xoay rồi lưu thành một trang.
 */
class EditActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEditBinding
    private lateinit var repository: DocumentRepository

    /** Ảnh đã nắn phẳng ở độ phân giải làm việc. */
    private var croppedBitmap: Bitmap? = null

    /** Bản thu nhỏ dùng để xem trước bộ lọc cho mượt. */
    private var previewSource: Bitmap? = null

    private var filter = ScanFilter.MAGIC
    private var brightness = 0
    private var contrast = 0
    private var previewJob: Job? = null

    private var documentId: String? = null
    private var pageId: String? = null
    private var quad: FloatArray? = null
    private var sourcePath: String? = null
    private var croppedPath: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEditBinding.inflate(layoutInflater)
        setContentView(binding.root)

        repository = DocumentRepository(this)
        documentId = intent.getStringExtra(Extras.DOCUMENT_ID)
        pageId = intent.getStringExtra(Extras.PAGE_ID)
        quad = intent.getFloatArrayExtra(Extras.QUAD)
        croppedPath = intent.getStringExtra(Extras.IMAGE_PATH)
        sourcePath = intent.getStringExtra(CropActivity.EXTRA_SOURCE_PATH)
        filter = runCatching {
            ScanFilter.valueOf(intent.getStringExtra(Extras.FILTER) ?: ScanFilter.MAGIC.name)
        }.getOrDefault(ScanFilter.MAGIC)
        brightness = intent.getIntExtra(Extras.BRIGHTNESS, 0)
        contrast = intent.getIntExtra(Extras.CONTRAST, 0)

        buildFilterChips()
        binding.brightnessSlider.value = brightness.toFloat()
        binding.contrastSlider.value = contrast.toFloat()

        binding.backButton.setOnClickListener { finish() }
        binding.rotateButton.setOnClickListener { rotate() }
        binding.saveButton.setOnClickListener { save() }

        binding.brightnessSlider.addOnChangeListener { _, value, fromUser ->
            if (fromUser) {
                brightness = value.roundToInt()
                schedulePreview()
            }
        }
        binding.contrastSlider.addOnChangeListener { _, value, fromUser ->
            if (fromUser) {
                contrast = value.roundToInt()
                schedulePreview()
            }
        }

        loadImage()
    }

    private fun buildFilterChips() {
        val labels = mapOf(
            ScanFilter.MAGIC to R.string.filter_magic,
            ScanFilter.ORIGINAL to R.string.filter_original,
            ScanFilter.GRAYSCALE to R.string.filter_grayscale,
            ScanFilter.BLACK_WHITE to R.string.filter_black_white,
            ScanFilter.SOFT to R.string.filter_soft
        )
        labels.forEach { (value, labelRes) ->
            val chip = Chip(this).apply {
                text = getString(labelRes)
                isCheckable = true
                isChecked = value == filter
                tag = value
                setOnClickListener {
                    filter = value
                    schedulePreview()
                }
            }
            binding.filterGroup.addView(chip)
        }
    }

    private fun loadImage() {
        val path = croppedPath
        if (path.isNullOrEmpty()) {
            Toast.makeText(this, R.string.import_failed, Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            val loaded = withContext(Dispatchers.IO) {
                val bitmap = BitmapIO.decodeFile(File(path)) ?: return@withContext null
                bitmap to scaleForPreview(bitmap)
            }
            binding.progress.visibility = View.GONE
            if (loaded == null) {
                Toast.makeText(this@EditActivity, R.string.import_failed, Toast.LENGTH_SHORT).show()
                finish()
                return@launch
            }
            croppedBitmap = loaded.first
            previewSource = loaded.second
            renderPreview()
        }
    }

    private fun scaleForPreview(bitmap: Bitmap): Bitmap {
        val maxSide = maxOf(bitmap.width, bitmap.height)
        if (maxSide <= PREVIEW_MAX_SIDE) return bitmap
        val scale = PREVIEW_MAX_SIDE.toFloat() / maxSide
        return Bitmap.createScaledBitmap(
            bitmap,
            (bitmap.width * scale).roundToInt(),
            (bitmap.height * scale).roundToInt(),
            true
        )
    }

    private fun schedulePreview() {
        previewJob?.cancel()
        previewJob = lifecycleScope.launch {
            delay(120)
            renderPreview()
        }
    }

    private fun renderPreview() {
        val source = previewSource ?: return
        lifecycleScope.launch {
            val result = withContext(Dispatchers.Default) {
                ImageFilters.apply(source, filter, brightness, contrast)
            }
            binding.preview.setImageBitmap(result)
        }
    }

    private fun rotate() {
        val cropped = croppedBitmap ?: return
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            val rotated = withContext(Dispatchers.Default) {
                PerspectiveTransform.rotate(cropped, 90) to
                    PerspectiveTransform.rotate(previewSource ?: cropped, 90)
            }
            croppedBitmap = rotated.first
            previewSource = rotated.second
            binding.progress.visibility = View.GONE
            renderPreview()
        }
    }

    private fun save() {
        val cropped = croppedBitmap ?: return
        binding.progress.visibility = View.VISIBLE
        binding.saveButton.isEnabled = false
        lifecycleScope.launch {
            val savedId = withContext(Dispatchers.Default) {
                val document: Document = documentId?.let { repository.getDocument(it) }
                    ?: repository.createDocument()
                val processed = ImageFilters.apply(cropped, filter, brightness, contrast)
                val source = sourcePath?.let { BitmapIO.decodeFile(File(it)) } ?: cropped
                val (updated, _) = repository.savePage(
                    document = document,
                    pageId = pageId,
                    source = source,
                    result = processed,
                    quad = quad,
                    filter = filter,
                    brightness = brightness,
                    contrast = contrast,
                    rotation = 0
                )
                if (source !== cropped) source.recycle()
                processed.recycle()
                updated.id
            }
            binding.progress.visibility = View.GONE
            binding.saveButton.isEnabled = true
            cleanupTempFiles()
            setResult(Activity.RESULT_OK, Intent().putExtra(Extras.DOCUMENT_ID, savedId))
            finish()
        }
    }

    private fun cleanupTempFiles() {
        croppedPath?.let { File(it).delete() }
        sourcePath?.let { File(it).delete() }
    }

    companion object {
        private const val PREVIEW_MAX_SIDE = 1080
    }
}
