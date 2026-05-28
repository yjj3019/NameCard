CardVault Pro

Google Apps Script & Gemini API 기반의 인공지능 명함 인식 및 관리 플랫폼

CardVault Pro는 모바일 카메라 및 웹 인터페이스를 통해 명함을 촬영하고, 업로드된 명함 이미지를 Gemini AI 모델(gemini-3.1-flash-lite)로 분석하여 자동으로 연락처 정보를 정형화(JSON)하고 안전하게 누적/관리할 수 있는 고성능 서버리스 웹 애플리케이션입니다.

📌 목차

핵심 기능

시스템 아키텍처 및 데이터 흐름

프로젝트 파일 구조

데이터베이스(Sheet) 구조

설치 및 배포 가이드

사용 안내

✨ 핵심 기능

1. 지능형 AI OCR 분석 (Gemini API)

스마트 데이터 추출: 명함 이미지에서 회사명, 이름, 직책, 대표전화, 휴대폰, 이메일, 주소를 정밀 분석하여 정형화된 JSON 데이터로 자동 변환합니다.

중복 데이터 필터링: 동일한 이메일, 휴대폰, 대표전화가 감지되면 신규 행을 생성하지 않고 기존 명함 데이터를 자동으로 업데이트(UPSERT)합니다.

이미지 자동 아카이빙: 인식 처리가 완료된 파일은 자동으로 드라이브 내 처리 완료 폴더(Namecard_Done)로 이동되어 원본 폴더의 가독성을 유지합니다.

2. 기기 최적화 및 듀얼 웹 UI (Desktop & Mobile)

환경 감지 및 렌더링: 첫 진입 시 User-Agent 및 터치 지원 여부를 통해 모바일과 데스크톱 환경을 자동으로 감지하고 최적의 전용 UI(index.html 또는 mobile.html)를 제공합니다.

사용자 설정 캐싱: 수동 화면 전환 시 UserProperties를 기반으로 사용자의 뷰 선호도를 유지 및 적용합니다.

풀스택 네이티브 제어: WebRTC 기술을 활용해 기기의 후면 카메라 환경(Facing Mode: Environment)을 제어하고 가이드를 제공하여 모바일 촬영 최적화를 구현했습니다.

3. 강력한 엔터프라이즈 보안 및 접근 제어

Google OAuth 기반 강제 로그인: 안전한 사용자 인증 및 인가를 위해 세션 식별 단계를 자동화하고 미인증 사용자의 접근을 차단합니다.

RBAC (역할 기반 접근 제어): 데이터베이스 시트(allowed_users)에 승인된 이메일만 접속을 허용하며, admin과 user 역할을 구분하여 제어합니다.

관리자 전용 패널: 신규 사용자 등록, 권한 설정(일반/관리자), 사용자 계정 삭제가 가능한 전용 웹페이지(admin.html)를 제공합니다.

🔄 시스템 아키텍처 및 데이터 흐름

[사용자 촬영/업로드] ──> [Google Drive: Namecard_Images]
                                 │
                                 ▼ (1분 간격 시간 트리거 / scanNewNamecards)
                      [Google Apps Script 백엔드 엔진]
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼ (Image Base64)                                ▼ (Data Insert / Update)
   [Gemini API]                                    [Google Sheets (DB)]
(gemini-3.1-flash-lite)                                  │
         │                                               ▼
         └─> (Structured JSON Output) ───────────────────┘
                                 │
                                 ▼ (Move File)
                      [Google Drive: Namecard_Done]


📁 프로젝트 파일 구조

NameCard/
├── admin.html       # 관리자용 사용자 관리 페이지 (승인 이메일 및 권한 CRUD)
├── index.html       # 데스크톱 웹 최적화 메인 대시보드
├── mobile.html      # 모바일 기기 최적화 반응형 대시보드 및 네이티브 카메라 UI
├── initSheet.gs     # 최초 시트 환경(DB 테이블 구조, 관리자 자동 등록) 구축 스크립트
├── namecard.gs      # Gemini API OCR 통신, 이미지 파일 관리 및 중복 제어 엔진
├── trigger.gs       # 미처리 명함 이미지 정기 스캔(1분 주기) 등록 스크립트
└── webapp.gs        # 웹앱 가우팅(doGet), 페이지 전환, 사용자 권한 및 데이터 CRUD API


📊 데이터베이스(Sheet) 구조

CardVault Pro는 단일 스프레드시트 파일 내 3개의 전용 시트를 테이블로 활용합니다.

1. 명함 데이터 테이블 (db_namecards)

