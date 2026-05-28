// ══════════════════════════════════════════════
// namecard.gs — 스크립트 속성 동적 로드 및 안정성 보완
// ══════════════════════════════════════════════

/**
 * 전역 설정 객체를 동적으로 가져오는 함수
 * (PropertiesService에 값이 없으면 디폴트 값을 제공합니다)
 */
function getActiveConfig() {
  var props = PropertiesService.getScriptProperties().getProperties();
  return {
    FOLDER_NAME: props.FOLDER_NAME || 'Namecard_Images',
    DONE_FOLDER: props.DONE_FOLDER || 'Namecard_Done',
    SHEET_NAME: 'db_namecards',
    LOG_SHEET: 'processed_log',
    GEMINI_MODEL: props.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    GEMINI_API_KEY: props.GEMINI_API_KEY || ''
  };
}

// ── 메인 스캐너 루프 ──────────────────────────────
function scanNewNamecards() {
  var config = getActiveConfig();
  var folder = getDriveFolder(config.FOLDER_NAME);
  if (!folder) {
    Logger.log('❌ 폴더를 찾을 수 없습니다: ' + config.FOLDER_NAME);
    return;
  }
  Logger.log('✅ 모니터링 폴더 검색 성공: ' + folder.getName());

  var logSheet = getLogSheet();
  var processedIds = getProcessedFileIds(logSheet);

  var files = folder.getFiles();
  var count = 0;

  while (files.hasNext()) {
    var file = files.next();
    var fileId = file.getId();

    // 1. 이미 가공 처리된 파일 건너뛰기
    if (processedIds.indexOf(fileId) !== -1) continue;

    // 2. 비이미지 파일 검증 및 오독 제외 필터링 (Vision API 크래시 방지)
    if (!isImageFile(file)) {
      Logger.log('⚠️ 비이미지 파일 제외 처리: ' + file.getName());
      continue;
    }

    try {
      Logger.log('🚀 명함 신규 분석 시도: ' + file.getName());
      processSingleFile(file, logSheet);
      count++;
      
      // 구글 앱스 스크립트 6분 타임아웃 방지를 위한 스로틀링 제한 적용
      if (count >= 5) {
        Logger.log('⏱️ 안정적인 구동 속도 보장을 위해 한 회당 최대 5개 스캐너 규칙을 수행하고 임시 중단합니다.');
        break;
      }
    } catch (e) {
      Logger.log('❌ 파일 연동 예외 발생 [' + file.getName() + ']: ' + e.toString());
    }
  }
}

// ── 단일 이미지 트랜잭션 처리 ───────────────────────
function processSingleFile(file, logSheet) {
  var config = getActiveConfig();
  if (!config.GEMINI_API_KEY) {
    throw new Error('Gemini API Key가 비어있습니다. 설정 대시보드에서 보완해 주세요.');
  }

  var fileId = file.getId();
  var blob = file.getBlob();
  var base64Data = Utilities.base64Encode(blob.getBytes());
  var mimeType = blob.ContentType;

  // 1. Gemini AI Vision OCR 파싱 통신
  var rawJson = callGeminiVision(base64Data, mimeType);
  var cardData = parseGeminiOutput(rawJson);

  // 2. 구글 드라이브 내 완료 격리 폴더로 안전 이동
  var viewUrl = file.getUrl();
  moveFileToDoneFolder(file);

  // 3. 스프레드시트 데이터 적재 및 UPSERT 수정 기입
  saveOrUpdateNamecard(cardData, viewUrl);

  // 4. 스캔 로그 최종 커밋 기록
  logSheet.appendRow([fileId, new Date().toISOString()]);
}

