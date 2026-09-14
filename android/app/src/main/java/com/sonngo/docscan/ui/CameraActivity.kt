package com.sonngo.docscan.ui

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.sonngo.docscan.R
import com.sonngo.docscan.data.DocumentRepository
import com.sonngo.docscan.databinding.ActivityCameraBinding
import com.sonngo.docscan.scan.BitmapIO
import com.sonngo.docscan.scan.EdgeDetector
import com.sonngo.docscan.scan.GrayImage
import com.sonngo.docscan.scan.Quad
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

/**
 * Màn hình camera: xem trực tiếp, nhận diện khung tài liệu theo thời gian thực
 * và chụp từng trang. Hỗ trợ chụp liên tiếp nhiều trang vào cùng một tài liệu.
 */
class CameraActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCameraBinding
    private lateinit var repository: DocumentRepository
    private lateinit var analysisExecutor: ExecutorService

    private var cameraProvider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null

    private var documentId: String? = null
    private var savedPages = 0

    private var flashOn = false
    private var autoCapture = true
    private var gridVisible = false

    private val capturing = AtomicBoolean(false)
    private var lastAnalysisAt = 0L
    private var lastQuad: Quad? = null
    private var stableFrames = 0

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startCamera() else {
            Toast.makeText(this, R.string.camera_permission_denied, Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private val cropLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        capturing.set(false)
        val id = result.data?.getStringExtra(Extras.DOCUMENT_ID)
        if (result.resultCode == Activity.RESULT_OK && id != null) {
            documentId = id
            savedPages++
            updateCounter()
            Toast.makeText(this, R.string.page_saved, Toast.LENGTH_SHORT).show()
        }
    }

    private val pickImageLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri -> uri?.let { importImage(it) } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCameraBinding.inflate(layoutInflater)
        setContentView(binding.root)

        repository = DocumentRepository(this)
        analysisExecutor = Executors.newSingleThreadExecutor()
        documentId = intent.getStringExtra(Extras.DOCUMENT_ID)

        binding.previewView.scaleType = PreviewView.ScaleType.FIT_CENTER
        binding.previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE

        binding.closeButton.setOnClickListener { finishWithResult() }
        binding.doneButton.setOnClickListener { finishWithResult() }
        binding.shutterButton.setOnClickListener { capturePhoto() }
        binding.galleryButton.setOnClickListener { pickImageLauncher.launch("image/*") }
        binding.flashButton.setOnClickListener { toggleFlash() }
        binding.autoButton.setOnClickListener { toggleAutoCapture() }
        binding.gridButton.setOnClickListener { toggleGrid() }

        updateAutoButton()
        updateCounter()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startCamera()
        } else {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        analysisExecutor.shutdown()
    }

    // ------------------------------------------------------------------
    // Thiết lập CameraX
    // ------------------------------------------------------------------

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = runCatching { future.get() }.getOrNull()
            if (provider == null) {
                Toast.makeText(this, R.string.camera_error, Toast.LENGTH_LONG).show()
                finish()
                return@addListener
            }
            cameraProvider = provider
            bindUseCases(provider)
        }, ContextCompat.getMainExecutor(this))
    }

    private fun bindUseCases(provider: ProcessCameraProvider) {
        val resolutionSelector = ResolutionSelector.Builder()
            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
            .build()

        val preview = Preview.Builder()
            .setResolutionSelector(resolutionSelector)
            .build()
            .also { it.setSurfaceProvider(binding.previewView.surfaceProvider) }

        val analysis = ImageAnalysis.Builder()
            .setResolutionSelector(resolutionSelector)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
            .build()
            .also { it.setAnalyzer(analysisExecutor, ::analyzeFrame) }

        val capture = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
            .setResolutionSelector(resolutionSelector)
            .setFlashMode(if (flashOn) ImageCapture.FLASH_MODE_ON else ImageCapture.FLASH_MODE_OFF)
            .build()
        imageCapture = capture

        runCatching {
            provider.unbindAll()
            provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis, capture)
        }.onFailure {
            Log.e(TAG, "Không gắn được use case của camera", it)
            Toast.makeText(this, R.string.camera_error, Toast.LENGTH_LONG).show()
        }
    }

    // ------------------------------------------------------------------
    // Nhận diện khung theo thời gian thực
    // ------------------------------------------------------------------

    private fun analyzeFrame(image: ImageProxy) {
        try {
            val now = System.currentTimeMillis()
            if (capturing.get() || now - lastAnalysisAt < ANALYSIS_INTERVAL_MS) return
            lastAnalysisAt = now

            val plane = image.planes[0]
            val buffer = plane.buffer
            val bytes = ByteArray(buffer.remaining())
            buffer.get(bytes)

            val gray = GrayImage.fromLuminance(
                luma = bytes,
                width = image.width,
                height = image.height,
                rowStride = plane.rowStride,
                pixelStride = plane.pixelStride,
                maxSize = EdgeDetector.WORK_SIZE
            ).rotated(image.imageInfo.rotationDegrees)

            val quad = EdgeDetector.detect(gray)
            runOnUiThread { onQuadDetected(quad, gray.width, gray.height) }
        } catch (error: Throwable) {
            Log.w(TAG, "Bỏ qua khung hình lỗi", error)
        } finally {
            image.close()
        }
    }

    private fun onQuadDetected(quad: Quad?, sourceWidth: Int, sourceHeight: Int) {
        binding.edgeOverlay.setQuad(quad, sourceWidth, sourceHeight)
        if (quad == null) {
            stableFrames = 0
            lastQuad = null
            binding.edgeOverlay.locked = false
            return
        }
        val previous = lastQuad
        val tolerance = max(sourceWidth, sourceHeight) * STABILITY_TOLERANCE_RATIO
        stableFrames = if (previous != null && quad.distanceTo(previous) < tolerance) stableFrames + 1 else 0
        lastQuad = quad
        binding.edgeOverlay.locked = stableFrames >= STABLE_FRAMES_REQUIRED

        if (autoCapture && stableFrames >= STABLE_FRAMES_REQUIRED) {
            stableFrames = 0
            capturePhoto()
        }
    }

    // ------------------------------------------------------------------
    // Chụp ảnh
    // ------------------------------------------------------------------

    private fun capturePhoto() {
        val capture = imageCapture ?: return
        if (!capturing.compareAndSet(false, true)) return
        binding.progress.visibility = View.VISIBLE

        val file = repository.newCaptureFile()
        val options = ImageCapture.OutputFileOptions.Builder(file).build()
        capture.takePicture(
            options,
            ContextCompat.getMainExecutor(this),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                    binding.progress.visibility = View.GONE
                    binding.edgeOverlay.clear()
                    openCrop(file.absolutePath)
                }

                override fun onError(exception: ImageCaptureException) {
                    Log.e(TAG, "Chụp ảnh thất bại", exception)
                    binding.progress.visibility = View.GONE
                    capturing.set(false)
                    Toast.makeText(this@CameraActivity, R.string.capture_error, Toast.LENGTH_SHORT).show()
                }
            }
        )
    }

    private fun openCrop(path: String) {
        val intent = Intent(this, CropActivity::class.java)
            .putExtra(Extras.IMAGE_PATH, path)
            .putExtra(Extras.DELETE_SOURCE_ON_FINISH, true)
        documentId?.let { intent.putExtra(Extras.DOCUMENT_ID, it) }
        cropLauncher.launch(intent)
    }

    private fun importImage(uri: Uri) {
        lifecycleScope.launch {
            val path = withContext(Dispatchers.IO) {
                val bitmap = BitmapIO.decodeUri(this@CameraActivity, uri) ?: return@withContext null
                val file: File = repository.newCaptureFile()
                BitmapIO.writeJpeg(bitmap, file)
                bitmap.recycle()
                file.absolutePath
            }
            if (path == null) {
                Toast.makeText(this@CameraActivity, R.string.import_failed, Toast.LENGTH_SHORT).show()
            } else {
                capturing.set(true)
                openCrop(path)
            }
        }
    }

    // ------------------------------------------------------------------
    // Điều khiển giao diện
    // ------------------------------------------------------------------

    private fun toggleFlash() {
        flashOn = !flashOn
        binding.flashButton.setImageResource(
            if (flashOn) R.drawable.ic_flash_on else R.drawable.ic_flash_off
        )
        imageCapture?.flashMode =
            if (flashOn) ImageCapture.FLASH_MODE_ON else ImageCapture.FLASH_MODE_OFF
    }

    private fun toggleAutoCapture() {
        autoCapture = !autoCapture
        stableFrames = 0
        updateAutoButton()
    }

    private fun updateAutoButton() {
        binding.autoButton.alpha = if (autoCapture) 1f else 0.45f
        binding.autoButton.contentDescription =
            getString(if (autoCapture) R.string.camera_auto_on else R.string.camera_auto_off)
        binding.hintText.text =
            getString(if (autoCapture) R.string.camera_auto_on else R.string.camera_hint)
    }

    private fun toggleGrid() {
        gridVisible = !gridVisible
        binding.gridOverlay.visibility = if (gridVisible) View.VISIBLE else View.GONE
        binding.gridButton.alpha = if (gridVisible) 1f else 0.45f
    }

    private fun updateCounter() {
        if (savedPages > 0) {
            binding.pageCounter.visibility = View.VISIBLE
            binding.pageCounter.text = savedPages.toString()
        } else {
            binding.pageCounter.visibility = View.GONE
        }
    }

    private fun finishWithResult() {
        val id = documentId
        if (savedPages > 0 && id != null) {
            setResult(Activity.RESULT_OK, Intent().putExtra(Extras.DOCUMENT_ID, id))
        } else {
            setResult(Activity.RESULT_CANCELED)
        }
        finish()
    }

    companion object {
        private const val TAG = "CameraActivity"
        private const val ANALYSIS_INTERVAL_MS = 120L
        private const val STABLE_FRAMES_REQUIRED = 6
        private const val STABILITY_TOLERANCE_RATIO = 0.022f
    }
}
