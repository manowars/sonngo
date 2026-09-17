# LinkNotes — hướng dẫn cho Claude Code

Thư mục này chứa một app ghi link chạy trên điện thoại (PWA / APK) và bộ script
chạy trên máy tính. Dữ liệu note **không** nằm ở đây — nó nằm trong một repo
GitHub riêng (nên là private) mà app đồng bộ lên.

## Định dạng dữ liệu

Trong repo dữ liệu, thư mục mặc định là `linknotes/data/`:

```
linknotes/data/
  topics.json     # luật phân loại topic
  2026-09.json    # mỗi tháng một file
  2026-10.json
```

Mỗi file tháng:

```json
{
  "month": "2026-09",
  "updatedAt": "2026-09-30T12:00:00.000Z",
  "count": 42,
  "items": [ /* note */ ]
}
```

Một note:

| Trường | Ý nghĩa |
| --- | --- |
| `id` | khoá bất biến. **Không bao giờ đổi** — đồng bộ dựa vào nó |
| `url` | link đã chuẩn hoá (bỏ `utm_*`, `fbclid`, `si`…) |
| `title` | tiêu đề; tự lấy từ trang web nếu bật, không thì suy từ URL |
| `note` | ghi chú tự do của người dùng |
| `tags` | các `#tag` gõ tay, đã bỏ dấu `#` |
| `topics` | topic tự động (+ `manualTopics` ghim tay) |
| `manualTopics` | topic người dùng ghim — luôn giữ khi phân loại lại |
| `domain`, `kind` | tự suy ra từ URL (`paper`, `code`, `video`, `docs`, …) |
| `fav`, `status` | ghim sao; `inbox` / `reading` / `done` |
| `createdAt` | quyết định note thuộc file tháng nào |
| `updatedAt` | trọng tài khi merge — bản mới hơn thắng |
| `deletedAt` | `null` hoặc ISO time. **Xoá = đặt tombstone**, không xoá khỏi mảng |

## Quy tắc khi sửa dữ liệu

1. Sửa xong thì cập nhật `updatedAt` của note đó, nếu không điện thoại sẽ ghi đè.
2. Không đổi `id`, không đổi `createdAt` (note sẽ nhảy sang file tháng khác).
3. Muốn xoá → đặt `deletedAt`, giữ nguyên record.
4. Cập nhật `count` = số note có `deletedAt === null`.
5. Xong thì `git commit && git push`; lần mở app kế tiếp điện thoại sẽ kéo về.

## Dashboard

`web/dashboard.html` là bản xem cho máy tính: đọc thẳng repo dữ liệu qua GitHub
API (**chỉ đọc**), vẽ biểu đồ và sinh bản tổng hợp Markdown. Nó dùng chung
`classify.js` và chung cấu hình trong localStorage với app ghi link.

- `js/dash/data.js` — tải, chuẩn hoá, lọc, gộp số liệu
- `js/dash/charts.js` — biểu đồ SVG tự vẽ (không dùng thư viện)
- `js/dash/digest.js` — sinh bản tổng hợp
- `js/dash/main.js` — nối mọi thứ lại

Màu biểu đồ lấy từ một bảng màu đã được kiểm định (an toàn với người mù màu ở cả
chế độ sáng và tối). Slot màu gán theo thứ tự cố định của thực thể, **không** theo
thứ hạng hiện tại — nên đổi bộ lọc không bao giờ đổi màu của một topic.

## Việc thường làm

```bash
# đường dẫn script, D = thư mục data của repo note
S=~/code/sonngo/linknotes/scripts
D=~/notes/linknotes/data

node $S/digest.mjs     --data $D              # sinh DIGEST.md (theo topic + tháng)
node $S/digest.mjs     --data $D --days 7     # chỉ 7 ngày gần nhất
node $S/reclassify.mjs --data $D --dry        # xem topic sẽ đổi thế nào
node $S/reclassify.mjs --data $D              # áp dụng
node $S/export.mjs     --data $D --format csv # xuất CSV
```

`reclassify.mjs` và app dùng chung đúng một file luật: `linknotes/web/js/classify.js`.
Muốn thêm topic mới thì sửa `topics.json` trong repo dữ liệu (thêm `keywords`,
`domains`), rồi chạy `reclassify.mjs`. Không cần đụng vào code.

## Gợi ý việc có thể nhờ Claude Code

- "Đọc `linknotes/data`, gom các link tuần này thành bản tóm tắt theo chủ đề."
- "Tìm link trùng / link chết và đánh dấu `deletedAt`."
- "Thêm topic `electrochemistry` vào `topics.json` với từ khoá phù hợp rồi phân loại lại."
- "Từ các link `kind: paper` tháng này, lập bảng: tiêu đề, tạp chí, vì sao liên quan đến đề tài PINN."
