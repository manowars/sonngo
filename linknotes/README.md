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
| `web/dashboard.html` | dashboard cho máy tính: biểu đồ + bản tổng hợp, đọc thẳng từ GitHub |
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

> **APK và web là hai kho cấu hình riêng.** APK chạy ở origin `https://localhost`
> của WebView, còn site Netlify ở tên miền của bạn — trình duyệt coi đó là hai
> nơi khác nhau, nên token và note lưu trong máy **không dùng chung**. Cài APK
> thì phải điền GitHub trong ⚙️ của chính APK. Cả hai vẫn đồng bộ về cùng một
> repo, nên dữ liệu vẫn gặp nhau ở đó.

### Cách B — file APK thật

Repo có sẵn workflow `.github/workflows/build-apk.yml`:

Mỗi lần đẩy thay đổi trong `linknotes/` là workflow tự build; muốn chạy tay thì
GitHub → tab **Actions** → **Build LinkNotes APK** → **Run workflow**.

Build xong, file `.apk` được đăng luôn vào
[Releases](https://github.com/manowars/sonngo/releases) — mở link đó **bằng
trình duyệt trên điện thoại**, tải về, mở file, cho phép "Cài ứng dụng từ nguồn
không xác định". (Bản trong mục Artifacts của Actions cũng có, nhưng phải đăng
nhập và tải về dạng zip.) APK nhận Share intent như PWA.

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

## Dashboard trên máy tính

Mở `https://<tên-site>.netlify.app/dashboard.html` (hoặc bấm 📊 trên thanh đầu
của app). Cùng tên miền nên nó **dùng lại luôn cấu hình bạn đã điền** — không
phải nhập token lần nữa.

Dashboard **chỉ đọc**, không bao giờ ghi. Nếu muốn an toàn hơn nữa, tạo riêng
một token chỉ có quyền `Contents: Read` cho máy tính.

Có gì trong đó:

| Phần | Trả lời câu hỏi |
| --- | --- |
| Số lớn + 4 ô chỉ số | Tôi đang lưu bao nhiêu, tuần này nhiều hay ít hơn tuần trước |
| **Nhịp lưu link** | Lưu đều hay lưu theo đợt (tự đổi sang tính theo tuần khi phạm vi dài) |
| **Lịch hoạt động** | Ngày nào bận, ngày nào bỏ trống |
| **Topic theo tháng** | Mối quan tâm dịch chuyển thế nào |
| **Loại nội dung** | Đang lưu paper hay video hay tool |
| **Nguồn / Tag hay dùng** | Hay lấy từ đâu, hay gắn thẻ gì |
| **Tổng hợp** | Bản Markdown của đúng phạm vi đang lọc |
| **Toàn bộ link** | Bảng tra cứu, sắp xếp được |

Hàng lọc trên cùng (thời gian · topic · loại · tìm kiếm) **chi phối tất cả** —
mọi biểu đồ, số liệu và bản tổng hợp đều đổi theo, nên các con số luôn khớp nhau.

Mỗi biểu đồ có nút **Bảng** để xem đúng số liệu đó dưới dạng bảng.

Nút **Chép kèm prompt** chép bản tổng hợp kèm sẵn một prompt để dán thẳng vào
Claude Code — nhờ gom nhóm lại, chỉ ra link trùng, và đề xuất topic mới.