// ── Gemini API 통신 파트 ──────────────────────────
function callGeminiVision(base64Data, mimeType) {
  var config = getActiveConfig();
  var url = '[https://generativelanguage.googleapis.com/v1beta/models/](https://generativelanguage.googleapis.com/v1beta/models/)' + config.GEMINI_MODEL + ':generateContent?key=' + config.GEMINI_API_KEY;

  var systemInstruction = 
    "You are a professional Business Card OCR parser. " +
    "Extract the information from the business card image and return ONLY a valid JSON object. " +
    "DO NOT warp the JSON in markdown blocks like ```json ... ```. " +
    "Return the raw JSON string directly. Use the exact JSON format below:\n" +
    "{\n" +
    "  \"company\": \"Company name or organization\",\n" +
    "  \"name\": \"Person's name\",\n" +
    "  \"title\": \"Job title or position\",\n" +
    "  \"phone\": \"Office/Representative phone number\",\n" +
    "  \"mobile\": \"Personal mobile phone number\",\n" +
    "  \"email\": \"Email address\",\n" +
    "  \"address\": \"Full office address\"\n" +
    "}\n" +
    "Rules:\n" +
    "- If a field is not found, use an empty string.\n" +
    "- Clean and format phone/mobile numbers (e.g., 010-1234-5678, 02-123-4567).\n" +
    "- Remove any prefix labels (like Tel, HP, Email, Fax, Addr, 주소, 전화) from the extracted field values.";

  var payload = {
    contents: [
      {
        parts: [
          { text: "Extract the data from this business card." },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    systemInstruction: {
      parts: [
        { text: systemInstruction }
      ]
    }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  // 지수 백오프 기반 네트워크 안정 기동 처리
  var response, responseCode;
  for (var i = 0; i < 3; i++) {
    try {
      response = UrlFetchApp.fetch(url, options);
      responseCode = response.getResponseCode();
      if (responseCode === 200) break;
    } catch (err) {
      Logger.log('🌐 API 서버 지연 감지, 네트워크 재조율 기동 (' + (i+1) + '/3)');
    }
    Utilities.sleep(Math.pow(2, i) * 1000);
  }

  if (!response || responseCode !== 200) {
    var errMsg = response ? response.getContentText() : '네트워크 연동 실패';
    throw new Error('Gemini 연동 중 예외가 발생했습니다 (HTTP ' + responseCode + '): ' + errMsg);
  }

  return response.getContentText();
}

function parseGeminiOutput(responseText) {
  try {
    var res = JSON.parse(responseText);
    var textOutput = res.candidates[0].content.parts[0].text;
    
    // Markdown 가드 및 Backtick 문자열 정교하게 전처리 및 파싱
    textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(textOutput);
  } catch (e) {
    throw new Error('JSON 변환 중 형식 불일치 오류가 나타났습니다: ' + e.toString());
  }
}

// ── 데이터베이스(Sheets) 동적 관리 ────────────────────
function saveOrUpdateNamecard(card, imageUrl) {
  var config = getActiveConfig();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(config.SHEET_NAME);
  if (!sheet) throw new Error('Database 테이블 탐색 실패: ' + config.SHEET_NAME);

  var data = sheet.getDataRange().getValues();
  var matchRowIndex = -1;

  // 이메일, 모바일 번호, 사무실 유선번호 비교를 통한 중복 UPSERT 판단
  for (var i = 1; i < data.length; i++) {
    var existingPhone  = String(data[i][5]).replace(/[^0-9]/g, '');
    var existingMobile = String(data[i][6]).replace(/[^0-9]/g, '');
    var existingEmail  = String(data[i][7]).trim().toLowerCase();

    var targetPhone  = card.phone ? String(card.phone).replace(/[^0-9]/g, '') : '';
    var targetMobile = card.mobile ? String(card.mobile).replace(/[^0-9]/g, '') : '';
    var targetEmail  = card.email ? String(card.email).trim().toLowerCase() : '';

    var isMatch = false;
    if (targetEmail && targetEmail === existingEmail) isMatch = true;
    else if (targetMobile && targetMobile === existingMobile) isMatch = true;
    else if (targetPhone && targetPhone === existingPhone) isMatch = true;

    if (isMatch) {
      matchRowIndex = i + 1;
      break;
    }
  }

  if (matchRowIndex !== -1) {
    // 중복 레코드: UPDATE
    sheet.getRange(matchRowIndex, 2, 1, 10).setValues([[
      new Date().toISOString(),
      card.company || '',
      card.name || '',
      card.title || '',
      card.phone || '',
      card.mobile || '',
      card.email || '',
      card.address || '',
      imageUrl,
      'UPDATED'
    ]]);
    Logger.log('🔄 기존 레코드를 발견하여 명함 데이터를 무결하게 갱신했습니다 (행 번호: ' + matchRowIndex + ')');
  } else {
    // 고유 레코드: INSERT
    var uuid = Utilities.getUuid();
    sheet.appendRow([
      uuid,
      new Date().toISOString(),
      card.company || '',
      card.name || '',
      card.title || '',
      card.phone || '',
      card.mobile || '',
      card.email || '',
      card.address || '',
      imageUrl,
      'OK'
    ]);
    Logger.log('✨ 새로운 고유 연락처 데이터를 데이터베이스에 적재했습니다.');
  }
}

// ── 드라이브 파일 이동 처리 ───────────────────────
function moveFileToDoneFolder(file) {
  var config = getActiveConfig();
  var doneFolder = getDriveFolder(config.DONE_FOLDER);
  if (!doneFolder) {
    var parentFolder = file.getParents().hasNext() ? file.getParents().next() : DriveApp.getRootFolder();
    doneFolder = parentFolder.createFolder(config.DONE_FOLDER);
  }
  
  // 구형 Google Drive API를 최신 moveTo 표준 규격으로 업그레이드 (중복/단축키 결함 해결)
  file.moveTo(doneFolder);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('📦 명함 이미지 파일 격리 격하 이송 완료: ' + file.getName());
}

// ── 유틸리티 보조 도구 ────────────────────────────
function getDriveFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return null;
}

function isImageFile(file) {
  var mime = file.getMimeType();
  return mime.startsWith('image/') || mime === 'application/pdf';
}

function getLogSheet() {
  var config = getActiveConfig();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(config.LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(config.LOG_SHEET);
    sheet.appendRow(['fileId', 'processedAt']);
  }
  return sheet;
}

function getProcessedFileIds(logSheet) {
  var data = logSheet.getDataRange().getValues();
  return data.slice(1).map(function(row) { return row[0]; });
}
