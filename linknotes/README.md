# LinkNotes

Sổ tay link cá nhân: lưu nhanh trên điện thoại → tự phân loại theo **ngày /
topic / loại / nguồn** → đồng bộ về máy tính để Claude Code tổng hợp.

```
Điện thoại (PWA hoặc APK)  ──┐
                             ├─►  repo GitHub private  ──►  máy tính: git pull
Web trên Netlify (máy tính) ──┘      (mỗi tháng 1 JSON)        + Claude Code
```

Không có server, không có database, không có tài khoản phải đăng ký. **Repo git
chính là database.** Đó là lý do Claude Code trên máy tính đọc được mọi thứ chỉ
với `git pull`.

## Có gì bên trong

| Đường dẫn | Việc |
| --- | --- |
| `web/` | toàn bộ app (HTML/CSS/JS thuần, không cần build) — chạy trên Netlify và cũng là ruột của APK |
| `netlify/functions/meta.mjs` | lấy tiêu đề trang giúp (trình duyệt không tự fetch được vì CORS) |
| `android/` | vỏ Capacitor để đóng gói thành `.apk` |
| `scripts/` | công cụ chạy trên máy tính: `bootstrap`, `digest`, `reclassify`, `export` |
| `CLAUDE.md` | mô tả định dạng dữ liệu cho Claude Code |
| `data/topics.json` | bộ luật topic mặc định (mẫu) |

---

## 1. Tạo kho dữ liệu (repo private)

```bash
git clone https://github.com/manowars/sonngo.git
node sonngo/linknotes/scripts/bootstrap.mjs ~/notes
cd ~/notes
git init && git add -A && git commit -m "khởi tạo kho LinkNotes"
# tạo repo PRIVATE trên GitHub, ví dụ manowars/link-notes, rồi:
git remote add origin git@github.com:manowars/link-notes.git
git push -u origin main
```

> Đừng dùng repo `sonngo` (public) để chứa note. Ai cũng đọc được.

## 2. Tạo token cho app

GitHub → Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate new token:

- **Repository access**: Only select repositories → chọn `link-notes`
- **Permissions → Repository permissions → Contents**: `Read and write`
- Hạn dùng: tuỳ, nhớ gia hạn khi hết

Token chỉ được lưu trong `localStorage` của máy/điện thoại đó và chỉ gửi tới
`api.github.com`.

## 3. Đưa web lên Netlify