Không muốn dùng token? Kéo thả thẳng các file `YYYY-MM.json` (hoặc file "Xuất
JSON" từ app) vào khung ở màn hình kết nối.

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

## Cứ mở lại trình duyệt là phải nhập token lại?

App lưu cấu hình vào **hai nơi**: `localStorage` (chính) và một bản dự phòng
trong IndexedDB cạnh các note. Nhiều trình duyệt xoá hai kho này không cùng lúc,
nên nếu `localStorage` bị xoá mà note vẫn còn thì app tự khôi phục token từ bản
dự phòng và báo một dòng ở đầu màn hình.

Nếu vẫn bị hỏi lại, mở ⚙️ → mục **Lưu trữ**. Nó cho biết:

| Dòng | Ý nghĩa khi có vấn đề |
| --- | --- |
| Địa chỉ site | Mỗi tên miền là một kho riêng. `abc.netlify.app` và `deploy-preview-3--abc.netlify.app` **không** dùng chung cấu hình |
| Lưu cấu hình (localStorage) | *BỊ CHẶN* → đang duyệt ẩn danh, hoặc trình duyệt chặn cookie/site data cho trang này |
| Bản lưu dự phòng | *chưa có* → IndexedDB cũng bị chặn |
| Chống trình duyệt tự xoá | *chưa bật* → trình duyệt có thể dọn dữ liệu khi thiếu chỗ |

Cách xử lý, theo thứ tự hay gặp:

1. **Đang ở chế độ ẩn danh?** Mở bằng cửa sổ thường.
2. **Trình duyệt bật "xoá cookie & dữ liệu site khi đóng"?** Chrome:
   Settings → Privacy and security → Third-party cookies →
   *Delete cookies and site data when you close all windows* — hãy thêm địa chỉ
   site vào danh sách **Allowed to use cookies**. Firefox có mục tương tự ở
   Settings → Privacy & Security → Cookies and Site Data.
3. **Cài app vào màn hình chính** (Chrome → ⋮ → Add to Home screen). App đã cài
   được trình duyệt ưu tiên giữ dữ liệu, và app tự xin quyền lưu lâu dài.
4. **Tiện ích chặn quảng cáo / tự xoá cookie** (Cookie AutoDelete…) → thêm site
   vào ngoại lệ.

## Không thấy note đâu?

Theo thứ tự này:

1. **Mở app trên điện thoại.** Có dải cảnh báo màu vàng/đỏ ở đầu màn hình không?
   - *"… chỉ nằm trên máy này — chưa kết nối GitHub"* → chưa làm bước 1–2 ở trên:
     chưa có repo note, hoặc chưa điền ⚙️. Note vẫn còn nguyên, bấm **Kết nối**.
   - *"Đồng bộ lỗi: …"* → thường là token hết hạn, sai repo, hoặc token không có
     quyền `Contents: Read and write`.
   - *"N note chưa lên GitHub"* → bấm **Đồng bộ**.
2. **Dùng APK?** Xem khung nhắc ở mục cài đặt Android bên trên — APK có kho cấu
   hình riêng, phải điền GitHub lần nữa trong ⚙️ của APK.
3. **Xem thẳng trên GitHub.** Vào `<repo note>/linknotes/data/` — phải thấy file
   `YYYY-MM.json` của tháng này. Không thấy thì note chưa hề rời khỏi điện thoại,
   và dashboard hiển thị trống là đúng.
4. **Dashboard báo gì?** Nếu nó nói *"Kho note đang trống"* thì nó đã kết nối
   được nhưng repo chưa có dữ liệu. Nếu có dải đỏ *"Không tải lại được…"* thì nó
   đang hiện bản lưu cũ và báo rõ lỗi.

App và dashboard đều gọi GitHub với `cache: no-store`, nên không có chuyện phải
chờ trình duyệt hết cache (GitHub trả `max-age=60` cho request có token).

## Quyền riêng tư

- Repo note nên **private**. App cảnh báo nếu phát hiện repo đang public.
- Token nằm trong `localStorage` của thiết bị, không đi đâu khác ngoài GitHub.
- Favicon lấy từ `google.com/s2/favicons` → lộ tên miền bạn lưu cho Google. Có
  công tắc tắt trong ⚙️ (khi tắt sẽ hiện emoji theo loại link).
- Netlify function `meta` chỉ fetch trang bạn lưu để lấy `<title>`; chặn sẵn
  địa chỉ nội bộ/localhost. Không bật thì app không gọi nó.
