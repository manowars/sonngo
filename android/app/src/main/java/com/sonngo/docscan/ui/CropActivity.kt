package com.sonngo.docscan.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.sonngo.docscan.R
import com.sonngo.docscan.data.DocumentRepository
import com.sonngo.docscan.databinding.ActivityCropBinding
import com.sonngo.docscan.scan.BitmapIO
import com.sonngo.docscan.scan.EdgeDetector
import com.sonngo.docscan.scan.PerspectiveTransform
import com.sonngo.docscan.scan.Quad
import com.sonngo.docscan.scan.ScanPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Xác nhận và tinh chỉnh khung tài liệu trước khi nắn phẳng.
 * Tự chạy nhận diện ngay khi mở, người dùng chỉ cần kéo lại nếu chưa khớp.
 */
class CropActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCropBinding
    private lateinit var repository: DocumentRepository

    private var sourceBitmap: Bitmap? = null
    private var sourcePath: String? = null
    private var documentId: String? = null
    private var pageId: String? = null
    private var deleteSourceOnFinish = false
    private var rotationApplied = 0

    private val editLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            setResult(Activity.RESULT_OK, result.data)
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCropBinding.inflate(layoutInflater)
        setContentView(binding.root)

        repository = DocumentRepository(this)
        sourcePath = intent.getStringExtra(Extras.IMAGE_PATH)
        documentId = intent.getStringExtra(Extras.DOCUMENT_ID)
        pageId = intent.getStringExtra(Extras.PAGE_ID)
        deleteSourceOnFinish = intent.getBooleanExtra(Extras.DELETE_SOURCE_ON_FINISH, false)

        binding.closeButton.setOnClickListener { cancel() }
        binding.autoDetectButton.setOnClickListener { runAutoDetect(showMessage = true) }
        binding.selectAllButton.setOnClickListener { binding.cropOverlay.selectWholeImage() }
        binding.rotateLeftButton.setOnClickListener { rotate(-90) }
        binding.rotateRightButton.setOnClickListener { rotate(90) }
        binding.nextButton.setOnClickListener { applyCrop() }

        loadImage()
    }

    private fun loadImage() {
        val path = sourcePath
        if (path.isNullOrEmpty()) {
            Toast.makeText(this, R.string.import_failed, Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            val bitmap = withContext(Dispatchers.IO) { BitmapIO.decodeFile(File(path)) }
            binding.progress.visibility = View.GONE
            if (bitmap == null) {
                Toast.makeText(this@CropActivity, R.string.import_failed, Toast.LENGTH_SHORT).show()
                finish()
                return@launch
            }
            sourceBitmap = bitmap

            val stored = intent.getFloatArrayExtra(Extras.QUAD)?.let { Quad.fromFloatArray(it) }
            if (stored != null) {
                binding.cropOverlay.setBitmap(bitmap, stored)
            } else {
                binding.cropOverlay.setBitmap(bitmap, null)
                runAutoDetect(showMessage = false)
            }
        }
    }

    private fun runAutoDetect(showMessage: Boolean) {
        val bitmap = sourceBitmap ?: return
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            val quad = withContext(Dispatchers.Default) { EdgeDetector.detect(bitmap) }
            binding.progress.visibility = View.GONE
            if (quad != null) {
                binding.cropOverlay.setQuad(quad)
            } else if (showMessage) {
                Toast.makeText(this@CropActivity, R.string.crop_detect_failed, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun rotate(degrees: Int) {
        val bitmap = sourceBitmap ?: return
        val quad = binding.cropOverlay.currentQuad()
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            val rotated = withContext(Dispatchers.Default) {
                PerspectiveTransform.rotate(bitmap, degrees)
            }
            val rotatedQuad = rotateQuad(quad, degrees, bitmap.width, bitmap.height)
            sourceBitmap = rotated
            rotationApplied = (rotationApplied + degrees + 360) % 360
            binding.progress.visibility = View.GONE
            binding.cropOverlay.setBitmap(rotated, rotatedQuad)
        }
    }

    /** Quay toạ độ 4 góc theo đúng phép xoay vừa áp dụng cho ảnh. */
    private fun rotateQuad(quad: Quad, degrees: Int, width: Int, height: Int): Quad {
        val normalized = ((degrees % 360) + 360) % 360
        if (normalized == 0) return quad
        val points = quad.points.map { point ->
            when (normalized) {
                90 -> ScanPoint(height - point.y, point.x)
                180 -> ScanPoint(width - point.x, height - point.y)
                else -> ScanPoint(point.y, width - point.x)
            }
        }
        return Quad(points)
    }

    private fun applyCrop() {
        val bitmap = sourceBitmap ?: return
        val quad = binding.cropOverlay.currentQuad()
        if (!quad.isPlausibleDocument() && quad.area < 1f) {
            Toast.makeText(this, R.string.crop_invalid, Toast.LENGTH_SHORT).show()
            return
        }
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            val paths = withContext(Dispatchers.Default) {
                val cropped = PerspectiveTransform.crop(bitmap, quad)
                val croppedFile = File(repository.cacheDir, "cropped_${System.currentTimeMillis()}.jpg")
                BitmapIO.writeJpeg(cropped, croppedFile)
                cropped.recycle()

                // Ảnh gốc sau khi xoay được lưu lại để lần sau còn cắt lại được.
                val rotatedFile = File(repository.cacheDir, "rotated_${System.currentTimeMillis()}.jpg")
                BitmapIO.writeJpeg(bitmap, rotatedFile)
                croppedFile.absolutePath to rotatedFile.absolutePath
            }
            binding.progress.visibility = View.GONE

            val intent = Intent(this@CropActivity, EditActivity::class.java)
                .putExtra(Extras.IMAGE_PATH, paths.first)
                .putExtra(EXTRA_SOURCE_PATH, paths.second)
                .putExtra(Extras.QUAD, quad.toFloatArray())
            documentId?.let { intent.putExtra(Extras.DOCUMENT_ID, it) }
            pageId?.let { intent.putExtra(Extras.PAGE_ID, it) }
            editLauncher.launch(intent)
        }
    }

    private fun cancel() {
        setResult(Activity.RESULT_CANCELED)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (deleteSourceOnFinish && isFinishing) {
            sourcePath?.let { File(it).delete() }
        }
    }

    companion object {
        const val EXTRA_SOURCE_PATH = "extra_source_path"
    }
}
