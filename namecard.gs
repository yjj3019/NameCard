// ══════════════════════════════════════════════
// namecard.gs — 스크립트 속성 동적 로드 적용
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
    GEMINI_API_KEY: props.GEMINI_API_KEY || '' // 빈 값일 경우 에러 처리를 하도록 구성
  };
}

// ── 메인 스캐너 루프 ──────────────────────────────
function scanNewNamecards() {
  var config = getActiveConfig();
  var folder = getDriveFolder(config.FOLDER_NAME);
  if (!folder) {
    Logger.log('폴더를 찾을 수 없습니다: ' + config.FOLDER_NAME);
    return;
  }

  var logSheet = getLogSheet();
  var processedIds = getProcessedFileIds(logSheet);

  var files = folder.getFiles();
  var count = 0;

  while (files.hasNext()) {
    var file = files.next();
    var fileId = file.getId();

    // 이미 가공 처리된 파일 건너뛰기
    if (processedIds.indexOf(fileId) !== -1) continue;

    try {
      Logger.log('명함 분석 시작: ' + file.getName());
      processSingleFile(file, logSheet);
      count++;
      // 안정적인 구동 및 스크립트 실행 제한 한도(6분) 준수를 위해 배치당 최대 5개 스캔 제한
      if (count >= 5) {
        Logger.log('안정적인 스캔 진행을 위해 이번 배치 스캔을 조기 종료합니다.');
        break;
      }
    } catch (e) {
      Logger.log('파일 처리 중 치명적 오류 [' + file.getName() + ']: ' + e.toString());
    }
  }
}

// ── 단일 이미지 트랜잭션 처리 ───────────────────────
function processSingleFile(file, logSheet) {
  var config = getActiveConfig();
  if (!config.GEMINI_API_KEY) {
    throw new Error('Gemini API Key가 설정되지 않았습니다. 관리자 페이지에서 먼저 키를 저장하세요.');
  }

  var fileId = file.getId();
  var blob = file.getBlob();
  var base64Data = Utilities.base64Encode(blob.getBytes());
  var mimeType = blob.ContentType;

  // 1. Gemini AI를 통한 광학 문자 분석(OCR) 수행
  var rawJson = callGeminiVision(base64Data, mimeType);
  var cardData = parseGeminiOutput(rawJson);

  // 2. 구글 드라이브 내 뷰어 전용 주소 및 완료 폴더 격리 이송
  var viewUrl = file.getUrl();
  moveFileToDoneFolder(file);

  // 3. Database (Spreadsheet) 중복 여부 판정 및 UPSERT 실행
  saveOrUpdateNamecard(cardData, viewUrl);

  // 4. 처리 로그 아카이브 기록
  logSheet.appendRow([fileId, new Date().toISOString()]);
}

// ── Gemini API 통신 파트 ──────────────────────────
function callGeminiVision(base64Data, mimeType) {
  var config = getActiveConfig();
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + config.GEMINI_MODEL + ':generateContent?key=' + config.GEMINI_API_KEY;

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

  // Exponential Backoff retry 알고리즘 적용 (최대 3회 실패 복구)
  var response, responseCode;
  for (var i = 0; i < 3; i++) {
    try {
      response = UrlFetchApp.fetch(url, options);
      responseCode = response.getResponseCode();
      if (responseCode === 200) break;
    } catch (err) {
      Logger.log('연동 중 네트워크 지연 발생 (재시도 중 ' + (i+1) + '/3)');
    }
    Utilities.sleep(Math.pow(2, i) * 1000);
  }

  if (!response || responseCode !== 200) {
    var errMsg = response ? response.getContentText() : '네트워크 통신 불능';
    throw new Error('Gemini API 호출에 실패했습니다. (HTTP ' + responseCode + '): ' + errMsg);
  }

  return response.getContentText();
}

function parseGeminiOutput(responseText) {
  try {
    var res = JSON.parse(responseText);
    var textOutput = res.candidates[0].content.parts[0].text;
    
    // 마크다운 백틱 가드가 포함되어 있을 경우 정규식 정제 처리
    textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(textOutput);
  } catch (e) {
    throw new Error('AI 분석 결과를 JSON 규격으로 파싱하는 데 실패했습니다: ' + e.toString() + '\nRaw Response: ' + responseText);
  }
}

// ── 데이터베이스(Sheets) 동적 관리 ────────────────────
function saveOrUpdateNamecard(card, imageUrl) {
  var config = getActiveConfig();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(config.SHEET_NAME);
  if (!sheet) throw new Error('데이터베이스 시트를 찾을 수 없습니다: ' + config.SHEET_NAME);

  var data = sheet.getDataRange().getValues();
  var matchRowIndex = -1;

  // 이메일, 휴대폰, 대표전화 중 하나라도 겹치면 중복 업데이트(UPSERT) 처리
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
      matchRowIndex = i + 1; // 1-based Index 보정
      break;
    }
  }

  if (matchRowIndex !== -1) {
    // 중복 발견: 수정(UPDATE) 
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
    Logger.log('기존 동일 명함을 검색하여 정보를 최신 데이터로 업데이트했습니다. (Row: ' + matchRowIndex + ')');
  } else {
    // 신규 등록: 추가(INSERT)
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
    Logger.log('새로운 독자 명함을 등록했습니다.');
  }
}

// ── 드라이브 파일 이동 처리 ───────────────────────
function moveFileToDoneFolder(file) {
  var config = getActiveConfig();
  var doneFolder = getDriveFolder(config.DONE_FOLDER);
  if (!doneFolder) {
    // 이동 보관 완료 폴더가 없을 경우 자동 프로비저닝 생성
    var parentFolder = file.getParents().hasNext() ? file.getParents().next() : DriveApp.getRootFolder();
    doneFolder = parentFolder.createFolder(config.DONE_FOLDER);
  }
  
  // 새 폴더에 연동 추가 및 기존 폴더 링크 제거 수행
  doneFolder.addFile(file);
  var parentFolders = file.getParents();
  while (parentFolders.hasNext()) {
    var p = parentFolders.next();
    if (p.getId() !== doneFolder.getId()) {
      p.removeFile(file);
    }
  }
  // 타 사용자가 뷰어로 명함 원본 이미지를 볼 수 있도록 읽기 전용 공유 권한 설정
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
}

// ── 유틸리티 보조 도구 ────────────────────────────
function getDriveFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return null;
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
