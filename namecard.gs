// ══════════════════════════════════════════════
// namecard.gs — 다중 명함 일괄 검출 및 동적 적재 고도화
// ══════════════════════════════════════════════

/**
 * 전역 설정 객체를 동적으로 가져오는 함수
 * (PropertiesService에 값이 없으면 디폴트 값을 제공합니다)
 */
function getActiveConfig() {
  var props = PropertiesService.getScriptProperties().getProperties();
  return {
    FOLDER_NAME: (props.FOLDER_NAME || 'Namecard_Images').trim(),
    DONE_FOLDER: (props.DONE_FOLDER || 'Namecard_Done').trim(),
    SHEET_NAME: 'db_namecards',
    LOG_SHEET: 'processed_log',
    GEMINI_MODEL: (props.GEMINI_MODEL || 'gemini-3.1-flash-lite').trim(),
    GEMINI_API_KEY: (props.GEMINI_API_KEY || '').trim()
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

// ── 단일 이미지 내 다중 명함 처리 트랜잭션 ───────────────────
function processSingleFile(file, logSheet) {
  var config = getActiveConfig();
  if (!config.GEMINI_API_KEY) {
    throw new Error('Gemini API Key가 비어있습니다. 설정 대시보드에서 보완해 주세요.');
  }

  var fileId = file.getId();
  var blob = file.getBlob();
  var base64Data = Utilities.base64Encode(blob.getBytes());
  
  // 구글 드라이브 네이티브 MIME 타입 및 Fallback 가드
  var mimeType = file.getMimeType() || blob.getContentType() || 'image/jpeg';

  // 1. Gemini AI Vision OCR 파싱 통신 (다중 명함 감지형 배열 수신)
  var rawJson = callGeminiVision(base64Data, mimeType);
  var cardsList = parseGeminiOutput(rawJson);

  Logger.log('📊 이미지 내 검출된 명함 개수: ' + cardsList.length + '장');

  // 2. 구글 드라이브 내 완료 격리 폴더로 안전 이동
  var viewUrl = file.getUrl();
  moveFileToDoneFolder(file);

  // 3. 스프레드시트 데이터 적재 및 UPSERT 수정 기입 (다중 명함 반복 루프)
  for (var i = 0; i < cardsList.length; i++) {
    var card = cardsList[i];
    // 필수 데이터 유효성 최소 검증 (이름이나 회사명이 존재할 때만 기입)
    if (card.name || card.company) {
      saveOrUpdateNamecard(card, viewUrl);
    }
  }

  // 4. 스캔 로그 최종 커밋 기록
  logSheet.appendRow([fileId, new Date().toISOString()]);
}

// ── Gemini API 통신 파트 (다중 명함 지시어 설계) ──────────────────────────
function callGeminiVision(base64Data, mimeType) {
  var config = getActiveConfig();
  
  var cleanKey = encodeURIComponent(config.GEMINI_API_KEY.replace(/[\s\t\r\n]/g, ''));
  var cleanModel = encodeURIComponent(config.GEMINI_MODEL.replace(/[\s\t\r\n]/g, ''));
  
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + cleanModel + ':generateContent?key=' + cleanKey;

  // 다중 명함의 정형화된 JSON 배열 출력을 보장하는 고급 시스템 지시어
  var systemInstruction = 
    "You are a professional Business Card OCR parser specialized in multi-object detection. " +
    "Analyze the image and locate ALL distinct business cards present in the image (there could be one, two, or multiple cards in a single photo). " +
    "Extract the information from EACH identified business card and return a single valid JSON object containing an array of cards. " +
    "DO NOT wrap the JSON in markdown blocks like ```json ... ```. " +
    "Return the raw JSON string directly. Use the exact JSON format below:\n" +
    "{\n" +
    "  \"cards\": [\n" +
    "    {\n" +
    "      \"company\": \"Company name or organization\",\n" +
    "      \"name\": \"Person's name\",\n" +
    "      \"title\": \"Job title or position\",\n" +
    "      \"phone\": \"Office/Representative phone number\",\n" +
    "      \"mobile\": \"Personal mobile phone number\",\n" +
    "      \"email\": \"Email address\",\n" +
    "      \"address\": \"Full office address\"\n" +
    "    }\n" +
    "  ]\n" +
    "}\n" +
    "Rules:\n" +
    "- Detect every single card. Do not omit any cards in the photo.\n" +
    "- If both Korean (한글) and English (영문) are present on a card (e.g. bilingual card or two-sided text), always prioritize extracting the Korean (한글) values for company, name, title, and address.\n" +
    "- If a field is not found on a card, use an empty string.\n" +
    "- Clean and format phone/mobile numbers (e.g., 010-1234-5678, 02-123-4567).\n" +
    "- Remove any prefix labels (like Tel, HP, Email, Fax, Addr, 주소, 전화) from the extracted field values.";

  var payload = {
    contents: [
      {
        parts: [
          { text: "Locate and extract all distinct business cards from this image." },
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

  var response = null;
  var responseCode = null;
  var lastError = null;

  for (var i = 0; i < 3; i++) {
    try {
      response = UrlFetchApp.fetch(url, options);
      responseCode = response.getResponseCode();
      if (responseCode === 200) {
        lastError = null;
        break;
      } else {
        lastError = new Error('HTTP Status ' + responseCode + ': ' + response.getContentText());
      }
    } catch (err) {
      lastError = err;
      Logger.log('🌐 API 서버 지연 감지, 네트워크 재조율 기동 (' + (i+1) + '/3) | 에러내용: ' + err.toString());
    }
    Utilities.sleep(Math.pow(2, i) * 1000);
  }

  if (responseCode !== 200) {
    var detailMsg = lastError ? lastError.toString() : '알 수 없는 네트워크 연동 오류';
    throw new Error('Gemini 연동 중 예외가 발생했습니다 (HTTP ' + (responseCode || 'undefined') + '): ' + detailMsg);
  }

  return response.getContentText();
}

/**
 * Gemini 결과물에서 다중 명함 리스트(Array)를 무결하게 파싱하여 반환하는 래퍼 함수
 */
function parseGeminiOutput(responseText) {
  try {
    var res = JSON.parse(responseText);
    var textOutput = res.candidates[0].content.parts[0].text;
    
    // Markdown 코드 블록 정제
    textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    
    var parsed = JSON.parse(textOutput);
    
    // 다중 명함 스키마 규격 검증 및 포맷 일반화
    if (parsed.cards && Array.isArray(parsed.cards)) {
      return parsed.cards;
    } else if (Array.isArray(parsed)) {
      return parsed;
    } else {
      return [parsed]; // 싱글 명함으로 오반환 시 배열로 자동 승격 보정
    }
  } catch (e) {
    throw new Error('JSON 변환 중 형식 불일치 오류가 나타났습니다: ' + e.toString() + ' | Raw: ' + responseText);
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
  var isCareerChange = false;
  var oldCompany = '';
  var oldTitle = '';

  var targetName = card.name ? String(card.name).trim() : '';
  var targetPhone = card.phone ? String(card.phone).replace(/[^0-9]/g, '') : '';
  var targetMobile = card.mobile ? String(card.mobile).replace(/[^0-9]/g, '') : '';
  var targetEmail = card.email ? String(card.email).trim().toLowerCase() : '';
  var targetCompany = card.company ? String(card.company).trim() : '';

  // 이메일, 모바일 번호, 사무실 유선번호 비교를 통한 중복 및 이직 여부 결정
  for (var i = 1; i < data.length; i++) {
    var existingCompany = String(data[i][2]).trim();
    var existingName    = String(data[i][3]).trim();
    var existingTitle   = String(data[i][4]).trim();
    var existingPhone   = String(data[i][5]).replace(/[^0-9]/g, '');
    var existingMobile  = String(data[i][6]).replace(/[^0-9]/g, '');
    var existingEmail   = String(data[i][7]).trim().toLowerCase();

    // 1. 이직(Career Change) 여부 최우선 판별: 동일인(이름+휴대폰 일치)이나 소속 회사가 달라진 경우
    if (targetName && targetMobile && targetName === existingName && targetMobile === existingMobile) {
      if (targetCompany && targetCompany !== existingCompany) {
        matchRowIndex = i + 1; // 1-based Index 보정
        isCareerChange = true;
        oldCompany = existingCompany;
        oldTitle = existingTitle;
        break;
      }
    }

    // 2. 일반적인 정보 업데이트 매칭 (동일인 정보 최신화)
    var isNormalMatch = false;
    if (targetEmail && targetEmail === existingEmail) isNormalMatch = true;
    else if (targetMobile && targetMobile === existingMobile) isNormalMatch = true;
    else if (targetPhone && targetPhone === existingPhone) isNormalMatch = true;

    if (isNormalMatch) {
      matchRowIndex = i + 1;
      break;
    }
  }

  if (matchRowIndex !== -1) {
    if (isCareerChange) {
      // 이직 이력 보존 처리 (db_careers 시트에 기록 적재)
      recordCareerHistory(targetName, card.mobile, oldCompany, oldTitle, targetCompany, card.title);

      // 메인 DB 레코드의 회사 소속 정보 등을 신규로 완전히 덮어쓰기 (상태: CAREER_CHANGED)
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
        'CAREER_CHANGED'
      ]]);
      Logger.log('🔄 이직 감지 및 이력 기록 완료: ' + targetName + ' (' + oldCompany + ' ➔ ' + targetCompany + ')');
    } else {
      // 일반 레코드: UPDATE
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
    }
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
    Logger.log('✨ 새 고유 데이터베이스 적재 완료: ' + targetName);
  }
}

/**
 * 인물의 이직 이력을 연대기 순으로 영구 기록하는 감사 보조 테이블 제어 함수
 */
function recordCareerHistory(name, mobile, oldCompany, oldTitle, newCompany, newTitle) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var careerSheetName = 'db_careers';
  var sheet = ss.getSheetByName(careerSheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(careerSheetName);
    sheet.appendRow(['이름', '휴대폰', '이전 회사', '이전 직책', '신규 회사', '신규 직책', '이직 기록 일시']);
    sheet.getRange(1, 1, 1, 7)
         .setFontWeight('bold')
         .setBackground('#111116')
         .setFontColor('#c9a84c')
         .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
  
  sheet.appendRow([
    name,
    mobile,
    oldCompany || '(정보 없음)',
    oldTitle || '(정보 없음)',
    newCompany || '(정보 없음)',
    newTitle || '(정보 없음)',
    new Date().toISOString()
  ]);
}

// ── 드라이브 파일 이동 처리 ───────────────────────
function moveFileToDoneFolder(file) {
  var config = getActiveConfig();
  var doneFolder = getDriveFolder(config.DONE_FOLDER);
  if (!doneFolder) {
    var parentFolder = file.getParents().hasNext() ? file.getParents().next() : DriveApp.getRootFolder();
    doneFolder = parentFolder.createFolder(config.DONE_FOLDER);
  }
  
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
