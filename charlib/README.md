# charlib — thư viện nhân vật game 3D từ ảnh 2D

Biến ảnh concept nhân vật thành **Gaussian splat 3D** bằng ComfyUI + model
[TripoSplat](https://huggingface.co/VAST-AI/TripoSplat), chạy hàng loạt, rồi
xem tất cả trong một trang thư viện có trình xem 3D xoay được.

```
input/hiep-si-lua.png ─┐
input/phap-su.png ─────┼─▶ tools/charlib.py build ──▶ ComfyUI (TripoSplat) ──▶ library/characters/<id>/
input/characters.json ─┘                                                         model.spz  (splat 3D)
                                                                                 turntable.mp4 (video 360°)
                                                                                 model.glb  (mesh, tuỳ chọn)
                                                                                 meta.json
                                                         library/index.json ◀── tự cập nhật
index.html (trình xem) ◀── đọc library/index.json
```

Workflow dùng là template chính thức
[`3d_triposplat_image_to_gaussian_splat.json`](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/3d_triposplat_image_to_gaussian_splat.json)
của Comfy-Org. Script **không sửa** workflow: nó tải bản UI, tự “làm phẳng” các
subgraph thành định dạng API dựa trên `/object_info` của chính ComfyUI của bạn,
rồi chỉ thay ảnh đầu vào, seed, số gaussian, bật/tắt tách nền và tên file xuất.

Bên trong workflow:

1. **LoadImage** → **BiRefNet** tách nền (tắt được nếu ảnh đã trong suốt)
2. **TripoSplatPreprocessImage** → **TripoSplatConditioning** (DINOv3 ViT-H + Flux2 VAE)
3. **KSampler** (20 bước, cfg 3, dpmpp_2m) → **VAEDecodeTripoSplat** (mặc định 262 144 gaussian)
4. Xuất: **SplatToFile3D** → `.spz`; **RenderSplat** quỹ đạo → video 360°;
   nhánh **SplatToMesh** → `.glb` (thử nghiệm, mặc định tắt — bật bằng `--glb`)

## 1. Cài ComfyUI và model

Cần ComfyUI bản mới (template được lưu với comfy-core 0.22) và GPU NVIDIA.
Cập nhật ComfyUI trước nếu khi chạy báo thiếu nút `TripoSplat…` hoặc `SplatToFile3D`.

Tải model vào đúng thư mục:

| Thư mục `ComfyUI/models/` | File | Nguồn |
| --- | --- | --- |
| `background_removal/` | `birefnet.safetensors` (424 MB) | [Comfy-Org/BiRefNet](https://huggingface.co/Comfy-Org/BiRefNet/resolve/main/background_removal/birefnet.safetensors) |
| `diffusion_models/` | `triposplat_fp16.safetensors` (707 MB) | [VAST-AI/TripoSplat](https://huggingface.co/VAST-AI/TripoSplat/resolve/main/diffusion_models/triposplat_fp16.safetensors) |
| `clip_vision/` | `dino_v3_vit_h.safetensors` (1.57 GB) | [VAST-AI/TripoSplat](https://huggingface.co/VAST-AI/TripoSplat/resolve/main/clip_vision/dino_v3_vit_h.safetensors) |
| `vae/` | `triposplat_vae_decoder_fp16.safetensors` (550 MB) | [VAST-AI/TripoSplat](https://huggingface.co/VAST-AI/TripoSplat/resolve/main/vae/triposplat_vae_decoder_fp16.safetensors) |
| `vae/` | `flux2-vae.safetensors` (321 MB) | [VAST-AI/TripoSplat](https://huggingface.co/VAST-AI/TripoSplat/resolve/main/vae/flux2-vae.safetensors) |

Nên mở template trong ComfyUI (Templates → 3D → TripoSplat) và chạy thử một ảnh
bằng tay trước, để chắc model và nút đều có.

Đọc giấy phép của model TripoSplat trên Hugging Face trước khi dùng kết quả cho
game thương mại.

## 2. Chuẩn bị ảnh nhân vật

Đặt ảnh vào `input/` (`.png`, `.jpg`, `.webp`). Tên file thành `id` của nhân vật:
`Hiep Si Lua.png` → `hiep-si-lua`.

Ảnh càng “dễ đọc” thì 3D càng tốt:

- **Một nhân vật, toàn thân, nhìn thẳng**, tư thế A-pose / T-pose, tay không che thân.
- Nền trơn hoặc PNG trong suốt (khi đó thêm `--keep-background` để bỏ BiRefNet).
- Độ phân giải ≥ 1024 px, nhân vật chiếm phần lớn khung hình.
- Theo tác giả, TripoSplat làm tốt nhất với **đối tượng phong cách hoá**
  (stylized) — hợp với nhân vật game kiểu chibi, cel-shading, low-poly.
- Giữ cùng một phong cách vẽ cho cả bộ để thư viện đồng đều.

Thông tin hiển thị (tên, vai trò, phe, tag, mô tả, seed riêng…) để trong
`input/characters.json` — xem mẫu ở `input/characters.example.json`.

## 3. Chạy hàng loạt

Chỉ cần Python 3.9+ (không cần cài thêm gì). Từ thư mục `charlib/`:

```bash
python3 tools/charlib.py fetch-workflow          # tải template vào workflows/
python3 tools/charlib.py build                   # mọi ảnh mới trong input/
python3 tools/charlib.py build --glb             # xuất thêm mesh .glb
python3 tools/charlib.py build --server http://192.168.1.20:8188   # ComfyUI ở máy khác
```

Tuỳ chọn hay dùng:

| Tuỳ chọn | Tác dụng |
| --- | --- |
| `--only hiep-si-lua phap-su` | chỉ chạy các id này |
| `--force` | tạo lại nhân vật đã có (mặc định bỏ qua) |
| `--seed 123` | seed cố định; thiếu thì lấy từ `characters.json`, rồi ngẫu nhiên |
| `--num-gaussians 131072` | ít gaussian hơn → file nhẹ hơn; nhiều hơn chỉ dày hơn, không thêm chi tiết |
| `--keep-background` | bỏ bước tách nền |
| `--workflow file.json` | dùng workflow khác (bản UI hoặc bản *Export (API)*) |

Kết quả không ưng? Đổi seed và chạy lại riêng nhân vật đó:
`python3 tools/charlib.py build --only hiep-si-lua --force --seed 7`.
Seed đã dùng được ghi trong `meta.json` để tái tạo được.

`python3 tools/charlib.py convert` in ra workflow API đã làm phẳng — tiện để
kiểm tra hoặc dùng trong công cụ khác. `python3 tools/charlib.py index` dựng lại
`library/index.json` sau khi bạn sửa tay `meta.json`.

## 4. Xem thư viện

```bash
cd charlib && python3 -m http.server 8000     # mở http://localhost:8000
```

- Lưới thẻ: tìm kiếm, lọc theo vai trò / phe; rê chuột vào thẻ để xem video 360°.
- Bấm thẻ: trình xem splat (three.js + [Spark](https://sparkjs.dev)) — xoay, phóng,
  đổi nền, tải `.spz` / `.glb` / video. Link `#id` mở thẳng một nhân vật.
- **Nhân vật bị lộn ngược?** Bấm “⇅ Lật” (nhớ theo từng nhân vật trong trình duyệt),
  hoặc đặt `"viewer": {"flip": true}` trong `characters.json` để cố định cho mọi người.
- “Mở file…” xem nhanh một `.spz`/`.ply` bất kỳ trên máy, không tải lên đâu.

Thư mục `library/characters/demo-mannequin` là nhân vật **giả lập** (sinh bằng
`tools/make_demo_splat.py`, không phải TripoSplat) để thử trang — xoá khi đã có nhân vật thật.

Đưa lên mạng: tạo site Netlify mới với *Base directory* = `charlib`
(`netlify.toml` đã cấu hình sẵn, không cần build). Lưu ý cả `input/` cũng sẽ
được phục vụ công khai.

## 5. Dùng trong game

- **Web / three.js**: dùng thẳng `.spz` với Spark như `viewer/app.js`.
- **Unity / Unreal / Godot**: các plugin Gaussian splat phần lớn nhập `.ply`;
  chuyển `.spz` → `.ply` bằng thư viện [nianticlabs/spz](https://github.com/nianticlabs/spz)
  hoặc đổi `format` của nút **SplatToFile3D** trong workflow nếu ComfyUI của bạn có lựa chọn `.ply`.
- **Nhân vật cần rig / animation**: splat khó gắn xương. Dùng nhánh `--glb` làm
  mesh nền, rồi retopo + rig trong Blender (hoặc Mixamo). Mesh từ splat là thử
  nghiệm — coi như bản phác 3D chứ không phải asset hoàn chỉnh.

Mỗi `.spz` khoảng vài MB; nếu thư viện lớn, cân nhắc
[Git LFS](https://git-lfs.com) cho `library/**/*.spz`, `*.glb`, `*.mp4`.

## Kiểm tra

```bash
python3 -m unittest discover -s tests -v
```

Test dùng một ComfyUI giả lập (`tests/mock_comfy.py`) để chạy hết quy trình
upload → queue → chờ → tải kết quả → `index.json` với workflow thật, không cần GPU.
Test chuyển đổi workflow cần file template ở `workflows/` (chạy `fetch-workflow` trước).
