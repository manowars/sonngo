package com.sonngo.docscan.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.sonngo.docscan.R
import com.sonngo.docscan.data.Document
import com.sonngo.docscan.data.DocumentRepository
import com.sonngo.docscan.data.Page
import com.sonngo.docscan.databinding.ActivityPagesBinding
import com.sonngo.docscan.export.ExportUtils
import com.sonngo.docscan.export.PdfExporter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** Chi tiết một tài liệu: danh sách trang, sắp xếp lại, xuất PDF và chia sẻ. */
class PagesActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPagesBinding
    private lateinit var repository: DocumentRepository
    private lateinit var adapter: PageAdapter
    private val thumbnails = ThumbnailLoader()

    private var document: Document? = null
    private var documentId: String = ""
    private var pendingMove: Pair<Int, Int>? = null

    private val scanLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { reload() }

    private val editLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { reload() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPagesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        repository = DocumentRepository(this)
        documentId = intent.getStringExtra(Extras.DOCUMENT_ID).orEmpty()
        if (documentId.isEmpty()) {
            finish()
            return
        }

        adapter = PageAdapter(
            documentDir = { repository.documentDir(documentId) },
            thumbnails = thumbnails,
            onEdit = { editPage(it) },
            onDelete = { confirmDeletePage(it) }
        )
        binding.pageList.layoutManager = LinearLayoutManager(this)
        binding.pageList.adapter = adapter
        attachDragToReorder()

        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.toolbar.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                R.id.action_rename -> {
                    renameDocument()
                    true
                }

                R.id.action_share_pdf -> {
                    exportPdf(share = true)
                    true
                }

                R.id.action_delete -> {
                    confirmDeleteDocument()
                    true
                }

                else -> false
            }
        }

        binding.addPageFab.setOnClickListener {
            scanLauncher.launch(
                Intent(this, CameraActivity::class.java).putExtra(Extras.DOCUMENT_ID, documentId)
            )
        }
        binding.exportPdfButton.setOnClickListener { exportPdf(share = true) }
        binding.shareImagesButton.setOnClickListener { shareImages() }
        binding.saveGalleryButton.setOnClickListener { saveToGallery() }
    }

    override fun onResume() {
        super.onResume()
        reload()
    }

    private fun reload() {
        lifecycleScope.launch {
            val loaded = withContext(Dispatchers.IO) { repository.getDocument(documentId) }
            if (loaded == null) {
                finish()
                return@launch
            }
            document = loaded
            binding.toolbar.title = loaded.name
            binding.toolbar.subtitle = getString(R.string.pages_count, loaded.pageCount)
            adapter.submit(loaded.pages)
            binding.emptyText.visibility = if (loaded.pages.isEmpty()) View.VISIBLE else View.GONE
        }
    }

    private fun attachDragToReorder() {
        val callback = object : ItemTouchHelper.SimpleCallback(
            ItemTouchHelper.UP or ItemTouchHelper.DOWN,
            0
        ) {
            override fun onMove(
                recyclerView: RecyclerView,
                viewHolder: RecyclerView.ViewHolder,
                target: RecyclerView.ViewHolder
            ): Boolean {
                val from = viewHolder.bindingAdapterPosition
                val to = target.bindingAdapterPosition
                adapter.moveItem(from, to)
                val existing = pendingMove
                pendingMove = (existing?.first ?: from) to to
                return true
            }

            override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) = Unit

            override fun clearView(recyclerView: RecyclerView, viewHolder: RecyclerView.ViewHolder) {
                super.clearView(recyclerView, viewHolder)
                val move = pendingMove ?: return
                pendingMove = null
                val current = document ?: return
                document = repository.movePage(current, move.first, move.second)
            }
        }
        ItemTouchHelper(callback).attachToRecyclerView(binding.pageList)
    }

    private fun editPage(page: Page) {
        val dir = repository.documentDir(documentId)
        val source = page.sourceFile(dir)
        val target = if (source.exists()) source else page.resultFile(dir)
        val intent = Intent(this, CropActivity::class.java)
            .putExtra(Extras.IMAGE_PATH, target.absolutePath)
            .putExtra(Extras.DOCUMENT_ID, documentId)
            .putExtra(Extras.PAGE_ID, page.id)
            .putExtra(Extras.FILTER, page.filter.name)
            .putExtra(Extras.BRIGHTNESS, page.brightness)
            .putExtra(Extras.CONTRAST, page.contrast)
        if (source.exists()) page.quad?.let { intent.putExtra(Extras.QUAD, it) }
        editLauncher.launch(intent)
    }

    private fun confirmDeletePage(page: Page) {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.delete_page_title)
            .setNegativeButton(R.string.action_cancel, null)
            .setPositiveButton(R.string.action_delete) { _, _ ->
                val current = document ?: return@setPositiveButton
                document = repository.deletePage(current, page)
                reload()
            }
            .show()
    }

    private fun confirmDeleteDocument() {
        val current = document ?: return
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.delete_document_title)
            .setMessage(R.string.delete_document_message)
            .setNegativeButton(R.string.action_cancel, null)
            .setPositiveButton(R.string.action_delete) { _, _ ->
                repository.delete(current)
                setResult(Activity.RESULT_OK)
                finish()
            }
            .show()
    }

    private fun renameDocument() {
        val current = document ?: return
        val view = layoutInflater.inflate(R.layout.dialog_rename, null)
        val input = view.findViewById<TextInputEditText>(R.id.nameInput)
        input.setText(current.name)
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.action_rename)
            .setView(view)
            .setNegativeButton(R.string.action_cancel, null)
            .setPositiveButton(R.string.action_ok) { _, _ ->
                val name = input.text?.toString()?.trim().orEmpty()
                if (name.isNotEmpty()) {
                    document = repository.rename(current, name)
                    reload()
                }
            }
            .show()
    }

    private fun exportPdf(share: Boolean) {
        val current = document ?: return
        if (current.pages.isEmpty()) {
            Toast.makeText(this, R.string.no_pages, Toast.LENGTH_SHORT).show()
            return
        }
        lifecycleScope.launch {
            val file = withContext(Dispatchers.IO) {
                val target = File(ExportUtils.exportCacheDir(this@PagesActivity), ExportUtils.pdfFileName(current))
                PdfExporter.export(current, repository.documentDir(current.id), target)
            }
            if (file == null) {
                Toast.makeText(this@PagesActivity, R.string.export_failed, Toast.LENGTH_SHORT).show()
            } else if (share) {
                ExportUtils.sharePdf(this@PagesActivity, file, current.name)
            }
        }
    }

    private fun shareImages() {
        val current = document ?: return
        if (current.pages.isEmpty()) {
            Toast.makeText(this, R.string.no_pages, Toast.LENGTH_SHORT).show()
            return
        }
        val dir = repository.documentDir(current.id)
        ExportUtils.shareImages(this, current.pages.map { it.resultFile(dir) }, current.name)
    }

    private fun saveToGallery() {
        val current = document ?: return
        if (current.pages.isEmpty()) {
            Toast.makeText(this, R.string.no_pages, Toast.LENGTH_SHORT).show()
            return
        }
        lifecycleScope.launch {
            val saved = withContext(Dispatchers.IO) {
                val dir = repository.documentDir(current.id)
                current.pages.mapIndexed { index, page ->
                    ExportUtils.saveImageToGallery(
                        this@PagesActivity,
                        page.resultFile(dir),
                        "${current.name}_${index + 1}.jpg"
                    )
                }.count { it != null }
            }
            if (saved > 0) {
                Toast.makeText(
                    this@PagesActivity,
                    getString(R.string.saved_to_gallery, saved),
                    Toast.LENGTH_SHORT
                ).show()
            } else {
                Toast.makeText(this@PagesActivity, R.string.save_gallery_failed, Toast.LENGTH_SHORT).show()
            }
        }
    }
}