열 이름

유형

설명

ID

String (UUID)

명함의 고유 식별자

생성일시

ISO 8601 String

등록 또는 최종 업데이트 시간

회사명

String

기업명

이름

String

소유자 이름

직책

String

소유자 직책

전화번호

String

회사 유선 전화번호 (숫자와 - 조합)

휴대폰

String

개인 모바일 번호

이메일

String

이메일 주소

주소

String

회사 주소

명함이미지링크

String (URL)

구글 드라이브 내 이미지 뷰어 링크

처리상태

String

OK (신규 등록) 또는 UPDATED (중복 업데이트)

2. 가공 이력 테이블 (processed_log)

중복 처리 방지를 위해 작동되는 감사 로그 테이블입니다.

fileId: 가공된 드라이브 이미지 고유 ID

processedAt: 처리 완료 시각

3. 권한 제어 테이블 (allowed_users)

승인된 내부 인원 리스트입니다.

이메일 / 이름 / 역할 (admin 또는 user) / 등록일시

🛠️ 설치 및 배포 가이드

단계 1: Google Spreadsheet 생성 및 시트 초기화

새 구글 스프레드시트를 생성합니다.

상단 메뉴에서 확장 프로그램 -> Apps Script를 클릭하여 코드 편집기를 엽니다.

프로젝트 내 모든 .gs 파일 내용과 .html 파일을 복사하여 Apps Script 프로젝트에 동일하게 추가합니다.

initSheet.gs 파일로 이동한 후, initSheet 함수를 실행하여 시스템 필수 데이터베이스 시트들을 자동으로 생성합니다. (최초 실행 시 Google 권한 승인이 필요합니다.)

단계 2: 구글 드라이브 폴더 준비 및 세팅

구글 드라이브 루트 폴더에 Namecard_Images 이름으로 새 폴더를 생성합니다.

명함 이미지 업로드 시 앱이 해당 폴더에서 파일을 스캔합니다. (처리 완료된 파일은 Namecard_Done 폴더로 자동 이동됩니다.)

단계 3: Gemini API Key 등록

Google AI Studio에서 개인 Gemini API Key를 발급받습니다.

namecard.gs 파일 상단의 CONFIG 오브젝트 내 GEMINI_API_KEY 값을 발급받은 API 키로 대체합니다.

const CONFIG = {
  FOLDER_NAME: 'Namecard_Images',
  DONE_FOLDER: 'Namecard_Done',
  SHEET_NAME: 'db_namecards',
  LOG_SHEET: 'processed_log',
  GEMINI_MODEL: 'gemini-3.1-flash-lite', // 고성능 및 초고속 추론 모델
  GEMINI_API_KEY: 'YOUR_ACTUAL_GEMINI_API_KEY', // <--- 이곳에 키를 입력하세요.
};


단계 4: 배치 트리거(자동 스캔) 활성화

Apps Script의 trigger.gs 파일로 이동합니다.

createTimeTrigger 함수를 한 번 실행합니다.

구글 트리거 정책에 따라 1분 주기로 백엔드 스크립트가 실행되며 Namecard_Images에 새 파일이 올라왔는지 지속적으로 모니터링합니다.

단계 5: 웹 애플리케이션으로 웹앱 배포

Apps Script 편집기 우측 상단의 배포 -> 새 배포를 클릭합니다.

유형 선택에서 웹 앱을 선택합니다.

다음과 같이 설정 정보를 기입합니다.

설명: CardVault Pro v1.0.0

웹앱을 실행할 사용자: 웹앱에 액세스하는 사용자 (인증된 Google 계정 필수)

액세스 권한이 있는 사용자: 모든 사용자 또는 회사 환경에 맞게 지정

배포 버튼을 누르고 생성된 웹앱 URL을 복사하여 즐겨찾기 또는 홈 화면에 저장해 사용합니다.

📱 사용 안내

대시보드 검색: 실시간 통합 검색을 지원하여 초성, 이름, 회사명, 직책, 번호 중 일부만 입력해도 신속하게 정보를 검색할 수 있습니다.

카메라 업로드: 모바일 기기에서 촬영 탭을 터치하면 가이드 영역에 맞춰 명함을 즉각 촬영 및 스캔한 후 파일 업로드 프로세스로 바로 이동할 수 있습니다.

권한 요청: 새로운 구성원의 접근이 필요할 경우, 관리자 계정으로 접속하여 우측 하단 설정 -> 사용자 관리 패널을 통해 해당 이메일을 승인 목록에 즉시 추가할 수 있습니다.
