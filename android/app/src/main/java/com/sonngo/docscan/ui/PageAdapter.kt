package com.sonngo.docscan.ui

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.sonngo.docscan.R
import com.sonngo.docscan.data.Page
import com.sonngo.docscan.databinding.ItemPageBinding
import java.io.File

class PageAdapter(
    private val documentDir: () -> File,
    private val thumbnails: ThumbnailLoader,
    private val onEdit: (Page) -> Unit,
    private val onDelete: (Page) -> Unit
) : RecyclerView.Adapter<PageAdapter.PageViewHolder>() {

    private val items = mutableListOf<Page>()

    fun submit(pages: List<Page>) {
        items.clear()
        items.addAll(pages)
        notifyDataSetChanged()
    }

    fun itemAt(position: Int): Page? = items.getOrNull(position)

    fun moveItem(from: Int, to: Int) {
        if (from !in items.indices || to !in items.indices) return
        items.add(to, items.removeAt(from))
        notifyItemMoved(from, to)
        notifyItemRangeChanged(minOf(from, to), kotlin.math.abs(from - to) + 1)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PageViewHolder {
        val binding = ItemPageBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return PageViewHolder(binding)
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: PageViewHolder, position: Int) {
        holder.bind(items[position], position)
    }

    inner class PageViewHolder(private val binding: ItemPageBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(page: Page, position: Int) {
            binding.pageLabel.text = binding.root.context.getString(R.string.page_index, position + 1)
            thumbnails.load(binding.pageThumbnail, page.resultFile(documentDir()))
            binding.root.setOnClickListener { onEdit(page) }
            binding.editPageButton.setOnClickListener { onEdit(page) }
            binding.deletePageButton.setOnClickListener { onDelete(page) }
        }
    }
}
