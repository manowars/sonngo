package com.sonngo.docscan.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.PopupMenu
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.StaggeredGridLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.sonngo.docscan.R
import com.sonngo.docscan.data.Document
import com.sonngo.docscan.data.DocumentRepository
import com.sonngo.docscan.databinding.ActivityMainBinding
import com.sonngo.docscan.export.ExportUtils
import com.sonngo.docscan.export.PdfExporter
import com.sonngo.docscan.scan.BitmapIO
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Màn hình chính: danh sách tài liệu đã quét. */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var repository: DocumentRepository
    private lateinit var adapter: DocumentAdapter
    private val thumbnails = ThumbnailLoader()

    private val scanLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val documentId = result.data?.getStringExtra(Extras.DOCUMENT_ID)
        if (result.resultCode == Activity.RESULT_OK && documentId != null) {
            openDocument(documentId)
        } else {
            reload()
        }
    }

    private val editLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val documentId = result.data?.getStringExtra(Extras.DOCUMENT_ID)
        if (result.resultCode == Activity.RESULT_OK && documentId != null) {
            openDocument(documentId)
        } else {
            reload()
        }
    }

    private val pickImageLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri -> uri?.let { importImage(it) } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        repository = DocumentRepository(this)
        adapter = DocumentAdapter(
            documentsDirProvider = { repository.documentDir(it) },
            thumbnails = thumbnails,
            onOpen = { openDocument(it.id) },
            onMore = { document, anchor -> showDocumentMenu(document, anchor) }
        )

        binding.documentList.layoutManager = StaggeredGridLayoutManager(2, StaggeredGridLayoutManager.VERTICAL)
        binding.documentList.adapter = adapter

        binding.scanFab.setOnClickListener { startScan(null) }
        binding.toolbar.setOnMenuItemClickListener { item ->
            if (item.itemId == R.id.action_import) {
                pickImageLauncher.launch("image/*")
                true
            } else {
                false
            }
        }
    }

    override fun onResume() {
        super.onResume()
        reload()
    }

    private fun reload() {
        lifecycleScope.launch {
            val documents = withContext(Dispatchers.IO) { repository.listDocuments() }
            adapter.submitList(documents)
            binding.emptyView.visibility = if (documents.isEmpty()) View.VISIBLE else View.GONE
            binding.documentList.visibility = if (documents.isEmpty()) View.GONE else View.VISIBLE
        }
    }

    private fun startScan(documentId: String?) {
        val intent = Intent(this, CameraActivity::class.java)
        documentId?.let { intent.putExtra(Extras.DOCUMENT_ID, it) }
        scanLauncher.launch(intent)
    }

    private fun openDocument(documentId: String) {
        startActivity(Intent(this, PagesActivity::class.java).putExtra(Extras.DOCUMENT_ID, documentId))
    }

    private fun importImage(uri: Uri) {
        lifecycleScope.launch {
            val path = withContext(Dispatchers.IO) {
                val bitmap = BitmapIO.decodeUri(this@MainActivity, uri) ?: return@withContext null
                val file = repository.newCaptureFile()
                BitmapIO.writeJpeg(bitmap, file)
                bitmap.recycle()
                file.absolutePath
            }
            if (path == null) {
                Toast.makeText(this@MainActivity, R.string.import_failed, Toast.LENGTH_SHORT).show()
                return@launch
            }
            editLauncher.launch(
                Intent(this@MainActivity, CropActivity::class.java)
                    .putExtra(Extras.IMAGE_PATH, path)
                    .putExtra(Extras.DELETE_SOURCE_ON_FINISH, true)
            )
        }
    }

    private fun showDocumentMenu(document: Document, anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 1, 0, R.string.action_rename)
            menu.add(0, 2, 1, R.string.action_share_pdf)
            menu.add(0, 3, 2, R.string.action_delete)
            setOnMenuItemClickListener { item ->
                when (item.itemId) {
                    1 -> renameDocument(document)
                    2 -> sharePdf(document)
                    3 -> confirmDelete(document)
                }
                true
            }
        }.show()
    }

    private fun renameDocument(document: Document) {
        val view = layoutInflater.inflate(R.layout.dialog_rename, null)
        val input = view.findViewById<TextInputEditText>(R.id.nameInput)
        input.setText(document.name)
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.action_rename)
            .setView(view)
            .setNegativeButton(R.string.action_cancel, null)
            .setPositiveButton(R.string.action_ok) { _, _ ->
                val name = input.text?.toString()?.trim().orEmpty()
                if (name.isNotEmpty()) {
                    repository.rename(document, name)
                    reload()
                }
            }
            .show()
    }

    private fun confirmDelete(document: Document) {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.delete_document_title)
            .setMessage(R.string.delete_document_message)
            .setNegativeButton(R.string.action_cancel, null)
            .setPositiveButton(R.string.action_delete) { _, _ ->
                repository.delete(document)
                reload()
            }
            .show()
    }

    private fun sharePdf(document: Document) {
        if (document.pages.isEmpty()) {
            Toast.makeText(this, R.string.no_pages, Toast.LENGTH_SHORT).show()
            return
        }
        lifecycleScope.launch {
            val file = withContext(Dispatchers.IO) {
                val target = java.io.File(ExportUtils.exportCacheDir(this@MainActivity), ExportUtils.pdfFileName(document))
                PdfExporter.export(document, repository.documentDir(document.id), target)
            }
            if (file == null) {
                Toast.makeText(this@MainActivity, R.string.export_failed, Toast.LENGTH_SHORT).show()
            } else {
                ExportUtils.sharePdf(this@MainActivity, file, document.name)
            }
        }
    }
}
