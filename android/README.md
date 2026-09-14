# DocScan — ứng dụng quét tài liệu cho Android

Ứng dụng quét văn bản kiểu CamScanner: mở camera, **tự động nhận diện khung giấy**
theo thời gian thực, nắn phẳng ảnh theo phối cảnh rồi cho phép chỉnh sửa và xuất PDF.

Toàn bộ xử lý ảnh chạy ngoại tuyến bằng Kotlin thuần — không dùng OpenCV,
không gọi dịch vụ đám mây, không cần Google Play Services.

## Tính năng

| Nhóm | Chi tiết |
|------|----------|
| Quét | Xem trực tiếp qua CameraX, khung tài liệu được vẽ đè theo thời gian thực |
| Tự động | Tự chụp khi khung đã ổn định; bật/tắt được. Có đèn flash và lưới canh khung |
| Cắt | Nắn phối cảnh 4 điểm; kéo góc hoặc cạnh, có kính lúp để đặt chính xác |
| Lọc ảnh | Làm nét (khử bóng, trắng nền), Xám, Đen trắng thích nghi, Dịu, Gốc |
| Chỉnh | Thanh trượt độ sáng và tương phản, xoay 90° |
| Tài liệu | Nhiều trang, kéo thả đổi thứ tự, đổi tên, xoá, chụp bổ sung |
| Xuất | PDF khổ A4, chia sẻ ảnh JPEG, lưu vào thư viện ảnh của máy |
| Nhập | Chọn ảnh có sẵn trong máy rồi xử lý như ảnh vừa chụp |

## Cách nhận diện khung hoạt động

1. Hạ ảnh xuống cạnh dài 360 px và chuyển sang ảnh xám (`GrayImage`).
2. Làm mờ Gauss 5×5, tính gradient Sobel.
3. Tách biên kiểu Canny: triệt tiêu phi cực đại, ngưỡng kép lấy theo phân vị 93%, lan truyền trễ.
4. Giãn nở 3×3 để nối các đoạn biên đứt.
5. Truy vết đường bao bằng Moore-neighbor, rút gọn bằng Douglas-Peucker.
6. Giữ đa giác 4 đỉnh, lồi, góc trong khoảng 60°–120°, diện tích ≥ 12% khung hình.
7. Nếu đường bao đứt quá nhiều: dự phòng bằng biến đổi Hough, lấy 2 đường ngang
   và 2 đường dọc mạnh nhất rồi giao nhau thành tứ giác.

Ảnh được nắn thẳng bằng `Matrix.setPolyToPoly` (biến đổi phối cảnh chạy bằng mã máy nên rất nhanh).

Mã nguồn liên quan:

- `scan/EdgeDetector.kt` — dò khung tài liệu
- `scan/GrayImage.kt` — ảnh xám, làm mờ, Sobel, ảnh tích phân
- `scan/PerspectiveTransform.kt` — nắn phẳng và xoay
- `scan/ImageFilters.kt` — bộ lọc ảnh scan
- `ui/view/EdgeOverlayView.kt` — vẽ khung trên preview
- `ui/view/CropOverlayView.kt` — kéo góc kèm kính lúp

## Yêu cầu

- Android 7.0 (API 24) trở lên
- Quyền máy ảnh

## Build

```bash
cd android
./gradlew assembleDebug      # APK gỡ lỗi
./gradlew assembleRelease    # APK phát hành (đã rút gọn bằng R8)
```

APK nằm ở `app/build/outputs/apk/debug/app-debug.apk`.

Workflow `.github/workflows/android.yml` build sẵn cả hai bản trên GitHub Actions
và đính kèm APK vào phần Artifacts của mỗi lần chạy.

> Bản release trong workflow được ký bằng khoá debug để cài thử ngay.
> Khi phát hành thật, hãy thay bằng keystore riêng trong `app/build.gradle.kts`.
