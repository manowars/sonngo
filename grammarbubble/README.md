# GrammarBubble

App chạy trên máy tính, hiện một **bubble nổi** luôn nằm trên các cửa sổ khác. Bạn copy đoạn văn tiếng Anh hoặc tiếng Hàn, click vào bubble, và một cửa sổ sẽ hiện ra với:

- **Bản đề xuất**: chữ bị xoá được gạch đỏ, chữ thêm vào được tô xanh (có thể tắt đánh dấu để xem bản sạch).
- **Chi tiết từng lỗi**: loại lỗi (ngữ pháp, chính tả, dấu câu, từ vựng, văn phong) kèm giải thích ngắn bằng tiếng Việt.
- Nút **Copy bản sửa** (hoặc `Ctrl+Enter`). Sau đó dán lại vào chỗ cũ.

Ngôn ngữ được tự nhận diện: có chữ Hangul thì là tiếng Hàn, còn lại là tiếng Anh. Bạn có thể chọn cố định ngôn ngữ, và chọn giọng văn: *Giữ giọng văn / Trang trọng / Học thuật / Thân thiện*. Với tiếng Hàn, app kiểm tra thêm 띄어쓰기, 조사, đuôi động từ và việc dùng nhất quán 존댓말/반말.

## Cài đặt

### Windows: tải file .exe (không cần Python)

Vào trang **Releases** của repo, mở bản `GrammarBubble build …` mới nhất, tải `GrammarBubble-….exe` rồi double-click.

- File chưa được ký số nên Windows SmartScreen có thể chặn ở lần đầu: bấm **More info**, rồi **Run anyway**.
- Lần khởi động đầu mất vài giây vì file `.exe` phải tự giải nén.
- Muốn app chạy cùng Windows: nhấn `Win+R`, gõ `shell:startup`, rồi đặt một shortcut của file `.exe` vào thư mục vừa mở.

File `.exe` được build tự động bởi GitHub Actions (`.github/workflows/build-grammarbubble-exe.yml`) mỗi khi thư mục `grammarbubble/` thay đổi. Workflow chạy test, build bằng PyInstaller, chạy `GrammarBubble.exe --selftest`, rồi đăng file lên Releases. Muốn tự build trên máy Windows:

```bat
pip install -r requirements.txt pyinstaller
pyinstaller GrammarBubble.spec
```

Kết quả nằm ở `dist\GrammarBubble.exe`. Icon được vẽ lại bằng `python make_icon.py` (cần Pillow).

### Chạy từ mã nguồn

Cần Python 3.10 trở lên.

**Windows:** double-click `run.bat`.
**macOS / Linux:** chạy `./run.sh`.

Lần chạy đầu, script tự tạo `.venv` và cài `PySide6` và `anthropic`.

## Chọn bộ máy sửa lỗi

Cấu hình nằm ở `~/.grammarbubble/config.json` (trên Windows là `C:\Users\<tên>\.grammarbubble\config.json`), tự tạo ở lần chạy đầu. Cách nhanh nhất để sửa: chuột phải vào bubble, chọn **Mở file cấu hình**. Lưu file xong là lần click bubble tiếp theo dùng cấu hình mới, không cần khởi động lại app.

### 1. Claude API (mặc định, chất lượng tốt nhất, cần Internet)

Lấy API key ở https://platform.claude.com, rồi chọn một trong hai cách:

- Đặt biến môi trường `ANTHROPIC_API_KEY` (khuyên dùng), hoặc
- Điền vào `"anthropic_api_key"` trong `config.json`.

```json
{
  "backend": "claude",
  "claude_model": "claude-opus-5-5",
  "claude_effort": "medium"
}
```

`claude_effort` nhận `low`, `medium` hoặc `high`. Đặt `low` thì nhanh và rẻ hơn, đặt `high` thì app soát kỹ hơn. Lưu ý: văn bản bạn kiểm tra sẽ được gửi lên Claude API.

### 2. Ollama (chạy offline hoàn toàn, văn bản không rời khỏi máy)

1. Cài Ollama: https://ollama.com
2. Tải model: `ollama pull qwen2.5:7b` (model này xử lý tiếng Hàn khá tốt; máy mạnh có thể dùng `qwen2.5:14b` hoặc `gemma3:12b`).
3. Chạy GrammarBubble. Không cần sửa gì thêm:
   - **Lần chạy đầu trên một máy**, nếu không có Claude API key mà Ollama đang chạy, app tự chuyển sang Ollama và tự chọn model đã cài (ưu tiên `qwen2.5`, rồi `qwen3`, `gemma3`…).
   - **Đổi model hoặc đổi qua lại với Claude**: chuột phải bubble → **Bộ máy sửa lỗi**. Menu này liệt kê các model Ollama đang có trên máy.

Nếu Ollama chạy ở máy khác trong mạng (ví dụ một máy có GPU), đặt `"ollama_url": "http://<địa chỉ IP>:11434"` trong file cấu hình. Máy chạy Ollama phải đặt biến môi trường `OLLAMA_HOST=0.0.0.0` thì máy khác mới kết nối vào được.

Model local nhỏ sửa ngữ pháp được, nhưng góp ý văn phong kém hơn Claude.

### Mang app sang máy khác

Chỉ cần copy file `GrammarBubble-….exe`. Cấu hình (API key, vị trí bubble, model) lưu riêng ở từng máy, trong `C:\Users\<tên>\.grammarbubble\config.json`. Máy mới có Ollama thì app tự dùng Ollama như mô tả ở trên. Muốn mang theo cả cấu hình cũ, copy thêm file `config.json` đó vào cùng vị trí trên máy mới.

### Các tuỳ chọn khác

| Khoá | Ý nghĩa |
|---|---|
| `explain_in` | Ngôn ngữ dùng để giải thích lỗi (mặc định `Vietnamese`; có thể đổi sang `English`, `Korean`) |
| `language` | `auto`, `en` hoặc `ko` |
| `tone` | `keep`, `formal`, `academic` hoặc `friendly` |
| `max_chars` | Độ dài tối đa của mỗi lần kiểm tra (mặc định 8000 ký tự) |

## Cách dùng bubble

- **Click**: kiểm tra văn bản đang có trong clipboard.
- **Kéo**: di chuyển bubble. Vị trí được nhớ cho lần sau.
- **Chuột phải**: kiểm tra lại, mở cửa sổ kết quả, đổi ngôn ngữ hoặc giọng văn, mở file cấu hình, thoát app.
- Khi app đang xử lý, bubble có một vòng cung vàng xoay quanh.
- Trong cửa sổ kết quả, bạn có thể sửa ô *Văn bản gốc* rồi bấm **Kiểm tra lại**. Nhấn `Esc` để ẩn cửa sổ.

## Chạy test

```bash
python -m unittest -v
```

Test dùng backend giả nên không cần API key hay Ollama.

## Cấu trúc

- `app.py`: giao diện (bubble, cửa sổ kết quả, diff theo từ), chạy request ở luồng nền nên UI không bị đứng.
- `engine.py`: prompt, JSON schema cho kết quả, backend Claude (structured outputs) và backend Ollama.
- `config.py`: đọc và ghi `~/.grammarbubble/config.json`.
- `GrammarBubble.spec`, `make_icon.py`, `icon.ico`, `icon.png`: đóng gói thành `.exe` và icon của app.
