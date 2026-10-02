/* Site-wide EN / VI / KO language switching.
 *
 * Markup: <el data-i18n="key"> — its English innerHTML stays in the page (SEO,
 * no-JS) and is restored when switching back to English; VI/KO come from D.
 * <input data-i18n-placeholder="key"> works the same for placeholders.
 * <time datetime="YYYY-MM-DD"> is re-formatted for the active locale.
 * Dynamic strings call window.i18n.t(key, vars). A 'langchange' event fires
 * on document after every switch so scripts can re-render.
 */
(function () {
  'use strict';
  var LANGS = ['en', 'vi', 'ko'];
  var LOCALE = { en: 'en-US', vi: 'vi-VN', ko: 'ko-KR' };
  var A = 'target="_blank" rel="noopener" style="color:var(--accent)"';

  // English for strings that only exist in JS (everything else is in the HTML).
  var EN = {
    'pubs.showAll': 'Show all {n} ▾',
    'pubs.showLess': 'Show less ▴',
    'skill.pinn': 'Physics-Informed Neural Networks',
    'skill.ke': 'Knowledge Extraction',
    'skill.dl': 'Deep Learning',
    'skill.en': 'English',
    'skill.vi': 'Vietnamese',
    'skill.ko': 'Korean',
    'skill.teach': 'Teaching & Consulting',
    'blog.minRead': '{n} min read',
    'lang.name.en': 'English',
    'lang.name.vi': 'Vietnamese',
    'lang.name.ko': 'Korean'
  };

  var D = {
    vi: {
      'nav.about': 'Giới thiệu', 'nav.experience': 'Kinh nghiệm', 'nav.publications': 'Công bố',
      'nav.projects': 'Dự án', 'nav.blog': 'Blog', 'nav.gallery': 'Thư viện', 'nav.contact': 'Liên hệ',

      'hero.badge': '<span class="dot"></span> Giáo sư nghiên cứu · Đại học Quốc gia Hankyong, Hàn Quốc',
      'hero.sub': 'Kết hợp <strong>động lực học chất lưu tính toán (CFD)</strong> và <strong>học sâu</strong> để thiết kế các thiết bị phản ứng hóa học thế hệ mới — từ sản xuất hydro không phát thải CO<sub>2</sub> đến các quá trình thu giữ carbon.',
      'hero.browse': 'Xem công bố', 'hero.touch': 'Liên hệ',
      'stat.cit': 'Trích dẫn', 'stat.pub': 'Công bố', 'stat.yr': 'Năm nghiên cứu',

      'about.kicker': 'Hướng nghiên cứu',
      'about.title': 'Đa vật lý · Đa pha · Đa thang đo',
      'about.intro': 'Giáo sư nghiên cứu tại Khoa Kỹ thuật Hóa học, Đại học Quốc gia Hankyong, thành viên <a href="http://cospe.hknu.ac.kr/" ' + A + '>Trung tâm Kỹ thuật Quá trình Bền vững (CoSPE)</a>. Giáo sư thỉnh giảng tại Khoa Công nghệ Nhiệt Lạnh, <a href="https://iuh.edu.vn/" ' + A + '>Trường Đại học Công nghiệp TP. Hồ Chí Minh (IUH)</a>. Đồng sáng lập &amp; cố vấn tại <a href="https://cfdways.com/en/" ' + A + '>CFDWAYS LLC</a>.',
      'b1.t': 'CFD cho các quá trình hóa học',
      'b1.d': 'CFD đa pha Euler &amp; VOF cho tầng sôi, cột sủi bọt, thiết bị phản ứng kim loại nóng chảy, cyclone, thiết bị reforming và lò CVD — kiểm chứng bằng thực nghiệm và mở rộng quy mô từ phòng thí nghiệm đến công nghiệp.',
      'b2.t': 'Mạng nơ-ron tích hợp vật lý (PINN)',
      'b2.d': 'Kết hợp các định luật nguyên lý cơ bản với học sâu (TensorFlow 2) để giải mô hình thiết bị phản ứng, nhận dạng tham số và tối ưu hóa.',
      'b3.t': 'Hydro không phát thải CO₂',
      'b3.d': 'Nhiệt phân methane trong cột sủi bọt kim loại nóng chảy — thủy động lực học, động học và mở rộng quy mô.',
      'b4.t': 'Methane hóa CO₂',
      'b4.d': 'Thiết kế thiết bị phản ứng tầng cố định và tầng sôi cho thu giữ &amp; sử dụng carbon, từ động học đến thiết kế tối ưu.',
      'b5.t': 'Thiết kế quá trình quy mô công nghiệp',
      'b5.d': 'Hơn 18 dự án được tài trợ cùng NRF Hàn Quốc, KIER, Hyosung, GS E&amp;C và các đối tác bán dẫn — thiết bị reforming hơi nước methane, dây chuyền sợi carbon, thiết bị tách ngoài khơi, hydrocracking pha huyền phù và epitaxy SiC.',

      'exp.kicker': 'Lý lịch', 'exp.title': 'Kinh nghiệm &amp; Học vấn',
      'exp.employment': '<span>💼</span> Công tác', 'exp.education': '<span>🎓</span> Học vấn',
      'exp.teaching': '<span>📖</span> Giảng dạy &amp; Biên tập',
      'd.aug2025': '08/2025 — nay', 'd.2020now': '2020 — nay', 'd.apr2026': '04/2026 — nay', 'd.2024now': '2024 — nay',
      'job.visiting': 'Giáo sư thỉnh giảng',
      'org.iuh': 'Khoa Công nghệ Nhiệt Lạnh, <a href="https://iuh.edu.vn/" target="_blank" rel="noopener">Trường Đại học Công nghiệp TP. Hồ Chí Minh (IUH)</a>, Việt Nam',
      'job.research': 'Giáo sư nghiên cứu',
      'org.hknuChem': 'Khoa Kỹ thuật Hóa học, Đại học Quốc gia Hankyong, Hàn Quốc',
      'job.cofounder': 'Đồng sáng lập &amp; Cố vấn',
      'org.cfdways': '<a href="https://cfdways.com/en/" target="_blank" rel="noopener">CFDWAYS LLC</a>, Việt Nam',
      'job.postdoc': 'Nghiên cứu viên sau tiến sĩ',
      'org.cospe': '<a href="http://cospe.hknu.ac.kr/" target="_blank" rel="noopener">CoSPE</a>, Đại học Quốc gia Hankyong, Hàn Quốc',
      'job.field': 'Kỹ sư hiện trường',
      'org.ceco': 'Chemical Industry Engineering JSC (CECO), Hà Nội, Việt Nam',
      'job.lecturer': 'Giảng viên',
      'org.utehy': 'Trường Đại học Sư phạm Kỹ thuật Hưng Yên (UTEHY), Việt Nam',
      'edu.phd': 'Tiến sĩ, Kỹ thuật Hóa học',
      'edu.phdOrg': 'Đại học Quốc gia Hankyong, Hàn Quốc — Mô phỏng CFD đa pha, đa vật lý và đa thang đo các quá trình hóa học',
      'edu.msc': 'Thạc sĩ, Kỹ thuật Hóa học',
      'edu.mscOrg': 'Đại học Quốc gia Hankyong, Hàn Quốc — Đánh giá hiệu suất thiết bị khí hóa sinh khối tầng sôi',
      'edu.bsc': 'Kỹ sư (First Class Honours)',
      'edu.bscOrg': 'Đại học Bách khoa Hà Nội, Việt Nam',
      'ed.board': 'Thành viên Hội đồng Biên tập — <i>Scientific Reports</i>',
      'teach.math': 'Giảng viên — Toán học cho Kỹ sư Hóa học',
      'org.hknu': 'Đại học Quốc gia Hankyong, Hàn Quốc',
      'teach.matlab': 'Giảng viên — MATLAB cho Kỹ sư Hóa học',

      'pubs.kicker': 'Thành tựu khoa học', 'pubs.title': 'Công bố khoa học',
      'pubs.intro': '37 bài báo tạp chí có bình duyệt (Q1/Q2), 8 bài hội nghị và 4 chương sách. Danh sách đầy đủ trên <a href="https://scholar.google.com/citations?user=z9jCEXQAAAAJ&amp;hl=en" ' + A + '>Google Scholar</a>.',
      'pubs.journal': 'Tạp chí <span class="n">37</span>', 'pubs.conf': 'Hội nghị <span class="n">8</span>',
      'pubs.book': 'Chương sách <span class="n">4</span>',
      'pubs.search': 'Tìm theo tiêu đề, tạp chí, tác giả, năm…',
      'pubs.empty': 'Không tìm thấy công bố phù hợp.',
      'pubs.showAll': 'Xem tất cả {n} ▾', 'pubs.showLess': 'Thu gọn ▴',

      'proj.kicker': 'Dự án tài trợ', 'proj.title': 'Dự án tiêu biểu',
      'proj.intro': 'Chủ nhiệm và thành viên chủ chốt của hơn 18 dự án R&amp;D cấp quốc gia và công nghiệp.',
      'proj.flagship': 'TRỌNG ĐIỂM',
      'p1': 'Phát triển quy trình đổi mới nhằm giảm phát thải CO₂ dựa trên định luật nguyên lý cơ bản và học sâu',
      'p1.d': 'Ứng dụng cho sản xuất H₂ bằng kim loại nóng chảy và methane hóa CO₂.',
      'p1.src': '<b>Quỹ Nghiên cứu Quốc gia Hàn Quốc (NRF)</b> · 2021 — 2026 · 5 năm',
      'p2': 'Thiết kế thiết bị phản ứng tầng cố định methane hóa CO₂ bằng tối ưu hóa đa thang đo',
      'p2.src': '<b>NRF Hàn Quốc / Bộ Giáo dục</b> · 2020 — 2023',
      'p3': 'Nhiệt phân methane không oxy hóa sản xuất hydro không CO₂ trong cột sủi bọt kim loại nóng chảy',
      'p4': 'Mô phỏng CFD thiết bị reforming hơi nước methane dạng module (SMR)',
      'p5': 'Quy trình methane hóa xanh — CFD &amp; phân tích kinh tế - kỹ thuật',
      'p6': 'Thủy động lực học quá trình epitaxy SiC bằng CFD',
      'p7': 'CFD thiết bị hydrocracking xúc tác pha huyền phù',
      'p8': 'Dây chuyền sản xuất sợi carbon — khuôn tẩm, đông đặc PAN, lò carbon hóa',
      'p9': 'Tính toán hiệu năng cao cho phát triển quy trình',
      'tag.3y': '3 năm', 'tag.2y': '2 năm', 'tag.semi': 'Bán dẫn', 'tag.industry': 'Công nghiệp', 'tag.multi': 'Đa thang đo',

      'skills.kicker': 'Công cụ', 'skills.title': 'Kỹ năng &amp; Công nghệ',
      'skill.pinn': 'Mạng nơ-ron tích hợp vật lý', 'skill.ke': 'Trích xuất tri thức', 'skill.dl': 'Học sâu',
      'skill.en': 'Tiếng Anh', 'skill.vi': 'Tiếng Việt', 'skill.ko': 'Tiếng Hàn', 'skill.teach': 'Giảng dạy & Tư vấn',

      'awards.kicker': 'Ghi nhận', 'awards.title': 'Giải thưởng &amp; Vinh danh',
      'a1': 'Giải thưởng Bài báo được trích dẫn nhiều — Giải Nhì',
      'a1.d': 'Giải thưởng Bài báo được trích dẫn nhiều 2020 của MDPI <i>ChemEngineering</i>.',
      'a2': 'Thành tích nghiên cứu sinh viên xuất sắc nhất 2017',
      'a2.d': 'Hội Kỹ sư Hóa học Hàn Quốc (KIChE).',
      'a3': 'Công bố trên tạp chí có hệ số ảnh hưởng cao',
      'a3.d': 'Đại học Quốc gia Hankyong, Hàn Quốc.',
      'a4': 'Cuộc thi Robot Sinh viên — Top 10',
      'a4.d': 'Giải thưởng cấp trường, Đại học Bách khoa Hà Nội.',

      'home.blogKicker': 'Từ blog', 'home.blogTitle': 'Bài viết mới', 'home.blogAll': 'Xem tất cả bài viết →',

      'contact.kicker': 'Liên hệ', 'contact.title': 'Hãy cùng hợp tác',
      'contact.text': 'Sẵn sàng hợp tác nghiên cứu, tư vấn công nghiệp về CFD &amp; mô phỏng quá trình, và tiếp nhận học viên sau đại học.',
      'footer.rights': 'Bảo lưu mọi quyền.',
      'footer.addr': 'Khoa Kỹ thuật Hóa học · Đại học Quốc gia Hankyong · Anseong, Hàn Quốc',

      'blog.kicker': 'Ghi chép', 'blog.title': 'Blog',
      'blog.intro': 'Ghi chép về nghiên cứu, CFD, giảng dạy và đời sống học thuật.',
      'blog.all': 'Tất cả', 'blog.empty': 'Chưa có bài viết nào — hãy quay lại sau nhé.',
      'blog.read': 'Đọc tiếp →', 'blog.back': '← Tất cả bài viết', 'blog.minRead': '{n} phút đọc',
      'gallery.kicker': 'Hình ảnh nghiên cứu', 'gallery.title': 'Thư viện ảnh',
      'gallery.intro': 'Mô phỏng CFD, thí nghiệm, hội nghị và những khoảnh khắc giảng dạy.',
      'gallery.empty': 'Thư viện đang được chuẩn bị — hình ảnh và mô phỏng CFD sẽ sớm được cập nhật.',
      'cat.all': 'Tất cả', 'cat.cfd': 'Mô phỏng CFD', 'cat.lab': 'Phòng thí nghiệm', 'cat.conference': 'Hội nghị',
      'cat.teaching': 'Giảng dạy', 'cat.other': 'Khác', 'ui.close': 'Đóng',
      'notfound.title': 'Không tìm thấy trang', 'notfound.text': 'Trang bạn tìm không tồn tại hoặc đã được chuyển.',
      'notfound.home': '← Về trang chủ',
      'lang.name.en': 'Tiếng Anh', 'lang.name.vi': 'Tiếng Việt', 'lang.name.ko': 'Tiếng Hàn'
    },

    ko: {
      'nav.about': '소개', 'nav.experience': '경력', 'nav.publications': '논문',
      'nav.projects': '연구과제', 'nav.blog': '블로그', 'nav.gallery': '갤러리', 'nav.contact': '연락처',

      'hero.badge': '<span class="dot"></span> 연구교수 · 한경국립대학교',
      'hero.sub': '<strong>전산유체역학(CFD)</strong>과 <strong>딥러닝</strong>을 융합하여 차세대 화학 반응기를 설계합니다 — CO<sub>2</sub> 무배출 수소 생산부터 탄소 포집 공정까지.',
      'hero.browse': '논문 보기', 'hero.touch': '연락하기',
      'stat.cit': '피인용', 'stat.pub': '논문 수', 'stat.yr': '연구 경력(년)',

      'about.kicker': '연구 분야',
      'about.title': '다물리 · 다상 · 다중스케일',
      'about.intro': '한경국립대학교 화학공학과 연구교수이며 <a href="http://cospe.hknu.ac.kr/" ' + A + '>지속가능공정공학센터(CoSPE)</a> 소속입니다. 베트남 <a href="https://iuh.edu.vn/" ' + A + '>호치민시 산업대학교(IUH)</a> 열냉동공학부 방문교수, <a href="https://cfdways.com/en/" ' + A + '>CFDWAYS LLC</a> 공동창업자 겸 자문위원을 맡고 있습니다.',
      'b1.t': '화학 공정의 전산유체역학',
      'b1.d': '유동층, 기포탑, 용융금속 반응기, 사이클론, 개질기, CVD 반응기에 대한 오일러리안 및 VOF 다상 CFD — 실험으로 검증하고 실험실에서 산업 규모까지 스케일업합니다.',
      'b2.t': '물리 정보 신경망(PINN)',
      'b2.d': '제1원리 법칙과 딥러닝(TensorFlow 2)을 결합하여 반응기 모델 해석, 파라미터 추정 및 최적화를 수행합니다.',
      'b3.t': 'CO₂ 무배출 수소',
      'b3.d': '용융금속 기포탑 반응기에서의 메탄 열분해 — 수력학, 반응속도론 및 스케일업.',
      'b4.t': 'CO₂ 메탄화',
      'b4.d': '탄소 포집·활용을 위한 고정층 및 유동층 반응기 설계 — 반응속도론부터 최적 설계까지.',
      'b5.t': '산업 규모 공정 설계',
      'b5.d': '한국연구재단, 한국에너지기술연구원, 효성, GS건설 및 반도체 기업과 18건 이상의 연구과제 수행 — 수증기 메탄 개질기, 탄소섬유 공정, 해양 분리기, 슬러리 수첨분해, SiC 에피택시.',

      'exp.kicker': '이력', 'exp.title': '경력 및 학력',
      'exp.employment': '<span>💼</span> 경력', 'exp.education': '<span>🎓</span> 학력',
      'exp.teaching': '<span>📖</span> 강의 및 편집 활동',
      'd.aug2025': '2025.08 — 현재', 'd.2020now': '2020 — 현재', 'd.apr2026': '2026.04 — 현재', 'd.2024now': '2024 — 현재',
      'job.visiting': '방문교수',
      'org.iuh': '<a href="https://iuh.edu.vn/" target="_blank" rel="noopener">호치민시 산업대학교(IUH)</a> 열냉동공학부, 베트남',
      'job.research': '연구교수',
      'org.hknuChem': '한경국립대학교 화학공학과',
      'job.cofounder': '공동창업자 겸 자문위원',
      'org.cfdways': '<a href="https://cfdways.com/en/" target="_blank" rel="noopener">CFDWAYS LLC</a>, 베트남',
      'job.postdoc': '박사후연구원',
      'org.cospe': '한경국립대학교 <a href="http://cospe.hknu.ac.kr/" target="_blank" rel="noopener">CoSPE</a>',
      'job.field': '현장 엔지니어',
      'org.ceco': 'Chemical Industry Engineering JSC (CECO), 베트남 하노이',
      'job.lecturer': '강사',
      'org.utehy': '흥옌 사범기술대학교(UTEHY), 베트남',
      'edu.phd': '화학공학 박사',
      'edu.phdOrg': '한경국립대학교 — 화학 공정의 다상·다물리·다중스케일 CFD 시뮬레이션',
      'edu.msc': '화학공학 석사',
      'edu.mscOrg': '한경국립대학교 — 유동층 바이오매스 가스화기 성능 평가',
      'edu.bsc': '학사 (First Class Honours)',
      'edu.bscOrg': '하노이 과학기술대학교, 베트남',
      'ed.board': '<i>Scientific Reports</i> 편집위원',
      'teach.math': '강사 — 화학공학 수학',
      'org.hknu': '한경국립대학교',
      'teach.matlab': '강사 — 화학공학자를 위한 MATLAB',

      'pubs.kicker': '연구 성과', 'pubs.title': '논문 및 저술',
      'pubs.intro': '동료심사 학술지 논문 37편(Q1/Q2), 학술대회 논문 8편, 저서(챕터) 4편. 전체 목록은 <a href="https://scholar.google.com/citations?user=z9jCEXQAAAAJ&amp;hl=en" ' + A + '>Google Scholar</a>에서 확인하실 수 있습니다.',
      'pubs.journal': '학술지 <span class="n">37</span>', 'pubs.conf': '학술대회 <span class="n">8</span>',
      'pubs.book': '저서 <span class="n">4</span>',
      'pubs.search': '제목, 학술지, 저자, 연도 검색…',
      'pubs.empty': '검색 결과가 없습니다.',
      'pubs.showAll': '전체 {n}편 보기 ▾', 'pubs.showLess': '접기 ▴',

      'proj.kicker': '연구과제', 'proj.title': '주요 연구과제',
      'proj.intro': '18건 이상의 국가 및 산업체 R&amp;D 과제에서 연구책임자 및 핵심 연구원으로 참여했습니다.',
      'proj.flagship': '대표 과제',
      'p1': '제1원리 법칙과 딥러닝을 활용한 CO₂ 저감 혁신 공정 개발',
      'p1.d': '용융금속 H₂ 생산 및 CO₂ 메탄화에 적용.',
      'p1.src': '<b>한국연구재단(NRF)</b> · 2021 — 2026 · 5년',
      'p2': '다중스케일 최적화를 이용한 CO₂ 메탄화 고정층 반응기 설계',
      'p2.src': '<b>한국연구재단 / 교육부</b> · 2020 — 2023',
      'p3': '용융금속 기포탑 반응기에서 메탄 비산화 열분해를 통한 CO₂ 무배출 수소 생산',
      'p4': '모듈형 수증기 메탄 개질기(SMR) CFD 시뮬레이션',
      'p5': '그린 메탄화 공정 — CFD 및 기술경제성 분석',
      'p6': 'CFD를 이용한 SiC 에피택시 수력학 해석',
      'p7': '슬러리상 촉매 수첨분해 반응기 CFD',
      'p8': '탄소섬유 생산 공정 — 함침 다이, PAN 응고, 탄화로',
      'p9': '공정 개발을 위한 고성능 컴퓨팅',
      'tag.3y': '3년', 'tag.2y': '2년', 'tag.semi': '반도체', 'tag.industry': '산업체', 'tag.multi': '다중스케일',

      'skills.kicker': '도구', 'skills.title': '기술 및 역량',
      'skill.pinn': '물리 정보 신경망', 'skill.ke': '지식 추출', 'skill.dl': '딥러닝',
      'skill.en': '영어', 'skill.vi': '베트남어', 'skill.ko': '한국어', 'skill.teach': '강의 및 컨설팅',

      'awards.kicker': '수상', 'awards.title': '수상 및 영예',
      'a1': '고피인용 논문상 — 2등상',
      'a1.d': 'MDPI <i>ChemEngineering</i> 2020 고피인용 논문상.',
      'a2': '2017 최우수 학생 연구성과상',
      'a2.d': '한국화학공학회(KIChE).',
      'a3': '고영향력 학술지 논문 게재상',
      'a3.d': '한경국립대학교.',
      'a4': '학생 로봇 경진대회 — 상위 10팀',
      'a4.d': '하노이 과학기술대학교 교내상.',

      'home.blogKicker': '블로그', 'home.blogTitle': '최근 글', 'home.blogAll': '모든 글 보기 →',

      'contact.kicker': '연락처', 'contact.title': '함께 연구해요',
      'contact.text': '공동 연구, CFD 및 공정 시뮬레이션 산업 자문, 대학원생 지원 문의를 환영합니다.',
      'footer.rights': '모든 권리 보유.',
      'footer.addr': '한경국립대학교 화학공학과 · 경기도 안성시',

      'blog.kicker': '기록', 'blog.title': '블로그',
      'blog.intro': '연구, CFD, 강의, 그리고 학계 생활에 대한 기록.',
      'blog.all': '전체', 'blog.empty': '아직 게시물이 없습니다 — 곧 찾아뵙겠습니다.',
      'blog.read': '더 보기 →', 'blog.back': '← 전체 글', 'blog.minRead': '{n}분 분량',
      'gallery.kicker': '연구 시각화', 'gallery.title': '갤러리',
      'gallery.intro': 'CFD 시뮬레이션, 실험, 학회 및 강의 현장.',
      'gallery.empty': '갤러리를 준비 중입니다 — 곧 이미지와 CFD 애니메이션이 업데이트됩니다.',
      'cat.all': '전체', 'cat.cfd': 'CFD 시뮬레이션', 'cat.lab': '실험실', 'cat.conference': '학회',
      'cat.teaching': '강의', 'cat.other': '기타', 'ui.close': '닫기',
      'notfound.title': '페이지를 찾을 수 없습니다', 'notfound.text': '요청하신 페이지가 존재하지 않거나 이동되었습니다.',
      'notfound.home': '← 홈으로',
      'lang.name.en': '영어', 'lang.name.vi': '베트남어', 'lang.name.ko': '한국어'
    }
  };

  var original = new WeakMap();
  var lang = pickInitial();

  function pickInitial() {
    var q = new URLSearchParams(location.search).get('lang');
    if (LANGS.indexOf(q) >= 0) return q;
    try {
      var saved = localStorage.getItem('lang');
      if (LANGS.indexOf(saved) >= 0) return saved;
    } catch (e) {}
    var prefs = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < prefs.length; i++) {
      var p = String(prefs[i]).slice(0, 2).toLowerCase();
      if (LANGS.indexOf(p) >= 0) return p;
    }
    return 'en';
  }

  function t(key, vars) {
    var s = (lang !== 'en' && D[lang][key] != null) ? D[lang][key] : (EN[key] != null ? EN[key] : key);
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }

  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (!original.has(el)) original.set(el, el.innerHTML);
      var v = lang === 'en' ? null : D[lang][el.getAttribute('data-i18n')];
      el.innerHTML = v != null ? v : original.get(el);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      if (!original.has(el)) original.set(el, el.getAttribute('placeholder') || '');
      var v = lang === 'en' ? null : D[lang][el.getAttribute('data-i18n-placeholder')];
      el.setAttribute('placeholder', v != null ? v : original.get(el));
    });
    var fmt = new Intl.DateTimeFormat(LOCALE[lang], { year: 'numeric', month: 'long', day: 'numeric' });
    document.querySelectorAll('time[datetime]').forEach(function (el) {
      var d = new Date(el.getAttribute('datetime') + 'T00:00:00');
      if (!isNaN(d)) el.textContent = fmt.format(d);
    });
    document.querySelectorAll('.lang-switch button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  function set(next) {
    if (LANGS.indexOf(next) < 0 || next === lang) return;
    lang = next;
    try { localStorage.setItem('lang', lang); } catch (e) {}
    apply();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.lang-switch button[data-lang]');
    if (b) set(b.getAttribute('data-lang'));
  });

  window.i18n = { t: t, set: set, get lang() { return lang; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