1. [app.netlify.com](https://app.netlify.com) → Add new site → Import from GitHub → chọn `sonngo`
2. **Base directory**: `linknotes`
3. **Build command**: `node scripts/make-icons.mjs`
4. **Publish directory**: `linknotes/web`
5. Deploy

`netlify.toml` đã cấu hình sẵn functions và redirect SPA. Xong sẽ có
`https://<tên-site>.netlify.app`.

Mở site → ⚙️ → điền `owner` / `repo` / `branch` = `main` / `path` =
`linknotes/data` / token → **Kiểm tra kết nối** → **Lưu & đồng bộ**.

## 4. Cài lên điện thoại

### Cách A — PWA (khuyến nghị, 30 giây, tự cập nhật)

Mở site bằng **Chrome trên Android** → menu ⋮ → **Add to Home screen** →
Install. Android tạo icon riêng, chạy toàn màn hình, dùng được offline, **và
xuất hiện trong menu Share** của mọi app khác.

Từ đó: trong Chrome/YouTube/Facebook bấm Share → chọn **LinkNotes** → link được
lưu và phân loại ngay.

### Cách B — file APK thật

Repo có sẵn workflow `.github/workflows/build-apk.yml`:

GitHub → tab **Actions** → **Build LinkNotes APK** → **Run workflow**
(bật `release` nếu muốn file được đính vào một GitHub Release).

Build xong tải `.apk` ở mục Artifacts, chép sang điện thoại, mở, cho phép "Cài
ứng dụng từ nguồn không xác định". APK cũng nhận Share intent như PWA.

Muốn build tại máy (cần Android SDK + JDK 21):

```bash
cd linknotes/android
npm install
node prepare.mjs          # chép web/ → www/
npx cap add android
node patch-android.mjs    # gắn share intent, tên app, icon
npx cap sync android
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

APK là bản **debug** (ký bằng khoá debug). Đủ để tự cài, không đưa lên Play
Store được.

---

## Dùng hằng ngày

- **Dán link** vào ô trên cùng rồi bấm Lưu. Gõ kèm ghi chú và `#tag` cũng được:
  `https://arxiv.org/abs/2403.11111 PINN cho lò tầng sôi #đọc-sau`
- Gõ chữ không có link → lưu thành ghi chú thường.
- **＋** mở form đầy đủ (tự dán link từ clipboard nếu có).
- Chips ở trên lọc theo hôm nay / 7 ngày / ghim / topic / loại.
- Ô **Theo ngày / topic / loại / nguồn** đổi cách gom nhóm.
- Mọi thứ hoạt động **offline**; note nằm trong IndexedDB và tự đẩy lên khi có mạng.

### Phân loại tự động

| Chiều | Cách suy ra |
| --- | --- |
| Ngày | `createdAt`, gom theo Hôm nay / Hôm qua / ngày |
| Loại | tên miền + đuôi file → `paper`, `code`, `video`, `docs`, `course`, `dataset`, `qa`, `social`, `article`, `tool`, `pdf`… |
| Topic | khớp từ khoá trong `topics.json` với URL + tiêu đề + ghi chú |
| Tag | mọi `#tag` bạn gõ |
| Nguồn | tên miền |

Topic mặc định đã chỉnh theo hướng nghiên cứu CFD/AI/hydrogen: *CFD &
Simulation, AI & ML, Energy & H2, Research & Career, Programming, Writing &
Viz, Korea & Life, Learning*. Sửa `topics.json` trong repo note để thêm bớt,
rồi chạy `reclassify.mjs`.

Trong form sửa, bấm vào topic để **ghim tay** (📌) — phân loại lại sẽ luôn giữ.

---

## Trên máy tính

```bash
S=~/code/sonngo/linknotes/scripts
D=~/notes/linknotes/data

cd ~/notes && git pull

node $S/digest.mjs     --data $D            # DIGEST.md gom theo topic + tháng
node $S/digest.mjs     --data $D --days 7   # chỉ tuần này
node $S/reclassify.mjs --data $D --dry      # thử phân loại lại
node $S/export.mjs     --data $D --format csv
```

Rồi nhờ Claude Code, ví dụ:

> "Đọc `linknotes/data`, gom các paper tôi lưu tháng này thành bảng: tiêu đề,
> tạp chí, liên quan gì tới đề tài PINN, mức ưu tiên đọc."

`CLAUDE.md` mô tả sẵn định dạng và các quy tắc sửa dữ liệu an toàn.

---

## Đồng bộ hoạt động thế nào

- Mỗi note có `id` và `updatedAt`. Khi đồng bộ: kéo tất cả file tháng về, merge
  theo `updatedAt` (bản mới hơn thắng), rồi ghi lại file tháng nào có thay đổi.
- Xoá là **tombstone** (`deletedAt`), nên xoá trên điện thoại cũng xoá trên máy.
- Ghi file dùng `sha` của GitHub; nếu đụng độ thì tự đọc lại và thử lại một lần.
- Hai thiết bị sửa cùng lúc → không mất dữ liệu, chỉ có trường bị ghi đè theo
  bản mới hơn. (Đã kiểm thử hai "thiết bị" chạy song song.)

## Quyền riêng tư

- Repo note nên **private**. App cảnh báo nếu phát hiện repo đang public.
- Token nằm trong `localStorage` của thiết bị, không đi đâu khác ngoài GitHub.
- Favicon lấy từ `google.com/s2/favicons` → lộ tên miền bạn lưu cho Google. Có
  công tắc tắt trong ⚙️ (khi tắt sẽ hiện emoji theo loại link).
- Netlify function `meta` chỉ fetch trang bạn lưu để lấy `<title>`; chặn sẵn
  địa chỉ nội bộ/localhost. Không bật thì app không gọi nó.
