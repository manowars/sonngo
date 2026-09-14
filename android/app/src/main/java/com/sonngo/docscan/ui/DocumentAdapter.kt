package com.sonngo.docscan.ui

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.sonngo.docscan.R
import com.sonngo.docscan.data.Document
import com.sonngo.docscan.databinding.ItemDocumentBinding
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class DocumentAdapter(
    private val documentsDirProvider: (String) -> File,
    private val thumbnails: ThumbnailLoader,
    private val onOpen: (Document) -> Unit,
    private val onMore: (Document, android.view.View) -> Unit
) : ListAdapter<Document, DocumentAdapter.DocumentViewHolder>(DIFF) {

    private val dateFormat = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): DocumentViewHolder {
        val binding = ItemDocumentBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return DocumentViewHolder(binding)
    }

    override fun onBindViewHolder(holder: DocumentViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class DocumentViewHolder(
        private val binding: ItemDocumentBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(document: Document) {
            binding.documentName.text = document.name
            binding.documentMeta.text = binding.root.context.getString(
                R.string.pages_count,
                document.pageCount
            ) + " • " + dateFormat.format(Date(document.updatedAt))

            val first = document.pages.firstOrNull()
            if (first != null) {
                thumbnails.load(binding.thumbnail, first.resultFile(documentsDirProvider(document.id)))
            } else {
                binding.thumbnail.setImageResource(R.drawable.ic_document)
            }
            binding.root.setOnClickListener { onOpen(document) }
            binding.moreButton.setOnClickListener { onMore(document, it) }
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<Document>() {
            override fun areItemsTheSame(oldItem: Document, newItem: Document) = oldItem.id == newItem.id
            override fun areContentsTheSame(oldItem: Document, newItem: Document) = oldItem == newItem
        }
    }
}
