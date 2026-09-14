package com.sonngo.docscan.ui

import android.view.View
import android.view.ViewGroup
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updateLayoutParams
import androidx.core.view.updatePadding

/**
 * Từ Android 15, ứng dụng nhắm targetSdk 35 luôn bị buộc vẽ tràn ra sau thanh trạng
 * thái và thanh điều hướng. Nếu không xử lý, thanh nút dưới cùng sẽ nằm lọt dưới các
 * phím home/back (thấy rõ trên Samsung S24). Các hàm dưới đây chừa đúng phần bị che.
 *
 * Trên máy Android cũ hơn, hệ thống đã tự chừa chỗ nên inset bằng 0 và bố cục giữ nguyên.
 */

private fun View.systemBarInsets(windowInsets: WindowInsetsCompat) = windowInsets.getInsets(
    WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
)

/**
 * Cộng thêm phần bị thanh hệ thống che vào padding của view.
 * [extraBottomDp] là khoảng hở thêm cho thoáng tay.
 */
fun View.padForSystemBars(top: Boolean = false, bottom: Boolean = false, extraBottomDp: Int = 0) {
    val basePaddingTop = paddingTop
    val basePaddingBottom = paddingBottom
    val extra = (extraBottomDp * resources.displayMetrics.density).toInt()
    ViewCompat.setOnApplyWindowInsetsListener(this) { view, windowInsets ->
        val bars = view.systemBarInsets(windowInsets)
        view.updatePadding(
            top = if (top) basePaddingTop + bars.top else basePaddingTop,
            bottom = if (bottom) basePaddingBottom + bars.bottom + extra else basePaddingBottom
        )
        // Trả lại nguyên vẹn để các view anh em cũng nhận được inset.
        windowInsets
    }
    ViewCompat.requestApplyInsets(this)
}

/** Nâng nút nổi lên phía trên thanh điều hướng. */
fun View.liftAboveSystemBars(extraBottomDp: Int = 0) {
    val params = layoutParams as? ViewGroup.MarginLayoutParams ?: return
    val baseMargin = params.bottomMargin
    val extra = (extraBottomDp * resources.displayMetrics.density).toInt()
    ViewCompat.setOnApplyWindowInsetsListener(this) { view, windowInsets ->
        val bars = view.systemBarInsets(windowInsets)
        view.updateLayoutParams<ViewGroup.MarginLayoutParams> {
            bottomMargin = baseMargin + bars.bottom + extra
        }
        windowInsets
    }
    ViewCompat.requestApplyInsets(this)
}
